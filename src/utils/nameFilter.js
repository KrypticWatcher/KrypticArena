import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';

const stmtAll = db.prepare('SELECT * FROM banned_name_words WHERE guild_id = ? ORDER BY match_type, word');
const stmtInsert = db.prepare(
  'INSERT INTO banned_name_words (guild_id, word, match_type, added_by) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(guild_id, word, match_type) DO NOTHING'
);
const stmtDelete = db.prepare('DELETE FROM banned_name_words WHERE guild_id = ? AND word = ? AND match_type = ?');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findBannedWord(guildId, name) {
  guildId = GLOBAL_ID;
  const lowerName = name.toLowerCase();
  const entries = stmtAll.all(guildId);

  for (const entry of entries) {
    const lowerWord = entry.word.toLowerCase();
    if (entry.match_type === 'wildcard') {
      if (lowerName.includes(lowerWord)) return entry.word;
    } else {
      const pattern = new RegExp(`\\b${escapeRegExp(lowerWord)}\\b`, 'i');
      if (pattern.test(lowerName)) return entry.word;
    }
  }

  return null;
}

export function addBannedWord(guildId, word, matchType, addedBy) {
  guildId = GLOBAL_ID;
  const trimmed = word.trim();
  if (!trimmed) return false;
  const result = stmtInsert.run(guildId, trimmed, matchType, addedBy);
  return result.changes > 0;
}

export function removeBannedWord(guildId, word, matchType) {
  guildId = GLOBAL_ID;
  const result = stmtDelete.run(guildId, word.trim(), matchType);
  return result.changes > 0;
}

export function getBannedWords(guildId) {
  guildId = GLOBAL_ID;
  return stmtAll.all(guildId);
}
