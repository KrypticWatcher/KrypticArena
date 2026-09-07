import { randomUUID } from 'crypto';
import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { EconomyError } from './economy.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { isGladiatorAdventuring } from './gladiator.js';
import { getActiveLabel } from './activeSession.js';
import { findBossAnywhere } from '../data/bossDomains.js';
import {
  getPetSpecies,
  getPetSpeciesForLocation,
  getBossPetSpecies,
  getQuestPetSpecies,
  PET_SPECIES,
  SHINY_ABILITY,
  BASE_STAT_RANGE_BY_RARITY,
  BOSS_TIER_STAT_RANGE,
  STAT_CAP_BY_RARITY,
  GODLY_STAT_CAP,
  BASE_WIN_RATE_BY_RARITY,
  WIN_RATE_CAP,
  RECOVERY_DAYS_BY_RARITY,
  ADVENTURE_PET_DROP_RATE_BY_RARITY,
  BOSS_PET_DROP_RATE,
  QUEST_PET_DROP_RATE,
  STAT_FOCUS_CANDIES,
  ADVENTURE_CANDY_DROP_RATE,
  ADVENTURE_CANDY_DROP_MIN,
  ADVENTURE_CANDY_DROP_MAX,
} from '../data/pets.js';

export const MAX_PET_LEVEL = 20;

const PET_XP_TABLE = (() => {
  const table = [0]; 
  let cumulative = 0;
  for (let level = 1; level < MAX_PET_LEVEL; level++) {
    cumulative += Math.floor(level + 300 * Math.pow(2, level / 7));
    table.push(Math.floor((cumulative / 4) * 0.75));
  }
  return table; 
})();

export function xpForPetLevel(level) {
  const clamped = Math.max(1, Math.min(MAX_PET_LEVEL, level));
  return PET_XP_TABLE[clamped - 1];
}

export function levelForPetXp(xp) {
  let level = 1;
  for (let l = MAX_PET_LEVEL; l >= 1; l--) {
    if (xp >= PET_XP_TABLE[l - 1]) {
      level = l;
      break;
    }
  }
  return level;
}

export function getPetLevelProgress(xp) {
  const level = levelForPetXp(xp);
  if (level >= MAX_PET_LEVEL) {
    return { level, xpIntoLevel: 0, xpForNextLevel: 0, maxed: true };
  }
  const currentFloor = xpForPetLevel(level);
  const nextFloor = xpForPetLevel(level + 1);
  return { level, xpIntoLevel: xp - currentFloor, xpForNextLevel: nextFloor - currentFloor, maxed: false };
}

function rollStat(rarity, isBossTier) {
  const [min, max] = isBossTier ? BOSS_TIER_STAT_RANGE : BASE_STAT_RANGE_BY_RARITY[rarity];
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollAllStats(rarity, isBossTier = false) {
  return {
    attack: rollStat(rarity, isBossTier),
    defense: rollStat(rarity, isBossTier),
    vitality: rollStat(rarity, isBossTier),
    speed: rollStat(rarity, isBossTier),
  };
}

export const SHINY_ITEM_ID_PREFIX = 'shiny_';

const SHINY_STAT_THRESHOLD = 0.6;
const SHINY_CHANCE_IF_ELIGIBLE = 0.1; 
const SHINY_ABILITY_MIN_PERCENT = 1;
const SHINY_ABILITY_MAX_PERCENT = 10;

function meetsShinyThreshold(stats, rarity, isBossTier) {
  const [min, max] = isBossTier ? BOSS_TIER_STAT_RANGE : BASE_STAT_RANGE_BY_RARITY[rarity];
  const cutoff = min + (max - min) * SHINY_STAT_THRESHOLD;
  return stats.attack >= cutoff && stats.defense >= cutoff && stats.vitality >= cutoff && stats.speed >= cutoff;
}

function rollShinyOutcome(species, stats) {
  if (!species.shinyIcon) return { isShiny: false, abilityPercent: null };
  const isBossTier = species.source === 'boss';
  if (!meetsShinyThreshold(stats, species.rarity, isBossTier)) return { isShiny: false, abilityPercent: null };
  if (Math.random() >= SHINY_CHANCE_IF_ELIGIBLE) return { isShiny: false, abilityPercent: null };
  const abilityPercent = SHINY_ABILITY_MIN_PERCENT + Math.random() * (SHINY_ABILITY_MAX_PERCENT - SHINY_ABILITY_MIN_PERCENT);
  return { isShiny: true, abilityPercent: Math.round(abilityPercent * 10) / 10 };
}

function getEquippedShinyAbility(guildId, userId) {
  const pet = getActivePet(guildId, userId);
  if (!pet || !pet.is_shiny) return null;
  const species = getPetSpecies(pet.species_id);
  const ability = species?.shinyAbilityId ? SHINY_ABILITY[species.shinyAbilityId] : null;
  if (!ability) return null;
  return { pet, ability, percent: pet.shiny_ability_percent };
}

export function applyShinySuccessBonuses(guildId, userId, { gambling, arena }) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  const result = { bonusArena: 0, bonusGambling: 0, bonusElixir: false, bonusEquipmentRoll: false, abilityName: null };
  if (!equipped) return result;
  const { ability, percent } = equipped;
  result.abilityName = ability.name;

  if (ability.type === 'bonus_arena') {
    result.bonusArena = Math.round(arena * (percent / 100));
  } else if (ability.type === 'bonus_gambling') {
    result.bonusGambling = Math.round(gambling * (percent / 100));
  } else if (ability.type === 'bonus_elixir_find') {
    result.bonusElixir = Math.random() < percent / 100;
  } else if (ability.type === 'bonus_equipment_drop') {
    result.bonusEquipmentRoll = Math.random() < percent / 100;
  } else if (ability.type === 'nethercharged_roar') {
    
    
    result.bonusArena = Math.round(arena * (percent / 100));
    result.bonusGambling = Math.round(gambling * (percent / 100));
  } else {
    result.abilityName = null; 
  }
  return result;
}

