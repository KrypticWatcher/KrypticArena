import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { EconomyError } from './economy.js';
import { findBannedWord } from './nameFilter.js';
import { getLevelProgress, adventureXpForLevel, adventureFailChance, MAX_GLADIATOR_LEVEL, MAX_GLADIATOR_XP } from './xp.js';
import { LOCATION_TIER } from './adventureFlavor.js';
import { getArenaRankInfo } from './ranks.js';
import { getTierBadge } from './permissions.js';
import { ITEMS } from '../data/items.js';
import { getOwnedQuantity } from './inventory.js';

const BADGE_GRANTING_ITEMS = ITEMS.filter((item) => item.grantsBadge);

const MYTHICAL_ADVENTURE_MIN_FAIL_CHANCE = 0.35;
import { addItemToInventory, getAllEquipmentSets } from './inventory.js';
import { computeChampionGladiatorXpBonus, computeAdventureCrossSetEffects } from './effects.js';
import { syncOwnerProgressiveGear } from './ownerProgressiveGear.js';
import { getTierGladiatorXpBonusPercent } from './permissions.js';
import { getBadgeTag } from './tierBadgeAssets.js';

export const MAXED_OUT_BADGE = getBadgeTag('MAXED_OUT') ?? '👑';
const MAXED_OUT_TROPHY_ITEM_ID = 'laurel_of_the_undying';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 32;

const NAME_PATTERN = /^[\p{L}\p{N} '\-.]+$/u;

const stmtGet = db.prepare('SELECT * FROM gladiators WHERE guild_id = ? AND user_id = ?');
const stmtInsert = db.prepare('INSERT INTO gladiators (guild_id, user_id, name) VALUES (?, ?, ?)');
const stmtSetName = db.prepare('UPDATE gladiators SET name = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetNameLocked = db.prepare('UPDATE gladiators SET name_locked = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetXp = db.prepare('UPDATE gladiators SET xp = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetQp = db.prepare('UPDATE gladiators SET qp = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetAdventure = db.prepare(
  'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, adventure_location = ?, adventure_duration_minutes = ?, adventure_dart_used = ?, active_boss_id = ?, adventure_elixir_cost = ? WHERE guild_id = ? AND user_id = ?'
);
const stmtSetSlay = db.prepare(
  'UPDATE gladiators SET adventure_started_at = ?, adventure_ends_at = ?, adventure_channel_id = ?, active_mob_id = ?, slay_quantity = ? WHERE guild_id = ? AND user_id = ?'
);
const stmtEndAdventure = db.prepare(
  'UPDATE gladiators SET adventure_started_at = 0, adventure_ends_at = 0, adventure_channel_id = NULL, adventure_location = NULL, adventure_dart_used = 0, active_boss_id = NULL, adventure_elixir_cost = 0, active_mob_id = NULL, slay_quantity = 0, farming_trip_json = NULL, slay_outcome_json = NULL, tanning_outcome_json = NULL WHERE guild_id = ? AND user_id = ?'
);
const stmtAllDue = db.prepare('SELECT * FROM gladiators WHERE adventure_ends_at > 0 AND adventure_ends_at <= ?');
const stmtSetMaxedGranted = db.prepare('UPDATE gladiators SET maxed_reward_granted = 1 WHERE guild_id = ? AND user_id = ?');

function validateName(guildId, name) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
    throw new EconomyError(`Gladiator names must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters.`);
  }
  if (!NAME_PATTERN.test(trimmed)) {
    throw new EconomyError('Gladiator names can only use letters, numbers, spaces, apostrophes, hyphens, and periods.');
  }
  if (findBannedWord(guildId, trimmed)) {
    throw new EconomyError("That name isn't allowed here — pick something else.");
  }
  return trimmed;
}

export const ensureGladiator = db.transaction((guildId, userId, fallbackName) => {
  guildId = GLOBAL_ID;
  let row = stmtGet.get(guildId, userId);
  if (!row) {

    let name;
    try {
      name = validateName(guildId, fallbackName ?? 'Gladiator');
    } catch {
      name = 'Gladiator';
    }
    stmtInsert.run(guildId, userId, name);
    row = stmtGet.get(guildId, userId);
  }
  return row;
});

const LOCKED_NAME = "Zoot's plaything";

export const setGladiatorName = db.transaction((guildId, userId, name) => {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId);
  if (row.name_locked) {
    throw new EconomyError('An admin has locked your Gladiator name — you can\'t change it right now.');
  }
  const clean = validateName(guildId, name);
  stmtSetName.run(clean, guildId, userId);
  return stmtGet.get(guildId, userId);
});

