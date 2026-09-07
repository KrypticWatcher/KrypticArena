import db from '../database.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const SKILL_REPEAT_TRIP_PREFIX = 'skill-repeat-trip';

export function skillRepeatTripCustomId() {
  return SKILL_REPEAT_TRIP_PREFIX;
}

export function skillRepeatTripRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(skillRepeatTripCustomId()).setLabel('🔁 Repeat Trip').setStyle(ButtonStyle.Primary)
  );
}

export function parseSkillRepeatTripCustomId(customId) {
  return customId === SKILL_REPEAT_TRIP_PREFIX;
}

const stmtUpsert = db.prepare(`
  INSERT INTO last_trip_settings (user_id, trip_type, settings_json, sent_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (user_id, trip_type) DO UPDATE SET settings_json = excluded.settings_json, sent_at = excluded.sent_at
`);
const stmtGet = db.prepare('SELECT settings_json, sent_at FROM last_trip_settings WHERE user_id = ? AND trip_type = ?');
const stmtGetMostRecent = db.prepare('SELECT trip_type, settings_json, sent_at FROM last_trip_settings WHERE user_id = ? ORDER BY sent_at DESC LIMIT 1');

export function recordLastTripSettings(userId, tripType, settings) {
  stmtUpsert.run(userId, tripType, JSON.stringify(settings), Date.now());
}

export function getLastTripSettings(userId, tripType) {
  const row = stmtGet.get(userId, tripType);
  if (!row) return null;
  try {
    return JSON.parse(row.settings_json);
  } catch {
    return null;
  }
}

export function getMostRecentTripSettings(userId) {
  const row = stmtGetMostRecent.get(userId);
  if (!row) return null;
  try {
    return { tripType: row.trip_type, settings: JSON.parse(row.settings_json) };
  } catch {
    return null;
  }
}
