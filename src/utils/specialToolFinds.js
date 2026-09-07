import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';

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
