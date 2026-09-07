import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { ITEMS, getItem } from '../data/items.js';
import { getSkillLevel, addSkillXp } from './skills.js';
import { ensureGladiator, isGladiatorAdventuring, hasUnclaimedAdventure, endGladiatorAdventure, getGladiatorProfile, formatGladiatorDisplayName, hasInstantTrips, awardGladiatorXpFromSkilling, formatGladiatorSkillingXpLine } from './gladiator.js';
import { getConstructionYieldBoostPercent, applyConstructionYieldBoost } from './construction.js';
import { buildBossChallengeStatusLine } from './bossChallenges.js';
import { EconomyError } from './economy.js';
import { addItemToInventory, getAllEquipmentSets } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { recordLastTripSettings, skillRepeatTripRow } from './lastTripSettings.js';

export const GATHERING_TRIP_TYPES = { mining: 'mining', woodcutting: 'woodcutting', fishing: 'fishing' };

const MATCHED_YIELD_BY_TIER = { 1: 45, 5: 43, 10: 41, 20: 38, 35: 35, 45: 32, 55: 29, 65: 26, 75: 23, 85: 20, 92: 18 };

const XP_PER_UNIT_BY_TIER = { 1: 7, 5: 10, 10: 12, 20: 18, 35: 26, 45: 32, 55: 38, 65: 44, 75: 50, 85: 58, 92: 65 };
const FULL_TRIP_MINUTES = 30;
const MIN_TRIP_SECONDS = 30;

const TIER_BREAKPOINTS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
function tierStepIndex(tier) {
  const i = TIER_BREAKPOINTS.indexOf(tier);
  return i === -1 ? 0 : i;
}

function gatheringYieldMultiplier(toolTier, resourceTier) {
  if (!toolTier) return 1;
  const toolIdx = tierStepIndex(toolTier);
  const resourceIdx = tierStepIndex(resourceTier);
  if (toolIdx > resourceIdx) return 1.15;
  if (toolIdx < resourceIdx) return Math.max(0.5, 1 - (resourceIdx - toolIdx) * 0.05);
  return 1;
}

export function getMaxQuantityForGatheringTier(tier) {
  return MATCHED_YIELD_BY_TIER[tier] ?? 30;
}

export function computeGatheringTripSeconds(tier, quantity) {
  const maxQty = getMaxQuantityForGatheringTier(tier);
  const secondsPerUnit = (FULL_TRIP_MINUTES * 60) / maxQty;
  return Math.max(MIN_TRIP_SECONDS, Math.round(quantity * secondsPerUnit));
}

export const GATHERING_SKILLS = {
  mining: { skillId: 'mining', resourceCategory: 'ore', toolCategory: 'pickaxe', actionVerb: 'mine' },
  woodcutting: { skillId: 'woodcutting', resourceCategory: 'log', toolCategory: 'axe', actionVerb: 'chop' },
  fishing: { skillId: 'fishing', resourceCategory: 'raw_fish', toolCategory: 'rod', actionVerb: 'fish' },
};

const TOOL_LABEL = { pickaxe: 'Pickaxe', axe: 'Axe', rod: 'Rod' };
const SKILL_DISPLAY = {
  mining: { icon: '⛏️', name: 'Mining', verb: 'mining' },
  woodcutting: { icon: '🪓', name: 'Woodcutting', verb: 'chopping' },
  fishing: { icon: '🎣', name: 'Fishing', verb: 'fishing' },
};

export function describeGatheringActiveTrip(activeMobId, timestamp) {
  if (!activeMobId || !activeMobId.startsWith('gathering:')) return null;
  const [, skillKey, tierRaw] = activeMobId.split(':');
  const tier = Number(tierRaw);
  const config = GATHERING_SKILLS[skillKey];
  const display = SKILL_DISPLAY[skillKey];
  const resource = config ? getResourceForTier(config.resourceCategory, tier) : null;
  const resourceName = resource ? resource.name : 'resources';
  return `${display?.icon ?? '🪓'} Out ${display?.verb ?? 'gathering'} ${resourceName} (${display?.name ?? skillKey}). Back ${timestamp}.`;
}

function getResourceForTier(category, tier) {
  return ITEMS.find((i) => i.type === 'resource' && i.category === category && i.tier === tier) ?? null;
}

function getEquippedToolTier(guildId, userId, toolCategory) {
  if (!toolCategory) return null;
  const skillingSet = getAllEquipmentSets(guildId, userId).misc;
  const equipped = skillingSet?.main_hand;
  if (!equipped || equipped.skill !== toolCategoryToSkill(toolCategory)) return null;
  return equipped.tier ?? null;
}

function toolCategoryToSkill(toolCategory) {
  return { pickaxe: 'mining', axe: 'woodcutting', rod: 'fishing' }[toolCategory] ?? toolCategory;
}

