import db from '../database.js';
import crypto from 'crypto';

const stmtInsert = db.prepare(
  `INSERT INTO pending_sells (sell_key, guild_id, user_id, items_json, arena_value, cash_value) VALUES (?, ?, ?, ?, ?, ?)`
);
const stmtGet = db.prepare('SELECT * FROM pending_sells WHERE sell_key = ?');
const stmtDelete = db.prepare('DELETE FROM pending_sells WHERE sell_key = ?');

export function recordPendingSell(guildId, userId, items, arenaValue, cashValue) {
  const sellKey = crypto.randomBytes(8).toString('hex');
  stmtInsert.run(sellKey, guildId, userId, JSON.stringify(items), arenaValue, cashValue);
  return sellKey;
}

export function getPendingSell(sellKey) {
  const row = stmtGet.get(sellKey);
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items_json) };
}

export function clearPendingSell(sellKey) {
  stmtDelete.run(sellKey);
}
