import fs from 'fs';
import path from 'path';
import db from '../database.js';

export const ADMIN_ACTIONS = {
  MONEY_ADD: 'money.add',
  MONEY_REMOVE: 'money.remove',
  ITEM_GRANT: 'item.grant',
  ITEM_REMOVE: 'item.remove',
  GLADIATOR_XP_ADD: 'gladiator.xp.add',
  GLADIATOR_XP_REMOVE: 'gladiator.xp.remove',
  GLADIATOR_XP_SET: 'gladiator.xp.set',
  GLADIATOR_RENAME: 'gladiator.rename',
  ADVENTURE_COMPLETE_NOW: 'adventure.complete_now',
  ADVENTURE_CANCEL: 'adventure.cancel',
  DURABILITY_SET: 'durability.set',
  DURABILITY_REPAIR: 'durability.repair',
  RESET_ECONOMY: 'reset.economy',
  RESET_INVENTORY: 'reset.inventory',
  RESET_GLADIATOR: 'reset.gladiator',
  RESET_ARENA_STATS: 'reset.arena_stats',
  RESET_CASINO_STATS: 'reset.casino_stats',
  RESET_STARTER_CLAIM: 'reset.starter_claim',
  RESET_EVERYTHING: 'reset.everything',
  SETTINGS_CHANGE: 'settings.change',
  
  BITFIELD_GRANT: 'bitfield.grant',
  BITFIELD_REVOKE: 'bitfield.revoke',
  BLACKLIST_ADD: 'blacklist.add',
  BLACKLIST_REMOVE: 'blacklist.remove',
  HADES_GRANT: 'hades.grant',
  OWNER_RESET_ECONOMY: 'owner.reset_economy',
  
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_RESTART: 'system.restart',
  SYSTEM_DEPLOY: 'system.deploy',
  
  NAMEFILTER_ADD: 'namefilter.add',
  NAMEFILTER_REMOVE: 'namefilter.remove',
};

const stmtInsert = db.prepare(`
  INSERT INTO admin_audit_log (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)
`);
const stmtRecent = db.prepare('SELECT * FROM admin_audit_log WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?');
const stmtRecentForTarget = db.prepare(
  'SELECT * FROM admin_audit_log WHERE guild_id = ? AND target_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
);

const VALID_MODULES = new Set(['admin', 'owner', 'mod', 'system']);

function getLogDir() {
  const dir = process.env.LOG_DIR?.trim() || 'logs';
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err.message);
    return null;
  }
  return dir;
}

function appendToFile(module, guildId, actorId, action, targetId, details) {
  const dir = getLogDir();
  if (!dir) return;
  try {
    const filePath = path.join(dir, `${module}.log`);
    const timestamp = new Date().toISOString();
    const targetPart = targetId ? ` target=${targetId}` : '';
    const detailsPart = details ? ` details="${details}"` : '';
    const line = `[${timestamp}] guild=${guildId} actor=${actorId} action=${action}${targetPart}${detailsPart}\n`;
    fs.appendFileSync(filePath, line);
  } catch (err) {
    console.error(`Failed to write ${module}.log:`, err.message);
  }
}

export function logAdminAction(guildId, actorId, action, targetId, details, module = 'admin') {
  stmtInsert.run(guildId, actorId, action, targetId ?? null, details ?? null);
  const safeModule = VALID_MODULES.has(module) ? module : 'admin';
  appendToFile(safeModule, guildId, actorId, action, targetId, details);
}

export function getRecentAuditLog(guildId, limit = 20) {
  return stmtRecent.all(guildId, limit);
}

export function getRecentAuditLogForTarget(guildId, targetId, limit = 20) {
  return stmtRecentForTarget.all(guildId, targetId, limit);
}
