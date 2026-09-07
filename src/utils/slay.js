import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { MOBS } from '../data/mobs.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, getAllSkillLevels } from './skills.js';
import { requireTrainingGear, awardCombatSkillXp, formatCombatSkillXpLines } from './trainingStyle.js';
import {
  ensureGladiator,
  isGladiatorAdventuring,
  hasUnclaimedAdventure,
  startGladiatorSlay,
  endGladiatorAdventure,
  getGladiatorProfile,
  formatGladiatorDisplayName,
  addGladiatorXp,
  applyGladiatorXpBonus,
  hasInstantTrips,
} from './gladiator.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getAllEquipmentSets, getOwnedQuantity, consumeEquippedArrows } from './inventory.js';
import { formatArena } from './format.js';
import { addArenaCoins } from './arena.js';
import { grantEquippedPetXp, formatPetLevelUpLine } from './pets.js';
import { getNewlyUnlockedItemIds, recordCollectionLogObtainMany } from './collectionLog.js';
import { AttachmentBuilder } from 'discord.js';
import { renderLootPreviewImage } from './inventoryImage.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const SLAY_TRIP_TYPE = 'slay';

export function getMob(mobId) {
  return MOBS.find((m) => m.id === mobId) ?? null;
}

export function describeSlayActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || activeMobId.startsWith('gathering:')) return null;
  const mob = getMob(activeMobId);
  if (!mob) return null;
  return `⚔️ Out hunting **${mob.name}**. Back ${timestamp}.`;
}

const DEATH_BASE_BY_TIER = { 1: 1, 5: 1.25, 10: 1.5, 20: 1.75, 35: 2, 45: 2.25, 55: 2.5, 65: 2.75, 75: 3, 85: 3.5, 92: 4 };
const DEATH_FLOOR_BY_TIER = { 1: 0.25, 5: 0.25, 10: 0.5, 20: 0.5, 35: 0.75, 45: 0.75, 55: 1, 65: 1, 75: 1.25, 85: 1.5, 92: 2 };
const DEATH_KC_CAP = 500;

export function computeMobDeathChancePercent(mobTier, kc) {
  const base = DEATH_BASE_BY_TIER[mobTier] ?? 20;
  const floor = DEATH_FLOOR_BY_TIER[mobTier] ?? 0;
  const frac = Math.min(kc / DEATH_KC_CAP, 1);
  const reduced = base * (1 - frac);
  return Math.max(reduced, floor);
}

function getMobKc(userId, mobId) {
  const row = db.prepare('SELECT kills FROM mob_kills WHERE user_id = ? AND mob_id = ?').get(userId, mobId);
  return row?.kills ?? 0;
}

const stmtAddMobKills = db.prepare(`
  INSERT INTO mob_kills (user_id, mob_id, kills) VALUES (?, ?, ?)
  ON CONFLICT (user_id, mob_id) DO UPDATE SET kills = kills + excluded.kills
`);

export function recordMobKills(userId, mobId, count) {
  stmtAddMobKills.run(userId, mobId, count);
}

export function checkMobGate(mob, skillLevels, killSetEquipped) {
  const reasons = [];

  const requiredLevel = mob.killGate.level;
  const skillKey = mob.killGate.skill === 'attack_str' ? null : mob.killGate.skill;
  if (mob.killGate.skill === 'attack_str') {

    const meetsAny = ['attack', 'strength', 'ranged', 'magic'].some((skill) => (skillLevels[skill] ?? 1) >= requiredLevel);
    if (!meetsAny) {
      reasons.push(`Attack, Strength, Ranged, or Magic level ${requiredLevel}`);
    }
  } else if ((skillLevels[skillKey] ?? 1) < requiredLevel) {
    reasons.push(`${skillKey} level ${requiredLevel}`);
  }

  if (mob.killGate.gatheringSkill) {
    const gLevel = skillLevels[mob.killGate.gatheringSkill] ?? 1;
    if (gLevel < requiredLevel) reasons.push(`${mob.killGate.gatheringSkill} level ${requiredLevel}`);
  }

  if (mob.namedItemIds) {
    for (const requiredId of mob.namedItemIds) {
      const requiredItem = getItem(requiredId);
      if (!requiredItem) continue;
      const equipped = killSetEquipped[requiredItem.slot];
      const qualifies =
        equipped &&
        equipped.combatStyle === requiredItem.combatStyle &&
        (equipped.weaponSubtype ?? null) === (requiredItem.weaponSubtype ?? null) &&
        equipped.tier >= requiredItem.tier;
      if (!qualifies) reasons.push(`${requiredItem.name} (or higher-tier) equipped in your Kill-set`);
    }
  }

  if (mob.arrowId) {
    const bow = killSetEquipped.main_hand;
    if (!bow || bow.weaponSubtype !== 'bow') reasons.push('a bow equipped');

  }

  return { allowed: reasons.length === 0, reasons };
}

