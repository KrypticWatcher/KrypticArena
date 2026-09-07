import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { recordLoss } from './gainLog.js';
import { EconomyError, ensureUser, ensureGuild, getBalance, addCash, getArenaBalance, addArenaCoins } from './economy.js';
import { addItemToInventory, getOwnedQuantity, getAllEquipmentSets } from './inventory.js';
import { damageEquippedGear } from './durability.js';
import { getChampionDropCollectibles, getItem } from '../data/items.js';
import { getGladiatorChampionStats } from './gladiator.js';
import { getBracket, getUnlockedBrackets } from './championBrackets.js';
import { getShinyChampionWinChanceBoost, getShinyChampionPayoutBoost } from './pets.js';
import {
  computeChampionCrossSetEffects,
  computeChampionOdds,
  computeChampionLevelReduction,
  computeChampionPayoutMultiplier,
  computeDuelWinChance,
  CHAMPION_MAXED_XP_REDUCTION_PERCENT,
} from './effects.js';

export const GAMBLING_TO_ARENA_RATE = 2000;

export const ARENA_TO_GAMBLING_RATE = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const SLAVE_GAMBLING_MIN_DEFAULT = 10_000;
export const SLAVE_GAMBLING_MAX_DEFAULT = 15_000;
export const SLAVE_ARENA_MIN_DEFAULT = 1;
export const SLAVE_ARENA_MAX_DEFAULT = 5;
export const SLAVE_COOLDOWN_SECONDS_DEFAULT = 1800;
export const SLAVE_ARENA_DAILY_CAP_DEFAULT = 25;

export const CHAMPION_DROP_CHANCE = 0.005;

export const CHAMPION_COMEBACK_CHANCE = 0.05;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export { getArenaBalance, addArenaCoins } from './economy.js';

const stmtSetExchangeWindow = db.prepare(`
  UPDATE users SET arena_exchanged_today = ?, arena_exchange_reset_at = ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);
const stmtSetExchangeCooldown = db.prepare(`
  UPDATE users SET last_exchange_at = ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);

function getExchangeWindow(guildId, userId) {
  const user = ensureUser(guildId, userId);
  const cap = ensureGuild(guildId).exchange_daily_cap;
  const now = Date.now();

  if (now >= user.arena_exchange_reset_at) {
    return { usedToday: 0, remaining: cap, resetAt: now + DAY_MS, cap, _rolledOver: true };
  }
  return {
    usedToday: user.arena_exchanged_today,
    remaining: Math.max(0, cap - user.arena_exchanged_today),
    resetAt: user.arena_exchange_reset_at,
    cap,
    _rolledOver: false,
  };
}

export function getExchangeStatus(guildId, userId) {
  guildId = GLOBAL_ID;
  const { usedToday, remaining, resetAt, cap } = getExchangeWindow(guildId, userId);
  const settings = ensureGuild(guildId);
  const user = ensureUser(guildId, userId);
  const cooldownReadyAt = user.last_exchange_at + settings.exchange_cooldown_seconds * 1000;
  return {
    usedToday,
    remaining,
    resetAt,
    cap,
    cooldownReadyAt,
    onCooldown: settings.exchange_cooldown_seconds > 0 && Date.now() < cooldownReadyAt,
  };
}

function assertExchangeOffCooldown(guildId, userId) {
  const settings = ensureGuild(guildId);
  if (settings.exchange_cooldown_seconds <= 0) return;
  const user = ensureUser(guildId, userId);
  const readyAt = user.last_exchange_at + settings.exchange_cooldown_seconds * 1000;
  if (Date.now() < readyAt) {
    throw new EconomyError(`You're exchanging too fast — try again in **${Math.ceil((readyAt - Date.now()) / 1000)}s**.`);
  }
}

