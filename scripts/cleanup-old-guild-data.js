import 'dotenv/config';
import db from '../src/database.js';
import { GLOBAL_ID } from '../src/utils/globalId.js';

const GLOBAL_TABLES = [
  'users',
  'gladiators',
  'inventory',
  'equipment',
  'item_instances',
  'loadouts',
  'collectible_claims',
  'game_stats',
  'banned_name_words',
  'elixir_purchase_limit',
  'trading_post_tax',
  'trading_post_listings',
  'trading_post_lock',
  'trading_post_trade_history',
];

console.log(`Cleaning up rows not under guild_id = '${GLOBAL_ID}'...\n`);

let totalDeleted = 0;
for (const table of GLOBAL_TABLES) {
  const result = db.prepare(`DELETE FROM ${table} WHERE guild_id != ?`).run(GLOBAL_ID);
  console.log(`  ${table}: removed ${result.changes} orphaned row(s)`);
  totalDeleted += result.changes;
}

const orphanedInstances = db
  .prepare('DELETE FROM trading_post_listing_instances WHERE listing_id NOT IN (SELECT id FROM trading_post_listings)')
  .run();
console.log(`  trading_post_listing_instances: removed ${orphanedInstances.changes} dangling row(s)`);
totalDeleted += orphanedInstances.changes;

console.log(`\nDone — ${totalDeleted} total row(s) removed. guild_settings and per-server tables were left untouched.`);