export function rollShinyFailElixirSave(guildId, userId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'fail_elixir_save') return false;
  return Math.random() < equipped.percent / 100;
}

export function getShinyAdventureTimeReductionPercent(guildId, userId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'adventure_time_reduction') return 0;
  return equipped.percent;
}

const stmtSetPendingDiscount = db.prepare('UPDATE gladiators SET pending_elixir_discount_percent = ? WHERE guild_id = ? AND user_id = ?');
const stmtGetPendingDiscount = db.prepare('SELECT pending_elixir_discount_percent FROM gladiators WHERE guild_id = ? AND user_id = ?');

export function rollShinyNextElixirDiscount(guildId, userId) {
  guildId = GLOBAL_ID;
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'next_elixir_discount') return;
  if (Math.random() >= equipped.percent / 100) return;
  stmtSetPendingDiscount.run(equipped.percent, guildId, userId);
}

export function consumePendingElixirDiscount(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetPendingDiscount.get(guildId, userId);
  const percent = row?.pending_elixir_discount_percent ?? 0;
  if (percent > 0) stmtSetPendingDiscount.run(null, guildId, userId);
  return percent;
}

export function getShinyBossCostReductionPercent(guildId, userId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'boss_cost_reduction') return 0;
  return equipped.percent;
}

export function getShinyBossWinArenaBonus(guildId, userId, arenaEarned) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'boss_win_bonus_arena') return 0;
  return Math.round(arenaEarned * (equipped.percent / 100));
}

export function getShinyBossLossRefund(guildId, userId, cost) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'boss_loss_refund') return { gambling: 0, arena: 0 };
  const factor = equipped.percent / 100;
  return { gambling: Math.round(cost.gambling * factor), arena: Math.round(cost.arena * factor) };
}

export function getShinyDomainCurrencyBonus(guildId, userId, { gambling, arena }) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || (equipped.ability.type !== 'domain_bonus' && equipped.ability.type !== 'nethercharged_roar')) {
    return { bonusGambling: 0, bonusArena: 0, abilityName: null };
  }
  const factor = equipped.percent / 100;
  return {
    bonusGambling: Math.round(gambling * factor),
    bonusArena: Math.round(arena * factor),
    abilityName: equipped.ability.name,
  };
}

export function rollShinyDomainEquipmentBonus(guildId, userId, killedBossId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'domain_bonus') return false;
  const petSpecies = getPetSpecies(equipped.pet.species_id);
  if (!petSpecies?.bossId) return false;
  const petBossDomain = findBossAnywhere(petSpecies.bossId)?.domain;
  const killedBossDomain = findBossAnywhere(killedBossId)?.domain;
  if (!petBossDomain || !killedBossDomain || petBossDomain.id !== killedBossDomain.id) return false;
  return Math.random() < equipped.percent / 100;
}

export function getShinyChampionPayoutBoost(guildId, userId, payoutMultiplier) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'champion_payout_boost') return 0;
  return payoutMultiplier * (equipped.percent / 100);
}

