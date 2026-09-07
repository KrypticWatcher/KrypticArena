import db from '../database.js';

const stmtGet = db.prepare('SELECT * FROM blacklisted_users WHERE user_id = ?');
const stmtInsert = db.prepare(
  'INSERT INTO blacklisted_users (user_id, reason, blacklisted_by) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET reason = excluded.reason, blacklisted_by = excluded.blacklisted_by, blacklisted_at = strftime(\'%s\',\'now\')'
);
const stmtDelete = db.prepare('DELETE FROM blacklisted_users WHERE user_id = ?');
const stmtAll = db.prepare('SELECT * FROM blacklisted_users ORDER BY blacklisted_at DESC');

export function isBlacklisted(userId) {
  return Boolean(stmtGet.get(userId));
}

export function getBlacklistEntry(userId) {
  return stmtGet.get(userId) ?? null;
}

export function addToBlacklist(userId, reason, blacklistedBy) {
  stmtInsert.run(userId, reason || null, blacklistedBy);
}

export function removeFromBlacklist(userId) {
  const result = stmtDelete.run(userId);
  return result.changes > 0;
}

export function getBlacklist() {
  return stmtAll.all();
}
