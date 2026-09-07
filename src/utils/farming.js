import { GLOBAL_ID } from './globalId.js';
import db from '../database.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import {
  ensureGladiator,
  isGladiatorAdventuring,
  hasUnclaimedAdventure,
  endGladiatorAdventure,
  getGladiatorProfile,
  getGladiatorQp,
  formatGladiatorDisplayName,
  hasInstantTrips,
  awardGladiatorXpFromSkilling,
  formatGladiatorSkillingXpLine,
} from './gladiator.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { getConstructionYieldBoostPercent, applyConstructionYieldBoost, getConstructionTripTimeReductionPercent, applyConstructionTripTimeReduction } from './construction.js';

const PATCH_TYPES = ['herb', 'tree', 'fruit'];

const TIER_LEVELS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];

const QP_MILESTONES = [
  { qp: 0, herb: 4, tree: 2, fruit: 3 },
  { qp: 500, herb: 6, tree: 3, fruit: 4 },
  { qp: 1000, herb: 9, tree: 4, fruit: 5 },
  { qp: 2000, herb: 11, tree: 5, fruit: 6 },
  { qp: 5000, herb: 13, tree: 6, fruit: 7 },
];

export function getPatchCounts(currentQp) {
  let result = QP_MILESTONES[0];
  for (const m of QP_MILESTONES) {
    if (currentQp >= m.qp) result = m;
  }
  return { herb: result.herb, tree: result.tree, fruit: result.fruit };
}

const GROWTH_MS = { herb: 30 * 60_000, fruit: 3 * 60 * 60_000 };
function treeGrowthMs(tier) {
  const idx = TIER_LEVELS.indexOf(tier);
  const hours = 12 + (24 - 12) * (idx / (TIER_LEVELS.length - 1));
  return hours * 60 * 60_000;
}

const COMPOST_BAGS_PER_PLANT = { herb: 2, tree: 4, fruit: 2 };
const MASTER_COMPOST_ID = 41007;
const SECATEURS_ID = 41008;
const MASTER_COMPOST_FIND_PERCENT = 3;

const MINUTES_PER_TYPE_SECONDS = 5 * 60;
const REPLANT_EXTRA_SECONDS = 5 * 60;

function getCompostBagItem() {
  return ITEMS.find((i) => i.name === 'Compost Bag');
}

function getPatchRow(userId, patchType, patchIndex) {
  return db.prepare('SELECT * FROM farming_patches WHERE user_id = ? AND patch_type = ? AND patch_index = ?').get(userId, patchType, patchIndex);
}

const stmtUpsertPatch = db.prepare(`
  INSERT INTO farming_patches (user_id, patch_type, patch_index, seed_item_id, planted_at, ready_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, patch_type, patch_index) DO UPDATE SET
    seed_item_id = excluded.seed_item_id, planted_at = excluded.planted_at, ready_at = excluded.ready_at
`);
const stmtClearPatch = db.prepare('UPDATE farming_patches SET seed_item_id = NULL, planted_at = NULL, ready_at = NULL WHERE user_id = ? AND patch_type = ? AND patch_index = ?');

function getSeedForType(seedItemId) {
  const seed = getItem(seedItemId);
  if (!seed || seed.category !== 'seed') return null;
  return seed;
}

function getGrownItem(seed, patchType) {
  const baseName = seed.name.replace(' Seed', '');
  if (patchType === 'herb') return ITEMS.find((i) => i.category === 'herb' && i.name === baseName);
  if (patchType === 'fruit') return ITEMS.find((i) => i.category === 'fruit' && i.name === baseName);
  if (patchType === 'tree') return ITEMS.find((i) => i.category === 'log' && i.name === `${baseName} Logs`);
  return null;
}

function computeGrowthMs(seed, patchType, hasMasterCompost, constructionTripTimeReductionPercent) {
  const baseGrowthMs = patchType === 'tree' ? treeGrowthMs(seed.tier) : GROWTH_MS[patchType];
  const compostAdjusted = hasMasterCompost ? Math.round(baseGrowthMs * 0.75) : baseGrowthMs;
  return applyConstructionTripTimeReduction(compostAdjusted, constructionTripTimeReductionPercent);
}

function writeFarmingTrip(guildId, userId, endsAt, channelId, mode, tripData) {
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, farming_trip_json = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, `farming:${mode}`, JSON.stringify(tripData), guildId, userId);
}

