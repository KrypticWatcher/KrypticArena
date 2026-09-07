import db from '../database.js';

const stmtGet = db.prepare('SELECT value FROM bot_config WHERE key = ?');
const stmtSet = db.prepare(`
  INSERT INTO bot_config (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const MAIN_GUILD_KEY = 'main_guild_id';

export function getMainGuildId() {
  return stmtGet.get(MAIN_GUILD_KEY)?.value ?? null;
}

export function setMainGuildId(guildId) {
  stmtSet.run(MAIN_GUILD_KEY, guildId);
}

export function isMainServer(guildId) {
  const mainGuildId = getMainGuildId();
  return mainGuildId !== null && guildId === mainGuildId;
}