export function getShinyChampionWinChanceBoost(guildId, userId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped || equipped.ability.type !== 'champion_odds_boost') return 0;
  return equipped.percent / 100;
}

export function getShinyChampionAbilityNote(guildId, userId) {
  const equipped = getEquippedShinyAbility(guildId, userId);
  if (!equipped) return null;
  if (equipped.ability.type !== 'champion_payout_boost' && equipped.ability.type !== 'champion_odds_boost') return null;
  return equipped.ability.name;
}

export function rollAdventurePetDrop(guildId, userId, location) {
  const species = getPetSpeciesForLocation(location);
  if (!species) return null;
  const baseRate = ADVENTURE_PET_DROP_RATE_BY_RARITY[species.rarity];
  if (!baseRate) return null;
  if (Math.random() >= 1 / baseRate) return null;
  return createPet(guildId, userId, species.id);
}

export function rollBossPetDrop(guildId, userId, bossId) {
  const species = getBossPetSpecies().find((s) => s.bossId === bossId);
  if (!species) return null;
  if (Math.random() >= 1 / BOSS_PET_DROP_RATE) return null;
  return createPet(guildId, userId, species.id);
}

export function rollQuestPetFind(guildId, userId) {
  const species = getQuestPetSpecies()[0];
  if (!species) return null;
  if (Math.random() >= 1 / QUEST_PET_DROP_RATE) return null;
  return { pet: createPet(guildId, userId, species.id) };
}

export function rollAdventureCandyDrop(hasPetEquipped) {
  if (!hasPetEquipped) return null;
  if (Math.random() >= 1 / ADVENTURE_CANDY_DROP_RATE) return null;
  const totalUnits = ADVENTURE_CANDY_DROP_MIN + Math.floor(Math.random() * (ADVENTURE_CANDY_DROP_MAX - ADVENTURE_CANDY_DROP_MIN + 1));

  const countById = new Map();
  for (let i = 0; i < totalUnits; i++) {
    const candy = STAT_FOCUS_CANDIES[Math.floor(Math.random() * STAT_FOCUS_CANDIES.length)];
    countById.set(candy.id, (countById.get(candy.id) ?? 0) + 1);
  }

  return [...countById.entries()].map(([candyId, quantity]) => {
    const candy = STAT_FOCUS_CANDIES.find((c) => c.id === candyId);
    return { candyId, candyName: candy.name, quantity };
  });
}

const PET_XP_BASE_BY_TIER = { common: 130, uncommon: 160, rare: 190, epic: 220, legendary: 250, mythical: 280 };
const PET_XP_FAIL_FRACTION = 0.2; 

function petXpPerTrip(tier, gladiatorLevel, succeeded = true) {
  const base = PET_XP_BASE_BY_TIER[tier] ?? PET_XP_BASE_BY_TIER.common;
  const gladiatorBonus = Math.round(gladiatorLevel / 5);
  const amount = base + gladiatorBonus;
  return succeeded ? amount : Math.max(1, Math.round(amount * PET_XP_FAIL_FRACTION));
}

const stmtAddPetXp = db.prepare('UPDATE pets SET xp = ?, level = ? WHERE instance_id = ?');
const stmtApplyStatGrowth = db.prepare(
  'UPDATE pets SET attack = ?, defense = ?, vitality = ?, speed = ?, stat_focus_levels_remaining = ?, stat_focus_id = ? WHERE instance_id = ?'
);

const stmtSetStatFocus = db.prepare('UPDATE pets SET stat_focus_id = ?, stat_focus_levels_remaining = ? WHERE instance_id = ?');
const CANDY_LEVEL_WINDOW_MIN = 2;
const CANDY_LEVEL_WINDOW_MAX = 3;

export function applyCandyToPet(instanceId, candyId) {
  const window = CANDY_LEVEL_WINDOW_MIN + Math.floor(Math.random() * (CANDY_LEVEL_WINDOW_MAX - CANDY_LEVEL_WINDOW_MIN + 1));
  stmtSetStatFocus.run(candyId, window, instanceId);
  return { levelsWindow: window };
}

const STAT_FOCUS_WEIGHTS = Object.fromEntries(STAT_FOCUS_CANDIES.map((c) => [c.id, c.weights]));

