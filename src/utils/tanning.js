import { GLOBAL_ID } from './globalId.js';
import { ITEMS } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, INSTANT_TRIP_SECONDS, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const TANNING_TRIP_TYPE = 'tanning';

const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;
const MAX_RAW_HIDES_BY_TIER = { 1: 100, 5: 95, 10: 90, 20: 85, 35: 78, 45: 70, 55: 62, 65: 55, 75: 48, 85: 42, 92: 38 };
const PERFECT_TAN_YIELD = 2;

const XP_PER_TANNED_HIDE_BY_TIER = { 1: 4, 5: 5, 10: 6, 20: 8, 35: 12, 45: 15, 55: 18, 65: 21, 75: 25, 85: 29, 92: 33 };

export function getMaxTanningQuantity(tier) {
  return MAX_RAW_HIDES_BY_TIER[tier] ?? 50;
}
export function computeTanningTripSeconds(tier, quantity) {
  const maxQty = getMaxTanningQuantity(tier);
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / maxQty;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

function getHide(tier, quality) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'hide' && i.tier === tier && i.hideQuality === quality);
}
export function getTannedHide(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'tanned_hide' && i.tier === tier);
}

function planTanning(guildId, userId, tier, requestedQuantity, usePerfect) {
  const finehide = getHide(tier, 'fine');
  const perfecthide = usePerfect ? getHide(tier, 'perfect') : null;
  const ownedFine = finehide ? getOwnedQuantity(guildId, userId, finehide.id) : 0;
  const ownedPerfect = perfecthide ? getOwnedQuantity(guildId, userId, perfecthide.id) : 0;

  const perfectToUse = usePerfect ? Math.min(requestedQuantity, ownedPerfect) : 0;
  const remaining = requestedQuantity - perfectToUse;
  const fineToUse = Math.min(remaining, ownedFine);

  const rawHidesUsed = perfectToUse + fineToUse;
  const tannedYield = fineToUse * 1 + perfectToUse * PERFECT_TAN_YIELD;

  return { finehide, perfecthide, ownedFine, ownedPerfect, perfectToUse, fineToUse, rawHidesUsed, tannedYield };
}

export function describeTanningActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('tanning:')) return null;
  const tier = Number(activeMobId.split(':')[1]);
  const finehide = getHide(tier, 'fine');
  const animalName = finehide ? finehide.name.replace(/ Hide$/, '') : 'hides';
  return `🧴 Out tanning **${animalName}**. Back ${timestamp}.`;
}

export function getAffordableTanningQuantity(guildId, userId, tier, usePerfect, requestedQuantity) {
  const plan = planTanning(guildId, userId, tier, requestedQuantity, usePerfect);
  return Math.max(0, Math.min(requestedQuantity, plan.rawHidesUsed));
}

export async function startTanningTrip(guildId, userId, channelId, fallbackName, tier, usePerfect, quantity) {
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

  const finehide = getHide(tier, 'fine');
  if (!finehide) throw new EconomyError('Invalid tier.');
  const tannedHide = getTannedHide(tier);
  if (!tannedHide) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'crafting');
  if (currentLevel < tier) throw new EconomyError(`You need Crafting level ${tier} [You are Level ${currentLevel}].`);

  const maxQty = getMaxTanningQuantity(tier);

  if (quantity == null) {
    const available = planTanning(guildId, userId, tier, maxQty, usePerfect).rawHidesUsed;
    quantity = Math.min(available, maxQty);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${usePerfect ? 'Fine or Perfect' : 'Fine'} ${finehide.name} to tan.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const plan = planTanning(guildId, userId, tier, quantity, usePerfect);
  if (plan.rawHidesUsed < quantity) {
    const missing = usePerfect
      ? `${quantity}x Fine or Perfect ${finehide.name} (have ${plan.ownedFine} Fine, ${plan.ownedPerfect} Perfect)`
      : `${quantity}x ${finehide.name} (have ${plan.ownedFine})`;
    throw new EconomyError(`You're missing: ${missing}.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const tripSeconds = hasInstantTrips(guildId, userId) ? INSTANT_TRIP_SECONDS : computeTanningTripSeconds(tier, quantity);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `tanning:${tier}`;
  const outcome = { fineUsed: plan.fineToUse, perfectUsed: plan.perfectToUse, tannedYield: plan.tannedYield };
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ?, tanning_outcome_json = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, JSON.stringify(outcome), guildId, userId);
  recordLastTripSettings(userId, TANNING_TRIP_TYPE, { tier, usePerfect, quantity });

  if (plan.fineToUse > 0) addItemToInventory(guildId, userId, plan.finehide.id, -plan.fineToUse);
  if (plan.perfectToUse > 0) addItemToInventory(guildId, userId, plan.perfecthide.id, -plan.perfectToUse);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const usedParts = [];
  if (plan.fineToUse > 0) usedParts.push(`${plan.fineToUse}x ${plan.finehide.name}`);
  if (plan.perfectToUse > 0) usedParts.push(`${plan.perfectToUse}x ${plan.perfecthide.name}`);
  return { text: `**${displayName}** heads off to tan ${usedParts.join(' and ')} into **${plan.tannedYield}x ${tannedHide.name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueTanning(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const tier = Number(row.active_mob_id.split(':')[1]);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  const outcome = JSON.parse(row.tanning_outcome_json);
  const { fineUsed, perfectUsed, tannedYield } = outcome;

  const tannedHide = getTannedHide(tier);
  const finehide = getHide(tier, 'fine');
  const perfecthide = getHide(tier, 'perfect');

  addItemToInventory(guildId, userId, tannedHide.id, tannedYield, 'tanning');
  recordCollectionLogObtain(userId, tannedHide.id, tannedYield);

  const xpPerTannedHide = XP_PER_TANNED_HIDE_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
  const totalXp = xpPerTannedHide * tannedYield;
  const xpResult = addSkillXp(guildId, userId, 'crafting', totalXp);

  const usedParts = [];
  if (fineUsed > 0) usedParts.push(`${fineUsed}x ${finehide.name}`);
  if (perfectUsed > 0) usedParts.push(`${perfectUsed}x ${perfecthide.name}`);

  let text = `<@${userId}> **${displayName}** returns from tanning — **${tannedYield}x ${tannedHide.name}** (from ${usedParts.join(' and ')}).`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} Crafting XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
