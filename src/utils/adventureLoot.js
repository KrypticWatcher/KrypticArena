import db from '../database.js';
import { addCash } from './economy.js';
import { addArenaCoins } from './arena.js';
import { addItemToInventory, getAllEquipmentSets } from './inventory.js';
import { computeAdventureCrossSetEffects } from './effects.js';
import { ITEMS, getAdventureDropCollectibles } from '../data/items.js';
import { getLocationFavoredLine, LOCATION_TIER } from './adventureFlavor.js';

const ADVENTURE_RARITY_WEIGHTS = [
  ['common', 100],
  ['uncommon', 55],
  ['rare', 35],
  ['epic', 8],
  ['legendary', 1.9],
  ['mythical', 0.1],
];
import { rollAdventurePetDrop, applyShinySuccessBonuses, rollAdventureCandyDrop, getActivePet } from './pets.js';
import { getHighestTier } from './permissions.js';
import { recordCollectionLogObtain, getCollectionLogQuantity } from './collectionLog.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const ADVENTURE_GAMBLING_MIN = 10_000;
const ADVENTURE_GAMBLING_MAX = 40_000;

const ADVENTURE_ARENA_RANGE_BY_TIER = {
  common: [1200, 1800],
  uncommon: [2400, 3600],
  rare: [3600, 5400],
  epic: [4800, 7200],
  legendary: [6000, 9000],
  mythical: [8400, 12600],
};

const ADVENTURE_EQUIPMENT_ROLLS = 3;
const ADVENTURE_EQUIPMENT_ROLL_CHANCE = 0.35; 

const RARITY_ORDER_INDEX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythical: 5 };

function rollRarityWithinTier(tierCeiling, excludeUncommon) {
  const ceilingIndex = RARITY_ORDER_INDEX[tierCeiling] ?? RARITY_ORDER_INDEX.mythical;
  let table = ADVENTURE_RARITY_WEIGHTS.filter(([rarity]) => RARITY_ORDER_INDEX[rarity] <= ceilingIndex);
  if (excludeUncommon) table = table.filter(([rarity]) => rarity !== 'uncommon');
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  if (total === 0) return null; 
  let roll = Math.random() * total;
  for (const [rarity, weight] of table) {
    if (roll < weight) return rarity;
    roll -= weight;
  }
  return table[table.length - 1][0]; 
}

const LEGACY_RARITY_TO_TIER = { common: 1, uncommon: 10, rare: 20, epic: 45, legendary: 65, mythical: 92 };

const ADVENTURE_LINE_EFFECT_TYPE = {
  open: 'adventure_faster_trips',
  wild: 'adventure_better_encounters',
  ruins: 'adventure_safer_trips',
};

const EQUIPMENT_BY_TIER_AND_LINE = new Map(); 

const SET_TO_LINE = new Map();
for (const item of ITEMS) {
  if (item.type !== 'equipment' || item.source !== 'adventure' || item.ownerOnly || !item.set) continue;
  const line = Object.entries(ADVENTURE_LINE_EFFECT_TYPE).find(([, effectType]) => item.effects.some((e) => e.type === effectType))?.[0];
  if (line && !SET_TO_LINE.has(item.set)) SET_TO_LINE.set(item.set, line);
}

for (const item of ITEMS) {
  if (item.type !== 'equipment' || item.source !== 'adventure' || item.ownerOnly) continue;
  const ownLine = Object.entries(ADVENTURE_LINE_EFFECT_TYPE).find(([, effectType]) =>
    item.effects.some((e) => e.type === effectType)
  )?.[0];
  const line = ownLine ?? SET_TO_LINE.get(item.set);
  if (!line) continue; 
  if (!EQUIPMENT_BY_TIER_AND_LINE.has(item.tier)) EQUIPMENT_BY_TIER_AND_LINE.set(item.tier, new Map());
  const byLine = EQUIPMENT_BY_TIER_AND_LINE.get(item.tier);
  if (!byLine.has(line)) byLine.set(line, []);
  byLine.get(line).push(item);
}

function rollEquipmentPiece(line, tierCeiling, excludeUncommon) {
  const rarity = rollRarityWithinTier(tierCeiling, excludeUncommon);
  if (!rarity) return null;
  const byLine = EQUIPMENT_BY_TIER_AND_LINE.get(LEGACY_RARITY_TO_TIER[rarity]);
  if (!byLine || !byLine.has(line)) return null; 

  const pool = byLine.get(line);
  return pool[Math.floor(Math.random() * pool.length)];
}

export const ADVENTURE_COLLECTIBLE_DROP_CHANCE = 0.0001;

const ADVENTURE_CANCEL_PAYOUT_FRACTION = 0.05;

export const grantCancelledAdventureLoot = db.transaction((guildId, userId) => {
  
  
  
  
  
  
  
  const { saferTrips } = computeAdventureCrossSetEffects(getAllEquipmentSets(guildId, userId));
  const currencyMultiplier = 1 + Math.max(0, saferTrips) / 100;

  const gambling = Math.round(randInt(ADVENTURE_GAMBLING_MIN, ADVENTURE_GAMBLING_MAX) * currencyMultiplier * ADVENTURE_CANCEL_PAYOUT_FRACTION);
  
  
  
  
  const [cancelArenaMin, cancelArenaMax] = ADVENTURE_ARENA_RANGE_BY_TIER.common;
  const arena = Math.round(randInt(cancelArenaMin, cancelArenaMax) * currencyMultiplier * ADVENTURE_CANCEL_PAYOUT_FRACTION);

  addCash(guildId, userId, gambling, 'adventure');
  addArenaCoins(guildId, userId, arena, 'adventure');

  return { gambling, arena };
});