export const exchangeToArena = db.transaction((guildId, userId, arenaAmount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(arenaAmount) || arenaAmount <= 0) {
    throw new EconomyError('Exchange amount must be a positive whole number of arena coins.');
  }
  assertExchangeOffCooldown(guildId, userId);

  const window = getExchangeWindow(guildId, userId);
  if (arenaAmount > window.remaining) {
    throw new EconomyError(
      `You can only exchange **${window.remaining}** more arena coin(s) today (daily cap is ${window.cap}). Try again after your window resets.`
    );
  }

  const cost = arenaAmount * GAMBLING_TO_ARENA_RATE;
  const user = ensureUser(guildId, userId);
  if (user.cash < cost) {
    throw new EconomyError(
      `That costs **${cost.toLocaleString('en-US')}** cash (${GAMBLING_TO_ARENA_RATE.toLocaleString('en-US')} per arena coin) — you only have **${user.cash.toLocaleString('en-US')}**.`
    );
  }

  addCash(guildId, userId, -cost);
  addArenaCoins(guildId, userId, arenaAmount);
  stmtSetExchangeWindow.run(window.usedToday + arenaAmount, window.resetAt, guildId, userId);
  stmtSetExchangeCooldown.run(Date.now(), guildId, userId);

  return {
    arenaGained: arenaAmount,
    cashSpent: cost,
    balance: getBalance(guildId, userId),
    arenaBalance: getArenaBalance(guildId, userId),
    remainingToday: window.cap - (window.usedToday + arenaAmount),
    cap: window.cap,
  };
});

export const exchangeToGambling = db.transaction((guildId, userId, arenaAmount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(arenaAmount) || arenaAmount <= 0) {
    throw new EconomyError('Exchange amount must be a positive whole number of arena coins.');
  }
  assertExchangeOffCooldown(guildId, userId);

  const user = ensureUser(guildId, userId);
  if (user.arena_coins < arenaAmount) {
    throw new EconomyError(`You only have **${user.arena_coins}** arena coin(s).`);
  }

  const payout = arenaAmount * ARENA_TO_GAMBLING_RATE;
  addArenaCoins(guildId, userId, -arenaAmount);
  addCash(guildId, userId, payout);
  stmtSetExchangeCooldown.run(Date.now(), guildId, userId);

  return {
    arenaSpent: arenaAmount,
    cashGained: payout,
    balance: getBalance(guildId, userId),
    arenaBalance: getArenaBalance(guildId, userId),
  };
});

const stmtSetSlaveCooldown = db.prepare(`
  UPDATE users SET last_slave_at = ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);
const stmtSetSlaveArenaWindow = db.prepare(`
  UPDATE users SET slave_arena_today = ?, slave_arena_reset_at = ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);

function getSlaveArenaWindow(guildId, userId, cap) {
  const user = ensureUser(guildId, userId);
  const now = Date.now();

  if (now >= user.slave_arena_reset_at) {
    return { usedToday: 0, remaining: cap, resetAt: now + DAY_MS };
  }
  return {
    usedToday: user.slave_arena_today,
    remaining: Math.max(0, cap - user.slave_arena_today),
    resetAt: user.slave_arena_reset_at,
  };
}

export function getSlaveArenaStatus(guildId, userId) {
  guildId = GLOBAL_ID;
  const settings = ensureGuild(guildId);
  const { usedToday, remaining, resetAt } = getSlaveArenaWindow(guildId, userId, settings.slave_arena_daily_cap);
  return { usedToday, remaining, resetAt, cap: settings.slave_arena_daily_cap };
}

export const doSlaveWork = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  const settings = ensureGuild(guildId);
  const user = ensureUser(guildId, userId);
  const now = Date.now();
  const readyAt = user.last_slave_at + settings.slave_cooldown_seconds * 1000;

  if (now < readyAt) {
    return { status: 'cooldown', readyAt };
  }

  const gambling = randInt(settings.slave_gambling_min, settings.slave_gambling_max);
  const rolledArena = randInt(settings.slave_arena_min, settings.slave_arena_max);

  const window = getSlaveArenaWindow(guildId, userId, settings.slave_arena_daily_cap);
  const arena = Math.min(rolledArena, window.remaining);

  addCash(guildId, userId, gambling, 'slave');
  if (arena > 0) addArenaCoins(guildId, userId, arena, 'slave');
  stmtSetSlaveArenaWindow.run(window.usedToday + arena, window.resetAt, guildId, userId);
  stmtSetSlaveCooldown.run(now, guildId, userId);

  return {
    status: 'success',
    gambling,
    arena,
    arenaCapped: arena < rolledArena,
    balance: getBalance(guildId, userId),
    arenaBalance: getArenaBalance(guildId, userId),
  };
});

