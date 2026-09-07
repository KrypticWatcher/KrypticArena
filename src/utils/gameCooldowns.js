import db from '../database.js';
import { ensureUser, ensureGuild } from './economy.js';
import { GLOBAL_ID } from './globalId.js';

const COOLDOWN_COLUMNS = {
  blackjack: { lastAt: 'last_blackjack_at', seconds: 'blackjack_cooldown_seconds' },
  roulette: { lastAt: 'last_roulette_at', seconds: 'roulette_cooldown_seconds' },
  dice: { lastAt: 'last_dice_at', seconds: 'dice_cooldown_seconds' },
  slots: { lastAt: 'last_slots_at', seconds: 'slots_cooldown_seconds' },
};

const updaters = {};
function getUpdater(game) {
  if (!updaters[game]) {
    const { lastAt } = COOLDOWN_COLUMNS[game];
    updaters[game] = db.prepare(`UPDATE users SET ${lastAt} = ? WHERE guild_id = ? AND user_id = ?`);
  }
  return updaters[game];
}

export function checkGameCooldown(guildId, userId, game) {
  const settings = ensureGuild(guildId);
  const user = ensureUser(guildId, userId);
  const { lastAt, seconds } = COOLDOWN_COLUMNS[game];
  const readyAt = user[lastAt] + settings[seconds] * 1000;
  if (Date.now() < readyAt) {
    return { onCooldown: true, readyAt };
  }
  return { onCooldown: false };
}

export function recordGamePlay(guildId, userId, game) {
  getUpdater(game).run(Date.now(), GLOBAL_ID, userId);
}
