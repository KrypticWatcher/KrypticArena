import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { EconomyError } from './economy.js';
import { addSkillXp } from './skills.js';
import { ensureUser } from './economy.js';

export const TRAINING_STYLES = ['attack', 'strength', 'defence', 'ranged', 'magic', 'balanced'];
export const DEFAULT_TRAINING_STYLE = 'balanced';

const BALANCED_SKILLS = ['attack', 'strength', 'defence'];

const REQUIRED_WEAPON_TYPE = { ranged: 'bow', magic: 'staff' };
const REQUIRED_GEAR_LABEL = { ranged: 'a Bow with Arrows', magic: 'a Staff' };

const stmtGetStyle = db.prepare('SELECT training_style FROM users WHERE guild_id = ? AND user_id = ?');
const stmtSetStyle = db.prepare('UPDATE users SET training_style = ?, updated_at = strftime(\'%s\',\'now\') WHERE guild_id = ? AND user_id = ?');

export function getTrainingStyle(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetStyle.get(guildId, userId)?.training_style ?? DEFAULT_TRAINING_STYLE;
}

export function setTrainingStyle(guildId, userId, style) {
  guildId = GLOBAL_ID;
  if (!TRAINING_STYLES.includes(style)) {
    throw new EconomyError(`\`${style}\` isn't a valid training style.`);
  }
  ensureUser(guildId, userId);
  stmtSetStyle.run(style, guildId, userId);
  return style;
}

export function requireTrainingGear(guildId, userId, adventureSet) {
  const style = getTrainingStyle(guildId, userId);
  const requiredType = REQUIRED_WEAPON_TYPE[style];
  if (!requiredType) return style; 

  const weapon = adventureSet.main_hand;
  if (!weapon || weapon.weaponSubtype !== requiredType) {
    throw new EconomyError(
      `You're training **${style[0].toUpperCase()}${style.slice(1)}** — you need ${REQUIRED_GEAR_LABEL[style]} equipped in your Slayer set before sending a /slay or Boss Challenge trip. Switch styles with /train, or equip the right gear first.`
    );
  }
  if (requiredType === 'bow') {
    const arrows = adventureSet.arrows;
    if (!arrows || arrows.quantity < 1) {
      throw new EconomyError(
        `You're training **Ranged** — you have a Bow equipped but no Arrows. Equip some before sending a /slay or Boss Challenge trip.`
      );
    }
  }
  return style;
}

export const awardCombatSkillXp = db.transaction((guildId, userId, totalCombatXp) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(totalCombatXp) || totalCombatXp <= 0) return [];

  const style = getTrainingStyle(guildId, userId);
  const results = [];

  if (style !== 'balanced') {
    results.push({ skillId: style, ...addSkillXp(guildId, userId, style, totalCombatXp) });
    return results;
  }

  const base = Math.floor(totalCombatXp / BALANCED_SKILLS.length);
  let remainder = totalCombatXp - base * BALANCED_SKILLS.length;
  for (const skillId of BALANCED_SKILLS) {
    const share = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (share > 0) results.push({ skillId, ...addSkillXp(guildId, userId, skillId, share) });
  }
  return results;
});

export function formatCombatSkillXpLines(results) {
  return results.map((r) => {
    const label = `${r.skillId[0].toUpperCase()}${r.skillId.slice(1)}`;
    let line = `✨ **+${r.xpGained.toLocaleString('en-US')} ${label} XP**`;
    if (r.leveledUp) line += ` — 🆙 **Level ${r.afterLevel}!**`;
    return line;
  });
}
