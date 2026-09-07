import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { xpForLevel, levelForXp, MAX_GLADIATOR_LEVEL } from './xp.js';

export const MAX_SKILL_LEVEL = MAX_GLADIATOR_LEVEL;

export const SKILL_IDS = [
  'attack', 'strength', 'defence', 'ranged', 'magic',
  'mining', 'smithing', 'woodcutting', 'fletching', 'fishing',
  'cooking', 'farming', 'herbalism', 'hunting', 'crafting', 'construction',
];

const stmtGetXp = db.prepare('SELECT xp FROM skill_xp WHERE guild_id = ? AND user_id = ? AND skill_id = ?');
const stmtSetXp = db.prepare(`
  INSERT INTO skill_xp (guild_id, user_id, skill_id, xp) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, skill_id) DO UPDATE SET xp = excluded.xp
`);
const stmtGetAllForUser = db.prepare('SELECT skill_id, xp FROM skill_xp WHERE guild_id = ? AND user_id = ?');

export function getSkillXp(guildId, userId, skillId) {
  guildId = GLOBAL_ID;
  return stmtGetXp.get(guildId, userId, skillId)?.xp ?? 0;
}

export function getSkillLevel(guildId, userId, skillId) {
  return levelForXp(getSkillXp(guildId, userId, skillId));
}

export function getAllSkillLevels(guildId, userId) {
  guildId = GLOBAL_ID;
  const rows = stmtGetAllForUser.all(guildId, userId);
  const bySkill = Object.fromEntries(rows.map((r) => [r.skill_id, r.xp]));
  const result = {};
  for (const skillId of SKILL_IDS) {
    result[skillId] = levelForXp(bySkill[skillId] ?? 0);
  }
  return result;
}

export function getAllSkillData(guildId, userId) {
  guildId = GLOBAL_ID;
  const rows = stmtGetAllForUser.all(guildId, userId);
  const bySkill = Object.fromEntries(rows.map((r) => [r.skill_id, r.xp]));
  const result = {};
  for (const skillId of SKILL_IDS) {
    const xp = bySkill[skillId] ?? 0;
    result[skillId] = { xp, level: levelForXp(xp) };
  }
  return result;
}

export const addSkillXp = db.transaction((guildId, userId, skillId, amount) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Skill XP amount must be a positive whole number.');
  }
  const before = getSkillXp(guildId, userId, skillId);
  const beforeLevel = levelForXp(before);
  const maxXp = xpForLevel(MAX_SKILL_LEVEL);
  const newXp = Math.min(maxXp, before + amount);
  const afterLevel = levelForXp(newXp);
  stmtSetXp.run(guildId, userId, skillId, newXp);
  return { xpGained: newXp - before, xpTotal: newXp, beforeLevel, afterLevel, leveledUp: afterLevel > beforeLevel };
});