function distributeStatGrowth(pet, levelsGained) {
  const species = getPetSpecies(pet.species_id);
  const cap = species?.source === 'boss' ? GODLY_STAT_CAP : STAT_CAP_BY_RARITY[pet.rarity];
  const naturalWeights = species?.growthWeights ?? { attack: 1, defense: 1, vitality: 1, speed: 1 };
  const candyWeights = pet.stat_focus_id ? STAT_FOCUS_WEIGHTS[pet.stat_focus_id] : null;

  const candyLevelsAvailable = candyWeights ? (pet.stat_focus_levels_remaining ?? 0) : 0;
  const candyLevels = Math.min(levelsGained, candyLevelsAvailable);
  const naturalLevels = levelsGained - candyLevels;

  const deltas = {};
  const newStats = {};
  for (const stat of ['attack', 'defense', 'vitality', 'speed']) {
    const before = pet[stat];
    const candyGrowth = candyWeights ? candyWeights[stat] * candyLevels : 0;
    const naturalGrowth = naturalWeights[stat] * naturalLevels;
    const after = Math.min(cap, before + candyGrowth + naturalGrowth);
    deltas[stat] = after - before;
    newStats[stat] = after;
  }
  const remainingCandyLevels = Math.max(0, candyLevelsAvailable - candyLevels);
  return { deltas, newStats, remainingCandyLevels };
}

export function grantEquippedPetXp(guildId, userId, tier, gladiatorLevel, succeeded = true) {
  guildId = GLOBAL_ID;
  const pet = getActivePet(guildId, userId);
  if (!pet) return null;
  const amount = petXpPerTrip(tier, gladiatorLevel, succeeded);
  const beforeLevel = pet.level;
  const newXp = Math.min(xpForPetLevel(MAX_PET_LEVEL), pet.xp + amount);
  const newLevel = levelForPetXp(newXp);
  stmtAddPetXp.run(newXp, newLevel, pet.instance_id);

  const levelsGained = newLevel - beforeLevel;
  let statDeltas = null;
  
  
  
  
  let candyExpired = false;
  if (levelsGained > 0) {
    const growth = distributeStatGrowth(pet, levelsGained);
    
    
    
    
    const newStatFocusId = growth.remainingCandyLevels > 0 ? pet.stat_focus_id : null;
    candyExpired = Boolean(pet.stat_focus_id) && growth.remainingCandyLevels === 0;
    stmtApplyStatGrowth.run(
      growth.newStats.attack,
      growth.newStats.defense,
      growth.newStats.vitality,
      growth.newStats.speed,
      growth.remainingCandyLevels,
      newStatFocusId,
      pet.instance_id
    );
    statDeltas = growth.deltas;
  }

  return { pet: stmtGet.get(pet.instance_id), xpGained: amount, leveledUp: levelsGained > 0, levelsGained, statDeltas, candyExpired };
}

export function grantBotFightWinXp(pet) {
  const amount = 15 + pet.level * 2;
  const beforeLevel = pet.level;
  const newXp = Math.min(xpForPetLevel(MAX_PET_LEVEL), pet.xp + amount);
  const newLevel = levelForPetXp(newXp);
  stmtAddPetXp.run(newXp, newLevel, pet.instance_id);

  const levelsGained = newLevel - beforeLevel;
  let statDeltas = null;
  
  
  
  
  let candyExpired = false;
  if (levelsGained > 0) {
    const growth = distributeStatGrowth(pet, levelsGained);
    
    
    
    
    const newStatFocusId = growth.remainingCandyLevels > 0 ? pet.stat_focus_id : null;
    candyExpired = Boolean(pet.stat_focus_id) && growth.remainingCandyLevels === 0;
    stmtApplyStatGrowth.run(
      growth.newStats.attack,
      growth.newStats.defense,
      growth.newStats.vitality,
      growth.newStats.speed,
      growth.remainingCandyLevels,
      newStatFocusId,
      pet.instance_id
    );
    statDeltas = growth.deltas;
  }

  return { pet: stmtGet.get(pet.instance_id), xpGained: amount, leveledUp: levelsGained > 0, levelsGained, statDeltas, candyExpired };
}

export function formatPetLevelUpLine(petXpResult) {
  if (!petXpResult) return null;
  const displayName = petXpResult.pet.nickname ?? petXpResult.pet.given_name;
  const expiredSuffix = petXpResult.candyExpired ? ` Its candy's effect has worn off.` : '';
  if (!petXpResult.leveledUp) {
    return `🐾 **${displayName}** gained ${petXpResult.xpGained} XP.${expiredSuffix}`;
  }
  const gains = Object.entries(petXpResult.statDeltas)
    .filter(([, delta]) => delta > 0)
    .map(([stat, delta]) => `${STAT_SHORT_LABEL[stat]} +${delta}`)
    .join(', ');
  const gainsSuffix = gains ? ` (${gains})` : '';
  return `🐾 **${displayName}** gained ${petXpResult.xpGained} XP and leveled up to **Level ${petXpResult.pet.level}**!${gainsSuffix}${expiredSuffix}`;
}

