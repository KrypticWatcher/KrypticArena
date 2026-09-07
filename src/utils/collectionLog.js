import db from '../database.js';
import { getItem } from '../data/items.js';
import { getCollectionLogCategory } from './collectionLogTaxonomy.js';

function normalizeItemIdKey(id) {
  const str = String(id);
  const match = /^(-?\d+)\.0$/.exec(str);
  return match ? match[1] : str;
}

const stmtRecordObtain = db.prepare(
  `INSERT INTO collection_log (user_id, item_id, quantity) VALUES (?, ?, ?)
   ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`
);

export function recordCollectionLogObtain(userId, itemId, quantity = 1) {
  if (quantity <= 0) return;
  stmtRecordObtain.run(userId, normalizeItemIdKey(itemId), quantity);
}

export function recordCollectionLogObtainMany(userId, itemIds) {
  const counts = new Map();
  for (const id of itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [itemId, quantity] of counts) recordCollectionLogObtain(userId, itemId, quantity);
}

const stmtGetOne = db.prepare('SELECT quantity FROM collection_log WHERE user_id = ? AND item_id = ?');
const stmtGetAllForUser = db.prepare('SELECT item_id, quantity FROM collection_log WHERE user_id = ?');

export function getCollectionLogQuantity(userId, itemId) {
  return stmtGetOne.get(userId, normalizeItemIdKey(itemId))?.quantity ?? 0;
}

export function getNewlyUnlockedItemIds(userId, itemIds) {
  const uniqueIds = [...new Set(itemIds)];
  return new Set(uniqueIds.filter((id) => getCollectionLogQuantity(userId, id) === 0));
}

export function getAllCollectionLogEntries(userId) {
  return stmtGetAllForUser.all(userId);
}

const stmtRecordTierCompletion = db.prepare(
  `INSERT INTO adventure_tier_completions (user_id, tier, count) VALUES (?, ?, 1)
   ON CONFLICT (user_id, tier) DO UPDATE SET count = count + 1`
);
const stmtGetTierCompletion = db.prepare('SELECT count FROM adventure_tier_completions WHERE user_id = ? AND tier = ?');

export function recordAdventureTierCompletion(userId, tier) {
  if (!tier) return;
  stmtRecordTierCompletion.run(userId, tier);
}

export function getAdventureTierCompletionCount(userId, tier) {
  return stmtGetTierCompletion.get(userId, tier)?.count ?? 0;
}

export function backfillMissingCollectionLogEntries() {
  const instanceCounts = db
    .prepare('SELECT user_id, item_id, COUNT(*) AS quantity FROM item_instances GROUP BY user_id, item_id')
    .all();
  const toolStacks = db.prepare("SELECT user_id, item_id, quantity FROM inventory WHERE quantity > 0").all();

  const insertIfMissing = db.prepare(
    `INSERT INTO collection_log (user_id, item_id, quantity) VALUES (?, ?, ?)
     ON CONFLICT (user_id, item_id) DO NOTHING`
  );

  let inserted = 0;
  const backfill = db.transaction((rows) => {
    for (const { user_id, item_id, quantity } of rows) {
      const item = getItem(Number(item_id));
      if (!item) continue;
      if (getCollectionLogCategory(item) === null) continue;
      
      
      
      
      const result = insertIfMissing.run(user_id, normalizeItemIdKey(item_id), quantity);
      if (result.changes > 0) inserted++;
    }
  });

  backfill([...instanceCounts, ...toolStacks]);
  if (inserted > 0) {
    console.log(`Collection Log backfill: inserted ${inserted} missing entr${inserted === 1 ? 'y' : 'ies'} from existing ownership.`);
  }
}

export function repairCorruptedCollectionLogItemIds() {
  const corrupted = db.prepare("SELECT user_id, item_id, quantity, first_obtained_at FROM collection_log WHERE item_id LIKE '%.0'").all();
  if (corrupted.length === 0) return;

  const deleteOld = db.prepare('DELETE FROM collection_log WHERE user_id = ? AND item_id = ?');
  const upsertClean = db.prepare(`
    INSERT INTO collection_log (user_id, item_id, quantity, first_obtained_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, item_id) DO UPDATE SET
      quantity = quantity + excluded.quantity,
      first_obtained_at = MIN(first_obtained_at, excluded.first_obtained_at)
  `);

  const repair = db.transaction((rows) => {
    for (const row of rows) {
      const cleanId = normalizeItemIdKey(row.item_id);
      if (cleanId === row.item_id) continue;
      deleteOld.run(row.user_id, row.item_id);
      upsertClean.run(row.user_id, cleanId, row.quantity, row.first_obtained_at);
    }
  });
  repair(corrupted);
  console.log(`Collection Log repair: fixed ${corrupted.length} corrupted item_id entr${corrupted.length === 1 ? 'y' : 'ies'} (stored as "N.0" instead of "N").`);
}