export const adminLockGladiatorName = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetName.run(LOCKED_NAME, guildId, userId);
  stmtSetNameLocked.run(1, guildId, userId);
  return stmtGet.get(guildId, userId);
});

export const adminUnlockGladiatorName = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetNameLocked.run(0, guildId, userId);
  return stmtGet.get(guildId, userId);
});

const stmtSetInstantTrips = db.prepare('UPDATE gladiators SET instant_trips = ? WHERE guild_id = ? AND user_id = ?');

export const adminGrantInstantTrips = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetInstantTrips.run(1, guildId, userId);
  return stmtGet.get(guildId, userId);
});

export const adminRevokeInstantTrips = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetInstantTrips.run(0, guildId, userId);
  return stmtGet.get(guildId, userId);
});

export function hasInstantTrips(guildId, userId) {
  guildId = GLOBAL_ID;
  return Boolean(getGladiatorRow(guildId, userId)?.instant_trips);
}

// Flat trip length granted by the Instant Trips perk. Kept here as the single
// source of truth so every skill file stays in sync if this ever changes.
export const INSTANT_TRIP_SECONDS = 10;

export const TRADE_LEVEL_REQUIREMENT = 5;

export function meetsTradeLevelRequirement(guildId, userId, fallbackName) {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  return getLevelProgress(row.xp).level >= TRADE_LEVEL_REQUIREMENT;
}

export function getGladiatorProfile(guildId, userId, fallbackName) {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  const progress = getLevelProgress(row.xp);
  const onAdventure = row.adventure_ends_at > Date.now();
  return {
    name: row.name,
    ...progress,
    maxLevel: MAX_GLADIATOR_LEVEL,
    adventureEndsAt: onAdventure ? row.adventure_ends_at : null,
    adventureLocation: onAdventure ? row.adventure_location : null,
    activeBossId: onAdventure ? row.active_boss_id : null,
    
    
    
    
    
    
    activeMobId: onAdventure ? row.active_mob_id : null,
    onAdventure,
    isMaxed: row.xp >= MAX_GLADIATOR_XP,
  };
}

export function formatGladiatorDisplayName(guildId, userId, name) {
  guildId = GLOBAL_ID;
  return isGladiatorMaxed(guildId, userId) ? `${MAXED_OUT_BADGE} ${name}` : name;
}

export function getAllBadges(guildId, userId) {
  guildId = GLOBAL_ID;
  const badges = [];
  if (isGladiatorMaxed(guildId, userId)) badges.push({ emoji: MAXED_OUT_BADGE, label: 'Maxed Out' });
  for (const item of BADGE_GRANTING_ITEMS) {
    if (getOwnedQuantity(guildId, userId, item.id) > 0) badges.push(item.grantsBadge);
  }
  const tierBadge = getTierBadge(userId);
  if (tierBadge) badges.push({ emoji: tierBadge.emoji, label: `Tier ${tierBadge.tier}` });
  return badges;
}

const FOUNDERS_BADGE_ITEM_ID = 'founders_badge';

export function hasFounderTitleActive(guildId, userId) {
  guildId = GLOBAL_ID;
  if (getOwnedQuantity(guildId, userId, FOUNDERS_BADGE_ITEM_ID) < 1) return false;
  const row = stmtGet.get(guildId, userId);
  return Boolean(row?.founder_title_enabled ?? 1);
}

const stmtSetFounderTitleEnabled = db.prepare('UPDATE gladiators SET founder_title_enabled = ? WHERE guild_id = ? AND user_id = ?');

