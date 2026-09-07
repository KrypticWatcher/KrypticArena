import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { getMainGuildId } from './botConfig.js';
import { recordGain, recordLoss } from './gainLog.js';

export class EconomyError extends Error {}

const stmtGetGuild = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
const stmtInsertGuild = db.prepare('INSERT INTO guild_settings (guild_id) VALUES (?)');

const GUILD_SETTINGS_COLUMNS = db
  .prepare('PRAGMA table_info(guild_settings)')
  .all()
  .map((c) => c.name)
  .filter((name) => name !== 'guild_id');

const stmtUpdateGuild = db.prepare(
  `UPDATE guild_settings SET ${GUILD_SETTINGS_COLUMNS.map((col) => `${col} = @${col}`).join(', ')} WHERE guild_id = @guild_id`
);

function resolveConfigGuildId(guildId) {
  return getMainGuildId() ?? guildId;
}

export function ensureGuild(guildId) {
  guildId = resolveConfigGuildId(guildId);
  let settings = stmtGetGuild.get(guildId);
  if (!settings) {
    stmtInsertGuild.run(guildId);
    settings = stmtGetGuild.get(guildId);
  }
  return settings;
}

export function updateGuildSettings(guildId, updates) {
  guildId = resolveConfigGuildId(guildId);
  const current = ensureGuild(guildId);
  const merged = { ...current, ...updates, guild_id: guildId };
  stmtUpdateGuild.run(merged);
  return stmtGetGuild.get(guildId);
}

const stmtGetUser = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?');
const stmtInsertUser = db.prepare(
  'INSERT INTO users (guild_id, user_id, cash, bank) VALUES (?, ?, ?, ?)'
);
const stmtAddCash = db.prepare(`
  UPDATE users SET cash = cash + ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);
const stmtAddBank = db.prepare(`
  UPDATE users SET bank = bank + ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);
const stmtDeleteGuildUsers = db.prepare('DELETE FROM users WHERE guild_id = ?');
const stmtGetWealthPeak = db.prepare('SELECT cash, bank, wealth_peak, wealth_peak_at FROM users WHERE guild_id = ? AND user_id = ?');
const stmtSetWealthPeak = db.prepare('UPDATE users SET wealth_peak = ?, wealth_peak_at = ? WHERE guild_id = ? AND user_id = ?');

function bumpWealthPeak(guildId, userId) {
  const row = stmtGetWealthPeak.get(guildId, userId);
  if (!row) return;
  const current = row.cash + row.bank;
  if (current > row.wealth_peak) {
    stmtSetWealthPeak.run(current, Date.now(), guildId, userId);
  }
}

function applyCashDelta(guildId, userId, amount) {
  stmtAddCash.run(amount, guildId, userId);
  bumpWealthPeak(guildId, userId);
}

function applyBankDelta(guildId, userId, amount) {
  stmtAddBank.run(amount, guildId, userId);
  bumpWealthPeak(guildId, userId);
}

const WEALTH_PEAK_HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

export function getEffectiveWealth(guildId, userId) {
  guildId = GLOBAL_ID;
  const user = ensureUser(guildId, userId);
  const current = user.cash + user.bank;
  if (user.wealth_peak <= current || !user.wealth_peak_at) return current;
  const elapsedMs = Date.now() - user.wealth_peak_at;
  const decayFactor = Math.pow(0.5, elapsedMs / WEALTH_PEAK_HALF_LIFE_MS);
  const decayedPeak = current + (user.wealth_peak - current) * decayFactor;
  return Math.max(current, Math.round(decayedPeak));
}

export function resetGuildEconomy(guildId) {
  guildId = GLOBAL_ID;
  const result = stmtDeleteGuildUsers.run(guildId);
  return result.changes;
}

const userCreatedHooks = [];
export function onUserCreated(fn) {
  userCreatedHooks.push(fn);
}

export function ensureUser(guildId, userId) {
  guildId = GLOBAL_ID;
  let user = stmtGetUser.get(guildId, userId);
  if (!user) {
    const settings = ensureGuild(guildId);
    stmtInsertUser.run(guildId, userId, settings.starting_cash, settings.starting_bank);
    user = stmtGetUser.get(guildId, userId);
    for (const fn of userCreatedHooks) fn(guildId, userId);
    user = stmtGetUser.get(guildId, userId);
  }
  return user;
}

export function getBalance(guildId, userId) {
  guildId = GLOBAL_ID;
  const user = ensureUser(guildId, userId);
  return { cash: user.cash, bank: user.bank, total: user.cash + user.bank };
}

export function buildBalanceAutocomplete(guildId, userId, typed) {
  guildId = GLOBAL_ID;
  const balance = getBalance(guildId, userId);
  const suggestion = { name: `💰 Balance: ${balance.cash.toLocaleString('en-US')}`, value: 'all' };
  const needle = (typed ?? '').toLowerCase().trim();
  if (needle && !suggestion.name.toLowerCase().includes(needle) && !suggestion.value.includes(needle)) return [];
  return [suggestion];
}

