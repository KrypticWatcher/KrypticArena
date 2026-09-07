import db from '../database.js';
import { BITFIELD_FLAGS } from './permissions.js';

const PLAYER_DATA_TABLES = [
  'users',
  'gladiators',
  'game_stats',
  'inventory',
  'item_instances',
  'equipment',
  'loadouts',
  'collectible_claims',
  'adventure_repeat_buttons',
  'pending_duels',
  'pending_trades',
  'pending_sells',
  'roulette_rounds',
  'roulette_bets',
  'last_gamble_bet',
  
  
  
  
  
  
  
  
  
  
  'skill_xp',
  'pets',
  'heist_attempts',
  'heist_target_locks',
  'heist_box_charges',
  'heist_pending',
  'trading_post_listings',
];

const GLOBAL_PLAYER_DATA_TABLES = ['boss_kills', 'collection_log', 'adventure_tier_completions', 'user_flags', 'mob_kills', 'farming_patches', 'construction_projects'];

const deleteStatements = PLAYER_DATA_TABLES.map((table) => db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`));
const deleteGlobalStatements = GLOBAL_PLAYER_DATA_TABLES.map((table) => db.prepare(`DELETE FROM ${table}`));

const deleteListingInstances = db.prepare(
  'DELETE FROM trading_post_listing_instances WHERE listing_id IN (SELECT id FROM trading_post_listings WHERE guild_id = ?)'
);

const GLOBAL_BITFIELD_TABLE = 'user_bitfields';
const clearAdminBit = db.prepare(
  `UPDATE ${GLOBAL_BITFIELD_TABLE} SET flags = flags & ~${BITFIELD_FLAGS.ADMIN} WHERE (flags & ${BITFIELD_FLAGS.ADMIN}) != 0`
);
const deleteEmptyBitfieldRows = db.prepare(`DELETE FROM ${GLOBAL_BITFIELD_TABLE} WHERE flags = 0`);

export const resetGuildEconomy = db.transaction((guildId) => {
  const results = {};
  results.trading_post_listing_instances = deleteListingInstances.run(guildId).changes;
  for (let i = 0; i < PLAYER_DATA_TABLES.length; i++) {
    const info = deleteStatements[i].run(guildId);
    results[PLAYER_DATA_TABLES[i]] = info.changes;
  }
  for (let i = 0; i < GLOBAL_PLAYER_DATA_TABLES.length; i++) {
    const info = deleteGlobalStatements[i].run();
    results[GLOBAL_PLAYER_DATA_TABLES[i]] = info.changes;
  }
  results[GLOBAL_BITFIELD_TABLE] = clearAdminBit.run().changes;
  deleteEmptyBitfieldRows.run();
  return results;
});

const countStatements = PLAYER_DATA_TABLES.map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE guild_id = ?`));
const countGlobalStatements = GLOBAL_PLAYER_DATA_TABLES.map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`));
const countAdminBitfields = db.prepare(
  `SELECT COUNT(*) AS n FROM ${GLOBAL_BITFIELD_TABLE} WHERE (flags & ${BITFIELD_FLAGS.ADMIN}) != 0`
);
const countListingInstances = db.prepare(
  'SELECT COUNT(*) AS n FROM trading_post_listing_instances WHERE listing_id IN (SELECT id FROM trading_post_listings WHERE guild_id = ?)'
);

export function previewGuildEconomyReset(guildId) {
  const results = {};
  results.trading_post_listing_instances = countListingInstances.get(guildId).n;
  for (let i = 0; i < PLAYER_DATA_TABLES.length; i++) {
    results[PLAYER_DATA_TABLES[i]] = countStatements[i].get(guildId).n;
  }
  for (let i = 0; i < GLOBAL_PLAYER_DATA_TABLES.length; i++) {
    results[GLOBAL_PLAYER_DATA_TABLES[i]] = countGlobalStatements[i].get().n;
  }
  results[GLOBAL_BITFIELD_TABLE] = countAdminBitfields.get().n;
  return results;
}

export const GLOBAL_RESET_TABLES = new Set([...GLOBAL_PLAYER_DATA_TABLES, GLOBAL_BITFIELD_TABLE]);