export const setFounderTitleEnabled = db.transaction((guildId, userId, enabled) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  if (getOwnedQuantity(guildId, userId, FOUNDERS_BADGE_ITEM_ID) < 1) {
    throw new EconomyError("You don't own a Founder's Badge, so there's no Founder title to toggle.");
  }
  stmtSetFounderTitleEnabled.run(enabled ? 1 : 0, guildId, userId);
});

const stmtSetInventoryBackground = db.prepare('UPDATE gladiators SET inventory_bg_id = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetGearBackground = db.prepare('UPDATE gladiators SET gear_bg_id = ? WHERE guild_id = ? AND user_id = ?');
const stmtSetBeastpetsBackground = db.prepare('UPDATE gladiators SET beastpets_bg_id = ? WHERE guild_id = ? AND user_id = ?');

export const setInventoryBackground = db.transaction((guildId, userId, backgroundId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetInventoryBackground.run(backgroundId, guildId, userId);
});

export const setGearBackground = db.transaction((guildId, userId, backgroundId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetGearBackground.run(backgroundId, guildId, userId);
});

export const setBeastpetsBackground = db.transaction((guildId, userId, backgroundId) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId);
  stmtSetBeastpetsBackground.run(backgroundId, guildId, userId);
});

export function formatGladiatorTitledName(guildId, userId, name) {
  guildId = GLOBAL_ID;
  const badge = isGladiatorMaxed(guildId, userId) ? `${MAXED_OUT_BADGE} ` : '';
  const rankInfo = getArenaRankInfo(guildId, userId);
  const rankPrefix = hasFounderTitleActive(guildId, userId)
    ? 'Founder '
    : rankInfo.rank !== 'Unranked'
      ? `${rankInfo.rank} `
      : '';
  const loserSuffix = rankInfo.loserTitle ? ` the ${rankInfo.loserTitle}` : '';
  return `${badge}${rankPrefix}${name}${loserSuffix}`;
}

export function isGladiatorMaxed(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGet.get(guildId, userId);
  return Boolean(row && row.xp >= MAX_GLADIATOR_XP);
}

export const addGladiatorXp = db.transaction((guildId, userId, amount, fallbackName) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('XP amount must be a positive whole number.');
  }
  const row = ensureGladiator(guildId, userId, fallbackName);
  const before = getLevelProgress(row.xp);
  const newXp = Math.min(MAX_GLADIATOR_XP, row.xp + amount);
  const after = getLevelProgress(newXp);
  stmtSetXp.run(newXp, guildId, userId);

  let justMaxed = false;
  if (newXp >= MAX_GLADIATOR_XP && !row.maxed_reward_granted) {
    stmtSetMaxedGranted.run(guildId, userId);
    addItemToInventory(guildId, userId, MAXED_OUT_TROPHY_ITEM_ID, 1);
    justMaxed = true;
  }

  
  if (after.level > before.level) {
    syncOwnerProgressiveGear(guildId, userId, after.level);
  }

  return {
    xpGained: newXp - row.xp,
    xpTotal: newXp,
    before,
    after,
    leveledUp: after.level > before.level,
    justMaxed,
  };
});

export const SKILLING_GLADIATOR_XP_RATE = 1;

export function awardGladiatorXpFromSkilling(guildId, userId, skillXpGained, fallbackName) {
  guildId = GLOBAL_ID;
  const amount = Math.round(skillXpGained * SKILLING_GLADIATOR_XP_RATE);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return addGladiatorXp(guildId, userId, amount, fallbackName);
}

export function formatGladiatorSkillingXpLine(gladXpResult, displayName) {
  if (!gladXpResult) return '';
  let line = `\n✨ **+${gladXpResult.xpGained.toLocaleString('en-US')} Gladiator XP**`;
  if (gladXpResult.leveledUp && !gladXpResult.justMaxed) {
    line += ` — 🆙 **Level ${gladXpResult.after.level}!**`;
  }
  if (gladXpResult.justMaxed) {
    line += `\n\n👑 **MAXED OUT!** ${displayName} just hit the 200,000,000 XP cap — the **Laurel of the Undying** has been added to their collection.`;
  }
  return line;
}