export async function startGatheringTrip(guildId, userId, channelId, fallbackName, skillKey, resourceTier, quantity) {
  guildId = GLOBAL_ID;
  const config = GATHERING_SKILLS[skillKey];
  if (!config) throw new EconomyError('Unknown gathering skill.');

  if (isGladiatorAdventuring(guildId, userId)) {
    const profile = getGladiatorProfile(guildId, userId, fallbackName);
    throw new EconomyError(
      profile.activeBossId ? buildBossChallengeStatusLine(profile.name, profile.activeBossId) : 'Your Gladiator is already out on a trip.'
    );
  }
  if (hasUnclaimedAdventure(guildId, userId)) {
    throw new EconomyError("Your Gladiator's last trip hasn't finished resolving yet — try again in a moment.");
  }

  const resourceItem = getResourceForTier(config.resourceCategory, resourceTier);
  if (!resourceItem) throw new EconomyError('Invalid tier for this skill.');

  const currentLevel = getSkillLevel(guildId, userId, config.skillId);
  if (currentLevel < resourceTier) {
    throw new EconomyError(`You need ${config.skillId} level ${resourceTier} for this resource [You are Level ${currentLevel}].`);
  }

  const toolTier = getEquippedToolTier(guildId, userId, config.toolCategory);
  if (!toolTier) {
    throw new EconomyError(`You need a ${TOOL_LABEL[config.toolCategory]} equipped in your Skilling set to ${config.actionVerb} at all.`);
  }

  const maxQty = getMaxQuantityForGatheringTier(resourceTier);

  if (quantity == null) quantity = maxQty;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    throw new EconomyError(`Quantity must be between 1 and ${maxQty} for this tier.`);
  }

  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);

  const tripSeconds = hasInstantTrips(guildId, userId) ? 30 : computeGatheringTripSeconds(resourceTier, quantity);
  const endsAt = Date.now() + tripSeconds * 1000;

  const syntheticId = `gathering:${skillKey}:${resourceTier}`;
  db.prepare(
    'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
  ).run(Date.now(), endsAt, channelId, syntheticId, quantity, guildId, userId);
  recordLastTripSettings(userId, GATHERING_TRIP_TYPES[skillKey], { skillKey, tier: resourceTier, quantity });

  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorRow.name);
  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  return { text: `**${displayName}** heads out to ${config.actionVerb} ${quantity}x **${resourceItem.name}**. Back ${timestamp}.`, endsAt };
}

export async function resolveDueGathering(row) {
  const guildId = row.guild_id;
  const userId = row.user_id;
  const name = row.name;
  const channelId = row.adventure_channel_id;
  const [, skillKey, tierStr] = row.active_mob_id.split(':');
  const resourceTier = Number(tierStr);
  const quantity = row.slay_quantity;

  const config = GATHERING_SKILLS[skillKey];
  const resourceItem = getResourceForTier(config.resourceCategory, resourceTier);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  const toolTier = getEquippedToolTier(guildId, userId, config.toolCategory);
  const yieldMultiplier = gatheringYieldMultiplier(toolTier, resourceTier);
  let actualYield = Math.max(1, Math.round(quantity * yieldMultiplier));

  const constructionBoostPercent = getConstructionYieldBoostPercent(userId, config.skillId);
  actualYield = applyConstructionYieldBoost(actualYield, constructionBoostPercent);

  addItemToInventory(guildId, userId, resourceItem.id, actualYield, config.skillId);
  recordCollectionLogObtain(userId, resourceItem.id, actualYield);

  const xpPerUnit = XP_PER_UNIT_BY_TIER[resourceTier] ?? (2 + Math.round(resourceTier / 10));
  const totalXp = xpPerUnit * quantity;
  const xpResult = addSkillXp(guildId, userId, config.skillId, totalXp);

  let text = `<@${userId}> **${displayName}** returns with **${actualYield}x ${resourceItem.name}**.`;
  if (yieldMultiplier > 1) text += ` ⬆️ *(overtiered tool, +15% yield)*`;
  else if (yieldMultiplier < 1) text += ` ⬇️ *(tool below this tier, ${Math.round((1 - yieldMultiplier) * 100)}% less yield)*`;
  text += `\n✨ **+${totalXp.toLocaleString('en-US')} ${config.skillId} XP**`;
  if (xpResult.leveledUp) text += ` — 🆙 **Level ${xpResult.afterLevel}!**`;

  const gladXpResult = awardGladiatorXpFromSkilling(guildId, userId, xpResult.xpGained, name);
  text += formatGladiatorSkillingXpLine(gladXpResult, displayName);

  endGladiatorAdventure(guildId, userId);

  return { guildId, userId, channelId, content: text, components: [skillRepeatTripRow()], files: [] };
}
