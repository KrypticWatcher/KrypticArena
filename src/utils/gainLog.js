import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { getItem, formatItemName } from '../data/items.js';

const stmtInsert = db.prepare(`
  INSERT INTO gain_log (guild_id, user_id, kind, item_id, amount, source, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export function recordGain(guildId, userId, kind, amount, source, itemId = null) {
  if (!source || !Number.isFinite(amount) || amount <= 0) return;
  stmtInsert.run(GLOBAL_ID, userId, kind, itemId, Math.trunc(amount), source, Date.now());
}

export function recordLoss(guildId, userId, kind, amount, source, itemId = null) {
  if (!source || !Number.isFinite(amount) || amount <= 0) return;
  stmtInsert.run(GLOBAL_ID, userId, kind, itemId, -Math.trunc(amount), source, Date.now());
}

export const GAIN_SOURCE_LABELS = {
  slots: 'Slots',
  blackjack: 'Blackjack',
  dice: 'Dice',
  roulette: 'Roulette',
  adventure: 'Adventures',
  claim: 'Collectible Claims',
  champion: 'Champion Fights',
  slave: '/slave',
  boss_challenge: 'Boss Challenges',
  beastpits_bot: 'Beast Pits (Bot Fights)',
  heist_fine: 'Heist Fines',

  heist: 'Heists',
  magic_crafting: 'Magic Crafting',

  mining: 'Mining',
  woodcutting: 'Woodcutting',
  fishing: 'Fishing',
  herbalism: 'Herbalism',
  hunting: 'Hunting',
  cooking: 'Cooking',
  smithing: 'Smithing',
  fletching: 'Fletching',
  crafting: 'Crafting',
  tanning: 'Tanning',
  farming: 'Farming',
  slay: 'Mob Loot (Slay)',
};

function sourceLabel(source) {
  return GAIN_SOURCE_LABELS[source] ?? source;
}

const stmtGainsSince = db.prepare(`
  SELECT kind, item_id, source, SUM(amount) AS total
  FROM gain_log
  WHERE guild_id = ? AND user_id = ? AND created_at >= ? AND amount > 0
  GROUP BY kind, item_id, source
  ORDER BY total DESC
`);

export function getGainsSummarySince(guildId, userId, sinceMs) {
  const rows = stmtGainsSince.all(GLOBAL_ID, userId, sinceMs);

  const cashBySource = new Map();
  const arenaBySource = new Map();
  const itemRows = [];

  for (const row of rows) {
    if (row.kind === 'cash') {
      cashBySource.set(row.source, (cashBySource.get(row.source) ?? 0) + row.total);
    } else if (row.kind === 'arena') {
      arenaBySource.set(row.source, (arenaBySource.get(row.source) ?? 0) + row.total);
    } else if (row.kind === 'item') {
      const item = getItem(row.item_id);
      itemRows.push({
        source: row.source,
        label: sourceLabel(row.source),
        itemId: row.item_id,
        itemName: item ? formatItemName(item, { showEffects: false }) : row.item_id,
        amount: row.total,
      });
    }
  }

  const toList = (map) =>
    [...map.entries()]
      .map(([source, amount]) => ({ source, label: sourceLabel(source), amount }))
      .sort((a, b) => b.amount - a.amount);

  const cashList = toList(cashBySource);
  const arenaList = toList(arenaBySource);
  itemRows.sort((a, b) => b.amount - a.amount);

  return {
    cash: { total: cashList.reduce((sum, r) => sum + r.amount, 0), bySource: cashList },
    arena: { total: arenaList.reduce((sum, r) => sum + r.amount, 0), bySource: arenaList },
    items: { bySource: itemRows },
  };
}