export const MAX_QP = 5000;

const QP_REWARD_FLOOR = 5;
const QP_REWARD_CEILING_AT_ZERO = 15;
const QP_REWARD_CEILING_AT_MAX = 55;

export function rollQuestPointsReward(currentQp) {
  const frac = Math.min(currentQp / MAX_QP, 1);
  const ceiling = Math.round(QP_REWARD_CEILING_AT_ZERO + (QP_REWARD_CEILING_AT_MAX - QP_REWARD_CEILING_AT_ZERO) * frac);
  return QP_REWARD_FLOOR + Math.floor(Math.random() * (ceiling - QP_REWARD_FLOOR + 1));
}

export const addGladiatorQp = db.transaction((guildId, userId, amount, fallbackName) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError('QP amount must be a positive whole number.');
  }
  const row = ensureGladiator(guildId, userId, fallbackName);
  const before = row.qp ?? 0;
  const newQp = Math.min(MAX_QP, before + amount);
  stmtSetQp.run(newQp, guildId, userId);
  return { qpGained: newQp - before, qpTotal: newQp, before, after: newQp };
});

export function getGladiatorQp(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = getGladiatorRow(guildId, userId);
  return row?.qp ?? 0;
}

function applyGladiatorXpTotal(guildId, userId, row, targetXp) {
  const before = getLevelProgress(row.xp);
  const newXp = Math.max(0, Math.min(MAX_GLADIATOR_XP, Math.round(targetXp)));
  const after = getLevelProgress(newXp);
  stmtSetXp.run(newXp, guildId, userId);

  let justMaxed = false;
  if (newXp >= MAX_GLADIATOR_XP && !row.maxed_reward_granted) {
    stmtSetMaxedGranted.run(guildId, userId);
    addItemToInventory(guildId, userId, MAXED_OUT_TROPHY_ITEM_ID, 1);
    justMaxed = true;
  }

  if (after.level > before.level) {
    syncOwnerProgressiveGear(guildId, userId, after.level);
  }

  return { xpDelta: newXp - row.xp, xpTotal: newXp, before, after, leveledUp: after.level > before.level, justMaxed };
}

export const adminSetGladiatorXp = db.transaction((guildId, userId, targetXp, fallbackName) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(targetXp) || targetXp < 0) {
    throw new EconomyError('XP must be a whole number of 0 or more.');
  }
  const row = ensureGladiator(guildId, userId, fallbackName);
  return applyGladiatorXpTotal(guildId, userId, row, targetXp);
});

export const adminAdjustGladiatorXp = db.transaction((guildId, userId, delta, fallbackName) => {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(delta) || delta === 0) {
    throw new EconomyError('XP adjustment must be a non-zero whole number.');
  }
  const row = ensureGladiator(guildId, userId, fallbackName);
  return applyGladiatorXpTotal(guildId, userId, row, row.xp + delta);
});

export function getGladiatorRow(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGet.get(guildId, userId);
}

export function isGladiatorAdventuring(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGet.get(guildId, userId);
  return Boolean(row && row.adventure_ends_at > Date.now());
}

export function hasUnclaimedAdventure(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGet.get(guildId, userId);
  return Boolean(row && row.adventure_ends_at > 0 && row.adventure_ends_at <= Date.now());
}

export const startGladiatorAdventure = db.transaction((guildId, userId, endsAt, channelId, location, fallbackName, durationMinutes, dartUsed = false, bossId = null, elixirCost = 0) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId, fallbackName);
  stmtSetAdventure.run(Date.now(), endsAt, channelId, location, durationMinutes, dartUsed ? 1 : 0, bossId, elixirCost, guildId, userId);
});

export const startGladiatorSlay = db.transaction((guildId, userId, endsAt, channelId, fallbackName, mobId, quantity) => {
  guildId = GLOBAL_ID;
  ensureGladiator(guildId, userId, fallbackName);
  stmtSetSlay.run(Date.now(), endsAt, channelId, mobId, quantity, guildId, userId);
});

export const endGladiatorAdventure = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  stmtEndAdventure.run(guildId, userId);
});