export function previewChampionOdds(guildId, userId, bracketId, fallbackName) {
  guildId = GLOBAL_ID;
  const bracket = getBracket(bracketId);
  if (!bracket) {
    throw new EconomyError('That Champion Bracket no longer exists.');
  }

  const { level, isMaxed } = getGladiatorChampionStats(guildId, userId, fallbackName);
  const unlockedBrackets = getUnlockedBrackets(level);
  if (!unlockedBrackets.some((b) => b.id === bracket.id)) {
    throw new EconomyError(`You haven't unlocked **${bracket.name}** yet — it opens up at Gladiator level **${bracket.unlockLevel}**.`);
  }

  
  
  
  
  
  
  const allSets = getAllEquipmentSets(guildId, userId);
  const { failReduction, wagerBoost, gladiatorXpBonus, contributingInstanceIds } = computeChampionCrossSetEffects(allSets, bracket.rarity);

  
  
  
  
  
  const levelReduction = computeChampionLevelReduction(level);
  const maxedReduction = isMaxed ? CHAMPION_MAXED_XP_REDUCTION_PERCENT : 0;
  const totalReduction = failReduction + levelReduction + maxedReduction;

  const { winChance: baseWinChance, failChance: baseFailChance } = computeChampionOdds(bracket, totalReduction);
  
  
  
  
  const shinyWinBoost = getShinyChampionWinChanceBoost(guildId, userId);
  const winChance = Math.min(bracket.maxWinChancePercent / 100, baseWinChance + shinyWinBoost);
  const failChance = 1 - winChance;
  const basePayoutMultiplier = computeChampionPayoutMultiplier(winChance);
  
  
  const payoutMultiplier = basePayoutMultiplier + getShinyChampionPayoutBoost(guildId, userId, basePayoutMultiplier);
  return { bracket, winChance, failChance, payoutMultiplier, wagerBoost, gladiatorXpBonus, contributingInstanceIds };
}

export const fightChampion = db.transaction((guildId, userId, bracketId, wagerArena, minWager, maxWager, fallbackName, useDart = false) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(wagerArena) || wagerArena < minWager) {
    throw new EconomyError(`The Champion won't fight for less than **${minWager.toLocaleString('en-US')} arena coins** — it's beneath him.`);
  }

  
  
  
  
  const { bracket, winChance, failChance, payoutMultiplier, wagerBoost, gladiatorXpBonus, contributingInstanceIds } = previewChampionOdds(guildId, userId, bracketId, fallbackName);

  if (wagerArena > maxWager) {
    throw new EconomyError(`**${bracket.name}** caps wagers at **${maxWager.toLocaleString('en-US')} arena coins**.`);
  }

  const arenaBalance = getArenaBalance(guildId, userId);
  if (arenaBalance < wagerArena) {
    throw new EconomyError(`You only have **${arenaBalance}** arena coin(s) — not enough to wager **${wagerArena}**.`);
  }

  
  
  
  
  
  const CHAMPION_DART_COST = 5;
  if (useDart && getOwnedQuantity(guildId, userId, 'hades_dart') < CHAMPION_DART_COST) {
    throw new EconomyError(`You need **${CHAMPION_DART_COST}x Hades' Dart** for a Champion fight.`);
  }
  if (useDart) addItemToInventory(guildId, userId, 'hades_dart', -CHAMPION_DART_COST);

  const won = Math.random() < winChance;

  
  
  
  
  
  
  
  
  
  
  
  
  
  const comebackWin = !won && (useDart || Math.random() < CHAMPION_COMEBACK_CHANCE);
  const finalWon = won || comebackWin;
  
  
  
  
  
  
  
  
  
  const dartCausedWin = useDart && !won;

  
  addArenaCoins(guildId, userId, -wagerArena);

  
  
  
  
  
  
  
  
  const effectiveWager = Math.round(wagerArena * (1 + wagerBoost / 100));
  
  
  
  
  
  
  
  
  
  
  
  const dartUnitPrice = getItem('hades_dart')?.priceArena ?? 0;
  const dartForcedWinBonus = dartUnitPrice * CHAMPION_DART_COST + dartUnitPrice; 
  const payout = !finalWon ? 0 : dartCausedWin ? wagerArena + dartForcedWinBonus : Math.round(effectiveWager * payoutMultiplier);
  if (finalWon) addArenaCoins(guildId, userId, payout, 'champion');
  
  
  
  else if (wagerArena > 0) recordLoss(guildId, userId, 'arena', wagerArena, 'champion');

  
  
  
  
  
  
  

  
  
  
  
  let collectibleDrop = null;
  if (finalWon && Math.random() < CHAMPION_DROP_CHANCE) {
    const pool = getChampionDropCollectibles().filter((item) => getOwnedQuantity(guildId, userId, item.id) < 1);
    if (pool.length > 0) {
      collectibleDrop = pool[Math.floor(Math.random() * pool.length)];
      addItemToInventory(guildId, userId, collectibleDrop.id, 1, 'champion');
    }
  }

  
  
  
  
  
  const brokenGear = damageEquippedGear(guildId, userId, contributingInstanceIds);

  return {
    won: finalWon,
    comebackWin,
    dartUsed: useDart,
    bracket,
    wager: wagerArena,
    payout,
    net: payout - wagerArena,
    winChance,
    failChance,
    payoutMultiplier,
    wagerBoost,
    gladiatorXpBonus,
    arenaBalance: getArenaBalance(guildId, userId),
    collectibleDrop,
    brokenGear,
  };
});

