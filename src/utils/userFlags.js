import db from '../database.js';

export const USER_FLAGS = {
  full_inventory: {
    label: 'Full Inventory',
    description: 'Always show /inventory at full page size, even with fewer items than would normally fill it',
  },
};

const stmtGet = db.prepare('SELECT enabled FROM user_flags WHERE user_id = ? AND flag_name = ?');
const stmtSet = db.prepare(
  `INSERT INTO user_flags (user_id, flag_name, enabled) VALUES (?, ?, ?)
   ON CONFLICT (user_id, flag_name) DO UPDATE SET enabled = excluded.enabled`
);

export function hasUserFlag(userId, flagName) {
  const row = stmtGet.get(userId, flagName);
  return Boolean(row?.enabled);
}

export function setUserFlag(userId, flagName, enabled) {
  stmtSet.run(userId, flagName, enabled ? 1 : 0);
}