export function describeFarmingActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('farming:')) return null;
  const mode = activeMobId.split(':')[1];
  const label = mode === 'plant' ? 'planting' : mode === 'replant' ? 'replanting' : 'harvesting';
  return `🌾 Out ${label} patches. Back ${timestamp}.`;
}

function guardCanStartTrip(guildId, userId, fallbackName) {
  if (isGladiatorAdventuring(guildId, userId)) {
    const profile = getGladiatorProfile(guildId, userId, fallbackName);
    throw new EconomyError(
      profile.activeBossId ? buildBossChallengeStatusLine(profile.name, profile.activeBossId) : 'Your Gladiator is already out on a trip.'
    );
  }
  if (hasUnclaimedAdventure(guildId, userId)) {
    throw new EconomyError("Your Gladiator's last trip hasn't finished resolving yet — try again in a moment.");
  }
}

function getReadyPatchIndexes(userId, maxPatches, patchType) {
  const ready = [];
  for (let i = 1; i <= maxPatches; i++) {
    const row = getPatchRow(userId, patchType, i);
    if (row?.seed_item_id && Date.now() >= row.ready_at) ready.push(i);
  }
  return ready;
}

function collectReadyTargets(guildId, userId, types) {
  const counts = getPatchCounts(getGladiatorQp(guildId, userId));
  const targets = {};
  for (const t of types) {
    const maxPatches = counts[t] ?? 0;
    if (!maxPatches) continue;
    const ready = getReadyPatchIndexes(userId, maxPatches, t);
    if (ready.length) targets[t] = ready;
  }
  return targets;
}

export async function startFarmingPlant(guildId, userId, channelId, fallbackName, seedsByType) {
  guildId = GLOBAL_ID;
  guardCanStartTrip(guildId, userId, fallbackName);

  const requestedTypes = PATCH_TYPES.filter((t) => seedsByType?.[t] != null);
  if (requestedTypes.length === 0) throw new EconomyError('Pick at least one seed to plant (herb, tree, and/or fruit).');

  const currentLevel = getSkillLevel(guildId, userId, 'farming');
  const counts = getPatchCounts(getGladiatorQp(guildId, userId));
  const compostBag = getCompostBagItem();

  const plan = {};
  for (const patchType of requestedTypes) {
    const seed = getSeedForType(seedsByType[patchType]);
    if (!seed) throw new EconomyError(`Invalid seed for your ${patchType} patch.`);
    const grown = getGrownItem(seed, patchType);
    if (!grown) throw new EconomyError(`That seed doesn't have a matching grown item registered for a ${patchType} patch.`);
    if (currentLevel < seed.tier) throw new EconomyError(`You need Farming level ${seed.tier} to plant ${seed.name} (you're ${currentLevel}).`);

    const maxPatches = counts[patchType] ?? 0;
    if (!maxPatches) throw new EconomyError(`You don't have any ${patchType} patches unlocked yet.`);

    const emptyIndexes = [];
    for (let i = 1; i <= maxPatches; i++) {
      const row = getPatchRow(userId, patchType, i);
      if (!row?.seed_item_id) emptyIndexes.push(i);
    }
    if (emptyIndexes.length === 0) {
      throw new EconomyError(`All your ${patchType} patches already have something growing — harvest them first.`);
    }

    const ownedSeeds = getOwnedQuantity(guildId, userId, seed.id);
    if (ownedSeeds < 1) throw new EconomyError(`You don't own a ${seed.name}.`);

    const bagsPerPatch = COMPOST_BAGS_PER_PLANT[patchType];
    const ownedBags = getOwnedQuantity(guildId, userId, compostBag.id);
    const maxByBags = Math.floor(ownedBags / bagsPerPatch);
    if (maxByBags < 1) {
      throw new EconomyError(`You need ${bagsPerPatch}x Compost Bag to plant a ${patchType} patch (100 coins each from the Arena Store) — you have ${ownedBags}.`);
    }

    const quantity = Math.min(emptyIndexes.length, ownedSeeds, maxByBags);
    const patchIndexes = emptyIndexes.slice(0, quantity);
    plan[patchType] = { seedItemId: seed.id, seedName: seed.name, patchIndexes, bagsUsed: bagsPerPatch * quantity };
  }

  for (const patchType of requestedTypes) {
    const { seedItemId, patchIndexes, bagsUsed } = plan[patchType];
    addItemToInventory(guildId, userId, seedItemId, -patchIndexes.length);
    addItemToInventory(guildId, userId, compostBag.id, -bagsUsed);
  }

  const tripSeconds = hasInstantTrips(guildId, userId) ? 5 : requestedTypes.length * MINUTES_PER_TYPE_SECONDS;
  const endsAt = Date.now() + tripSeconds * 1000;
  const tripPlan = {};
  for (const patchType of requestedTypes) {
    tripPlan[patchType] = { seedItemId: plan[patchType].seedItemId, patchIndexes: plan[patchType].patchIndexes };
  }
  writeFarmingTrip(guildId, userId, endsAt, channelId, 'plant', { plan: tripPlan });

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const summary = requestedTypes
    .map((t) => `${plan[t].patchIndexes.length}x **${plan[t].seedName}** in your ${t} patches (#${plan[t].patchIndexes.join(', ')})`)
    .join(', ');
  return {
    text: `**${displayName}** heads out to plant ${summary}. Back ${timestamp}.`,
    endsAt,
  };
}

