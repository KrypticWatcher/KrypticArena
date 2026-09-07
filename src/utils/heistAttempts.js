import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';

const HEIST_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const REPEAT_TARGET_BLOCK_MS = 24 * 60 * 60 * 1000;

const stmtGetLastAttemptAt = db.prepare('SELECT last_attempt_at FROM heist_attempts WHERE guild_id = ? AND attacker_user_id = ?');
const stmtSetLastAttemptAt = db.prepare(`
  INSERT INTO heist_attempts (guild_id, attacker_user_id, last_attempt_at)
  VALUES (?, ?, ?)
  ON CONFLICT(guild_id, attacker_user_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at
`);

const stmtGetTargetLock = db.prepare(
  'SELECT locked_at FROM heist_target_locks WHERE guild_id = ? AND attacker_user_id = ? AND target_user_id = ?'
);
const stmtSetTargetLock = db.prepare(`
  INSERT INTO heist_target_locks (guild_id, attacker_user_id, target_user_id, locked_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, attacker_user_id, target_user_id) DO UPDATE SET locked_at = excluded.locked_at
`);

export function getHeistCooldownRemainingMs(guildId, attackerUserId) {
  guildId = GLOBAL_ID;
  const row = stmtGetLastAttemptAt.get(guildId, attackerUserId);
  if (!row) return 0;
  const elapsed = Date.now() - row.last_attempt_at;
  return Math.max(0, HEIST_COOLDOWN_MS - elapsed);
}

export function isHeistOnCooldown(guildId, attackerUserId) {
  return getHeistCooldownRemainingMs(guildId, attackerUserId) > 0;
}

export function isRepeatTarget(guildId, attackerUserId, targetUserId) {
  guildId = GLOBAL_ID;
  const row = stmtGetTargetLock.get(guildId, attackerUserId, targetUserId);
  if (!row) return false;
  return Date.now() - row.locked_at < REPEAT_TARGET_BLOCK_MS;
}

export function recordHeistAttempt(guildId, attackerUserId, targetUserId) {
  guildId = GLOBAL_ID;
  const now = Date.now();
  stmtSetLastAttemptAt.run(guildId, attackerUserId, now);
  stmtSetTargetLock.run(guildId, attackerUserId, targetUserId, now);
}

export function clearHeistCooldown(guildId, attackerUserId) {
  guildId = GLOBAL_ID;
  stmtSetLastAttemptAt.run(guildId, attackerUserId, Date.now() - HEIST_COOLDOWN_MS);
}