export function getAllDueAdventures() {
  return stmtAllDue.all(Date.now());
}

export function rollAdventureSuccess(guildId, userId, fallbackName, location) {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  const level = getLevelProgress(row.xp).level;
  const baseFailChance = adventureFailChance(level);
  const failChance = LOCATION_TIER[location] === 'mythical' ? Math.max(baseFailChance, MYTHICAL_ADVENTURE_MIN_FAIL_CHANCE) : baseFailChance;
  return Math.random() >= failChance;
}

export function applyGladiatorXpBonus(guildId, userId, baseAmount, context) {
  guildId = GLOBAL_ID;
  const allSets = getAllEquipmentSets(guildId, userId);
  const gladiatorXpBonus =
    context === 'champion' ? computeChampionGladiatorXpBonus(allSets) : computeAdventureCrossSetEffects(allSets).gladiatorXpBonus;
  const totalBonusPercent = (gladiatorXpBonus || 0) + getTierGladiatorXpBonusPercent(userId);
  if (!totalBonusPercent) return baseAmount;
  return Math.max(baseAmount, Math.ceil(baseAmount * (1 + totalBonusPercent / 100)));
}

function scaleByDuration(flatAmount, durationMinutes, baseMinutes) {
  const rate = flatAmount / Math.max(1, baseMinutes);
  return Math.max(1, Math.round(rate * Math.max(0, durationMinutes)));
}

export const awardAdventureXp = db.transaction((guildId, userId, fallbackName, durationMinutes, baseMinutes) => {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  const level = getLevelProgress(row.xp).level;
  const scaledAmount = scaleByDuration(adventureXpForLevel(level), durationMinutes, baseMinutes);
  const amount = applyGladiatorXpBonus(guildId, userId, scaledAmount, 'adventure');
  return addGladiatorXp(guildId, userId, amount, fallbackName);
});

const ADVENTURE_FAIL_XP_FRACTION = 0.2;

export const awardAdventureFailXp = db.transaction((guildId, userId, fallbackName, durationMinutes, baseMinutes) => {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  const level = getLevelProgress(row.xp).level;
  const scaledAmount = scaleByDuration(adventureXpForLevel(level), durationMinutes, baseMinutes);
  const baseAmount = Math.max(1, Math.round(scaledAmount * ADVENTURE_FAIL_XP_FRACTION));
  const amount = applyGladiatorXpBonus(guildId, userId, baseAmount, 'adventure');
  return addGladiatorXp(guildId, userId, amount, fallbackName);
});

const CHAMPION_LOSS_XP_FRACTION_OF_WIN = 0.2;

const CHAMPION_XP_LEVEL_BONUS_PERCENT_PER_LEVEL = 0.5;
const CHAMPION_XP_LEVEL_BONUS_CAP_PERCENT = 50;

export const awardChampionFightXp = db.transaction((guildId, userId, won, fallbackName, bracketBaseXp, bracketXpModifierPercent = 0) => {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  const level = getLevelProgress(row.xp).level;

  const rawAmount = won ? bracketBaseXp : bracketBaseXp * CHAMPION_LOSS_XP_FRACTION_OF_WIN;
  const levelBonusPercent = Math.min(CHAMPION_XP_LEVEL_BONUS_CAP_PERCENT, level * CHAMPION_XP_LEVEL_BONUS_PERCENT_PER_LEVEL);
  const baseAmount = Math.max(1, Math.round(rawAmount * (1 + levelBonusPercent / 100)));

  const bracketBoostedAmount = won && bracketXpModifierPercent > 0 ? Math.round(baseAmount * (1 + bracketXpModifierPercent / 100)) : baseAmount;
  const amount = applyGladiatorXpBonus(guildId, userId, bracketBoostedAmount, 'champion');
  return addGladiatorXp(guildId, userId, amount, fallbackName);
});

export function getGladiatorChampionStats(guildId, userId, fallbackName) {
  guildId = GLOBAL_ID;
  const row = ensureGladiator(guildId, userId, fallbackName);
  return { level: getLevelProgress(row.xp).level, isMaxed: row.xp >= MAX_GLADIATOR_XP };
}
