import db from '../database.js';
import { EconomyError, placeBet, addCash, ensureGuild, recordGameResult } from './economy.js';
import { checkGameCooldown, recordGamePlay } from './gameCooldowns.js';
import { formatDuration } from './format.js';

export const SLOTS_PAYOUT_TABLE = [
  { key: 'shield', emoji: '🛡️', weight: 32, pair: 0.2, triple: 2 },
  { key: 'gladius', emoji: '⚔️', weight: 24, pair: 0.3, triple: 3.5 },
  { key: 'torch', emoji: '🔥', weight: 18, pair: 0.5, triple: 6 },
  { key: 'lion', emoji: '🦁', weight: 13, pair: 0.8, triple: 12 },
  { key: 'colosseum', emoji: '🏛️', weight: 9, pair: 1.5, triple: 30 },
  { key: 'crown', emoji: '👑', weight: 4, pair: 2.5, triple: 90 },
];
const TOTAL_WEIGHT = SLOTS_PAYOUT_TABLE.reduce((sum, s) => sum + s.weight, 0);

function spinReel() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const symbol of SLOTS_PAYOUT_TABLE) {
    if (roll < symbol.weight) return symbol;
    roll -= symbol.weight;
  }
  return SLOTS_PAYOUT_TABLE[SLOTS_PAYOUT_TABLE.length - 1]; 
}

export function resolveSpin() {
  const reels = [spinReel(), spinReel(), spinReel()];
  const [a, b, c] = reels;

  if (a.key === b.key && b.key === c.key) {
    return { reels, kind: 'triple', matchedSymbol: a, multiplier: a.triple };
  }
  if (a.key === b.key || b.key === c.key || a.key === c.key) {
    const matchedSymbol = a.key === b.key || a.key === c.key ? a : b;
    return { reels, kind: 'pair', matchedSymbol, multiplier: matchedSymbol.pair };
  }
  return { reels, kind: 'none', matchedSymbol: null, multiplier: 0 };
}

export const playSlots = db.transaction((guildId, userId, bet) => {
  const settings = ensureGuild(guildId);

  const cooldown = checkGameCooldown(guildId, userId, 'slots');
  if (cooldown.onCooldown) {
    throw new EconomyError(`Slow down — you can spin again in **${formatDuration(cooldown.readyAt - Date.now())}**.`);
  }

  if (!Number.isInteger(bet) || bet < settings.slots_min_bet) {
    throw new EconomyError(`Bet must be a whole number of at least **${settings.slots_min_bet.toLocaleString('en-US')}**.`);
  }

  placeBet(guildId, userId, bet);
  recordGamePlay(guildId, userId, 'slots');

  const spin = resolveSpin();
  const scalar = settings.slots_payout_multiplier_pct / 100;
  const profitMultiplier = spin.multiplier * scalar;
  const profit = spin.kind === 'none' ? -bet : Math.round(bet * profitMultiplier);
  const payout = spin.kind === 'none' ? 0 : bet + profit;

  if (payout > 0) addCash(guildId, userId, payout, 'slots');
  recordGameResult(guildId, userId, 'slots', { outcome: spin.kind === 'none' ? 'loss' : 'win', net: profit });

  return { spin, bet, profit, payout };
});