const STAT_SHORT_LABEL = { attack: 'ATK', defense: 'DEF', vitality: 'VIT', speed: 'SPD' };

const PET_PURCHASE_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
export const PET_PURCHASE_MAX_PER_WINDOW = 5;

const stmtGetPurchaseLimit = db.prepare('SELECT * FROM pet_purchase_limit WHERE guild_id = ? AND user_id = ?');
const stmtUpsertPurchaseLimit = db.prepare(`
  INSERT INTO pet_purchase_limit (guild_id, user_id, window_started_at, purchased_in_window) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET window_started_at = excluded.window_started_at, purchased_in_window = excluded.purchased_in_window
`);

export function getPetPurchaseAllowance(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetPurchaseLimit.get(guildId, userId);
  const now = Date.now();
  if (!row || now - row.window_started_at >= PET_PURCHASE_WINDOW_MS) {
    return { remaining: PET_PURCHASE_MAX_PER_WINDOW, windowResetsAt: now + PET_PURCHASE_WINDOW_MS };
  }
  return {
    remaining: Math.max(0, PET_PURCHASE_MAX_PER_WINDOW - row.purchased_in_window),
    windowResetsAt: row.window_started_at + PET_PURCHASE_WINDOW_MS,
  };
}

export function consumePetPurchaseAllowance(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetPurchaseLimit.get(guildId, userId);
  const now = Date.now();
  const windowExpired = !row || now - row.window_started_at >= PET_PURCHASE_WINDOW_MS;
  const windowStart = windowExpired ? now : row.window_started_at;
  const purchasedSoFar = windowExpired ? 0 : row.purchased_in_window;

  if (purchasedSoFar + 1 > PET_PURCHASE_MAX_PER_WINDOW) {
    const resetsAt = windowStart + PET_PURCHASE_WINDOW_MS;
    throw new EconomyError(
      `You've already bought **${PET_PURCHASE_MAX_PER_WINDOW}** pets this window (max per 4 days) — resets <t:${Math.floor(resetsAt / 1000)}:R>.`
    );
  }

  stmtUpsertPurchaseLimit.run(guildId, userId, windowStart, purchasedSoFar + 1);
}

const stmtInsert = db.prepare(`
  INSERT INTO pets (
    instance_id, guild_id, user_id, species_id, rarity, given_name, nickname,
    level, xp, attack, defense, vitality, speed, win_rate, cooldown_until, stat_focus_id,
    is_shiny, shiny_ability_percent
  ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 0, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
`);
const stmtGet = db.prepare('SELECT * FROM pets WHERE instance_id = ?');
const stmtGetForUser = db.prepare('SELECT * FROM pets WHERE guild_id = ? AND user_id = ? ORDER BY created_at ASC');
const stmtSetNickname = db.prepare('UPDATE pets SET nickname = ? WHERE instance_id = ?');
const stmtDelete = db.prepare('DELETE FROM pets WHERE instance_id = ?');

const stmtDeleteAllForUser = db.prepare('DELETE FROM pets WHERE guild_id = ? AND user_id = ?');

export function removeAllPetsForUser(guildId, userId) {
  guildId = GLOBAL_ID;
  const count = getPetsForUser(guildId, userId).length;
  stmtSetActivePet.run(null, guildId, userId);
  stmtDeleteAllForUser.run(guildId, userId);
  return count;
}

const stmtGetBotFightWindow = db.prepare('SELECT window_started_at, fights_in_window FROM pet_daily_fight_limit WHERE instance_id = ?');
const stmtUpsertBotFightCount = db.prepare(`
  INSERT INTO pet_daily_fight_limit (instance_id, window_started_at, fights_in_window)
  VALUES (?, ?, 1)
  ON CONFLICT(instance_id) DO UPDATE SET fights_in_window = fights_in_window + 1
`);
const stmtStartFreshWindow = db.prepare(`
  INSERT INTO pet_daily_fight_limit (instance_id, window_started_at, fights_in_window)
  VALUES (?, ?, 1)
  ON CONFLICT(instance_id) DO UPDATE SET window_started_at = excluded.window_started_at, fights_in_window = 1
`);
const stmtResetBotFightCount = db.prepare('UPDATE pet_daily_fight_limit SET fights_in_window = 0, window_started_at = ? WHERE instance_id = ?');
const stmtSetCooldown = db.prepare('UPDATE pets SET cooldown_until = ? WHERE instance_id = ?');
const stmtSetWinRate = db.prepare('UPDATE pets SET win_rate = ? WHERE instance_id = ?');
const stmtSetTotalRest = db.prepare('UPDATE pets SET total_rest_started_at = ?, total_rest_until = ? WHERE instance_id = ?');

