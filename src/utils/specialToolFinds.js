import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { getItem } from '../data/items.js';

export const SPECIAL_TOOL_FIND_MIN_TRIP_MINUTES = 25;

export function rollSpecialToolFind(guildId, userId, itemId, startedAt, endsAt, findPercent) {
  if (getOwnedQuantity(guildId, userId, itemId) > 0) return false;
  const tripMinutes = (endsAt - startedAt) / 60_000;
  if (tripMinutes < SPECIAL_TOOL_FIND_MIN_TRIP_MINUTES) return false;
  if (Math.random() * 100 >= findPercent) return false;
  addItemToInventory(guildId, userId, itemId, 1);
  recordCollectionLogObtain(userId, itemId, 1);
  return true;
}

// ===== Skilling outfits: 5-piece cosmetic/XP-bonus sets (see items.js, ids
// 43001-43025). One piece can drop per qualifying trip, in a fixed order,
// until the set is complete — mirrors the special-tool-find pattern above.
export const SKILLING_OUTFIT_FIND_PERCENT = 3;

const SKILLING_OUTFIT_PIECES = {
  fishing: [43001, 43002, 43003, 43004, 43005], // Tidewalker
  woodcutting: [43006, 43007, 43008, 43009, 43010], // Timberhand
  fletching: [43011, 43012, 43013, 43014, 43015], // Arrowsmith
  farming: [43016, 43017, 43018, 43019, 43020], // Greenwarden
  hunting: [43021, 43022, 43023, 43024, 43025], // Trapper
};

export function rollSkillingOutfitFind(guildId, userId, skillId, startedAt, endsAt, findPercent = SKILLING_OUTFIT_FIND_PERCENT) {
  const pieceIds = SKILLING_OUTFIT_PIECES[skillId];
  if (!pieceIds) return null;
  const tripMinutes = (endsAt - startedAt) / 60_000;
  if (tripMinutes < SPECIAL_TOOL_FIND_MIN_TRIP_MINUTES) return null;
  const nextPieceId = pieceIds.find((id) => getOwnedQuantity(guildId, userId, id) === 0);
  if (!nextPieceId) return null; // full set already owned
  if (Math.random() * 100 >= findPercent) return null;
  addItemToInventory(guildId, userId, nextPieceId, 1);
  recordCollectionLogObtain(userId, nextPieceId, 1);
  return getItem(nextPieceId);
}