export async function resolveDueFarmingPlant(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const channelId = row.adventure_channel_id;
  const displayName = formatGladiatorDisplayName(guildId, userId, row.name);
  const { plan } = JSON.parse(row.farming_trip_json);

  const hasMasterCompost = getOwnedQuantity(guildId, userId, MASTER_COMPOST_ID) > 0;
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'farming');
  const plantedAt = Date.now();
  const lines = [];

  for (const patchType of PATCH_TYPES) {
    const entry = plan[patchType];
    if (!entry) continue;
    const seed = getItem(entry.seedItemId);
    const growthMs = computeGrowthMs(seed, patchType, hasMasterCompost, constructionTripTimeReductionPercent);
    const readyAt = plantedAt + growthMs;
    for (const idx of entry.patchIndexes) {
      stmtUpsertPatch.run(userId, patchType, idx, seed.id, plantedAt, readyAt);
    }
    const readyTimestamp = `<t:${Math.floor(readyAt / 1000)}:R>`;
    const plural = entry.patchIndexes.length > 1 ? 'es' : '';
    lines.push(`**${entry.patchIndexes.length}x ${seed.name}** in ${patchType} patch${plural} #${entry.patchIndexes.join(', ')} — ready ${readyTimestamp}`);
  }

  endGladiatorAdventure(guildId, userId);

  const content = `<@${userId}> **${displayName}** finishes planting ${lines.join('; ')}.`;

  return { guildId, userId, channelId, content, components: [], files: [] };
}

export async function startFarmingHarvest(guildId, userId, channelId, fallbackName, targetType) {
  guildId = GLOBAL_ID;
  guardCanStartTrip(guildId, userId, fallbackName);

  const types = targetType === 'all' ? PATCH_TYPES : [targetType];
  const targets = collectReadyTargets(guildId, userId, types);
  const touchedTypes = Object.keys(targets);

  if (touchedTypes.length === 0) {
    throw new EconomyError(targetType === 'all' ? 'Nothing is ready to harvest right now.' : `Your ${targetType} patches aren't ready yet.`);
  }

  const tripSeconds = hasInstantTrips(guildId, userId) ? 5 : touchedTypes.length * MINUTES_PER_TYPE_SECONDS;
  const endsAt = Date.now() + tripSeconds * 1000;
  writeFarmingTrip(guildId, userId, endsAt, channelId, 'harvest', { targets });

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const totalPatches = Object.values(targets).reduce((sum, arr) => sum + arr.length, 0);
  const plural = totalPatches > 1 ? 'es' : '';
  return {
    text: `**${displayName}** heads out to harvest ${totalPatches} ready patch${plural} (${touchedTypes.join(', ')}). Back ${timestamp}.`,
    endsAt,
  };
}

