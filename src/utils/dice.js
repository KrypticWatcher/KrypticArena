import db from '../database.js';
import { EconomyError, placeBet, addCash, ensureGuild, recordGameResult } from './economy.js';
import { checkGameCooldown, recordGamePlay } from './gameCooldowns.js';
import { formatDuration } from './format.js';

export const DICE_PAYOUT_TABLE = {
  venus: { multiplier: 30, label: '🌟 Venus Throw' }, 
  triple: { multiplier: 4.5, label: 'Triple' }, 
  straight: { multiplier: 0.7, label: 'Straight' }, 
  pair: { multiplier: 0.15, label: 'Pair' }, 
  none: { multiplier: 0, label: 'Nothing' },
};

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

export function classifyRoll(dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  const [a, b, c] = sorted;

  if (a === b && b === c) return a === 6 ? 'venus' : 'triple';
  if (b === a + 1 && c === b + 1) return 'straight';
  if (a === b || b === c || a === c) return 'pair';
  return 'none';
}

export function rollDice() {
  const dice = [rollDie(), rollDie(), rollDie()];
  return { dice, kind: classifyRoll(dice) };
}

export const playDice = db.transaction((guildId, userId, bet) => {
  const settings = ensureGuild(guildId);

  const cooldown = checkGameCooldown(guildId, userId, 'dice');
  if (cooldown.onCooldown) {
    throw new EconomyError(`Slow down — you can roll again in **${formatDuration(cooldown.readyAt - Date.now())}**.`);
  }

  if (!Number.isInteger(bet) || bet < settings.dice_min_bet) {
    throw new EconomyError(`Bet must be a whole number of at least **${settings.dice_min_bet.toLocaleString('en-US')}**.`);
  }

  placeBet(guildId, userId, bet);
  recordGamePlay(guildId, userId, 'dice');

  const roll = rollDice();
  const scalar = settings.dice_payout_multiplier_pct / 100;
  const tier = DICE_PAYOUT_TABLE[roll.kind];
  const profit = roll.kind === 'none' ? -bet : Math.round(bet * tier.multiplier * scalar);
  const payout = roll.kind === 'none' ? 0 : bet + profit;

  if (payout > 0) addCash(guildId, userId, payout, 'dice');
  recordGameResult(guildId, userId, 'dice', { outcome: roll.kind === 'none' ? 'loss' : 'win', net: profit });

  return { roll, bet, profit, payout };
});
