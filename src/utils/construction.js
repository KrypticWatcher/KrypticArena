import { GLOBAL_ID } from './globalId.js';
import db from '../database.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator } from './gladiator.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import { getNewlyUnlockedItemIds, recordCollectionLogObtainMany } from './collectionLog.js';
import { AttachmentBuilder } from 'discord.js';
import { renderLootPreviewImage } from './inventoryImage.js';
import {
  PROJECTS,
  RESOURCE_LEVEL_BY_BUILD_TIER,
  BUILD_MINUTES_BY_TIER,
  CONSTRUCTION_XP_BY_TIER,
  PASSIVE_RATE_PER_HOUR_BY_TIER,
  PASSIVE_ACCRUAL_CAP_HOURS,
  MATERIAL_AMOUNT_BY_TIER,
  TIERED_TOOL_QTY,
  FLAVOR_TOOL_QTY_BY_TIER,
  LODGE_BOW_REQUIREMENTS_BY_TIER,
  BUILD_TIER_COUNT,
  MAX_CONCURRENT_BUILDS,
} from '../data/constructionProjects.js';

export { PROJECTS };

const SAW_ID = 42004;
const BUILDERS_SAW_ID = 41005;

const PASSIVE_UNLOCK_TIER = Object.keys(PASSIVE_RATE_PER_HOUR_BY_TIER)
  .map(Number)
  .sort((a, b) => a - b)
  .find((t) => PASSIVE_RATE_PER_HOUR_BY_TIER[t] > 0);

function getProjectRow(userId, projectId) {
  return (
    db.prepare('SELECT * FROM construction_projects WHERE user_id = ? AND project_id = ?').get(userId, projectId) ?? {
      current_tier: 0,
      building_tier: null,
      build_ready_at: null,
      last_collected_at: null,
    }
  );
}

const stmtUpsertProject = db.prepare(`
  INSERT INTO construction_projects (user_id, project_id, current_tier, building_tier, build_ready_at, last_collected_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, project_id) DO UPDATE SET
    current_tier = excluded.current_tier,
    building_tier = excluded.building_tier,
    build_ready_at = excluded.build_ready_at,
    last_collected_at = excluded.last_collected_at
`);

function saveProjectRow(userId, projectId, row) {
  stmtUpsertProject.run(userId, projectId, row.current_tier, row.building_tier, row.build_ready_at, row.last_collected_at);
}

const stmtActiveBuildCount = db.prepare(
  'SELECT COUNT(*) AS c FROM construction_projects WHERE user_id = ? AND building_tier IS NOT NULL'
);
function getActiveBuildCount(userId) {
  return stmtActiveBuildCount.get(userId).c;
}

function resolveCategoryItem(category, level) {
  if (category === 'crafting_input') {
    return ITEMS.find((i) => i.category === 'crafting_input' && i.name === 'Thread');
  }
  if (category === 'feather') {
    return ITEMS.find((i) => i.type === 'resource' && i.category === 'feather');
  }
  if (category === 'hide') {
    return ITEMS.find((i) => i.type === 'resource' && i.category === 'hide' && i.tier === level && i.hideQuality === 'fine');
  }
  return ITEMS.find((i) => i.type === 'resource' && i.category === category && i.tier === level);
}

const MATERIAL_ROLES = ['primary', 'secondary', 'tertiary'];

