import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionCostReductionPercent, applyConstructionCostReduction, computeAffordableQuantity, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction } from './construction.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import db from '../database.js';
import { rollSpecialToolFind } from './specialToolFinds.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const MAGIC_CRAFTING_TRIP_TYPE = 'magic_crafting';

const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 10;

const MAX_YIELD = 100;

const XP_PER_UNIT_BY_TIER = { 1: 4, 5: 5, 10: 6 };
const NEEDLE_BREAK_CHANCE_PERCENT = 3;

const LARGE_SLOTS = new Set(['chest', 'legs']);
const ENCHANTED_THREAD_PER_PIECE = { small: 2, large: 4 };

const SILK_PER_PIECE_BY_TIER = { 1: 1, 5: 2, 10: 3 };

export function getMaxMagicCraftingQuantity() {
  return MAX_YIELD;
}

function getImbuedSilk() {
  return ITEMS.find((i) => i.name === 'Imbued Silk');
}
function getNeedle() {
  return ITEMS.find((i) => i.name === 'Needle');
}
function getEnchantedThread() {
  return ITEMS.find((i) => i.name === 'Enchanted Thread');
}

function silkCostForProduct(product) {
  return SILK_PER_PIECE_BY_TIER[product.tier] ?? 1;
}
function threadCostForProduct(product) {
  const isLarge = LARGE_SLOTS.has(product.slot) || product.slot === 'main_hand' || product.slot === 'off_hand';
  return isLarge ? ENCHANTED_THREAD_PER_PIECE.large : ENCHANTED_THREAD_PER_PIECE.small;
}

export function getAffordableMagicCraftingQuantity(guildId, userId, productId, requestedQuantity) {
  const product = getItem(productId);
  if (!product) return 0;
  const silk = getImbuedSilk();
  const thread = getEnchantedThread();
  if (!silk || !thread) return 0;
  const silkCost = silkCostForProduct(product);
  const threadCost = threadCostForProduct(product);
  const ownedSilk = getOwnedQuantity(guildId, userId, silk.id);
  const ownedThread = getOwnedQuantity(guildId, userId, thread.id);
  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'crafting');
  const costMultiplier = 1 - constructionReductionPercent / 100;
  const effectiveSilkCost = silkCost * costMultiplier;
  const affordableBySilk = effectiveSilkCost > 0 ? Math.floor(ownedSilk / effectiveSilkCost) : ownedSilk;
  const effectiveThreadCost = threadCost * costMultiplier;
  const affordableByThread = effectiveThreadCost > 0 ? Math.floor(ownedThread / effectiveThreadCost) : Math.floor(ownedThread / threadCost);
  return Math.max(0, Math.min(requestedQuantity, affordableBySilk, affordableByThread));
}

export function computeMagicCraftingTripSeconds(quantity) {
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / MAX_YIELD;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

export function describeMagicCraftingActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('magic_crafting:')) return null;
  const productId = Number(activeMobId.split(':')[1]);
  const product = getItem(productId);
  return `📜 Out enchanting **${product ? product.name : 'gear'}**. Back ${timestamp}.`;
}

export function getMagicCraftingProducts() {
  const products = ITEMS.filter(
    (i) => i.combatStyle === 'mage' && i.source === 'mage_craft' && !(i.slot === 'main_hand' && i.weaponSubtype === 'staff')
  );
  return products.map((p) => ({ ...p, silkCost: silkCostForProduct(p), threadCost: threadCostForProduct(p) }));
}

