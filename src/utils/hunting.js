import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp, formatOutfitBonusNote } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, INSTANT_TRIP_SECONDS, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionYieldBoostPercent, applyConstructionYieldBoost, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction, getProjectCurrentTier } from './construction.js';
import { multiResourceTierWeights, distributeByWeight, MULTI_RESOURCE_QUANTITY_BONUS_MULTIPLIER } from './gathering.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { rollSpecialToolFind, rollSkillingOutfitFind } from './specialToolFinds.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const HUNTING_TRIP_TYPE = 'hunting';
export const LODGE_TRIP_TYPE = 'lodge';

const TIER_LEVELS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;
const MAX_YIELD_BY_TIER = { 1: 44, 5: 42, 10: 40, 20: 37, 35: 34, 45: 31, 55: 28, 65: 25, 75: 22, 85: 19, 92: 17 };

const XP_PER_UNIT_BY_TIER = { 1: 7, 5: 10, 10: 13, 20: 18, 35: 27, 45: 33, 55: 39, 65: 45, 75: 52, 85: 61, 92: 69 };

const BIRD_NAMES_BY_TIER = {
  1: 'Sparrow', 5: 'Crow', 10: 'Pheasant', 20: 'Falcon', 35: 'Owl',
  45: 'Emberhawk', 55: 'Ironwing Falcon', 65: 'Stormhawk', 75: 'Duskraven', 85: 'Godhawk', 92: 'Celestial Roc',
};
const FEATHERS_PER_CATCH_BY_TIER = { 1: 1, 5: 1, 10: 2, 20: 2, 35: 3, 45: 3, 55: 4, 65: 5, 75: 6, 85: 7, 92: 8 };

export function getMaxHuntingQuantity(tier) {
  return MAX_YIELD_BY_TIER[tier] ?? 30;
}

// Extension point: the base (unreduced) length of a full trip — see the matching
// getBaseTripSeconds in gathering.js. Future buffs/perks that change the max
// trip duration should plug in here.
export function getBaseTripSeconds(guildId, userId) {
  return FULL_TRIP_MINUTES * 60;
}

export function computeHuntingTripSeconds(tier, quantity, guildId, userId) {
  const maxQty = getMaxHuntingQuantity(tier);
  const baseSeconds = getBaseTripSeconds(guildId, userId);
  if (maxQty <= 1) return baseSeconds;
  const secondsPerUnit = (baseSeconds - MIN_TRIP_SECONDS) / (maxQty - 1);
  const seconds = MIN_TRIP_SECONDS + (quantity - 1) * secondsPerUnit;
  return Math.max(MIN_TRIP_SECONDS, Math.round(seconds));
}

function getHide(tier, quality = 'fine') {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'hide' && i.tier === tier && i.hideQuality === quality);
}

function getFeatherItem() {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'feather');
}

function getAnimalName(fineHide) {
  return fineHide.name.replace(/ Hide$/, '');
}

export function describeHuntingActiveTrip(activeMobId, timestamp) {
  if (activeMobId?.startsWith('lodge:')) {
    return `🏕️ Out trapping a mixed haul at the Lodge grounds. Back ${timestamp}.`;
  }
  if (!activeMobId || !activeMobId.startsWith('hunting:')) return null;
  const [, huntType, tierStr] = activeMobId.split(':');
  const tier = Number(tierStr);
  if (huntType === 'bird') {
    return `🏹 Out hunting **${BIRD_NAMES_BY_TIER[tier] ?? 'birds'}**. Back ${timestamp}.`;
  }
  const hide = getHide(tier);
  return `🏹 Out hunting **${hide ? getAnimalName(hide) : 'creatures'}**. Back ${timestamp}.`;
}

function computePoorChancePercent(tierLevel, huntingLevel) {
  const idx = TIER_LEVELS.indexOf(tierLevel);
  const isTopTier = idx === TIER_LEVELS.length - 1;
  const nextTierLevel = isTopTier ? 99 : TIER_LEVELS[idx + 1];
  const startChance = 35;
  const floor = isTopTier ? 5 : 0;
  if (huntingLevel <= tierLevel) return startChance;
  const span = nextTierLevel - tierLevel;
  const progressed = Math.min(huntingLevel - tierLevel, span);
  const frac = progressed / span;
  return Math.max(startChance * (1 - frac), floor);
}