const TOTAL_REST_MULTIPLIER_MIN = 1;
const TOTAL_REST_MULTIPLIER_MAX = 1.3;

export function adjustPetWinRateAfterBotFight(instanceId, currentWinRate, won, rarity) {
  const delta = won ? 0.02 : -0.02;
  const newRate = Math.max(0, Math.min(WIN_RATE_CAP, currentWinRate + delta));
  stmtSetWinRate.run(newRate, instanceId);

  if (newRate === 0 && currentWinRate > 0) {
    const recoveryDays = RECOVERY_DAYS_BY_RARITY[rarity] ?? RECOVERY_DAYS_BY_RARITY.common;
    const multiplier = TOTAL_REST_MULTIPLIER_MIN + Math.random() * (TOTAL_REST_MULTIPLIER_MAX - TOTAL_REST_MULTIPLIER_MIN);
    const now = Date.now();
    stmtSetTotalRest.run(now, now + recoveryDays * multiplier * 24 * 60 * 60 * 1000, instanceId);
  }

  return newRate;
}

export function isPetInTotalRest(pet) {
  return pet.total_rest_until > Date.now();
}

export function getEffectiveWinRate(pet) {
  if (!isPetInTotalRest(pet)) return pet.win_rate;
  const baseWinRate = BASE_WIN_RATE_BY_RARITY[pet.rarity] ?? BASE_WIN_RATE_BY_RARITY.common;
  const elapsed = Date.now() - pet.total_rest_started_at;
  const totalWindow = pet.total_rest_until - pet.total_rest_started_at;
  const fraction = totalWindow > 0 ? Math.max(0, Math.min(1, elapsed / totalWindow)) : 1;
  return baseWinRate * fraction;
}

const BOT_FIGHT_ATTEMPTS_BEFORE_REST = 3;

export function isPetRestingFromBotFights(pet) {
  return pet.cooldown_until > Date.now();
}

const BOT_FIGHT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function recordBotFightAttempt(instanceId, rarity) {
  const now = Date.now();
  const existing = stmtGetBotFightWindow.get(instanceId);
  const windowExpired = !existing || now - existing.window_started_at >= BOT_FIGHT_WINDOW_MS;

  let count;
  if (windowExpired) {
    stmtStartFreshWindow.run(instanceId, now);
    count = 1;
  } else {
    stmtUpsertBotFightCount.run(instanceId, now);
    count = existing.fights_in_window + 1;
  }

  if (count >= BOT_FIGHT_ATTEMPTS_BEFORE_REST) {
    const recoveryDays = RECOVERY_DAYS_BY_RARITY[rarity] ?? RECOVERY_DAYS_BY_RARITY.common;
    stmtSetCooldown.run(Date.now() + recoveryDays * 24 * 60 * 60 * 1000, instanceId);
    stmtResetBotFightCount.run(Date.now(), instanceId);
    return true;
  }
  return false;
}

export function rollBotFightOutcome(winRate) {
  return Math.random() < winRate;
}

const stmtRerollStats = db.prepare(`
  UPDATE pets SET attack = ?, defense = ?, vitality = ?, speed = ?, win_rate = ?,
    level = 1, xp = 0, cooldown_until = 0, stat_focus_id = NULL, user_id = ?, guild_id = ?
  WHERE instance_id = ?
`);
const stmtSetActivePet = db.prepare('UPDATE gladiators SET active_pet_id = ? WHERE guild_id = ? AND user_id = ?');
const stmtGetActivePetId = db.prepare('SELECT active_pet_id FROM gladiators WHERE guild_id = ? AND user_id = ?');