function harvestOnePatch(guildId, userId, patchType, patchIndex, alreadyHasCompost) {
  const row = getPatchRow(userId, patchType, patchIndex);
  const seed = getItem(row.seed_item_id);
  const grown = getGrownItem(seed, patchType);
  stmtClearPatch.run(userId, patchType, patchIndex);

  const hasSecateurs = getOwnedQuantity(guildId, userId, SECATEURS_ID) > 0;
  const baseYieldAmount = patchType === 'herb' ? 3 + Math.round(seed.tier / 20) : patchType === 'fruit' ? 2 + Math.round(seed.tier / 25) : 1;
  let yieldAmount = patchType === 'herb' && hasSecateurs ? baseYieldAmount * 2 : baseYieldAmount;
  const constructionBoostPercent = getConstructionYieldBoostPercent(userId, 'farming');
  yieldAmount = applyConstructionYieldBoost(yieldAmount, constructionBoostPercent);
  addItemToInventory(guildId, userId, grown.id, yieldAmount, 'farming');
  recordCollectionLogObtain(userId, grown.id, yieldAmount);

  const farmingXpPerYield = 3 + Math.round(seed.tier / 8);
  const farmingXp = farmingXpPerYield * yieldAmount;

  let woodcuttingXp = 0;
  if (patchType === 'tree') {
    const woodcuttingXpPerLog = 2 + Math.round(seed.tier / 10);
    woodcuttingXp = woodcuttingXpPerLog * yieldAmount;
  }

  let foundMasterCompost = false;
  if (!alreadyHasCompost && Math.random() * 100 < MASTER_COMPOST_FIND_PERCENT) {
    addItemToInventory(guildId, userId, MASTER_COMPOST_ID, 1, 'farming');
    recordCollectionLogObtain(userId, MASTER_COMPOST_ID, 1);
    foundMasterCompost = true;
  }

  return {
    seed,
    grown,
    patchType,
    patchIndex,
    yieldAmount,
    doubledBySecateurs: patchType === 'herb' && hasSecateurs,
    farmingXp,
    woodcuttingXp,
    foundMasterCompost,
  };
}

function buildHarvestSummary(userId, displayName, results) {
  const resourceTally = new Map();
  let totalFarmingXp = 0;
  let totalWoodcuttingXp = 0;
  let foundMasterCompost = false;
  for (const r of results) {
    resourceTally.set(r.grown.name, (resourceTally.get(r.grown.name) ?? 0) + r.yieldAmount);
    totalFarmingXp += r.farmingXp;
    totalWoodcuttingXp += r.woodcuttingXp;
    if (r.foundMasterCompost) foundMasterCompost = true;
  }

  const usedSecateurs = results.some((r) => r.doubledBySecateurs);
  const lines = [...resourceTally.entries()].map(([name, qty]) => `${qty}x ${name}`);
  let content = `<@${userId}> **${displayName}** returns from harvesting — ${lines.join(', ')}${usedSecateurs ? ' (herb yield doubled by Secateurs)' : ''}.`;

  const farmingResult = totalFarmingXp > 0 ? addSkillXp(GLOBAL_ID, userId, 'farming', totalFarmingXp) : null;
  if (farmingResult) {
    content += `\n✨ **+${totalFarmingXp.toLocaleString('en-US')} Farming XP**`;
    if (farmingResult.leveledUp) content += ` — 🆙 **Level ${farmingResult.afterLevel}!**`;

    const farmingGladXp = awardGladiatorXpFromSkilling(GLOBAL_ID, userId, farmingResult.xpGained, displayName);
    content += formatGladiatorSkillingXpLine(farmingGladXp, displayName);
  }

  const wcResult = totalWoodcuttingXp > 0 ? addSkillXp(GLOBAL_ID, userId, 'woodcutting', totalWoodcuttingXp) : null;
  if (wcResult) {
    content += `\n✨ **+${totalWoodcuttingXp.toLocaleString('en-US')} Woodcutting XP**`;
    if (wcResult.leveledUp) content += ` — 🆙 **Woodcutting Level ${wcResult.afterLevel}!**`;

    const wcGladXp = awardGladiatorXpFromSkilling(GLOBAL_ID, userId, wcResult.xpGained, displayName);
    content += formatGladiatorSkillingXpLine(wcGladXp, displayName);
  }

  if (foundMasterCompost) content += `\n\n🌱 You found a **Master Compost**!`;

  return content;
}

export async function resolveDueFarmingHarvest(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const channelId = row.adventure_channel_id;
  const displayName = formatGladiatorDisplayName(guildId, userId, row.name);
  const { targets } = JSON.parse(row.farming_trip_json);

  let alreadyHasCompost = getOwnedQuantity(guildId, userId, MASTER_COMPOST_ID) > 0;
  const results = [];
  for (const patchType of PATCH_TYPES) {
    for (const patchIndex of targets[patchType] ?? []) {
      const result = harvestOnePatch(guildId, userId, patchType, patchIndex, alreadyHasCompost);
      if (result.foundMasterCompost) alreadyHasCompost = true;
      results.push(result);
    }
  }

  endGladiatorAdventure(guildId, userId);

  const content = buildHarvestSummary(userId, displayName, results);
  return { guildId, userId, channelId, content, components: [], files: [] };
}