export async function startHuntingTrip(guildId, userId, channelId, fallbackName, huntType, tier, quantity) {
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

  const isBird = huntType === 'bird';
  const targetName = isBird ? BIRD_NAMES_BY_TIER[tier] : null;
  const hide = isBird ? null : getHide(tier);
  if (isBird && !targetName) throw new EconomyError('Invalid tier.');
  if (!isBird && !hide) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'hunting');
  if (currentLevel < tier) {
    throw new EconomyError(`You need Hunting level ${tier} for this creature [You are Level ${currentLevel}].`);
  }

  const SKINNING_KNIFE_ID = 42003;
  if (getOwnedQuantity(guildId, userId, SKINNING_KNIFE_ID) < 1) {
    throw new EconomyError('You need a Skinning Knife to Hunt at all — buy one from the Arena Store.');
  }

  const maxQty = getMaxHuntingQuantity(tier);

  if (quantity == null) quantity = maxQty;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'hunting');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? INSTANT_TRIP_SECONDS
    : applyConstructionTripTimeReduction(computeHuntingTripSeconds(tier, quantity, guildId, userId), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `hunting:${huntType}:${tier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, HUNTING_TRIP_TYPE, { huntType, tier, quantity });

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const huntedName = isBird ? targetName : getAnimalName(hide);
  return { text: `**${displayName}** heads off to hunt ${quantity}x **${huntedName}**. Back ${timestamp}.`, endsAt };
}

export async function startLodgeTrip(guildId, userId, channelId, fallbackName) {
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

  if (getProjectCurrentTier(userId, 'lodge') < 1) {
    throw new EconomyError("You need to build the Hunter's Lodge (Tier 1+) to send Lodge trips — see /building.");
  }

  const currentLevel = getSkillLevel(guildId, userId, 'hunting');
  const SKINNING_KNIFE_ID = 42003;
  if (getOwnedQuantity(guildId, userId, SKINNING_KNIFE_ID) < 1) {
    throw new EconomyError('You need a Skinning Knife to Hunt at all — buy one from the Arena Store.');
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'hunting');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? INSTANT_TRIP_SECONDS
    : applyConstructionTripTimeReduction(getBaseTripSeconds(guildId, userId), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `lodge:${currentLevel}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, 0, guildId, userId);
  recordLastTripSettings(userId, LODGE_TRIP_TYPE, {});

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `🏕️ **${displayName}** heads into the Lodge grounds for a mixed haul of hides. Back ${timestamp}.`, endsAt };
}

