import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionCostReductionPercent, applyConstructionCostReduction, computeAffordableQuantity } from './construction.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { rollSpecialToolFind } from './specialToolFinds.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const HERBALISM_TRIP_TYPE = 'herbalism';

const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 30;
const MAX_YIELD_BY_TIER = { 1: 100, 5: 95, 10: 90, 20: 85, 35: 78, 45: 70, 55: 62, 65: 55, 75: 48, 85: 42, 92: 38 };

const XP_PER_UNIT_BY_TIER = { 1: 4, 5: 5, 10: 6, 20: 8, 35: 12, 45: 15, 55: 18, 65: 21, 75: 25, 85: 29, 92: 33 };

export function getMaxHerbalismQuantity(tier) {
  return MAX_YIELD_BY_TIER[tier] ?? 50;
}

export function getAffordableHerbalismQuantity(guildId, userId, tier, requestedQuantity) {
  const herb = getHerb(tier);
  const vial = getVial();
  if (!herb || !vial) return 0;
  const ownedHerbs = getOwnedQuantity(guildId, userId, herb.id);
  const ownedVials = getOwnedQuantity(guildId, userId, vial.id);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'herbalism');
  const costMultiplier = 1 - constructionReductionPercent / 100;
  const affordableByHerbs = costMultiplier > 0 ? Math.floor(ownedHerbs / costMultiplier) : ownedHerbs;
  const affordableByVials = costMultiplier > 0 ? Math.floor(ownedVials / costMultiplier) : ownedVials;
  return Math.max(0, Math.min(requestedQuantity, affordableByHerbs, affordableByVials));
}
export function computeHerbalismTripSeconds(tier, quantity) {
  const maxQty = getMaxHerbalismQuantity(tier);
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / maxQty;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

function getHerb(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'herb' && i.tier === tier);
}
function getPotion(tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === 'potion' && i.tier === tier);
}
function getVial() {
  return ITEMS.find((i) => i.name === 'Vial of Water');
}

export function describeHerbalismActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('herbalism:')) return null;
  const tier = Number(activeMobId.split(':')[1]);
  const potion = getPotion(tier);
  return `🧪 Out brewing **${potion ? potion.name : 'potions'}**. Back ${timestamp}.`;
}

export async function startHerbalismTrip(guildId, userId, channelId, fallbackName, tier, quantity) {
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

  const herb = getHerb(tier);
  const vial = getVial();
  if (!herb) throw new EconomyError('Invalid tier.');

  const currentLevel = getSkillLevel(guildId, userId, 'herbalism');
  if (currentLevel < tier) {
    throw new EconomyError(`You need Herbalism level ${tier} for this herb [You are Level ${currentLevel}].`);
  }

  const maxQty = getMaxHerbalismQuantity(tier);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'herbalism');
  const ownedHerbs = getOwnedQuantity(guildId, userId, herb.id);
  const ownedVials = getOwnedQuantity(guildId, userId, vial.id);

  if (quantity == null) {
    quantity = computeAffordableQuantity(maxQty, (qty) => [
      { owned: ownedHerbs, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
      { owned: ownedVials, needed: applyConstructionCostReduction(qty, constructionReductionPercent) },
    ]);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${herb.name} or Vials of Water to brew with.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const herbCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  const vialCost = applyConstructionCostReduction(quantity, constructionReductionPercent);
  if (ownedHerbs < herbCost) throw new EconomyError(`You need ${herbCost}x ${herb.name} — you have ${ownedHerbs}.`);
  if (ownedVials < vialCost) throw new EconomyError(`You need ${vialCost}x Vial of Water (10 coins each from the Arena Store) — you have ${ownedVials}.`);

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const tripSeconds = hasInstantTrips(guildId, userId) ? 30 : computeHerbalismTripSeconds(tier, quantity);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `herbalism:${tier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, HERBALISM_TRIP_TYPE, { tier, quantity });

  addItemToInventory(guildId, userId, herb.id, -herbCost);
  addItemToInventory(guildId, userId, vial.id, -vialCost);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to brew ${quantity}x **${getPotion(tier).name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueHerbalism(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const tier = Number(row.active_mob_id.split(':')[1]);
  const quantity = row.slay_quantity;

  const potion = getPotion(tier);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  const HERBAL_FLASK_ID = 41006;
  const HERBAL_FLASK_PROC_PERCENT = 10;
  const hasFlask = getOwnedQuantity(guildId, userId, HERBAL_FLASK_ID) > 0;
  let doubledCount = 0;
  if (hasFlask) {
    for (let i = 0; i < quantity; i++) {
      if (Math.random() * 100 < HERBAL_FLASK_PROC_PERCENT) doubledCount++;
    }
  }
  const totalYield = quantity + doubledCount;

  addItemToInventory(guildId, userId, potion.id, totalYield, 'herbalism');
  recordCollectionLogObtain(userId, potion.id, totalYield);

  const HERBAL_FLASK_FIND_PERCENT = 3;
  const foundFlask = rollSpecialToolFind(
    guildId, userId, HERBAL_FLASK_ID, row.adventure_started_at, row.adventure_ends_at, HERBAL_FLASK_FIND_PERCENT
  );

  const xpPerUnit = XP_PER_UNIT_BY_TIER[tier] ?? (2 + Math.round(tier / 10));
  const totalXp = xpPerUnit * quantity;
  const xpResult = addSkillXp(guildId, userId, 'herbalism', totalXp);

  let text = `<@${userId}> **${displayName}** returns from brewing — **${totalYield}x ${potion.name}**${doubledCount > 0 ? ` (${doubledCount} doubled by Herbal Flask)` : ''}.`;
  if (foundFlask) text += `\n\n🧪 You found a **Herbal Flask**!`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} Herbalism XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
