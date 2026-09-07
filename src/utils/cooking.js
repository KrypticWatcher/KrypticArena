import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionCostReductionPercent, applyConstructionCostReduction, computeAffordableQuantity, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction } from './construction.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import db from '../database.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const COOKING_TRIP_TYPE = 'cooking';

const TIER_LEVELS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;
const MAX_YIELD_BY_TIER = { 1: 100, 5: 95, 10: 90, 20: 85, 35: 78, 45: 70, 55: 62, 65: 55, 75: 48, 85: 42, 92: 38 };

const XP_PER_UNIT_BY_TIER = { 1: 4, 5: 5, 10: 6, 20: 8, 35: 12, 45: 15, 55: 18, 65: 21, 75: 25, 85: 29, 92: 33 };

export function getMaxCookingQuantity(tier) {
  return MAX_YIELD_BY_TIER[tier] ?? 50;
}

export function getAffordableCookingQuantity(guildId, userId, tier, requestedQuantity) {
  const rawFish = getRawFish(tier);
  if (!rawFish) return 0;
  const owned = getOwnedQuantity(guildId, userId, rawFish.id);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'cooking');

  const costMultiplier = 1 - constructionReductionPercent / 100;
  const affordable = costMultiplier > 0 ? Math.floor(owned / costMultiplier) : owned;
  return Math.max(0, Math.min(requestedQuantity, affordable));
}
export function computeCookingTripSeconds(tier, quantity) {
  const maxQty = getMaxCookingQuantity(tier);
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / maxQty;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

function getRawFish(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'raw_fish' && i.tier === tier);
}
function getCookedFish(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'cooked_fish' && i.tier === tier);
}

export function describeCookingActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('cooking:')) return null;
  const tier = Number(activeMobId.split(':')[1]);
  const rawFish = getRawFish(tier);
  return `🍳 Out cooking **${rawFish ? rawFish.name : 'fish'}**. Back ${timestamp}.`;
}

export function computeBurnChancePercent(fishTierLevel, cookingLevel) {
  const idx = TIER_LEVELS.indexOf(fishTierLevel);
  const isTopTier = idx === TIER_LEVELS.length - 1;
  const nextTierLevel = isTopTier ? 99 : TIER_LEVELS[idx + 1];
  const startBurn = 40;
  const floor = isTopTier ? 5 : 0;

  if (cookingLevel <= fishTierLevel) return startBurn;
  const span = nextTierLevel - fishTierLevel;
  const progressed = Math.min(cookingLevel - fishTierLevel, span);
  const frac = progressed / span;
  const reduced = startBurn * (1 - frac);
  return Math.max(reduced, floor);
}

export async function startCookingTrip(guildId, userId, channelId, fallbackName, tier, quantity) {
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

  const rawFish = getRawFish(tier);
  if (!rawFish) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'cooking');
  if (currentLevel < tier) {
    throw new EconomyError(`You need Cooking level ${tier} for this fish [You are Level ${currentLevel}].`);
  }

  const maxQty = getMaxCookingQuantity(tier);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'cooking');
  const owned = getOwnedQuantity(guildId, userId, rawFish.id);

  if (quantity == null) {
    quantity = computeAffordableQuantity(maxQty, (qty) => [
      { owned, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
    ]);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${rawFish.name} to cook.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const actualCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  if (owned < actualCost) {
    throw new EconomyError(`You need ${actualCost}x ${rawFish.name} to cook that many — you have ${owned}.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'cooking');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? 30
    : applyConstructionTripTimeReduction(computeCookingTripSeconds(tier, quantity), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `cooking:${tier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, COOKING_TRIP_TYPE, { tier, quantity });

  addItemToInventory(guildId, userId, rawFish.id, -actualCost);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to cook ${quantity}x **${rawFish.name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueCooking(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const tier = Number(row.active_mob_id.split(':')[1]);
  const quantity = row.slay_quantity;

  const cookedFish = getCookedFish(tier);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);
  const cookingLevel = getSkillLevel(guildId, userId, 'cooking');
  const burnPct = computeBurnChancePercent(tier, cookingLevel);

  let cooked = 0;
  let burnt = 0;
  for (let i = 0; i < quantity; i++) {
    if (Math.random() * 100 < burnPct) burnt++;
    else cooked++;
  }

  if (cooked > 0) {
    addItemToInventory(guildId, userId, cookedFish.id, cooked, 'cooking');
    recordCollectionLogObtain(userId, cookedFish.id, cooked);
  }

  const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
  const totalXp = xpPerUnit * cooked;
  let xpResult = null;
  if (totalXp > 0) xpResult = addSkillXp(guildId, userId, 'cooking', totalXp);

  let text = `<@${userId}> **${displayName}** returns from cooking — **${cooked}x ${cookedFish.name}**`;
  if (burnt > 0) text += ` (${burnt} burnt)`;
  text += '.';
  if (xpResult) {
    text += `\n✨ **+${totalXp.toLocaleString('en-US')} Cooking XP**`;
    if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

    const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
    text += formatGladiatorSkillingXpLine(gladXpResult, displayName);
  }

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