export async function resolveDueLodgeTrip(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const currentLevel = Number(row.active_mob_id.split(':')[1]);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  const topTier = [...TIER_LEVELS].reverse().find((t) => t <= currentLevel) ?? 1;
  const baseTotalQty = Math.round(getMaxHuntingQuantity(topTier) * MULTI_RESOURCE_QUANTITY_BONUS_MULTIPLIER);

  const constructionBoostPercent = getConstructionYieldBoostPercent(userId, 'hunting');
  const totalQty = applyConstructionYieldBoost(baseTotalQty, constructionBoostPercent);

  const weights = multiResourceTierWeights(currentLevel);
  const distribution = distributeByWeight(totalQty, weights);

  let totalXp = 0;
  const grantedLines = [];
  for (const { tier, qty } of distribution) {
    const hide = getHide(tier, 'fine');
    if (!hide) continue;
    addItemToInventory(guildId, userId, hide.id, qty, 'hunting');
    recordCollectionLogObtain(userId, hide.id, qty);
    const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
    totalXp += xpPerUnit * qty;
    grantedLines.push(`${qty}x ${hide.name}`);
  }

  const xpResult = addSkillXp(guildId, userId, 'hunting', totalXp);

  let text = `<@${userId}> **${displayName}** returns from the Lodge grounds with: ${grantedLines.join(', ')}.`;
  text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} hunting XP**${formatOutfitBonusNote(xpResult.outfitBonusPercent)}`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}

export async function resolveDueHunting(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const [, huntType, tierStr] = row.active_mob_id.split(':');
  const tier = Number(tierStr);
  const quantity = row.slay_quantity;
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  if (huntType === 'bird') {
    const featherItem = getFeatherItem();
    const perCatch = FEATHERS_PER_CATCH_BY_TIER[tier] ?? 1;
    let totalFeathers = perCatch * quantity;
    const constructionBoostPercent = getConstructionYieldBoostPercent(userId, 'hunting');
    totalFeathers = applyConstructionYieldBoost(totalFeathers, constructionBoostPercent);
    addItemToInventory(guildId, userId, featherItem.id, totalFeathers, 'hunting');
    recordCollectionLogObtain(userId, featherItem.id, totalFeathers);

    const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
    const totalXp = xpPerUnit * quantity;
    const xpResult = addSkillXp(guildId, userId, 'hunting', totalXp);

    let text = `<@${userId}> **${displayName}** returns from hunting **${BIRD_NAMES_BY_TIER[tier]}**: ${totalFeathers}x ${featherItem.name}.`;
    text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Hunting XP**${formatOutfitBonusNote(xpResult.outfitBonusPercent)}`;
    if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

    const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
    text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

    endGladiatorAdventure(guildId, userId);
    return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
  }

  const fineHide = getHide(tier, 'fine');
  const poorHide = getHide(tier, 'poor');
  const perfectHide = getHide(tier, 'perfect');
  const huntingLevel = getSkillLevel(guildId, userId, 'hunting');
  let poorPct = computePoorChancePercent(tier, huntingLevel);

  const HUNTERS_KNIFE_ID = 41004;
  const hasHuntersKnife = getOwnedQuantity(guildId, userId, HUNTERS_KNIFE_ID) > 0;
  if (hasHuntersKnife) poorPct = 0;

  let poorCount = 0, fineCount = 0, perfectCount = 0;
  let totalXp = 0;
  const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
  for (let i = 0; i < quantity; i++) {
    const roll = Math.random() * 100;
    if (roll < poorPct) { poorCount++; totalXp += Math.round(xpPerUnit * 0.35); }
    else if (roll < poorPct + 15) { perfectCount++; totalXp += Math.round(xpPerUnit * 1.5); }
    else { fineCount++; totalXp += xpPerUnit; }
  }

  const yieldBoostPercent = getConstructionYieldBoostPercent(userId, 'hunting');
  let boostedPoor = 0, boostedFine = 0, boostedPerfect = 0;
  if (poorCount > 0) {
    boostedPoor = applyConstructionYieldBoost(poorCount, yieldBoostPercent);
    addItemToInventory(guildId, userId, poorHide.id, boostedPoor, 'hunting');
    recordCollectionLogObtain(userId, poorHide.id, boostedPoor);
  }
  if (fineCount > 0) {
    boostedFine = applyConstructionYieldBoost(fineCount, yieldBoostPercent);
    addItemToInventory(guildId, userId, fineHide.id, boostedFine, 'hunting');
    recordCollectionLogObtain(userId, fineHide.id, boostedFine);
  }
  if (perfectCount > 0) {
    boostedPerfect = applyConstructionYieldBoost(perfectCount, yieldBoostPercent);
    addItemToInventory(guildId, userId, perfectHide.id, boostedPerfect, 'hunting');
    recordCollectionLogObtain(userId, perfectHide.id, boostedPerfect);
  }

  const xpResult = addSkillXp(guildId, userId, 'hunting', totalXp);

  const HUNTERS_KNIFE_FIND_PERCENT = 3;
  const foundHuntersKnife = rollSpecialToolFind(
    guildId, userId, HUNTERS_KNIFE_ID, row.adventure_started_at, row.adventure_ends_at, HUNTERS_KNIFE_FIND_PERCENT
  );
  const foundOutfitPiece = rollSkillingOutfitFind(guildId, userId, 'hunting', row.adventure_started_at, row.adventure_ends_at);

  let text = `<@${userId}> **${displayName}** returns from hunting **${getAnimalName(fineHide)}**:`;
  const parts = [];
  if (boostedFine > 0) parts.push(`${boostedFine}x ${fineHide.name}`);
  if (boostedPerfect > 0) parts.push(`${boostedPerfect}x ${perfectHide.name}`);
  if (boostedPoor > 0) parts.push(`${boostedPoor}x ${poorHide.name}`);
  text += ` ${parts.join(', ')}.`;
  if (foundHuntersKnife) text += `\n\n🔪 You found a **Hunter's Knife**!`;
  if (foundOutfitPiece) text += `\n\n🏕️ You found the **${foundOutfitPiece.name}**!`;
  text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Hunting XP**${formatOutfitBonusNote(xpResult.outfitBonusPercent)}`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
