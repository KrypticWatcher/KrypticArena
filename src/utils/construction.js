import { GLOBAL_ID } from './globalId.js';
import db from '../database.js';
import { ITEMS } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, formatGladiatorDisplayName } from './gladiator.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';

const TRIPS_PER_TIER = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 7 };
const XP_PER_TRIP_BY_TIER = { 1: 21724, 2: 32586, 3: 43448, 4: 63724, 5: 130344 };

const PROJECT_TIER_TO_RESOURCE_LEVEL = { 1: 1, 2: 1, 3: 20, 4: 45, 5: 65 };

export const PROJECTS = {
  quarry: { name: 'Reinforced Quarry', skillId: 'mining', resourceCategories: ['ore', 'log'] },
  forge: { name: 'Master Forge', skillId: 'smithing', resourceCategories: ['bar', 'ore', 'log'] },
  lumberyard: { name: 'Grand Lumberyard', skillId: 'woodcutting', resourceCategories: ['log'] },
  fletchers_bench: { name: "Fletcher's Workbench", skillId: 'fletching', resourceCategories: ['arrowhead', 'log', 'feather'] },
  dock: { name: 'Fishing Dock', skillId: 'fishing', resourceCategories: ['raw_fish', 'log'] },
  kitchen: { name: 'Grand Kitchen', skillId: 'cooking', resourceCategories: ['cooked_fish', 'log', 'herb'] },
  apothecary: { name: 'Apothecary', skillId: 'herbalism', resourceCategories: ['potion', 'herb', 'log'] },
  lodge: { name: "Hunter's Lodge", skillId: 'hunting', resourceCategories: ['hide', 'log'] },
  workshop: { name: "Crafter's Workshop", skillId: 'crafting', resourceCategories: ['crafting_input', 'tanned_hide', 'log'] },
  greenhouse: { name: 'Grand Greenhouse', skillId: 'farming', resourceCategories: ['herb', 'log'] },
};

const YIELD_BOOST_PERCENT_PER_TIER = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 };

export function getConstructionYieldBoostPercent(userId, skillId) {
  const projectId = Object.keys(PROJECTS).find((id) => PROJECTS[id].skillId === skillId);
  if (!projectId) return 0;
  const row = getProjectRow(userId, projectId);
  return YIELD_BOOST_PERCENT_PER_TIER[row.current_tier] ?? 0;
}

export function applyConstructionYieldBoost(amount, boostPercent) {
  if (!boostPercent || amount <= 0) return amount;
  return Math.max(amount, Math.round(amount * (1 + boostPercent / 100)));
}

const COST_REDUCTION_PERCENT_PER_TIER = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };

export function getConstructionCostReductionPercent(userId, skillId) {
  const projectId = Object.keys(PROJECTS).find((id) => PROJECTS[id].skillId === skillId);
  if (!projectId) return 0;
  const row = getProjectRow(userId, projectId);
  return COST_REDUCTION_PERCENT_PER_TIER[row.current_tier] ?? 0;
}

