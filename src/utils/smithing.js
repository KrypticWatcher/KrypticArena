import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, INSTANT_TRIP_SECONDS, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionCostReductionPercent, applyConstructionCostReduction, computeAffordableQuantity, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction, getProjectCurrentTier } from './construction.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { rollSpecialToolFind } from './specialToolFinds.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const SMELT_TRIP_TYPE = 'smelt';
export const SMITH_TRIP_TYPE = 'smith';

const TIER_LEVELS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
const ORE_TO_BAR_RATIO = { 1: 1, 5: 2, 10: 1, 20: 2, 35: 1, 45: 2, 55: 2, 65: 3, 75: 3, 85: 3, 92: 4 };
const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;
const MAX_BAR_YIELD_BY_TIER = { 1: 40, 5: 38, 10: 36, 20: 33, 35: 30, 45: 27, 55: 24, 65: 21, 75: 18, 85: 15, 92: 13 };

const FORGE_QUANTITY_MULTIPLIER = 1.5;
const FORGE_SPEED_MULTIPLIER = 0.7;

const XP_PER_UNIT_BY_TIER = { 1: 8, 5: 11, 10: 14, 20: 20, 35: 31, 45: 38, 55: 46, 65: 54, 75: 64, 85: 77, 92: 89 };

export function getMaxSmeltQuantity(tier, useForge = false) {
  const base = MAX_BAR_YIELD_BY_TIER[tier] ?? 20;
  return useForge ? Math.round(base * FORGE_QUANTITY_MULTIPLIER) : base;
}

export function getAffordableSmeltQuantity(guildId, userId, tier, requestedBarQuantity) {
  const ore = getOre(tier);
  if (!ore) return 0;
  const ratio = ORE_TO_BAR_RATIO[tier];
  const ownedOre = getOwnedQuantity(guildId, userId, ore.id);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'smithing');
  const effectiveRatio = ratio * (1 - constructionReductionPercent / 100);
  const affordableBars = effectiveRatio > 0 ? Math.floor(ownedOre / effectiveRatio) : Math.floor(ownedOre / ratio);
  return Math.max(0, Math.min(requestedBarQuantity, affordableBars));
}
export function computeSmeltTripSeconds(tier, barQuantity, useForge = false) {

  const normalMaxQty = getMaxSmeltQuantity(tier, false);
  const secondsPerUnit = ((FULL_TRIP_MINUTES * 60) / normalMaxQty) * (useForge ? FORGE_SPEED_MULTIPLIER : 1);
  return Math.max(MIN_TRIP_SECONDS, Math.round(barQuantity * secondsPerUnit));
}

function getOre(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'ore' && i.tier === tier);
}
function getBar(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'bar' && i.tier === tier);
}

export function describeSmithingActiveTrip(activeMobId, timestamp) {
  if (!activeMobId) return null;
  if (activeMobId.startsWith('smelt:')) {
    const [, tierStr, forgeFlag] = activeMobId.split(':');
    const bar = getBar(Number(tierStr));
    const forgeNote = forgeFlag === 'forge' ? ' at the Master Forge' : '';
    return `🔥 Out smelting${forgeNote} **${bar ? bar.name : 'bars'}**. Back ${timestamp}.`;
  }
  if (activeMobId.startsWith('smith:')) {
    const [, productIdStr, forgeFlag] = activeMobId.split(':');
    const product = getItem(Number(productIdStr));
    const forgeNote = forgeFlag === 'forge' ? ' at the Master Forge' : '';
    return `🔨 Out smithing${forgeNote} **${product ? product.name : 'gear'}**. Back ${timestamp}.`;
  }
  return null;
}