function getBuildRequirements(project, buildTier) {
  const level = RESOURCE_LEVEL_BY_BUILD_TIER[buildTier];
  const requirements = [];

  project.resourceCategories.forEach((category, index) => {
    const role = MATERIAL_ROLES[index];
    const item = resolveCategoryItem(category, level);
    if (!item) throw new EconomyError(`No matching ${category} resource found for this tier.`);
    requirements.push({ id: item.id, name: item.name, qty: MATERIAL_AMOUNT_BY_TIER[role][buildTier] });
  });

  if (project.tieredTool) {
    const tool = ITEMS.find(
      (i) => i.type === 'tool' && i.skill === project.tieredTool.skill && i.tier === level && i.category !== 'starter_tool'
    );
    if (!tool) throw new EconomyError('No matching tool found for this tier.');
    requirements.push({ id: tool.id, name: tool.name, qty: TIERED_TOOL_QTY });
  }

  if (project.flavorTool) {
    const tool = ITEMS.find((i) => i.name === project.flavorTool.name);
    if (!tool) throw new EconomyError(`Missing catalog item: ${project.flavorTool.name}`);
    requirements.push({ id: tool.id, name: tool.name, qty: FLAVOR_TOOL_QTY_BY_TIER[buildTier] });
  }

  if (project.bowTribute) {
    const bows = LODGE_BOW_REQUIREMENTS_BY_TIER[buildTier] ?? [];
    for (const { name, qty } of bows) {
      const bow = ITEMS.find((i) => i.name === name);
      if (!bow) throw new EconomyError(`Missing catalog item: ${name}`);
      requirements.push({ id: bow.id, name: bow.name, qty });
    }
  }

  return requirements;
}

export function discordRelativeTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function describeBonus(bonus) {
  if (!bonus) return '';
  const parts = [];
  if (bonus.yieldPercent) parts.push(`+${bonus.yieldPercent}% Yield`);
  if (bonus.costReductionPercent) parts.push(`-${bonus.costReductionPercent}% Material Cost`);
  if (bonus.tripTimePercent) parts.push(`-${bonus.tripTimePercent}% Trip Time`);
  return parts.length ? `(${parts.join(', ')})` : '';
}

export async function startBuild(guildId, userId, fallbackName, projectId) {
  guildId = GLOBAL_ID;
  const project = PROJECTS[projectId];
  if (!project) throw new EconomyError('Invalid project.');

  const row = getProjectRow(userId, projectId);
  if (row.current_tier >= BUILD_TIER_COUNT) throw new EconomyError(`${project.name} is already fully built.`);
  if (row.building_tier) {
    throw new EconomyError(`${project.name} already has a Tier ${row.building_tier} build in progress.`);
  }

  const buildTier = row.current_tier + 1;
  const currentLevel = getSkillLevel(guildId, userId, 'construction');
  const requiredLevel = RESOURCE_LEVEL_BY_BUILD_TIER[buildTier];
  if (currentLevel < requiredLevel) {
    throw new EconomyError(`You need Construction level ${requiredLevel} for this tier (you're ${currentLevel}).`);
  }

  if (getOwnedQuantity(guildId, userId, SAW_ID) < 1) {
    throw new EconomyError('You need a Saw for Construction at all — buy one from the Arena Store.');
  }

  if (getActiveBuildCount(userId) >= MAX_CONCURRENT_BUILDS) {
    throw new EconomyError(`You already have ${MAX_CONCURRENT_BUILDS} builds in progress — complete one before starting another.`);
  }

  const requirements = getBuildRequirements(project, buildTier);

  const hasSaw = getOwnedQuantity(guildId, userId, BUILDERS_SAW_ID) > 0;
  const actualQty = (qty) => (hasSaw ? Math.max(1, Math.round(qty * 0.85)) : qty);

  const missing = [];
  for (const req of requirements) {
    const need = actualQty(req.qty);
    const owned = getOwnedQuantity(guildId, userId, req.id);
    if (owned < need) missing.push(`${need}x ${req.name} (have ${owned})`);
  }
  if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

  ensureGladiator(guildId, userId, fallbackName);

  for (const req of requirements) {
    addItemToInventory(guildId, userId, req.id, -actualQty(req.qty));
  }

  const minutes = BUILD_MINUTES_BY_TIER[buildTier];
  const now = Date.now();
  row.building_tier = buildTier;
  row.build_ready_at = now + minutes * 60_000;
  saveProjectRow(userId, projectId, row);

  const summary = requirements.map((r) => `${actualQty(r.qty)}x ${r.name}`).join(', ');
  let text = `🏗️ Materials submitted for **${project.name}** Tier ${buildTier}: ${summary}.`;
  if (hasSaw) text += ` (Builder's Saw reduced costs.)`;
  text += `\n⏳ Ready ${discordRelativeTimestamp(row.build_ready_at)} — use the complete command once it's done.`;
  return { text };
}