export function applyConstructionCostReduction(amount, reductionPercent) {
  if (!reductionPercent || amount <= 0) return amount;
  return Math.min(amount, Math.max(1, Math.round(amount * (1 - reductionPercent / 100))));
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

function getProjectRow(userId, projectId) {
  return db.prepare('SELECT * FROM construction_projects WHERE user_id = ? AND project_id = ?').get(userId, projectId) ?? { current_tier: 0, trips_done_this_tier: 0 };
}
const stmtUpsertProject = db.prepare(`
  INSERT INTO construction_projects (user_id, project_id, current_tier, trips_done_this_tier) VALUES (?, ?, ?, ?)
  ON CONFLICT (user_id, project_id) DO UPDATE SET current_tier = excluded.current_tier, trips_done_this_tier = excluded.trips_done_this_tier
`);

function getProjectResourcesForTier(project, buildTier) {
  const level = PROJECT_TIER_TO_RESOURCE_LEVEL[buildTier];
  return project.resourceCategories.map((category) => {
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
  });
}

const RESOURCE_AMOUNT_PER_TRIP = 30;

export async function applyConstructionResources(guildId, userId, fallbackName, projectId) {
  guildId = GLOBAL_ID;
  const project = PROJECTS[projectId];
  if (!project) throw new EconomyError('Invalid project.');

  const row = getProjectRow(userId, projectId);
  if (row.current_tier >= 5) throw new EconomyError(`${project.name} is already fully built.`);

  const buildTier = row.current_tier + 1;
  const currentLevel = getSkillLevel(guildId, userId, 'construction');
  const requiredLevel = PROJECT_TIER_TO_RESOURCE_LEVEL[buildTier];
  if (currentLevel < requiredLevel) {
    throw new EconomyError(`You need Construction level ${requiredLevel} for this tier (you're ${currentLevel}).`);
  }

  const SAW_ID = 42004;
  if (getOwnedQuantity(guildId, userId, SAW_ID) < 1) {
    throw new EconomyError('You need a Saw for Construction at all — buy one from the Arena Store.');
  }

  const resources = getProjectResourcesForTier(project, buildTier);
  if (resources.some((r) => !r)) throw new EconomyError('No matching resource found for this project/tier.');

  
  
  
  const BUILDERS_SAW_ID = 41005;
  const hasSaw = getOwnedQuantity(guildId, userId, BUILDERS_SAW_ID) > 0;
  const actualResourceCost = hasSaw ? Math.max(1, Math.round(RESOURCE_AMOUNT_PER_TRIP * 0.85)) : RESOURCE_AMOUNT_PER_TRIP;

  const missing = [];
  for (const resource of resources) {
    const owned = getOwnedQuantity(guildId, userId, resource.id);
    if (owned < actualResourceCost) missing.push(`${actualResourceCost}x ${resource.name} (have ${owned})`);
  }
  if (missing.length > 0) throw new EconomyError(`You're missing: ${missing.join(', ')}.`);

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);

  for (const resource of resources) {
    addItemToInventory(guildId, userId, resource.id, -actualResourceCost);
  }

  let xpGained = XP_PER_TRIP_BY_TIER[buildTier];
  let sawXpBonusTriggered = false;
  if (hasSaw && Math.random() * 100 < 10) {
    xpGained = Math.round(xpGained * 1.1);
    sawXpBonusTriggered = true;
  }
  const xpResult = addSkillXp(guildId, userId, 'construction', xpGained);

  const resourceSummary = resources.map((r) => `${actualResourceCost}x ${r.name}`).join(', ');
  const newTripsDone = row.trips_done_this_tier + 1;
  const tripsNeeded = TRIPS_PER_TIER[buildTier];
  let text;
  if (newTripsDone >= tripsNeeded) {
    stmtUpsertProject.run(userId, projectId, buildTier, 0);
    text = `**${project.name}** reaches Tier ${buildTier}! (${resourceSummary} applied)`;
  } else {
    stmtUpsertProject.run(userId, projectId, row.current_tier, newTripsDone);
    text = `Applied ${resourceSummary} to **${project.name}** — ${newTripsDone}/${tripsNeeded} trips toward Tier ${buildTier}.`;
  }
  if (hasSaw && actualResourceCost < RESOURCE_AMOUNT_PER_TRIP) text += ` (Builder's Saw reduced the cost)`;
  text += `\n✨ **+${xpGained.toLocaleString('en-US')} Construction XP**${sawXpBonusTriggered ? " (Builder's Saw bonus!)" : ''}`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  
  
  
  
  
  
  

  return { text };
}

export function getConstructionStatus(userId) {
  const result = {};
  for (const [projectId, project] of Object.entries(PROJECTS)) {
    const row = getProjectRow(userId, projectId);
    result[projectId] = { name: project.name, tier: row.current_tier, tripsThisTier: row.trips_done_this_tier };
  }
  return result;
}