export async function startSmeltTrip(guildId, userId, channelId, fallbackName, tier, barQuantity, useForge = false) {
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

  if (useForge && getProjectCurrentTier(userId, 'forge') < 1) {
    throw new EconomyError('You need to build the Master Forge (Tier 1+) to use Forge Mode — see /building.');
  }

  const ore = getOre(tier);
  const bar = getBar(tier);
  if (!ore || !bar) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'smithing');
  if (currentLevel < tier) throw new EconomyError(`You need Smithing level ${tier} for this bar [You are Level ${currentLevel}].`);

  const maxQty = getMaxSmeltQuantity(tier, useForge);

  if (barQuantity == null) barQuantity = maxQty;
  if (!Number.isInteger(barQuantity) || barQuantity < 1 || barQuantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} bars for this tier.`);
  }

  const ratio = ORE_TO_BAR_RATIO[tier];
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'smithing');
  const oreNeeded = applyConstructionCostReduction(barQuantity * ratio, constructionReductionPercent);
  const ownedOre = getOwnedQuantity(guildId, userId, ore.id);
  if (ownedOre < oreNeeded) {
    throw new EconomyError(`You need ${oreNeeded}x ${ore.name} (${ratio}:1 ratio) to smelt ${barQuantity}x ${bar.name} — you have ${ownedOre}.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'smithing');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? INSTANT_TRIP_SECONDS
    : applyConstructionTripTimeReduction(computeSmeltTripSeconds(tier, barQuantity, useForge), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = useForge ? `smelt:${tier}:forge` : `smelt:${tier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, barQuantity, guildId, userId);
  recordLastTripSettings(userId, SMELT_TRIP_TYPE, { tier, barQuantity, useForge });

  const BLACKSMITHS_HAMMER_ID = 41003;
  const BLACKSMITHS_HAMMER_PROC_PERCENT = 15;
  const hasHammer = getOwnedQuantity(guildId, userId, BLACKSMITHS_HAMMER_ID) > 0;
  let oreSaved = 0;
  if (hasHammer) {
    for (let i = 0; i < barQuantity; i++) {
      if (Math.random() * 100 < BLACKSMITHS_HAMMER_PROC_PERCENT) oreSaved += Math.round(ratio / 2);
    }
  }
  const actualOreConsumed = Math.max(0, oreNeeded - oreSaved);

  addItemToInventory(guildId, userId, ore.id, -actualOreConsumed);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to smelt ${barQuantity}x **${bar.name}**${oreSaved > 0 ? ` (Blacksmith's Hammer saved ${oreSaved}x ${ore.name})` : ''}. Back ${timestamp}.`, endsAt };
}

export async function resolveDueSmelt(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const [, tierStr, forgeFlag] = row.active_mob_id.split(':');
  const tier = Number(tierStr);
  const useForge = forgeFlag === 'forge';
  const barQuantity = row.slay_quantity;

  const bar = getBar(tier);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  addItemToInventory(guildId, userId, bar.id, barQuantity, 'smithing');

  const xpPerBar = XP_PER_UNIT_BY_TIER[tier] ?? (1 + Math.round(tier / 15));
  const totalXp = xpPerBar * barQuantity;
  const xpResult = addSkillXp(guildId, userId, 'smithing', totalXp);

  const BLACKSMITHS_HAMMER_ID = 41003;
  const BLACKSMITHS_HAMMER_FIND_PERCENT = 3;
  const foundHammer = rollSpecialToolFind(
    guildId, userId, BLACKSMITHS_HAMMER_ID, row.adventure_started_at, row.adventure_ends_at, BLACKSMITHS_HAMMER_FIND_PERCENT
  );

  let text = `<@${userId}> **${displayName}** returns from smelting${useForge ? ' at the Master Forge' : ''} — **${barQuantity}x ${bar.name}**.`;
  if (foundHammer) text += `\n\n🔨 You found a **Blacksmith's Hammer**!`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} Smithing XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}

function getArrowhead(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'arrowhead' && i.tier === tier);
}

const BAR_COST_BY_SLOT_AND_TYPE = {
  arrowhead: 1, helmet: 1, chest: 5, legs: 2, gloves: 1, boots: 1, shield: 2, weapon_main: 2, weapon_offhand: 1,
};

const TOOL_BAR_COST = { mining: 3, woodcutting: 2 };

function barCostForProduct(product) {
  if (product.category === 'arrowhead') return BAR_COST_BY_SLOT_AND_TYPE.arrowhead;
  if (product.type === 'tool') return TOOL_BAR_COST[product.skill] ?? 1;
  if (product.weaponSubtype === 'shield') return BAR_COST_BY_SLOT_AND_TYPE.shield;
  if (product.slot === 'off_hand') return BAR_COST_BY_SLOT_AND_TYPE.weapon_offhand;
  if (product.slot === 'main_hand') return BAR_COST_BY_SLOT_AND_TYPE.weapon_main;
  return BAR_COST_BY_SLOT_AND_TYPE[product.slot] ?? 1;
}

function getCraftableTools(tier) {
  return ITEMS.filter(
    (i) => i.type === 'tool' && i.tier === tier && ['mining', 'woodcutting'].includes(i.skill) && i.category !== 'starter_tool'
  );
}

export function getSmithProductsForTier(tier) {
  const arrowhead = getArrowhead(tier);
  const meleeCraft = ITEMS.filter((i) => i.combatStyle === 'melee' && i.tier === tier && i.source === 'melee_craft');
  const tools = getCraftableTools(tier);
  const products = [...meleeCraft, ...tools];
  if (arrowhead) products.push(arrowhead);
  return products.map((p) => ({ ...p, barCost: barCostForProduct(p) }));
}

const MAX_SMITH_YIELD_BY_TIER = { 1: 40, 5: 38, 10: 36, 20: 33, 35: 30, 45: 27, 55: 24, 65: 21, 75: 18, 85: 15, 92: 13 };
export function getMaxSmithQuantity(tier, useForge = false) {
  const base = MAX_SMITH_YIELD_BY_TIER[tier] ?? 20;
  return useForge ? Math.round(base * FORGE_QUANTITY_MULTIPLIER) : base;
}

