import db from '../database.js';
import { getAllOwnedInstances, updateInstanceItemId, addItemToInventory } from './inventory.js';
import { ITEMS, LEVEL_REQUIREMENT_BY_RARITY } from '../data/items.js';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];

const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

const TIER_TO_LEGACY_RARITY = { 1: 'common', 10: 'uncommon', 20: 'rare', 45: 'epic', 65: 'legendary', 92: 'mythical' };
const PROGRESSIVE_PIECES = new Map();
for (const item of ITEMS) {
  if (!item.progressivePiece) continue;
  if (!PROGRESSIVE_PIECES.has(item.progressivePiece)) PROGRESSIVE_PIECES.set(item.progressivePiece, {});
  PROGRESSIVE_PIECES.get(item.progressivePiece)[TIER_TO_LEGACY_RARITY[item.tier] ?? 'common'] = item.id;
}

const ITEM_ID_TO_PIECE = new Map();
for (const [pieceKey, byRarity] of PROGRESSIVE_PIECES) {
  for (const [rarity, itemId] of Object.entries(byRarity)) {
    ITEM_ID_TO_PIECE.set(itemId, { pieceKey, rarity });
  }
}

export function rarityForLevel(level) {
  let best = RARITIES[0];
  for (const rarity of RARITIES) {
    if (level >= LEVEL_REQUIREMENT_BY_RARITY[rarity]) best = rarity;
  }
  return best;
}

export function syncOwnerProgressiveGear(guildId, userId, level) {
  if (PROGRESSIVE_PIECES.size === 0) return;

  const targetRarity = rarityForLevel(level);
  const targetIndex = RARITY_INDEX[targetRarity];

  for (const instance of getAllOwnedInstances(guildId, userId)) {
    const piece = ITEM_ID_TO_PIECE.get(instance.itemId);
    if (!piece) continue;
    if (RARITY_INDEX[piece.rarity] >= targetIndex) continue;

    const nextItemId = PROGRESSIVE_PIECES.get(piece.pieceKey)[targetRarity];
    if (!nextItemId || nextItemId === instance.itemId) continue;
    updateInstanceItemId(instance.instanceId, nextItemId);
  }
}

export const grantOwnerProgressiveSet = db.transaction((guildId, userId, level) => {
  const targetRarity = rarityForLevel(level);
  const granted = [];
  const alreadyOwned = [];

  const ownedPieceKeys = new Set();
  for (const instance of getAllOwnedInstances(guildId, userId)) {
    const piece = ITEM_ID_TO_PIECE.get(instance.itemId);
    if (piece) ownedPieceKeys.add(piece.pieceKey);
  }

  for (const [pieceKey, byRarity] of PROGRESSIVE_PIECES) {
    if (ownedPieceKeys.has(pieceKey)) {
      alreadyOwned.push(pieceKey);
      continue;
    }
    const itemId = byRarity[targetRarity];
    addItemToInventory(guildId, userId, itemId, 1);
    granted.push(itemId);
  }

  syncOwnerProgressiveGear(guildId, userId, level);

  return { granted, alreadyOwned, rarity: targetRarity };
});