const KILLS_PER_TRIP_BY_TIER = { 1: 48, 5: 45, 10: 42, 20: 38, 35: 35, 45: 32, 55: 29, 65: 26, 75: 23, 85: 20, 92: 18 };

const BASE_XP_PER_KILL_BY_TIER = { 1: 8.8, 5: 12, 10: 16, 20: 24, 35: 36, 45: 44, 55: 52, 65: 60, 75: 68, 85: 79, 92: 88.9 };
const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 30;

export function getMaxQuantityForTier(tier) {
  return KILLS_PER_TRIP_BY_TIER[tier] ?? 30;
}

export function computeSlayTripSeconds(tier, quantity) {
  const maxQty = getMaxQuantityForTier(tier);
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / maxQty;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function rollCoins(mob) {
  if (!mob.coinRange) return 0;
  const [lo, hi] = mob.coinRange;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollResource(mob) {
  if (!mob.resourceItemId) return null;
  if (Math.random() * 100 >= mob.resourceWeight) return null;
  return { itemId: mob.resourceItemId, quantity: 2 + Math.floor(Math.random() * 3) };
}

const IMBUED_SILK_MAX_BY_TIER = { 1: 2, 5: 2, 10: 2, 20: 3, 35: 3, 45: 3, 55: 4, 65: 4, 75: 4, 85: 5, 92: 5 };
function getImbuedSilkItem() {
  return ITEMS.find((i) => i.name === 'Imbued Silk');
}
function rollImbuedSilkForTrip(mob) {
  if (!mob.resourceItemId) return null;
  const imbuedSilk = getImbuedSilkItem();
  if (!imbuedSilk) return null;
  const maxSilk = IMBUED_SILK_MAX_BY_TIER[mob.tier] ?? 2;
  const quantity = 1 + Math.floor(Math.random() * maxSilk);
  return { itemId: imbuedSilk.id, quantity };
}

function rollEquipment(mob) {
  if (!mob.equipStyle || !mob.equipGatePercent) return null;
  if (Math.random() * 100 >= mob.equipGatePercent) return null;
  const style = mob.equipStyle === 'any' ? pickRandom(['melee', 'ranged', 'mage']) : mob.equipStyle;
  const source = `${style}_drop`;
  const pool = ITEMS.filter((i) => i.type === 'equipment' && i.combatStyle === style && i.tier === mob.tier && i.source === source);
  if (pool.length === 0) return null;
  return pickRandom(pool).id;
}

const TIER_ORDER = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];

function rollBonusLowerTier(mob) {
  const idx = TIER_ORDER.indexOf(mob.tier);
  if (idx <= 0) return { resource: null, equipment: null };

  const lowerTiers = TIER_ORDER.slice(0, idx);
  let bonusResource = null;
  if (Math.random() * 100 < 20) {
    const tier = pickRandom(lowerTiers);
    const pool = ITEMS.filter((i) => i.type === 'resource' && i.tier === tier && i.category !== 'seed');
    if (pool.length > 0) bonusResource = { itemId: pickRandom(pool).id, quantity: 2 + Math.floor(Math.random() * 3) };
  }

  let bonusEquipment = null;
  if (mob.equipStyle) {
    const bonusPct = Math.max(0.1, mob.equipGatePercent * 0.3);
    if (Math.random() * 100 < bonusPct) {
      const tier = pickRandom(lowerTiers);
      const style = mob.equipStyle === 'any' ? pickRandom(['melee', 'ranged', 'mage']) : mob.equipStyle;
      const pool = ITEMS.filter((i) => i.type === 'equipment' && i.combatStyle === style && i.tier === tier && i.source === `${style}_drop`);
      if (pool.length > 0) bonusEquipment = pickRandom(pool).id;
    }
  }

  return { resource: bonusResource, equipment: bonusEquipment };
}

export function rollKillLoot(mob) {
  const coins = rollCoins(mob);
  const resource = rollResource(mob);
  const equipmentId = rollEquipment(mob);
  const bonus = rollBonusLowerTier(mob);
  return { coins, resource, equipmentId, bonusResource: bonus.resource, bonusEquipmentId: bonus.equipment };
}

const MATCHED_UNITS_PER_FULL_TRIP = { 1: 12, 5: 12, 10: 14, 20: 13, 35: 12, 45: 11, 55: 15, 65: 13, 75: 12, 85: 10, 92: 9 };
const ELIXIR_UNITS_PER_FULL_TRIP = { 1: 16, 5: 18, 10: 21, 20: 26, 35: 35, 45: 46, 55: 73, 65: 104 };
const FUEL_TIER_ORDER = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
const FUEL_CATEGORIES = ['cooked_fish', 'potion'];

export function isElixirValidForTier(tier) {
  return tier in ELIXIR_UNITS_PER_FULL_TRIP;
}

function computeFuelUnitsNeeded(tier, quantity, fuelType) {
  const maxQty = getMaxQuantityForTier(tier);
  const perFullTrip = fuelType === 'elixir' ? ELIXIR_UNITS_PER_FULL_TRIP[tier] : MATCHED_UNITS_PER_FULL_TRIP[tier];
  if (perFullTrip == null) return null;
  return Math.max(1, Math.ceil((quantity / maxQty) * perFullTrip));
}

function getMatchedFuelItem(tier) {
  return (
    ITEMS.find((i) => i.type === 'resource' && i.category === 'cooked_fish' && i.tier === tier) ??
    ITEMS.find((i) => i.type === 'resource' && i.category === 'potion' && i.tier === tier)
  );
}

function getFuelItemAtTier(tier, category) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === category && i.tier === tier);
}