export function getAffordableSmithQuantity(guildId, userId, productId, requestedQuantity) {
  const product = getItem(productId);
  if (!product) return 0;
  const bar = getBar(product.tier);
  if (!bar) return 0;
  const barCost = barCostForProduct(product);
  const ownedBars = getOwnedQuantity(guildId, userId, bar.id);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'smithing');
  const effectiveBarCost = barCost * (1 - constructionReductionPercent / 100);
  const affordable = effectiveBarCost > 0 ? Math.floor(ownedBars / effectiveBarCost) : Math.floor(ownedBars / barCost);
  return Math.max(0, Math.min(requestedQuantity, affordable));
}
export function computeSmithTripSeconds(tier, quantity, useForge = false) {
  const normalMaxQty = getMaxSmithQuantity(tier, false);
  const secondsPerUnit = ((FULL_TRIP_MINUTES * 60) / normalMaxQty) * (useForge ? FORGE_SPEED_MULTIPLIER : 1);
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

export async function startSmithTrip(guildId, userId, channelId, fallbackName, productId, quantity, useForge = false) {
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

  if (useForge && getProjectCurrentTier(userId, 'forge') < 1) {
    throw new EconomyError('You need to build the Master Forge (Tier 1+) to use Forge Mode — see /building.');
  }

  const product = getItem(productId);
  if (!product) throw new EconomyError('Invalid product.');
  const tier = product.tier;
  const barCost = barCostForProduct(product);
  const bar = getBar(tier);
  if (!bar) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'smithing');
  if (currentLevel < tier) throw new EconomyError(`You need Smithing level ${tier} [You are Level ${currentLevel}].`);

  const HAMMER_ID = 42002;
  if (getOwnedQuantity(guildId, userId, HAMMER_ID) < 1) {
    throw new EconomyError('You need a Hammer to Smith at all — buy one from the Arena Store.');
  }

  const maxQty = getMaxSmithQuantity(tier, useForge);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'smithing');
  const ownedBars = getOwnedQuantity(guildId, userId, bar.id);

  if (quantity == null) {
    quantity = computeAffordableQuantity(maxQty, (qty) => [
      { owned: ownedBars, needed: applyConstructionCostReduction(qty * barCost, constructionReductionPercent) },
    ]);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${bar.name} to smith with.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const barsNeeded = applyConstructionCostReduction(quantity * barCost, constructionReductionPercent);
  if (ownedBars < barsNeeded) {
    throw new EconomyError(`You need ${barsNeeded}x ${bar.name} (${barCost} per ${product.name}) — you have ${ownedBars}.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'smithing');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? INSTANT_TRIP_SECONDS
    : applyConstructionTripTimeReduction(computeSmithTripSeconds(tier, quantity, useForge), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = useForge ? `smith:${productId}:forge` : `smith:${productId}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, SMITH_TRIP_TYPE, { productId, quantity, useForge });

  const BLACKSMITHS_HAMMER_ID = 41003;
  const BLACKSMITHS_HAMMER_PROC_PERCENT = 15;
  const hasHammer = getOwnedQuantity(guildId, userId, BLACKSMITHS_HAMMER_ID) > 0;
  let barsSaved = 0;
  if (hasHammer) {
    for (let i = 0; i < quantity; i++) {
      if (Math.random() * 100 < BLACKSMITHS_HAMMER_PROC_PERCENT) barsSaved += Math.round(barCost / 2);
    }
  }
  const actualBarsConsumed = Math.max(0, barsNeeded - barsSaved);

  addItemToInventory(guildId, userId, bar.id, -actualBarsConsumed);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to smith ${quantity}x **${product.name}**${barsSaved > 0 ? ` (Blacksmith's Hammer saved ${barsSaved}x ${bar.name})` : ''}. Back ${timestamp}.`, endsAt };
}

export async function resolveDueSmith(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const [, productIdStr, forgeFlag] = row.active_mob_id.split(':');
  const productId = Number(productIdStr);
  const useForge = forgeFlag === 'forge';
  const quantity = row.slay_quantity;

  const product = getItem(productId);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);
  const tier = product.tier;

  addItemToInventory(guildId, userId, product.id, quantity, 'smithing');
  recordCollectionLogObtain(userId, product.id, quantity);

  const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (1 + Math.round(tier / 15));
  const totalXp = xpPerUnit * quantity;
  const xpResult = addSkillXp(guildId, userId, 'smithing', totalXp);

  const BLACKSMITHS_HAMMER_ID = 41003;
  const BLACKSMITHS_HAMMER_FIND_PERCENT = 3;
  const foundHammer = rollSpecialToolFind(
    guildId, userId, BLACKSMITHS_HAMMER_ID, row.adventure_started_at, row.adventure_ends_at, BLACKSMITHS_HAMMER_FIND_PERCENT
  );

  let text = `<@${userId}> **${displayName}** returns from smithing${useForge ? ' at the Master Forge' : ''} — **${quantity}x ${product.name}**.`;
  if (foundHammer) text += `\n\n🔨 You found a **Blacksmith's Hammer**!`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} Smithing XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