export async function startMagicCraftingTrip(guildId, userId, channelId, fallbackName, productId, quantity) {
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

  const product = getItem(productId);
  if (
    !product ||
    product.combatStyle !== 'mage' ||
    product.source !== 'mage_craft' ||
    (product.slot === 'main_hand' && product.weaponSubtype === 'staff')
  ) {
    throw new EconomyError('Invalid product.');
  }
  const tier = product.tier;

  const currentLevel = getSkillLevel(guildId, userId, 'crafting');
  if (currentLevel < tier) throw new EconomyError(`You need Crafting level ${tier} [You are Level ${currentLevel}].`);

  const maxQty = getMaxMagicCraftingQuantity();
  const silkCost = silkCostForProduct(product);
  const threadCost = threadCostForProduct(product);
  const silk = getImbuedSilk();
  const needle = getNeedle();
  const thread = getEnchantedThread();

  if (getOwnedQuantity(guildId, userId, needle.id) < 1) {
    throw new EconomyError('You need a Needle to craft at all — buy one from the Arena Store.');
  }

  const constructionReductionPercent = getConstructionCostReductionPercent(userId, 'crafting');
  const ownedSilk = getOwnedQuantity(guildId, userId, silk.id);
  const ownedThread = getOwnedQuantity(guildId, userId, thread.id);

  if (quantity == null) {
    quantity = computeAffordableQuantity(maxQty, (qty) => [
      { owned: ownedSilk, needed: applyConstructionCostReduction(qty * silkCost, constructionReductionPercent) },
      { owned: ownedThread, needed: applyConstructionCostReduction(qty * threadCost, constructionReductionPercent) },
    ]);
    if (quantity < 1) {
      throw new EconomyError(`You don't have any ${silk.name} or ${thread.name} to craft with.`);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty}.`);
  }

  const silkNeeded = applyConstructionCostReduction(quantity * silkCost, constructionReductionPercent);
  const threadNeeded = applyConstructionCostReduction(quantity * threadCost, constructionReductionPercent);
  const missing = [];
  if (ownedSilk < silkNeeded) missing.push(`${silkNeeded}x ${silk.name} (have ${ownedSilk})`);
  if (ownedThread < threadNeeded) missing.push(`${threadNeeded}x ${thread.name} (have ${ownedThread})`);
  if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'crafting');
  const tripSeconds = hasInstantTrips(guildId, userId)
    ? 30
    : applyConstructionTripTimeReduction(computeMagicCraftingTripSeconds(quantity), constructionTripTimeReductionPercent);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `magic_crafting:${productId}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, MAGIC_CRAFTING_TRIP_TYPE, { productId, quantity });

  addItemToInventory(guildId, userId, silk.id, -silkNeeded);
  addItemToInventory(guildId, userId, thread.id, -threadNeeded);

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads off to enchant ${quantity}x **${product.name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueMagicCrafting(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const productId = Number(row.active_mob_id.split(':')[1]);
  const quantity = row.slay_quantity;

  const product = getItem(productId);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  addItemToInventory(guildId, userId, product.id, quantity, 'magic_crafting');
  recordCollectionLogObtain(userId, product.id, quantity);

  const GOLDEN_NEEDLE_ID = 41001;
  const GOLDEN_NEEDLE_PROC_PERCENT = 12;
  const hasGoldenNeedle = getOwnedQuantity(guildId, userId, GOLDEN_NEEDLE_ID) > 0;
  let bonusPieces = 0;
  if (hasGoldenNeedle) {
    for (let i = 0; i < quantity; i++) {
      if (Math.random() * 100 < GOLDEN_NEEDLE_PROC_PERCENT) bonusPieces++;
    }
  }
  if (bonusPieces > 0) {
    addItemToInventory(guildId, userId, product.id, bonusPieces, 'magic_crafting');
    recordCollectionLogObtain(userId, product.id, bonusPieces);
  }
  const totalYield = quantity + bonusPieces;

  let needleBroke = false;
  if (Math.random() * 100 < NEEDLE_BREAK_CHANCE_PERCENT) {
    const needle = getNeedle();
    addItemToInventory(guildId, userId, needle.id, -1);
    needleBroke = true;
  }

  const GOLDEN_NEEDLE_FIND_PERCENT = 3;
  const foundGoldenNeedle = rollSpecialToolFind(
    guildId, userId, GOLDEN_NEEDLE_ID, row.adventure_started_at, row.adventure_ends_at, GOLDEN_NEEDLE_FIND_PERCENT
  );

  const xpPerUnit = XP_PER_UNIT_BY_TIER[product.tier] ?? (2 + Math.round(product.tier / 10));
  const totalXp = xpPerUnit * quantity;
  const xpResult = addSkillXp(guildId, userId, 'crafting', totalXp);

  let text = `<@${userId}> **${displayName}** returns from enchanting — **${totalYield}x ${product.name}**${bonusPieces > 0 ? ` (${bonusPieces} bonus from Golden Needle)` : ''}.`;
  if (needleBroke) text += `\n🪡 Your Needle broke — you'll need a new one for your next trip.`;
  if (foundGoldenNeedle) text += `\n\n🪡 You found a **Golden Needle**!`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} Crafting XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
