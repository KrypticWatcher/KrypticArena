import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp, formatOutfitBonusNote } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, INSTANT_TRIP_SECONDS, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { rollSpecialToolFind, rollSkillingOutfitFind } from './specialToolFinds.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { getConstructionCostReductionPercent, applyConstructionCostReduction, computeAffordableQuantity, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction, getProjectCurrentTier } from './construction.js';

export const FLETCHING_TRIP_TYPE = 'fletching';

const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;
const MAX_YIELD_BY_TIER = { 1: 100, 5: 95, 10: 90, 20: 85, 35: 78, 45: 70, 55: 62, 65: 55, 75: 48, 85: 42, 92: 38 };

const XP_PER_UNIT_BY_TIER = { 1: 4, 5: 5, 10: 6, 20: 8, 35: 12, 45: 15, 55: 18, 65: 21, 75: 25, 85: 29, 92: 33 };
const KNIFE_ID = 42001;
const LOGS_PER_BOW = 2;
const LOGS_PER_ROD = 2;
const BARS_PER_ROD = 1;
const LOGS_PER_STAVE = 2;
const HERBS_PER_STAVE = 2;

const BOOSTED_QUANTITY_MULTIPLIER = 1.5;
const BOOSTED_SPEED_MULTIPLIER = 0.7;

export function getMaxFletchingQuantity(tier, useBoostedMode = false) {
  const base = MAX_YIELD_BY_TIER[tier] ?? 50;
  return useBoostedMode ? Math.round(base * BOOSTED_QUANTITY_MULTIPLIER) : base;
}

export function getAffordableFletchingQuantity(guildId, userId, itemType, key, requestedQuantity) {
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'fletching');
  const costMultiplier = 1 - constructionReductionPercent / 100;

  if (itemType === 'bow') {
    const product = getItem(key);
    if (!product) return 0;
    const log = getLog(product.tier);
    if (!log) return 0;
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
    const effectiveLogsPerBow = LOGS_PER_BOW * costMultiplier;
    const affordable = effectiveLogsPerBow > 0 ? Math.floor(ownedLogs / effectiveLogsPerBow) : Math.floor(ownedLogs / LOGS_PER_BOW);
    return Math.max(0, Math.min(requestedQuantity, affordable));
  }
  if (itemType === 'rod') {
    const product = getItem(key);
    if (!product) return 0;
    const log = getLog(product.tier);
    const bar = getBar(product.tier);
    if (!log || !bar) return 0;
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
    const ownedBars = getOwnedQuantity(guildId, userId, bar.id);
    const effectiveLogsPerRod = LOGS_PER_ROD * costMultiplier;
    const effectiveBarsPerRod = BARS_PER_ROD * costMultiplier;
    const affordableByLogs = effectiveLogsPerRod > 0 ? Math.floor(ownedLogs / effectiveLogsPerRod) : Math.floor(ownedLogs / LOGS_PER_ROD);
    const affordableByBars = effectiveBarsPerRod > 0 ? Math.floor(ownedBars / effectiveBarsPerRod) : Math.floor(ownedBars / BARS_PER_ROD);
    return Math.max(0, Math.min(requestedQuantity, affordableByLogs, affordableByBars));
  }
  if (itemType === 'stave') {
    const product = getItem(key);
    if (!product) return 0;
    const log = getLog(product.tier);
    const herb = getHerb(product.tier);
    if (!log || !herb) return 0;
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
    const ownedHerbs = getOwnedQuantity(guildId, userId, herb.id);
    const effectiveLogsPerStave = LOGS_PER_STAVE * costMultiplier;
    const effectiveHerbsPerStave = HERBS_PER_STAVE * costMultiplier;
    const affordableByLogs = effectiveLogsPerStave > 0 ? Math.floor(ownedLogs / effectiveLogsPerStave) : Math.floor(ownedLogs / LOGS_PER_STAVE);
    const affordableByHerbs = effectiveHerbsPerStave > 0 ? Math.floor(ownedHerbs / effectiveHerbsPerStave) : Math.floor(ownedHerbs / HERBS_PER_STAVE);
    return Math.max(0, Math.min(requestedQuantity, affordableByLogs, affordableByHerbs));
  }
  const tier = key;
  const log = getLog(tier);
  const feather = getFeather();
  const arrowhead = getArrowhead(tier);
  if (!log || !feather || !arrowhead) return 0;
  const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
  const ownedFeathers = getOwnedQuantity(guildId, userId, feather.id);
  const ownedArrowheads = getOwnedQuantity(guildId, userId, arrowhead.id);
  const affordableByLogs = costMultiplier > 0 ? Math.floor(ownedLogs / costMultiplier) : ownedLogs;
  const affordableByFeathers = costMultiplier > 0 ? Math.floor(ownedFeathers / costMultiplier) : ownedFeathers;
  const affordableByArrowheads = costMultiplier > 0 ? Math.floor(ownedArrowheads / costMultiplier) : ownedArrowheads;
  return Math.max(0, Math.min(requestedQuantity, affordableByLogs, affordableByFeathers, affordableByArrowheads));
}