export function addCash(guildId, userId, amount, source) {
  guildId = GLOBAL_ID;
  ensureUser(guildId, userId);
  applyCashDelta(guildId, userId, amount);
  recordGain(guildId, userId, 'cash', amount, source);
  return getBalance(guildId, userId);
}

export function addBank(guildId, userId, amount) {
  guildId = GLOBAL_ID;
  ensureUser(guildId, userId);
  applyBankDelta(guildId, userId, amount);
  return getBalance(guildId, userId);
}

export const deposit = db.transaction((guildId, userId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('Deposit amount must be a positive whole number.');
  }
  const user = ensureUser(guildId, userId);
  if (user.cash < amount) {
    throw new EconomyError(`You don't have that much cash on hand. You have **${user.cash}** in cash.`);
  }
  applyCashDelta(guildId, userId, -amount);
  applyBankDelta(guildId, userId, amount);
  return getBalance(guildId, userId);
});

export const withdraw = db.transaction((guildId, userId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('Withdraw amount must be a positive whole number.');
  }
  const user = ensureUser(guildId, userId);
  if (user.bank < 0) {
    throw new EconomyError(`Your bank is negative — you owe **${Math.abs(user.bank)}**. Nothing to withdraw until that's paid off.`);
  }
  if (user.bank < amount) {
    throw new EconomyError(`Your bank doesn't have that much. You have **${user.bank}** in the bank.`);
  }
  applyBankDelta(guildId, userId, -amount);
  applyCashDelta(guildId, userId, amount);
  return getBalance(guildId, userId);
});

export const pay = db.transaction((guildId, fromUserId, toUserId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('Pay amount must be a positive whole number.');
  }
  const sender = ensureUser(guildId, fromUserId);
  if (sender.bank < amount) {
    throw new EconomyError(`Your bank doesn't have that much. You have **${sender.bank}** in the bank.`);
  }
  ensureUser(guildId, toUserId);
  applyBankDelta(guildId, fromUserId, -amount);
  applyCashDelta(guildId, toUserId, amount);
  return { sender: getBalance(guildId, fromUserId), recipient: getBalance(guildId, toUserId) };
});

export const payArena = db.transaction((guildId, fromUserId, toUserId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('Pay amount must be a positive whole number.');
  }
  const senderBalance = getArenaBalance(guildId, fromUserId);
  if (senderBalance < amount) {
    throw new EconomyError(`You don't have that many arena coins. You have **${senderBalance}**.`);
  }
  ensureUser(guildId, toUserId);
  addArenaCoins(guildId, fromUserId, -amount);
  addArenaCoins(guildId, toUserId, amount);
  return {
    sender: { arenaCoins: getArenaBalance(guildId, fromUserId) },
    recipient: { arenaCoins: getArenaBalance(guildId, toUserId) },
  };
});

const stmtGetStat = db.prepare('SELECT * FROM game_stats WHERE guild_id = ? AND user_id = ? AND game = ?');
const stmtInsertStat = db.prepare('INSERT INTO game_stats (guild_id, user_id, game) VALUES (?, ?, ?)');
const stmtUpdateStat = db.prepare(`
  UPDATE game_stats
  SET plays = plays + 1,
      wins = wins + ?,
      losses = losses + ?,
      pushes = pushes + ?,
      net = net + ?
  WHERE guild_id = ? AND user_id = ? AND game = ?
`);
const stmtGetAllStatsForUser = db.prepare(
  'SELECT * FROM game_stats WHERE guild_id = ? AND user_id = ? ORDER BY game'
);

export const recordGameResult = db.transaction((guildId, userId, game, { outcome, net }) => {
  guildId = GLOBAL_ID;
  if (!stmtGetStat.get(guildId, userId, game)) {
    stmtInsertStat.run(guildId, userId, game);
  }
  stmtUpdateStat.run(
    outcome === 'win' ? 1 : 0,
    outcome === 'loss' ? 1 : 0,
    outcome === 'push' ? 1 : 0,
    net,
    guildId,
    userId,
    game
  );
  if (net < 0) recordLoss(guildId, userId, 'cash', -net, game);
});

export function getGameStats(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetAllStatsForUser.all(guildId, userId);
}

export const placeBet = db.transaction((guildId, userId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('Bet amount must be a positive whole number.');
  }
  const user = ensureUser(guildId, userId);
  if (user.cash < amount) {
    throw new EconomyError(`You don't have that much cash to bet. You have **${user.cash}** in cash.`);
  }
  applyCashDelta(guildId, userId, -amount);
  return getBalance(guildId, userId);
});

const stmtAddArena = db.prepare(`
  UPDATE users SET arena_coins = arena_coins + ?, updated_at = strftime('%s','now')
  WHERE guild_id = ? AND user_id = ?
`);

export function getArenaBalance(guildId, userId) {
  guildId = GLOBAL_ID;
  return ensureUser(guildId, userId).arena_coins;
}

export function addArenaCoins(guildId, userId, amount, source) {
  guildId = GLOBAL_ID;
  ensureUser(guildId, userId);
  stmtAddArena.run(amount, guildId, userId);
  recordGain(guildId, userId, 'arena', amount, source);
  return getArenaBalance(guildId, userId);
}