function priceScaledFuelUnits(baseUnits, referencePrice, candidatePrice) {
  if (!candidatePrice) return baseUnits;
  const ratio = referencePrice / candidatePrice;
  return Math.max(1, Math.min(baseUnits, Math.ceil(baseUnits * ratio)));
}

function resolveFuelChoice(guildId, userId, mobTier, quantity) {
  const matchedItem = getMatchedFuelItem(mobTier);
  const matchedUnitsNeeded = matchedItem ? computeFuelUnitsNeeded(mobTier, quantity, 'matched') : null;

  if (matchedItem && matchedUnitsNeeded != null) {
    for (const fuelTier of FUEL_TIER_ORDER) {
      if (fuelTier < mobTier) continue;
      for (const category of FUEL_CATEGORIES) {
        const candidate = getFuelItemAtTier(fuelTier, category);
        if (!candidate) continue;
        const unitsNeeded = priceScaledFuelUnits(matchedUnitsNeeded, matchedItem.price, candidate.price);
        const owned = getOwnedQuantity(guildId, userId, candidate.id);
        if (owned >= unitsNeeded) return { itemId: candidate.id, units: unitsNeeded, name: candidate.name };
      }
    }
  }

  if (isElixirValidForTier(mobTier)) {
    const elixirUnitsNeeded = computeFuelUnitsNeeded(mobTier, quantity, 'elixir');
    const ownedElixir = getOwnedQuantity(guildId, userId, 'elixir');
    if (ownedElixir >= elixirUnitsNeeded) return { itemId: 'elixir', units: elixirUnitsNeeded, name: 'Elixir' };
  }

  const matchedName = matchedItem?.name ?? `Tier ${mobTier} fish/potion`;
  const elixirUnitsForError = isElixirValidForTier(mobTier) ? computeFuelUnitsNeeded(mobTier, quantity, 'elixir') : null;
  const elixirNote = elixirUnitsForError != null ? ` or ${elixirUnitsForError}x Elixir` : ' (Elixir is not valid at this tier)';
  throw new EconomyError(`You need ${matchedUnitsNeeded ?? '?'}x ${matchedName} (or a smaller amount of a higher-tier food/potion)${elixirNote} to fuel this trip.`);
}

const MINIMUM_TRIP_SECONDS_FOR_DROPS = 25 * 60;