export async function completeBuild(guildId, userId, fallbackName, projectId) {
  guildId = GLOBAL_ID;
  const project = PROJECTS[projectId];
  if (!project) throw new EconomyError('Invalid project.');

  const row = getProjectRow(userId, projectId);
  if (!row.building_tier) throw new EconomyError(`${project.name} doesn't have a build in progress.`);

  const now = Date.now();
  if (now < row.build_ready_at) {
    throw new EconomyError(
      `${project.name}'s Tier ${row.building_tier} build isn't ready yet — ready ${discordRelativeTimestamp(row.build_ready_at)}.`
    );
  }

  const completedTier = row.building_tier;
  row.current_tier = completedTier;
  row.building_tier = null;
  row.build_ready_at = null;
  if (completedTier === PASSIVE_UNLOCK_TIER && !row.last_collected_at) {
    row.last_collected_at = now;
  }
  saveProjectRow(userId, projectId, row);

  ensureGladiator(guildId, userId, fallbackName);
  const xpGained = CONSTRUCTION_XP_BY_TIER[completedTier];
  const xpResult = addSkillXp(guildId, userId, 'construction', xpGained);

  const bonusText = describeBonus(project.bonusTable[completedTier]);
  let text = `✅ **${project.name}** reaches Tier ${completedTier}!`;
  if (bonusText) text += ` ${bonusText}`;
  if (completedTier === PASSIVE_UNLOCK_TIER) text += `\n🔋 Passive generation unlocked!`;
  text += `\n✨ **+${xpGained.toLocaleString('en-US')} Construction XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  return { text };
}

function collectOneProject(userId, projectId, project) {
  const row = getProjectRow(userId, projectId);
  const rate = PASSIVE_RATE_PER_HOUR_BY_TIER[row.current_tier] ?? 0;
  if (rate <= 0 || !row.last_collected_at) return null;

  const now = Date.now();
  const elapsedHours = Math.min(PASSIVE_ACCRUAL_CAP_HOURS, (now - row.last_collected_at) / 3_600_000);
  const accrued = Math.floor(elapsedHours * rate);
  if (accrued <= 0) return null;

  const level = RESOURCE_LEVEL_BY_BUILD_TIER[row.current_tier];
  const item = resolveCategoryItem(project.resourceCategories[0], level);
  if (!item) return null;

  row.last_collected_at = now;
  saveProjectRow(userId, projectId, row);

  return { item, accrued };
}

async function grantCollectedResources(guildId, userId, fallbackName, collected) {
  ensureGladiator(guildId, userId, fallbackName);

  const droppedIds = collected.flatMap(({ item, accrued }) => Array(accrued).fill(item.id));
  for (const { item, accrued } of collected) {
    addItemToInventory(guildId, userId, item.id, accrued, 'construction_passive');
  }

  const newUnlockIds = getNewlyUnlockedItemIds(userId, droppedIds);
  recordCollectionLogObtainMany(userId, droppedIds);
  const grantedItems = droppedIds.map((id) => getItem(id)).filter(Boolean);
  const lootPreviewBuf = await renderLootPreviewImage(guildId, userId, fallbackName, grantedItems, newUnlockIds);
  const files = lootPreviewBuf ? [new AttachmentBuilder(lootPreviewBuf, { name: 'loot.png' })] : [];

  const summary = collected.map(({ item, accrued }) => `${accrued}x ${item.name}`).join(', ');
  const text = `🔋 You collected from your buildings: ${summary}.`;
  return { text, files };
}

export async function collectPassive(guildId, userId, fallbackName, projectId) {
  guildId = GLOBAL_ID;
  const project = PROJECTS[projectId];
  if (!project) throw new EconomyError('Invalid project.');

  const row = getProjectRow(userId, projectId);
  const rate = PASSIVE_RATE_PER_HOUR_BY_TIER[row.current_tier] ?? 0;
  if (rate <= 0) {
    throw new EconomyError(`${project.name} hasn't unlocked passive generation yet (Tier ${PASSIVE_UNLOCK_TIER}+ required).`);
  }
  if (!row.last_collected_at) {
    throw new EconomyError(`${project.name} hasn't started generating yet.`);
  }

  const result = collectOneProject(userId, projectId, project);
  if (!result) throw new EconomyError(`${project.name} hasn't generated anything to collect yet.`);

  return grantCollectedResources(guildId, userId, fallbackName, [result]);
}