export function createPet(guildId, userId, speciesId) {
  guildId = GLOBAL_ID;
  const species = getPetSpecies(speciesId);
  if (!species) {
    throw new EconomyError(`Unknown pet species: ${speciesId}`);
  }
  const instanceId = randomUUID();
  const stats = rollAllStats(species.rarity, species.source === 'boss');
  const winRate = BASE_WIN_RATE_BY_RARITY[species.rarity];
  const { isShiny, abilityPercent } = rollShinyOutcome(species, stats);
  stmtInsert.run(
    instanceId,
    guildId,
    userId,
    species.id,
    species.rarity,
    species.defaultName,
    stats.attack,
    stats.defense,
    stats.vitality,
    stats.speed,
    winRate,
    isShiny ? 1 : 0,
    abilityPercent
  );
  
  
  
  
  
  
  recordCollectionLogObtain(userId, species.id, 1);
  
  
  
  
  
  
  
  if (isShiny) {
    recordCollectionLogObtain(userId, `${SHINY_ITEM_ID_PREFIX}${species.id}`, 1);
  }
  return stmtGet.get(instanceId);
}

export function createTestPet(guildId, userId, speciesId, forceShiny = false) {
  guildId = GLOBAL_ID;
  const species = getPetSpecies(speciesId);
  if (!species) {
    throw new EconomyError(`Unknown pet species: ${speciesId}`);
  }
  const instanceId = randomUUID();
  const isBossTier = species.source === 'boss';
  const [, maxStat] = isBossTier ? BOSS_TIER_STAT_RANGE : BASE_STAT_RANGE_BY_RARITY[species.rarity];
  const winRate = BASE_WIN_RATE_BY_RARITY[species.rarity];
  const stats = { attack: maxStat, defense: maxStat, vitality: maxStat, speed: maxStat };
  const rolled = rollShinyOutcome(species, stats);
  const isShiny = forceShiny && species.shinyIcon ? true : rolled.isShiny;
  const abilityPercent = isShiny ? (rolled.abilityPercent ?? Math.round((SHINY_ABILITY_MIN_PERCENT + Math.random() * (SHINY_ABILITY_MAX_PERCENT - SHINY_ABILITY_MIN_PERCENT)) * 10) / 10) : null;
  stmtInsert.run(
    instanceId,
    guildId,
    userId,
    species.id,
    species.rarity,
    species.defaultName,
    maxStat,
    maxStat,
    maxStat,
    maxStat,
    winRate,
    isShiny ? 1 : 0,
    abilityPercent
  );
  return stmtGet.get(instanceId);
}

const UNIQUE_SPECIES_ABILITY_PERCENT = 10;

export function createGiftedPet(guildId, userId, speciesId) {
  guildId = GLOBAL_ID;
  const species = getPetSpecies(speciesId);
  if (!species) {
    throw new EconomyError(`Unknown pet species: ${speciesId}`);
  }
  if (species.source !== 'unique') {
    return createPet(guildId, userId, speciesId);
  }
  const instanceId = randomUUID();
  
  
  
  
  const stats = rollAllStats(species.rarity, false);
  const winRate = BASE_WIN_RATE_BY_RARITY[species.rarity];
  stmtInsert.run(
    instanceId,
    guildId,
    userId,
    species.id,
    species.rarity,
    species.defaultName,
    stats.attack,
    stats.defense,
    stats.vitality,
    stats.speed,
    winRate,
    1, 
    
    
    
    
    
    UNIQUE_SPECIES_ABILITY_PERCENT
  );
  
  
  return stmtGet.get(instanceId);
}

export function getPet(instanceId) {
  return stmtGet.get(instanceId) ?? null;
}

export function getPetsForUser(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetForUser.all(guildId, userId);
}

export function describePet(pet) {
  if (!pet) return null;
  const species = getPetSpecies(pet.species_id);
  const isBossTier = species?.source === 'boss';
  const isShiny = Boolean(pet.is_shiny);
  return {
    ...pet,
    
    
    
    
    win_rate: getEffectiveWinRate(pet),
    isInTotalRest: isPetInTotalRest(pet),
    isShiny,
    
    
    
    shinyAbilityName: (isShiny && species?.shinyAbilityId && SHINY_ABILITY[species.shinyAbilityId]?.name) || null,
    
    
    
    shinyAbilityType: (isShiny && species?.shinyAbilityId && SHINY_ABILITY[species.shinyAbilityId]?.type) || null,
    speciesName: species?.name ?? pet.species_id,
    speciesDescription: species?.description ?? null,
    
    
    
    
    
    untradeable: Boolean(species?.untradeable),
    
    
    
    
    
    icon: (isShiny && species?.shinyIcon) || species?.icon || null,
    image: (isShiny && species?.shinyImage) || species?.image || null,
    isBossTier,
    
    
    
    
    
    
    rarityLabel: isBossTier ? 'Godly' : pet.rarity === 'nethercharged' ? 'Nethercharged' : pet.rarity,
    displayName: pet.nickname ?? pet.given_name,
    statCap: isBossTier ? GODLY_STAT_CAP : STAT_CAP_BY_RARITY[pet.rarity],
    winRateCap: WIN_RATE_CAP,
    recoveryDays: RECOVERY_DAYS_BY_RARITY[pet.rarity],
    onCooldown: pet.cooldown_until > Date.now(),
  };
}

