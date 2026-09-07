import 'dotenv/config';
import db from '../src/database.js';

const MOVED_ITEM_IDS = [
  'custos_aegis_blade',
  'custos_aegis_shield',
  'horatius_stand_spear',
  'horatius_stand_scutum',
  'cassandras_ward_dagger',
  'aeneas_shelter_spear',
  'aeneas_shelter_shield',
];

const apply = process.argv.includes('--apply');
const placeholders = MOVED_ITEM_IDS.map(() => '?').join(',');

function run() {
  
  const instances = db
    .prepare(`SELECT instance_id, guild_id, user_id, item_id FROM item_instances WHERE item_id IN (${placeholders})`)
    .all(...MOVED_ITEM_IDS);
  const instanceIds = instances.map((i) => i.instance_id);
  const instancePlaceholders = instanceIds.map(() => '?').join(',');

  console.log(`Found ${instances.length} physical instance(s) of the 7 moved items across all players.`);

  
  const SLOT_COLUMNS = ['helmet', 'chest', 'legs', 'boots', 'gloves', 'main_hand', 'off_hand'];
  let equipmentRowsTouched = 0;
  if (instanceIds.length > 0) {
    const equipmentRows = db.prepare('SELECT rowid, * FROM equipment').all();
    for (const row of equipmentRows) {
      const updates = {};
      for (const col of SLOT_COLUMNS) {
        if (row[col] && instanceIds.includes(row[col])) updates[col] = null;
      }
      if (Object.keys(updates).length === 0) continue;
      equipmentRowsTouched++;
      if (apply) {
        const setClause = Object.keys(updates).map((col) => `${col} = NULL`).join(', ');
        db.prepare(`UPDATE equipment SET ${setClause} WHERE rowid = ?`).run(row.rowid);
      }
    }
  }
  console.log(`equipment: ${equipmentRowsTouched} row(s) had a slot cleared.`);

  
  let loadoutRowsTouched = 0;
  if (instanceIds.length > 0) {
    const loadoutRows = db.prepare('SELECT rowid, * FROM loadouts').all();
    for (const row of loadoutRows) {
      const updates = {};
      for (const col of SLOT_COLUMNS) {
        if (row[col] && instanceIds.includes(row[col])) updates[col] = null;
      }
      if (Object.keys(updates).length === 0) continue;
      loadoutRowsTouched++;
      if (apply) {
        const setClause = Object.keys(updates).map((col) => `${col} = NULL`).join(', ');
        db.prepare(`UPDATE loadouts SET ${setClause} WHERE rowid = ?`).run(row.rowid);
      }
    }
  }
  console.log(`loadouts: ${loadoutRowsTouched} row(s) had a slot cleared.`);

  
  const activeListings = db
    .prepare(`SELECT id FROM trading_post_listings WHERE item_id IN (${placeholders}) AND status = 'active'`)
    .all(...MOVED_ITEM_IDS);
  console.log(`trading_post_listings: ${activeListings.length} active listing(s) will be cancelled.`);
  if (apply) {
    for (const listing of activeListings) {
      db.prepare(`DELETE FROM trading_post_listing_instances WHERE listing_id = ?`).run(listing.id);
      db.prepare(`UPDATE trading_post_listings SET status = 'cancelled', updated_at = strftime('%s','now') WHERE id = ?`).run(listing.id);
    }
  }

  
  if (apply && instanceIds.length > 0) {
    db.prepare(`DELETE FROM item_instances WHERE instance_id IN (${instancePlaceholders})`).run(...instanceIds);
  }

  
  const clogRows = db
    .prepare(`SELECT COUNT(*) AS n FROM collection_log WHERE item_id IN (${placeholders})`)
    .get(...MOVED_ITEM_IDS).n;
  console.log(`collection_log: ${clogRows} row(s) will be cleared.`);
  if (apply) {
    db.prepare(`DELETE FROM collection_log WHERE item_id IN (${placeholders})`).run(...MOVED_ITEM_IDS);
  }

  
  if (instanceIds.length > 0) {
    const pendingTrades = db.prepare('SELECT trade_key, send_side_json FROM pending_trades').all();
    const pendingSells = db.prepare('SELECT sell_key, items_json FROM pending_sells').all();
    const flaggedTrades = pendingTrades.filter((r) => instanceIds.some((id) => r.send_side_json.includes(id)));
    const flaggedSells = pendingSells.filter((r) => instanceIds.some((id) => r.items_json.includes(id)));
    if (flaggedTrades.length || flaggedSells.length) {
      console.log(`\n⚠️  ${flaggedTrades.length} pending trade(s) and ${flaggedSells.length} pending sell(s) reference an affected instance.`);
      console.log('   These were NOT touched — let them resolve/cancel naturally, then re-run this script.');
      flaggedTrades.forEach((r) => console.log(`   pending_trades: ${r.trade_key}`));
      flaggedSells.forEach((r) => console.log(`   pending_sells: ${r.sell_key}`));
    } else {
      console.log('\npending_trades / pending_sells: none reference an affected instance.');
    }
  }

  console.log(apply ? '\n✅ Applied.' : '\nDry run only — nothing was changed. Re-run with --apply to actually do this.');
}

run();