export async function collectPassiveAll(guildId, userId, fallbackName) {
  guildId = GLOBAL_ID;
  const collected = [];
  for (const [projectId, project] of Object.entries(PROJECTS)) {
    const result = collectOneProject(userId, projectId, project);
    if (result) collected.push(result);
  }
  if (collected.length === 0) {
    throw new EconomyError(`Nothing to collect right now — no project has resources banked.`);
  }
  return grantCollectedResources(guildId, userId, fallbackName, collected);
}

export function getActiveBuilds(userId) {
  const now = Date.now();
  const builds = [];
  for (const [projectId, project] of Object.entries(PROJECTS)) {
    const row = getProjectRow(userId, projectId);
    if (!row.building_tier) continue;
    builds.push({
      projectId,
      name: project.name,
      tier: row.building_tier,
      ready: now >= row.build_ready_at,
      remainingMs: Math.max(0, row.build_ready_at - now),
      readyAt: row.build_ready_at,
    });
  }
  return builds;
}

export function getProjectSummary(userId) {
  const now = Date.now();
  const result = {};
  for (const [projectId, project] of Object.entries(PROJECTS)) {
    const row = getProjectRow(userId, projectId);
    const rate = PASSIVE_RATE_PER_HOUR_BY_TIER[row.current_tier] ?? 0;
    let atCollectionCap = false;
    if (rate > 0 && row.last_collected_at) {
      const elapsedHours = (now - row.last_collected_at) / 3_600_000;
      atCollectionCap = elapsedHours >= PASSIVE_ACCRUAL_CAP_HOURS;
    }
    result[projectId] = {
      name: project.name,
      currentTier: row.current_tier,
      maxTier: BUILD_TIER_COUNT,
      passiveUnlocked: rate > 0,
      atCollectionCap,
    };
  }
  return result;
}

export function getProjectCurrentTier(userId, projectId) {
  return getProjectRow(userId, projectId).current_tier;
}

function sumBonusField(userId, skillId, field) {
  const projectId = Object.keys(PROJECTS).find((id) => PROJECTS[id].skillId === skillId);
  if (!projectId) return 0;
  const project = PROJECTS[projectId];
  const row = getProjectRow(userId, projectId);
  let total = 0;
  for (let t = 1; t <= row.current_tier; t++) {
    total += project.bonusTable[t]?.[field] ?? 0;
  }
  return total;
}

export function getConstructionYieldBoostPercent(userId, skillId) {
  return sumBonusField(userId, skillId, 'yieldPercent');
}

export function applyConstructionYieldBoost(amount, boostPercent) {
  if (!boostPercent || amount <= 0) return amount;
  return Math.max(amount, Math.round(amount * (1 + boostPercent / 100)));
}

export function getConstructionCostReductionPercent(userId, skillId) {
  return sumBonusField(userId, skillId, 'costReductionPercent');
}

export function applyConstructionCostReduction(amount, reductionPercent) {
  if (!reductionPercent || amount <= 0) return amount;
  return Math.min(amount, Math.max(1, Math.round(amount * (1 - reductionPercent / 100))));
}

export function getConstructionTripTimeReductionPercent(userId, skillId) {
  return sumBonusField(userId, skillId, 'tripTimePercent');
}

export function applyConstructionTripTimeReduction(seconds, reductionPercent) {
  if (!reductionPercent || seconds <= 0) return seconds;
  return Math.min(seconds, Math.max(1, Math.round(seconds * (1 - reductionPercent / 100))));
}

export function computeAffordableQuantity(maxQty, costsForQuantity) {
  if (maxQty < 1) return 0;
  let lo = 0;
  let hi = maxQty;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    const affordable = costsForQuantity(mid).every(({ owned, needed }) => owned >= needed);
    if (affordable) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