export const DUEL_CURRENCIES = ['arena', 'gambling'];

function assertValidDuelCurrency(currency) {
  if (!DUEL_CURRENCIES.includes(currency)) {
    throw new EconomyError(`\`${currency}\` isn't a valid duel currency.`);
  }
}

function getWagerBalance(guildId, userId, currency) {
  return currency === 'arena' ? getArenaBalance(guildId, userId) : ensureUser(guildId, userId).cash;
}

function debitWager(guildId, userId, currency, amount) {
  return currency === 'arena' ? addArenaCoins(guildId, userId, -amount) : addCash(guildId, userId, -amount);
}

function creditWager(guildId, userId, currency, amount) {
  return currency === 'arena' ? addArenaCoins(guildId, userId, amount) : addCash(guildId, userId, amount);
}

export const createDuelChallenge = db.transaction((guildId, challengerId, wagerAmount, currency) => {
  guildId = GLOBAL_ID;
  assertValidDuelCurrency(currency);
  if (!Number.isInteger(wagerAmount) || wagerAmount < 1) {
    throw new EconomyError('Duel wagers must be a positive whole number.');
  }
  const balance = getWagerBalance(guildId, challengerId, currency);
  const label = currency === 'arena' ? 'arena coin(s)' : 'cash';
  if (balance < wagerAmount) {
    throw new EconomyError(
      `You only have **${balance.toLocaleString('en-US')}** ${label} — not enough to challenge for **${wagerAmount.toLocaleString('en-US')}**.`
    );
  }
  debitWager(guildId, challengerId, currency, wagerAmount);
  return { balance: getWagerBalance(guildId, challengerId, currency) };
});

export function refundDuelWager(guildId, userId, wagerAmount, currency) {
  guildId = GLOBAL_ID;
  creditWager(guildId, userId, currency, wagerAmount);
}

export function previewDuelOdds() {
  return { winChance: computeDuelWinChance() };
}

export const resolveDuel = db.transaction((guildId, challengerId, opponentId, wagerAmount, currency) => {
  guildId = GLOBAL_ID;
  const opponentBalance = getWagerBalance(guildId, opponentId, currency);
  const label = currency === 'arena' ? 'arena coin(s)' : 'cash';
  if (opponentBalance < wagerAmount) {
    throw new EconomyError(
      `You only have **${opponentBalance.toLocaleString('en-US')}** ${label} — not enough to match the **${wagerAmount.toLocaleString('en-US')}** wager.`
    );
  }
  debitWager(guildId, opponentId, currency, wagerAmount);

  const winChance = computeDuelWinChance();
  const challengerWon = Math.random() < winChance;
  const winnerId = challengerWon ? challengerId : opponentId;
  const loserId = challengerWon ? opponentId : challengerId;
  const pot = wagerAmount * 2;
  creditWager(guildId, winnerId, currency, pot);

  return {
    challengerWon,
    winnerId,
    loserId,
    wager: wagerAmount,
    currency,
    pot,
    winChance,
    winnerBalance: getWagerBalance(guildId, winnerId, currency),
    loserBalance: getWagerBalance(guildId, loserId, currency),
  };
});