export async function startFarmingReplant(guildId, userId, channelId, fallbackName) {
  guildId = GLOBAL_ID;
  guardCanStartTrip(guildId, userId, fallbackName);

  const targets = collectReadyTargets(guildId, userId, PATCH_TYPES);
  const touchedTypes = Object.keys(targets);
  if (touchedTypes.length === 0) {
    throw new EconomyError('Nothing is ready to replant right now.');
  }

  const compostBag = getCompostBagItem();
  const seedTally = new Map();
  let bagsRemaining = getOwnedQuantity(guildId, userId, compostBag.id);

  const replant = {};
  for (const patchType of PATCH_TYPES) {
    for (const patchIndex of targets[patchType] ?? []) {
      const row = getPatchRow(userId, patchType, patchIndex);
      const seed = getItem(row.seed_item_id);
      if (!seedTally.has(seed.id)) seedTally.set(seed.id, getOwnedQuantity(guildId, userId, seed.id));

      const bagsNeeded = COMPOST_BAGS_PER_PLANT[patchType];
      const seedsOwned = seedTally.get(seed.id);
      if (seedsOwned >= 1 && bagsRemaining >= bagsNeeded) {
        seedTally.set(seed.id, seedsOwned - 1);
        bagsRemaining -= bagsNeeded;
        (replant[patchType] ??= []).push({ index: patchIndex, seedItemId: seed.id });
      }
    }
  }

  for (const [seedId, remaining] of seedTally) {
    const seedItem = getItem(seedId);
    const startingOwned = getOwnedQuantity(guildId, userId, seedId);
    const used = startingOwned - remaining;
    if (used > 0) addItemToInventory(guildId, userId, seedItem.id, -used);
  }
  let totalBagsUsed = 0;
  for (const patchType of PATCH_TYPES) {
    totalBagsUsed += (replant[patchType]?.length ?? 0) * COMPOST_BAGS_PER_PLANT[patchType];
  }
  if (totalBagsUsed > 0) addItemToInventory(guildId, userId, compostBag.id, -totalBagsUsed);

  const tripSeconds = hasInstantTrips(guildId, userId) ? 5 : touchedTypes.length * MINUTES_PER_TYPE_SECONDS + REPLANT_EXTRA_SECONDS;
  const endsAt = Date.now() + tripSeconds * 1000;
  writeFarmingTrip(guildId, userId, endsAt, channelId, 'replant', { targets, replant });

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const totalPatches = Object.values(targets).reduce((sum, arr) => sum + arr.length, 0);
  const totalReplanting = Object.values(replant).reduce((sum, arr) => sum + arr.length, 0);
  const plural = totalPatches > 1 ? 'es' : '';
  return {
    text: `**${displayName}** heads out to replant — ${totalPatches} ready patch${plural} (${touchedTypes.join(', ')}), ${totalReplanting}x will be replanted. Back ${timestamp}.`,
    endsAt,
  };
}

export async function resolveDueFarmingReplant(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const channelId = row.adventure_channel_id;
  const displayName = formatGladiatorDisplayName(guildId, userId, row.name);
  const { targets, replant } = JSON.parse(row.farming_trip_json);

  const replantLookup = new Set();
  for (const patchType of PATCH_TYPES) {
    for (const entry of replant[patchType] ?? []) replantLookup.add(`${patchType}:${entry.index}`);
  }

  let alreadyHasCompost = getOwnedQuantity(guildId, userId, MASTER_COMPOST_ID) > 0;
  const constructionTripTimeReductionPercent = getConstructionTripTimeReductionPercent(userId, 'farming');
  const results = [];
  const replantedTally = new Map();
  let leftEmptyCount = 0;

  for (const patchType of PATCH_TYPES) {
    for (const patchIndex of targets[patchType] ?? []) {
      const result = harvestOnePatch(guildId, userId, patchType, patchIndex, alreadyHasCompost);
      if (result.foundMasterCompost) alreadyHasCompost = true;
      results.push(result);

      if (replantLookup.has(`${patchType}:${patchIndex}`)) {
        const seed = getItem(replant[patchType].find((e) => e.index === patchIndex).seedItemId);
        const growthMs = computeGrowthMs(seed, patchType, alreadyHasCompost, constructionTripTimeReductionPercent);
        const plantedAt = Date.now();
        const readyAt = plantedAt + growthMs;
        stmtUpsertPatch.run(userId, patchType, patchIndex, seed.id, plantedAt, readyAt);
        replantedTally.set(seed.name, (replantedTally.get(seed.name) ?? 0) + 1);
      } else {
        leftEmptyCount += 1;
      }
    }
  }

  endGladiatorAdventure(guildId, userId);

  let content = buildHarvestSummary(userId, displayName, results);
  if (replantedTally.size > 0) {
    const replantedLine = [...replantedTally.entries()].map(([name, qty]) => `${qty}x ${name}`).join(', ');
    content += `\n🌱 **Replanted:** ${replantedLine}`;
  }
  if (leftEmptyCount > 0) {
    content += `\n\n${leftEmptyCount} patch${leftEmptyCount > 1 ? 'es' : ''} left empty — not enough seeds/compost to replant.`;
  }

  return { guildId, userId, channelId, content, components: [], files: [] };
}