export const grantAdventureLoot = db.transaction((guildId, userId, location, durationMinutes, baseMinutes) => {
  const { betterEncounters, saferTrips } = computeAdventureCrossSetEffects(getAllEquipmentSets(guildId, userId));

  
  
  
  
  
  const durationScale = Math.max(0.1, Math.min(3, durationMinutes / Math.max(1, baseMinutes)));

  
  
  
  
  
  
  
  const currencyMultiplier = (1 + Math.max(0, saferTrips) / 100) * durationScale;
  const gamblingBase = randInt(ADVENTURE_GAMBLING_MIN, ADVENTURE_GAMBLING_MAX);
  const gambling = Math.round(gamblingBase * currencyMultiplier);
  const tier = LOCATION_TIER[location] ?? 'common';
  const [arenaMin, arenaMax] = ADVENTURE_ARENA_RANGE_BY_TIER[tier];
  const arena = Math.round(randInt(arenaMin, arenaMax) * currencyMultiplier);

  
  
  
  
  
  
  
  
  const shinyBonus = applyShinySuccessBonuses(guildId, userId, { gambling, arena });

  addCash(guildId, userId, gambling + shinyBonus.bonusGambling, 'adventure');
  addArenaCoins(guildId, userId, arena + shinyBonus.bonusArena, 'adventure');
  if (shinyBonus.bonusElixir) {
    addItemToInventory(guildId, userId, 'elixir', 1, 'adventure');
  }

  
  
  
  
  
  
  const isTier5 = getHighestTier(userId) >= 5;
  const excludeUncommon = isTier5;
  const TIER_5_ROLL_CHANCE_BONUS = 0.05;

  
  
  
  
  
  
  
  const rollChance = Math.min(
    0.95,
    Math.max(
      0,
      (ADVENTURE_EQUIPMENT_ROLL_CHANCE + Math.max(0, betterEncounters) / 100 - Math.max(0, saferTrips) / 100) * durationScale +
        (isTier5 ? TIER_5_ROLL_CHANCE_BONUS : 0)
    )
  );
  const line = getLocationFavoredLine(location);
  const tierCeiling = LOCATION_TIER[location];

  const equipment = [];
  const newUnlockIds = new Set();
  for (let i = 0; i < ADVENTURE_EQUIPMENT_ROLLS; i++) {
    if (Math.random() >= rollChance) continue;
    const piece = line ? rollEquipmentPiece(line, tierCeiling, excludeUncommon) : null;
    if (!piece) continue;
    addItemToInventory(guildId, userId, piece.id, 1, 'adventure');
    
    
    
    if (getCollectionLogQuantity(userId, piece.id) === 0) newUnlockIds.add(piece.id);
    recordCollectionLogObtain(userId, piece.id, 1);
    equipment.push(piece);
  }

  
  
  
  
  
  if (shinyBonus.bonusEquipmentRoll && line) {
    const bonusPiece = rollEquipmentPiece(line, tierCeiling, excludeUncommon);
    if (bonusPiece) {
      addItemToInventory(guildId, userId, bonusPiece.id, 1, 'adventure');
      if (getCollectionLogQuantity(userId, bonusPiece.id) === 0) newUnlockIds.add(bonusPiece.id);
      recordCollectionLogObtain(userId, bonusPiece.id, 1);
      equipment.push(bonusPiece);
    }
  }

  let collectible = null;
  if (Math.random() < ADVENTURE_COLLECTIBLE_DROP_CHANCE) {
    const pool = getAdventureDropCollectibles();
    collectible = pool[Math.floor(Math.random() * pool.length)];
    addItemToInventory(guildId, userId, collectible.id, 1, 'adventure');
    if (getCollectionLogQuantity(userId, collectible.id) === 0) newUnlockIds.add(collectible.id);
    recordCollectionLogObtain(userId, collectible.id, 1);
  }

  
  
  
  
  
  
  
  
  
  const pet = rollAdventurePetDrop(guildId, userId, location);

  
  
  
  
  const equippedPet = getActivePet(guildId, userId);
  
  
  const candyDrop = rollAdventureCandyDrop(Boolean(equippedPet));
  if (candyDrop) {
    for (const entry of candyDrop) {
      addItemToInventory(guildId, userId, entry.candyId, entry.quantity, 'adventure');
      
      
      
      
      
      
      
      
      const candyItem = ITEMS.find((i) => i.id === entry.candyId);
      if (candyItem) {
        for (let i = 0; i < entry.quantity; i++) equipment.push(candyItem);
      }
    }
  }

  
  
  
  
  
  return {
    gambling: gambling + shinyBonus.bonusGambling,
    arena: arena + shinyBonus.bonusArena,
    equipment,
    collectible,
    newUnlockIds,
    pet,
    candyDrop,
    equippedPetName: equippedPet ? equippedPet.nickname ?? equippedPet.given_name : null,
    shinyBonus,
  };
});