export function computeFletchingTripSeconds(tier, quantity, useBoostedMode = false) {
  const normalMaxQty = getMaxFletchingQuantity(tier, false);
  const secondsPerUnit = ((FULL_TRIP_MINUTES * 60) / normalMaxQty) * (useBoostedMode ? BOOSTED_SPEED_MULTIPLIER : 1);
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

function getLog(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'log' && i.tier === tier);
}
function getBar(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'bar' && i.tier === tier);
}
function getHerb(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'herb' && i.tier === tier);
}
function getFeather() {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'feather');
}
function getArrowhead(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'arrowhead' && i.tier === tier);
}
function getArrow(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'arrow' && i.tier === tier);
}
function isBowProduct(product) {
  return product.slot === 'main_hand' && product.weaponSubtype === 'bow' && product.source === 'ranged_craft';
}
function isRodProduct(product) {
  return product.type === 'tool' && product.skill === 'fishing' && product.category !== 'starter_tool';
}
function isStaveProduct(product) {
  return product.combatStyle === 'mage' && product.source === 'mage_craft' && product.slot === 'main_hand' && product.weaponSubtype === 'staff';
}

export function getBowProductsForTier(tier) {
  const bows = ITEMS.filter((i) => isBowProduct(i) && i.tier === tier);
  const log = getLog(tier);
  return bows.map((p) => ({ ...p, logCost: LOGS_PER_BOW, logName: log ? log.name : 'Logs' }));
}

export function getRodProductsForTier(tier) {
  const rods = ITEMS.filter((i) => isRodProduct(i) && i.tier === tier);
  const log = getLog(tier);
  const bar = getBar(tier);
  return rods.map((p) => ({ ...p, logCost: LOGS_PER_ROD, logName: log ? log.name : 'Logs', barCost: BARS_PER_ROD, barName: bar ? bar.name : 'Bar' }));
}

export function getStaveProductsForTier(tier) {
  const staves = ITEMS.filter((i) => isStaveProduct(i) && i.tier === tier);
  const log = getLog(tier);
  const herb = getHerb(tier);
  return staves.map((p) => ({
    ...p,
    logCost: LOGS_PER_STAVE,
    logName: log ? log.name : 'Logs',
    herbCost: HERBS_PER_STAVE,
    herbName: herb ? herb.name : 'Herb',
  }));
}

export function describeFletchingActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('fletching:')) return null;
  const parts = activeMobId.split(':');
  const [, itemType, keyStr] = parts;
  const forgeNote = parts[3] === 'boosted' ? " at the Fletcher's Workbench" : '';
  if (itemType === 'bow' || itemType === 'rod' || itemType === 'stave') {
    const product = getItem(Number(keyStr));
    return `🪶 Out fletching${forgeNote} **${product ? product.name : 'gear'}**. Back ${timestamp}.`;
  }
  const arrow = getArrow(Number(keyStr));
  return `🪶 Out fletching${forgeNote} **${arrow ? arrow.name : 'arrows'}**. Back ${timestamp}.`;
}