export function renamePet(guildId, userId, instanceId, newName) {
  guildId = GLOBAL_ID;
  const pet = stmtGet.get(instanceId);
  if (!pet || pet.guild_id !== guildId || pet.user_id !== userId) {
    throw new EconomyError("You don't own that pet.");
  }
  
  
  
  
  
  
  
  const active = stmtGetActivePetId.get(guildId, userId);
  if (active?.active_pet_id === instanceId) {
    if (isGladiatorAdventuring(guildId, userId)) {
      throw new EconomyError("You can't rename your equipped pet while your Gladiator is out on an Adventure or Boss Challenge.");
    }
    if (getActiveLabel(guildId, userId) === 'a Champion fight') {
      throw new EconomyError("You can't rename your equipped pet mid-Champion fight.");
    }
  }
  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > 32) {
    throw new EconomyError('Pet names must be 1-32 characters.');
  }
  stmtSetNickname.run(trimmed, instanceId);
  return stmtGet.get(instanceId);
}

export function getActivePet(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetActivePetId.get(guildId, userId);
  if (!row?.active_pet_id) return null;
  
  
  
  const pet = stmtGet.get(row.active_pet_id);
  return pet && pet.guild_id === guildId && pet.user_id === userId ? pet : null;
}

export function setActivePet(guildId, userId, instanceId) {
  guildId = GLOBAL_ID;
  if (instanceId !== null) {
    const pet = stmtGet.get(instanceId);
    if (!pet || pet.guild_id !== guildId || pet.user_id !== userId) {
      throw new EconomyError("You don't own that pet.");
    }
  }
  
  
  
  
  
  
  
  
  if (isGladiatorAdventuring(guildId, userId)) {
    throw new EconomyError("You can't switch pets while your Gladiator is out on an Adventure or Boss Challenge.");
  }
  if (getActiveLabel(guildId, userId) === 'a Champion fight') {
    throw new EconomyError("You can't switch pets mid-Champion fight.");
  }
  stmtSetActivePet.run(instanceId, guildId, userId);
}

export function transferPet(instanceId, fromUserId, toUserId) {
  const pet = stmtGet.get(instanceId);
  if (!pet) {
    throw new EconomyError("That pet doesn't exist.");
  }
  const species = getPetSpecies(pet.species_id);
  const stats = rollAllStats(pet.rarity, species?.source === 'boss');
  const winRate = BASE_WIN_RATE_BY_RARITY[pet.rarity];
  stmtRerollStats.run(stats.attack, stats.defense, stats.vitality, stats.speed, winRate, toUserId, GLOBAL_ID, instanceId);
  
  
  
  const senderActive = stmtGetActivePetId.get(GLOBAL_ID, fromUserId);
  if (senderActive?.active_pet_id === instanceId) {
    stmtSetActivePet.run(null, GLOBAL_ID, fromUserId);
  }
  return stmtGet.get(instanceId);
}

export const PET_SELL_PRICE = 10;

export function sellPet(guildId, userId, instanceId) {
  guildId = GLOBAL_ID;
  const pet = stmtGet.get(instanceId);
  if (!pet || pet.guild_id !== guildId || pet.user_id !== userId) {
    throw new EconomyError("You don't own that pet.");
  }
  const active = stmtGetActivePetId.get(guildId, userId);
  if (active?.active_pet_id === instanceId) {
    stmtSetActivePet.run(null, guildId, userId);
  }
  stmtDelete.run(instanceId);
  return pet;
}

const stmtDeleteCollectionLogEntry = db.prepare('DELETE FROM collection_log WHERE user_id = ? AND item_id = ?');

export function clearPetCollectionLogEntries(userId) {
  let cleared = 0;
  for (const species of PET_SPECIES) {
    const result = stmtDeleteCollectionLogEntry.run(userId, species.id);
    cleared += result.changes;
  }
  return cleared;
}