export function cancelFarmingTrip(guildId, userId, row) {
  const mode = row.active_mob_id.split(':')[1];
  const displayName = formatGladiatorDisplayName(guildId, userId, row.name);
  endGladiatorAdventure(guildId, userId);

  if (mode === 'plant') {
    return { text: `🏳️ **${displayName}**'s planting trip was called back early — the seeds and compost already spent are gone, and nothing got planted.` };
  }
  if (mode === 'harvest') {
    return { text: `🏳️ **${displayName}**'s harvesting trip was called back early — nothing was harvested, every patch is untouched.` };
  }
  if (mode === 'replant') {
    return {
      text: `🏳️ **${displayName}**'s replanting trip was called back early — the seeds and compost reserved for replanting are gone, but every patch is untouched.`,
    };
  }
  return { text: `🏳️ **${displayName}**'s farming trip was called back early.` };
}

export function getPatchStatus(guildId, userId) {
  guildId = GLOBAL_ID;
  const counts = getPatchCounts(getGladiatorQp(guildId, userId));
  const rows = db.prepare('SELECT * FROM farming_patches WHERE user_id = ?').all(userId);
  const byKey = Object.fromEntries(rows.map((r) => [`${r.patch_type}:${r.patch_index}`, r]));

  const result = { herb: [], tree: [], fruit: [] };
  for (const patchType of PATCH_TYPES) {
    for (let i = 1; i <= counts[patchType]; i++) {
      const row = byKey[`${patchType}:${i}`];
      if (!row || !row.seed_item_id) {
        result[patchType].push({ index: i, empty: true });
      } else {
        const seed = getItem(row.seed_item_id);
        const grown = seed ? getGrownItem(seed, patchType) : null;
        result[patchType].push({
          index: i,
          seedItemId: row.seed_item_id,
          grownName: grown?.name ?? seed?.name ?? 'Unknown',
          readyAt: row.ready_at,
          ready: Date.now() >= row.ready_at,
        });
      }
    }
  }
  return result;
}

const PATCH_TYPE_LABELS = { herb: 'Herb', tree: 'Tree', fruit: 'Fruit' };

export function formatPatchStatusLines(status) {
  const lines = [];
  for (const patchType of PATCH_TYPES) {
    const patches = status[patchType] ?? [];
    if (patches.length === 0) continue;
    const label = PATCH_TYPE_LABELS[patchType];

    const emptyCount = patches.filter((p) => p.empty).length;
    if (emptyCount > 0) {
      lines.push(`❌ **${label}**: ${emptyCount} patch${emptyCount > 1 ? 'es' : ''} empty.`);
    }

    const groups = new Map();
    for (const p of patches) {
      if (p.empty) continue;
      const key = `${p.grownName}:${p.ready}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { grownName: p.grownName, ready: p.ready, readyAt: p.readyAt, count: 1 });
      } else {
        existing.count += 1;
        if (p.readyAt < existing.readyAt) existing.readyAt = p.readyAt;
      }
    }

    for (const g of groups.values()) {
      if (g.ready) {
        lines.push(`✅ **${label}**: ${g.count} ${g.grownName} are ready to be harvested!`);
      } else {
        lines.push(`🌱 **${label}**: ${g.count} ${g.grownName} growing — ready <t:${Math.floor(g.readyAt / 1000)}:R>.`);
      }
    }
  }
  return lines.length ? lines : ['No patches unlocked yet.'];
}

export function seedChoicesForType(patchType) {
  const categoryByType = { herb: 'herb', tree: 'log', fruit: 'fruit' };
  return ITEMS.filter((i) => i.category === 'seed').filter((s) => {
    const baseName = s.name.replace(' Seed', '');
    const grownName = patchType === 'tree' ? `${baseName} Logs` : baseName;
    return ITEMS.some((g) => g.category === categoryByType[patchType] && g.name === grownName);
  });
}
