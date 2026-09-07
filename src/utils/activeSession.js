import { EconomyError } from './economy.js';

const active = new Map(); 

export function getActiveLabel(guildId, userId) {
  return active.get(userId) ?? null;
}

export function startSession(guildId, userId, label) {
  const existing = active.get(userId);
  if (existing) {
    throw new EconomyError(
      `You already have **${existing}** in progress — finish it (or let it time out) before starting something new.`
    );
  }
  active.set(userId, label);
}

export function endSession(guildId, userId) {
  active.delete(userId);
}