export async function startSlayFor(guildId, userId, channelId, fallbackName, mobId, quantity) {
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

  const mob = getMob(mobId);
  if (!mob) throw new EconomyError("That mob doesn't exist.");

  const maxQty = getMaxQuantityForTier(mob.tier);

  quantity = quantity ?? maxQty;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this mob (its own full-trip amount).`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const skillLevels = getAllSkillLevels(guildId, userId);
  const killSetEquipped = getAllEquipmentSets(guildId, userId).adventure;

  const gate = checkMobGate(mob, skillLevels, killSetEquipped);
  if (!gate.allowed) {
    throw new EconomyError(`You don't meet the requirements for ${mob.name}: ${gate.reasons.join(', ')}.`);
  }

  requireTrainingGear(guildId, userId, killSetEquipped);

  const fuel = resolveFuelChoice(guildId, userId, mob.tier, quantity);

  const ARROWS_PER_KILL = 5;
  let fullArrowsNeeded = 0;
  if (mob.arrowId) {
    const arrowItem = getItem(mob.arrowId);
    fullArrowsNeeded = quantity * ARROWS_PER_KILL;
    const equippedArrows = killSetEquipped.arrows;
    if (!equippedArrows || equippedArrows.item?.id !== mob.arrowId || equippedArrows.quantity < fullArrowsNeeded) {
      const have = equippedArrows?.item?.id === mob.arrowId ? equippedArrows.quantity : 0;
      throw new EconomyError(`You need ${fullArrowsNeeded}x ${arrowItem?.name ?? 'matching-tier arrows'} equipped for this trip — you have ${have} equipped.`);
    }
  }

  const kc = getMobKc(userId, mobId);
  let kills = 0;
  let died = false;
  let totalCoins = 0;
  const resourceTally = new Map();
  const equipmentDrops = [];

  for (let i = 0; i < quantity; i++) {
    const deathChance = computeMobDeathChancePercent(mob.tier, kc + kills);
    if (Math.random() * 100 < deathChance) {
      died = true;
      break;
    }
    kills++;
    const loot = rollKillLoot(mob);
    totalCoins += loot.coins;
    if (loot.resource) resourceTally.set(loot.resource.itemId, (resourceTally.get(loot.resource.itemId) ?? 0) + loot.resource.quantity);
    if (loot.bonusResource) resourceTally.set(loot.bonusResource.itemId, (resourceTally.get(loot.bonusResource.itemId) ?? 0) + loot.bonusResource.quantity);
    if (loot.equipmentId) equipmentDrops.push(loot.equipmentId);
    if (loot.bonusEquipmentId) equipmentDrops.push(loot.bonusEquipmentId);
  }

  if (kills > 0) {
    const silk = rollImbuedSilkForTrip(mob);
    if (silk) resourceTally.set(silk.itemId, (resourceTally.get(silk.itemId) ?? 0) + silk.quantity);
  }

  addItemToInventory(guildId, userId, fuel.itemId, -fuel.units);
  if (mob.arrowId) {
    consumeEquippedArrows(guildId, userId, 'adventure', fullArrowsNeeded);
  }

  const attemptsMade = Math.max(1, kills + (died ? 1 : 0));
  const actualFuelUnits = died ? Math.max(1, Math.ceil((attemptsMade / quantity) * fuel.units)) : fuel.units;
  const actualArrowsUsed = died && mob.arrowId ? Math.max(ARROWS_PER_KILL, attemptsMade * ARROWS_PER_KILL) : fullArrowsNeeded;
  const fuelToSalvage = fuel.units - actualFuelUnits;
  const arrowsToSalvage = fullArrowsNeeded - actualArrowsUsed;

  const realTripSeconds = hasInstantTrips(guildId, userId) ? 30 : computeSlayTripSeconds(mob.tier, attemptsMade);
  const realEndsAt = Date.now() + realTripSeconds * 1000;

  const displayTripSeconds = hasInstantTrips(guildId, userId) ? 30 : computeSlayTripSeconds(mob.tier, quantity);
  const displayEndsAt = Date.now() + displayTripSeconds * 1000;

  const outcome = {
    kills,
    died,
    totalCoins,
    resourceTally: [...resourceTally.entries()],
    equipmentDrops,
    tripSeconds: realTripSeconds,
    fuelItemId: fuel.itemId,
    fuelName: fuel.name,
    fuelToSalvage,
    arrowId: mob.arrowId ?? null,
    arrowName: mob.arrowId ? getItem(mob.arrowId)?.name : null,
    arrowsToSalvage,
  };

  startGladiatorSlay(guildId, userId, realEndsAt, channelId, fallbackName, mobId, quantity);
  db.prepare('UPDATE gladiators SET slay_outcome_json = ? WHERE guild_id = ? AND user_id = ?').run(JSON.stringify(outcome), guildId, userId);
  recordLastTripSettings(userId, SLAY_TRIP_TYPE, { mobId, quantity });

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(displayEndsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads out to hunt ${quantity}x **${mob.name}**. Back ${timestamp}.\nRemoved: ${fuel.units}x ${fuel.name}`, endsAt: displayEndsAt };
}

export async function resolveDueSlay(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const mobId = row.active_mob_id;

  const mob = getMob(mobId);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  if (!mob || !row.slay_outcome_json) {
    endGladiatorAdventure(guildId, userId);
    return { guildId, userId, channelId, content: `<@${userId}> **${displayName}**'s trip ended unexpectedly, They were defeated.`, components: [], files: [] };
  }

  const outcome = JSON.parse(row.slay_outcome_json);
  const { kills, died, totalCoins, equipmentDrops, tripSeconds, fuelItemId, fuelName, fuelToSalvage, arrowId, arrowName, arrowsToSalvage } = outcome;
  const resourceTally = new Map(outcome.resourceTally);
  const kc = getMobKc(userId, mobId);

  if (kills > 0) recordMobKills(userId, mobId, kills);

  const salvagedParts = [];
  if (fuelToSalvage > 0) {
    addItemToInventory(guildId, userId, fuelItemId, fuelToSalvage);
    salvagedParts.push(`${fuelToSalvage}x ${fuelName}`);
  }
  if (arrowsToSalvage > 0 && arrowId) {
    addItemToInventory(guildId, userId, arrowId, arrowsToSalvage);
    salvagedParts.push(`${arrowsToSalvage}x ${arrowName}`);
  }

  for (const [itemId, qty] of resourceTally) addItemToInventory(guildId, userId, itemId, qty, 'slay');
  for (const itemId of equipmentDrops) addItemToInventory(guildId, userId, itemId, 1, 'slay');
  if (totalCoins > 0) addArenaCoins(guildId, userId, totalCoins, 'slay');

  const xpPerKill = (BASE_XP_PER_KILL_BY_TIER[mob.tier] ?? 8 * (mob.tier / 10 + 1)) * mob.xpMultiplier;
  const totalXp = Math.round(xpPerKill * kills);
  let xpResult = null;
  let combatSkillResults = [];
  if (totalXp > 0) {
    const boostedXp = applyGladiatorXpBonus(guildId, userId, totalXp, 'slay');
    xpResult = addGladiatorXp(guildId, userId, boostedXp, name);

    combatSkillResults = awardCombatSkillXp(guildId, userId, boostedXp);
  }

  let text = died
    ? `<@${userId}> **${displayName}** was overwhelmed after ${kills}x **${mob.name}** — the trip ends early.`
    : `<@${userId}> **${displayName}** returns from hunting **${mob.name}** — ${kills}x killed.`;

  if (totalCoins > 0) text += `\n\n💰 **Earned:** ${formatArena(totalCoins)}`;

  if (equipmentDrops.length > 0) {
    text += `\n🎁 **Dropped:** ${equipmentDrops.map((id) => getItem(id)?.name ?? id).join(', ')}!`;
  }
  if (salvagedParts.length > 0) {
    text += `\n♻️ **Salvaged:** ${salvagedParts.join(', ')} (never used before the trip ended)`;
  }
  if (xpResult) {
    text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Gladiator XP**`;
    if (xpResult.leveledUp && !xpResult.justMaxed) text += ` — 🆙 **Level ${xpResult.after.level}!**`;
  }
  for (const line of formatCombatSkillXpLines(combatSkillResults)) text += `\n${line}`;

  if (totalXp > 0 && tripSeconds > 0) {
    const xpPerHour = Math.round((totalXp / tripSeconds) * 3600);
    text += `\n📊 **${xpPerHour.toLocaleString('en-US')} XP/hr** — ${kc + kills} KC`;
  } else {
    text += `\n📊 ${kc + kills} KC`;
  }

  if (tripSeconds >= MINIMUM_TRIP_SECONDS_FOR_DROPS) {
    const petXpResult = grantEquippedPetXp(guildId, userId, 'common', xpResult?.after.level ?? 1, !died);
    if (petXpResult) text += `\n\n${formatPetLevelUpLine(petXpResult)}`;
  }

  endGladiatorAdventure(guildId, userId);

  const droppedIds = [...[...resourceTally.entries()].flatMap(([id, qty]) => Array(qty).fill(id)), ...equipmentDrops];
  const newUnlockIds = getNewlyUnlockedItemIds(userId, droppedIds);
  recordCollectionLogObtainMany(userId, droppedIds);
  const grantedItems = droppedIds.map((id) => getItem(id)).filter(Boolean);
  const lootPreviewBuf = await renderLootPreviewImage(guildId, userId, name, grantedItems, newUnlockIds);
  const files = lootPreviewBuf ? [new AttachmentBuilder(lootPreviewBuf, { name: 'loot.png' })] : [];

  const components = [skillRepeatTripRow()];

  return { guildId, userId, channelId, content: text, components, files };
}