export async function startFletchingTrip(guildId, userId, channelId, fallbackName, itemType, key, quantity, useBoostedMode = false) {
  guildId = GLOBAL_ID;
  if (isGladiatorAdventuring(guildId, userId)) {
    const profile = getGladiatorProfile(guildId, userId, fallbackName);
    throw new EconomyError(
      profile.activeBossId ? buildBossChallengeStatusLine(profile.name, profile.activeBossId) : 'Your Gladiator is already out on a trip.'
    );
  }
  if (hasUnclaimedAdventure(guildId, userId)) {
    throw new EconomyError("Your Gladiator's last trip hasn't finished resolving yet — try again in a moment.");
  }

  if (getOwnedQuantity(guildId, userId, KNIFE_ID) < 1) {
    throw new EconomyError('You need a Knife to Fletch at all — buy one from the Arena Store.');
  }

  if (useBoostedMode && getProjectCurrentTier(userId, 'fletchers_bench') < 1) {
    throw new EconomyError("You need to build the Fletcher's Workbench (Tier 1+) to use Boosted Mode — see /building.");
  }

  if (itemType === 'bow') {
    const product = getItem(key);
    if (!product || !isBowProduct(product)) throw new EconomyError('Invalid bow.');
    const tier = product.tier;
    const log = getLog(tier);
    if (!log) throw new EconomyError('Invalid tier.');

    const currentLevel = getSkillLevel(guildId, userId, 'fletching');
    if (currentLevel < tier) throw new EconomyError(`You need Fletching level ${tier} [You are Level ${currentLevel}].`);

    const maxQty = getMaxFletchingQuantity(tier, useBoostedMode);
    const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'fletching');
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);

    if (quantity == null) {
      quantity = computeAffordableQuantity(maxQty, (qty) => [
        { owned: ownedLogs, needed: applyConstructionCostReduction(qty * LOGS_PER_BOW, constructionReductionPercent) },
      ]);
      if (quantity < 1) {
        throw new EconomyError(`You don't have any ${log.name} to fletch with.`);
      }
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
      throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
    }

    const logsNeeded = applyConstructionCostReduction(quantity * LOGS_PER_BOW, constructionReductionPercent);
    if (ownedLogs < logsNeeded) {
      throw new EconomyError(`You're missing: ${logsNeeded}x ${log.name} (have ${ownedLogs}).`);
    }

    const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
    const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'fletching');
    const tripSeconds = hasInstantTrips(guildId, userId)
      ? INSTANT_TRIP_SECONDS
      : applyConstructionTripTimeReduction(computeFletchingTripSeconds(tier, quantity, useBoostedMode), constructionTripTimeReductionPercent);
    const endsAt = Date.now() + tripSeconds * 1000;

    const syntheticId = useBoostedMode ? `fletching:bow:${key}:boosted` : `fletching:bow:${key}`;
    db.prepare(
      'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
    ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
    recordLastTripSettings(userId, FLETCHING_TRIP_TYPE, { itemType: 'bow', key, quantity, useBoostedMode });

    addItemToInventory(guildId, userId, log.id, -logsNeeded);
    const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
    const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
    return { text: `**${displayName}** heads off to fletch ${quantity}x **${product.name}**. Back ${timestamp}.`, endsAt };
  }

  if (itemType === 'rod') {
    const product = getItem(key);
    if (!product || !isRodProduct(product)) throw new EconomyError('Invalid fishing rod.');
    const tier = product.tier;
    const log = getLog(tier);
    const bar = getBar(tier);
    if (!log || !bar) throw new EconomyError('Invalid tier.');

    const currentLevel = getSkillLevel(guildId, userId, 'fletching');
    if (currentLevel < tier) throw new EconomyError(`You need Fletching level ${tier} [You are Level ${currentLevel}].`);

    const maxQty = getMaxFletchingQuantity(tier, useBoostedMode);
    const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'fletching');
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
    const ownedBars = getOwnedQuantity(guildId, userId, bar.id);

    if (quantity == null) {
      quantity = computeAffordableQuantity(maxQty, (qty) => [
        { owned: ownedLogs, needed: applyConstructionCostReduction(qty * LOGS_PER_ROD, constructionReductionPercent) },
        { owned: ownedBars, needed: applyConstructionCostReduction(qty * BARS_PER_ROD, constructionReductionPercent) },
      ]);
      if (quantity < 1) {
        throw new EconomyError(`You don't have any ${log.name} or ${bar.name} to fletch with.`);
      }
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
      throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
    }

    const logsNeeded = applyConstructionCostReduction(quantity * LOGS_PER_ROD, constructionReductionPercent);
    const barsNeeded = applyConstructionCostReduction(quantity * BARS_PER_ROD, constructionReductionPercent);
    const missing = [];
    if (ownedLogs < logsNeeded) missing.push(`${logsNeeded}x ${log.name} (have ${ownedLogs})`);
    if (ownedBars < barsNeeded) missing.push(`${barsNeeded}x ${bar.name} (have ${ownedBars})`);
    if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

    const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
    const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'fletching');
    const tripSeconds = hasInstantTrips(guildId, userId)
      ? INSTANT_TRIP_SECONDS
      : applyConstructionTripTimeReduction(computeFletchingTripSeconds(tier, quantity, useBoostedMode), constructionTripTimeReductionPercent);
    const endsAt = Date.now() + tripSeconds * 1000;

    const syntheticId = useBoostedMode ? `fletching:rod:${key}:boosted` : `fletching:rod:${key}`;
    db.prepare(
      'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
    ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
    recordLastTripSettings(userId, FLETCHING_TRIP_TYPE, { itemType: 'rod', key, quantity, useBoostedMode });

    addItemToInventory(guildId, userId, log.id, -logsNeeded);
    addItemToInventory(guildId, userId, bar.id, -barsNeeded);
    const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
    const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
    return { text: `**${displayName}** heads off to fletch ${quantity}x **${product.name}**. Back ${timestamp}.`, endsAt };
  }

  if (itemType === 'stave') {
    const product = getItem(key);
    if (!product || !isStaveProduct(product)) throw new EconomyError('Invalid staff.');
    const tier = product.tier;
    const log = getLog(tier);
    const herb = getHerb(tier);
    if (!log || !herb) throw new EconomyError('Invalid tier.');

    const currentLevel = getSkillLevel(guildId, userId, 'fletching');
    if (currentLevel < tier) throw new EconomyError(`You need Fletching level ${tier} [You are Level ${currentLevel}].`);

    const maxQty = getMaxFletchingQuantity(tier, useBoostedMode);
    const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'fletching');
    const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
    const ownedHerbs = getOwnedQuantity(guildId, userId, herb.id);

    if (quantity == null) {
      quantity = computeAffordableQuantity(maxQty, (qty) => [
        { owned: ownedLogs, needed: applyConstructionCostReduction(qty * LOGS_PER_STAVE, constructionReductionPercent) },
        { owned: ownedHerbs, needed: applyConstructionCostReduction(qty * HERBS_PER_STAVE, constructionReductionPercent) },
      ]);
      if (quantity < 1) {
        throw new EconomyError(`You don't have any ${log.name} or ${herb.name} to fletch with.`);
      }
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
      throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
    }

    const logsNeeded = applyConstructionCostReduction(quantity * LOGS_PER_STAVE, constructionReductionPercent);
    const herbsNeeded = applyConstructionCostReduction(quantity * HERBS_PER_STAVE, constructionReductionPercent);
    const missing = [];
    if (ownedLogs < logsNeeded) missing.push(`${logsNeeded}x ${log.name} (have ${ownedLogs})`);
    if (ownedHerbs < herbsNeeded) missing.push(`${herbsNeeded}x ${herb.name} (have ${ownedHerbs})`);
    if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

    const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
    const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'fletching');
    const tripSeconds = hasInstantTrips(guildId, userId)
      ? INSTANT_TRIP_SECONDS
      : applyConstructionTripTimeReduction(computeFletchingTripSeconds(tier, quantity, useBoostedMode), constructionTripTimeReductionPercent);
    const endsAt = Date.now() + tripSeconds * 1000;

    const syntheticId = useBoostedMode ? `fletching:stave:${key}:boosted` : `fletching:stave:${key}`;
    db.prepare(
      'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
    ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
    recordLastTripSettings(userId, FLETCHING_TRIP_TYPE, { itemType: 'stave', key, quantity, useBoostedMode });

    addItemToInventory(guildId, userId, log.id, -logsNeeded);
    addItemToInventory(guildId, userId, herb.id, -herbsNeeded);
    const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
    const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
    return { text: `**${displayName}** heads off to fletch ${quantity}x **${product.name}**. Back ${timestamp}.`, endsAt };
  }

  const tier = key;
  const log = getLog(tier);
  const feather = getFeather();
  const arrowhead = getArrowhead(tier);
  const arrow = getArrow(tier);
  if (!log || !feather || !arrowhead || !arrow) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'fletching');
  if (currentLevel < tier) throw new EconomyError(`You need Fletching level ${tier} [You are Level ${currentLevel}].`);

  const maxQty = getMaxFletchingQuantity(tier, useBoostedMode);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'fletching');
  const ownedLogs = getOwnedQuantity(guildId, userId, log.id);
  const ownedFeathers = getOwnedQuantity(guildId, userId, feather.id);
  const ownedArrowheads = getOwnedQuantity(guildId, userId, arrowhead.id);

  if (quantity == null) {
    quantity = computeAffordableQuantity(maxQty, (qty) => [
      { owned: ownedLogs, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
      { owned: ownedFeathers, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
      { owned: ownedArrowheads, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
    ]);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${log.name}, ${feather.name}, or ${arrowhead.name} to fletch arrows with.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const logCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  const featherCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  const arrowheadCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  const missing = [];
  if (ownedLogs < logCost) missing.push(`${logCost}x ${log.name} (have ${ownedLogs})`);
  if (ownedFeathers < featherCost) missing.push(`${featherCost}x ${feather.name} (have ${ownedFeathers})`);
  if (ownedArrowheads < arrowheadCost) missing.push(`${arrowheadCost}x ${arrowhead.name} (have ${ownedArrowheads})`);
  if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'fletching');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? INSTANT_TRIP_SECONDS
    : applyConstructionTripTimeReduction(computeFletchingTripSeconds(tier, quantity, useBoostedMode), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = useBoostedMode ? `fletching:arrow:${tier}:boosted` : `fletching:arrow:${tier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, FLETCHING_TRIP_TYPE, { itemType: 'arrow', key: tier, quantity, useBoostedMode });

  addItemToInventory(guildId, userId, log.id, -logCost);
  addItemToInventory(guildId, userId, feather.id, -featherCost);
  addItemToInventory(guildId, userId, arrowhead.id, -arrowheadCost);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to fletch ${quantity}x **${arrow.name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueFletching(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const parts = row.active_mob_id.split(':');
  const [, itemType, keyStr] = parts;
  const useForge = parts[3] === 'boosted';
  const quantity = row.slay_quantity;
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  if (itemType === 'bow' || itemType === 'rod' || itemType === 'stave') {
    const product = getItem(Number(keyStr));
    addItemToInventory(guildId, userId, product.id, quantity, 'fletching');
    recordCollectionLogObtain(userId, product.id, quantity);

    const xpPerUnit = XP_PER_UNIT_BY_TIER[product.tier] ?? (2 + Math.round(product.tier / 10));
    const totalXp = xpPerUnit * quantity;
    const xpResult = addSkillXp(guildId, userId, 'fletching', totalXp);
    const foundOutfitPiece = rollSkillingOutfitFind(guildId, userId, 'fletching', row.adventure_started_at, row.adventure_ends_at);

    let text = `<@${userId}> **${displayName}** returns from fletching${useForge ? " at the Fletcher's Workbench" : ''} — **${quantity}x ${product.name}**.`;
    if (foundOutfitPiece) text += `\n\n🏹 You found the **${foundOutfitPiece.name}**!`;
    text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Fletching XP**${formatOutfitBonusNote(xpResult.outfitBonusPercent)}`;
    if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

    const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
    text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

    endGladiatorAdventure(guildId, userId);
    return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
  }

  const tier = Number(keyStr);
  const arrow = getArrow(tier);

  const ARROWSMITHS_KNIFE_ID = 41002;
  const ARROWSMITHS_KNIFE_PROC_PERCENT = 10;
  const hasKnife = getOwnedQuantity(guildId, userId, ARROWSMITHS_KNIFE_ID) > 0;
  let doubledCount = 0;
  if (hasKnife) {
    for (let i = 0; i < quantity; i++) {
      if (Math.random() * 100 < ARROWSMITHS_KNIFE_PROC_PERCENT) doubledCount++;
    }
  }
  const totalYield = quantity + doubledCount;

  addItemToInventory(guildId, userId, arrow.id, totalYield, 'fletching');

  const ARROWSMITHS_KNIFE_FIND_PERCENT = 3;
  const foundKnife = rollSpecialToolFind(
    guildId, userId, ARROWSMITHS_KNIFE_ID, row.adventure_started_at, row.adventure_ends_at, ARROWSMITHS_KNIFE_FIND_PERCENT
  );
  const foundOutfitPiece = rollSkillingOutfitFind(guildId, userId, 'fletching', row.adventure_started_at, row.adventure_ends_at);

  const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
  const totalXp = xpPerUnit * quantity;
  const xpResult = addSkillXp(guildId, userId, 'fletching', totalXp);

  let text = `<@${userId}> **${displayName}** returns from fletching${useForge ? " at the Fletcher's Workbench" : ''} — **${totalYield}x ${arrow.name}**${doubledCount > 0 ? ` (${doubledCount} doubled by Arrowsmith's Knife)` : ''}.`;
  if (foundKnife) text += `\n\n🗡️ You found an **Arrowsmith Knife**!`;
  if (foundOutfitPiece) text += `\n\n🏹 You found the **${foundOutfitPiece.name}**!`;
  text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Fletching XP**${formatOutfitBonusNote(xpResult.outfitBonusPercent)}`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
