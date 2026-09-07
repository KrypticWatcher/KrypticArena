import { getEquipmentEffectTotals, EFFECT_TYPES, CHAMPION_FAIL_REDUCTION_BY_TIER, getEquipmentContributions, WEAPON_LABELS } from '../data/items.js';
import { MAX_GLADIATOR_LEVEL } from './xp.js';

export const ARMOR_SLOTS = ['helmet', 'chest', 'legs', 'boots', 'gloves'];

export function computeTierCappedFailReduction(equipped, bracketTier) {
  const wornArmorTiers = ARMOR_SLOTS.map((slot) => equipped[slot]).filter((item) => item && !item.durability?.broken).map((item) => item.tier);
  const isFullMatchingSet = wornArmorTiers.length === ARMOR_SLOTS.length && wornArmorTiers.every((t) => t === wornArmorTiers[0]);

  let total = 0;
  for (const slot of ARMOR_SLOTS) {
    const item = equipped[slot];
    if (!item || item.durability?.broken) continue;
    const itemTier = item.tier;
    if (itemTier < bracketTier) continue; 
    const effect = (item.effects ?? []).find((e) => e.type === EFFECT_TYPES.CHAMPION_FAIL_REDUCTION);
    if (!effect) continue;

    if (itemTier > bracketTier && !isFullMatchingSet) {
      total += CHAMPION_FAIL_REDUCTION_BY_TIER[bracketTier] ?? 0;
    } else {
      total += effect.value;
    }
  }
  return total;
}

export const CHAMPION_LEVEL_MAX_REDUCTION_PERCENT = 5;
export const CHAMPION_MAXED_XP_REDUCTION_PERCENT = 5;

export const CHAMPION_MIN_FAIL_CHANCE_PERCENT = 20;
export const CHAMPION_MAX_FAIL_CHANCE_PERCENT = 99;

export const CHAMPION_TARGET_RTP = 0.95;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const ADVENTURE_MAX_FASTER_TRIPS_PERCENT = 25;

export function computeLoadoutEffects(equipped) {
  const totals = getEquipmentEffectTotals(equipped);
  return {
    failReduction: totals[EFFECT_TYPES.CHAMPION_FAIL_REDUCTION].total,
    wagerBoost: totals[EFFECT_TYPES.CHAMPION_WAGER_BOOST].total,
    fasterTrips: clamp(totals[EFFECT_TYPES.ADVENTURE_FASTER_TRIPS].total, 0, ADVENTURE_MAX_FASTER_TRIPS_PERCENT),
    betterEncounters: totals[EFFECT_TYPES.ADVENTURE_BETTER_ENCOUNTERS].total,
    saferTrips: totals[EFFECT_TYPES.ADVENTURE_SAFER_TRIPS].total,
    gladiatorXpBonus: totals[EFFECT_TYPES.GLADIATOR_XP_BONUS].total,
  };
}

export function isUniversalArmorItem(item) {
  return item.source === 'starter' || item.source === 'owner' || item.source === 'god_equipment';
}

function armorQualifies(item, relevantSource) {
  return Boolean(item) && !item.durability?.broken && (item.source === relevantSource || isUniversalArmorItem(item));
}

export function doesSetQualifyForContext(setEquipped, relevantSource) {
  return ARMOR_SLOTS.some((slot) => armorQualifies(setEquipped[slot], relevantSource));
}

function buildArmorWaterfall(allSets, homeSetName, relevantSource) {
  const otherSetName = GEAR_SETS_FOR_EFFECTS.find((s) => s !== homeSetName && s !== 'misc');

  for (const [setName, universalOnly] of [[homeSetName, false], ['misc', false], [otherSetName, true]]) {
    const setEquipped = allSets[setName];
    const virtual = {};
    let anyQualified = false;
    for (const slot of ARMOR_SLOTS) {
      const item = setEquipped[slot];
      const qualifies = universalOnly ? Boolean(item) && !item.durability?.broken && isUniversalArmorItem(item) : armorQualifies(item, relevantSource);
      virtual[slot] = qualifies ? item : null;
      if (qualifies) anyQualified = true;
    }
    if (anyQualified) {
      return { virtual, contributingInstanceIds: ARMOR_SLOTS.map((s) => virtual[s]?.instanceId).filter(Boolean) };
    }
  }
  return { virtual: { helmet: null, chest: null, legs: null, boots: null, gloves: null }, contributingInstanceIds: [] };
}

const GEAR_SETS_FOR_EFFECTS = ['arena', 'adventure', 'misc'];

export function getGladiatorXpWeaponMaxSource(allSets) {
  let best = { value: 0, setName: null };
  for (const setName of GEAR_SETS_FOR_EFFECTS) {
    for (const { label, item } of getEquipmentContributions(allSets[setName])) {
      if (!WEAPON_LABELS.has(label) || item.durability?.broken) continue;
      const effect = (item.effects ?? []).find((e) => e.type === EFFECT_TYPES.GLADIATOR_XP_BONUS);
      if (effect && effect.value > best.value) best = { value: effect.value, setName };
    }
  }
  return best;
}

function computeUniversalWeaponMax(allSets) {
  const best = {
    [EFFECT_TYPES.GLADIATOR_XP_BONUS]: { value: 0, instanceId: null },
    [EFFECT_TYPES.CHAMPION_WAGER_BOOST]: { value: 0, instanceId: null },
  };
  for (const setName of GEAR_SETS_FOR_EFFECTS) {
    for (const { label, item } of getEquipmentContributions(allSets[setName])) {
      if (!WEAPON_LABELS.has(label) || item.durability?.broken) continue;
      for (const effect of item.effects ?? []) {
        if (!(effect.type in best)) continue;
        if (effect.value > best[effect.type].value) {
          best[effect.type] = { value: effect.value, instanceId: item.instanceId };
        }
      }
    }
  }
  return best;
}

export function computeChampionGladiatorXpBonus(allSets) {
  const { virtual: armorVirtual } = buildArmorWaterfall(allSets, 'arena', 'arena_store');
  const armorXpBonus = ARMOR_SLOTS.reduce((sum, slot) => {
    const item = armorVirtual[slot];
    if (!item) return sum;
    const effect = (item.effects ?? []).find((e) => e.type === EFFECT_TYPES.GLADIATOR_XP_BONUS);
    return sum + (effect?.value ?? 0);
  }, 0);
  const weaponMax = computeUniversalWeaponMax(allSets);
  return armorXpBonus + weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].value;
}

export function computeChampionCrossSetEffects(allSets, bracketRarity) {
  const { virtual: armorVirtual, contributingInstanceIds: armorInstanceIds } = buildArmorWaterfall(allSets, 'arena', 'arena_store');
  const failReduction = computeTierCappedFailReduction(armorVirtual, bracketRarity);
  const armorXpBonus = ARMOR_SLOTS.reduce((sum, slot) => {
    const item = armorVirtual[slot];
    if (!item) return sum;
    const effect = (item.effects ?? []).find((e) => e.type === EFFECT_TYPES.GLADIATOR_XP_BONUS);
    return sum + (effect?.value ?? 0);
  }, 0);

  const weaponMax = computeUniversalWeaponMax(allSets);
  const contributingInstanceIds = new Set(armorInstanceIds);
  if (weaponMax[EFFECT_TYPES.CHAMPION_WAGER_BOOST].instanceId) contributingInstanceIds.add(weaponMax[EFFECT_TYPES.CHAMPION_WAGER_BOOST].instanceId);
  if (weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].instanceId) contributingInstanceIds.add(weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].instanceId);

  return {
    failReduction,
    wagerBoost: weaponMax[EFFECT_TYPES.CHAMPION_WAGER_BOOST].value,
    gladiatorXpBonus: armorXpBonus + weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].value,
    contributingInstanceIds,
  };
}

export function computeAdventureCrossSetEffects(allSets) {
  const { virtual: armorVirtual, contributingInstanceIds: armorInstanceIds } = buildArmorWaterfall(allSets, 'adventure', 'adventure');

  const sums = { fasterTrips: 0, betterEncounters: 0, saferTrips: 0, armorXpBonus: 0 };
  for (const slot of ARMOR_SLOTS) {
    const item = armorVirtual[slot];
    if (!item) continue;
    for (const effect of item.effects ?? []) {
      if (effect.type === EFFECT_TYPES.ADVENTURE_FASTER_TRIPS) sums.fasterTrips += effect.value;
      else if (effect.type === EFFECT_TYPES.ADVENTURE_BETTER_ENCOUNTERS) sums.betterEncounters += effect.value;
      else if (effect.type === EFFECT_TYPES.ADVENTURE_SAFER_TRIPS) sums.saferTrips += effect.value;
      else if (effect.type === EFFECT_TYPES.GLADIATOR_XP_BONUS) sums.armorXpBonus += effect.value;
    }
  }

  const weaponMax = computeUniversalWeaponMax(allSets);
  const contributingInstanceIds = new Set(armorInstanceIds);
  if (weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].instanceId) contributingInstanceIds.add(weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].instanceId);

  return {
    fasterTrips: clamp(sums.fasterTrips, 0, ADVENTURE_MAX_FASTER_TRIPS_PERCENT),
    betterEncounters: sums.betterEncounters,
    saferTrips: sums.saferTrips,
    gladiatorXpBonus: sums.armorXpBonus + weaponMax[EFFECT_TYPES.GLADIATOR_XP_BONUS].value,
    contributingInstanceIds,
  };
}

export function computeChampionLevelReduction(level) {
  const clampedLevel = Math.max(1, Math.min(MAX_GLADIATOR_LEVEL, level));
  return ((clampedLevel - 1) / (MAX_GLADIATOR_LEVEL - 1)) * CHAMPION_LEVEL_MAX_REDUCTION_PERCENT;
}

export function computeChampionOdds(bracket, totalFailReduction) {
  const failChance = clamp(bracket.difficultyScore - totalFailReduction, CHAMPION_MIN_FAIL_CHANCE_PERCENT, CHAMPION_MAX_FAIL_CHANCE_PERCENT);
  const rawWinChance = 100 - failChance;
  const winChance = Math.min(bracket.maxWinChancePercent, rawWinChance);
  return { winChance: winChance / 100, failChance: (100 - winChance) / 100 };
}

export function computeChampionPayoutMultiplier(winChanceDecimal) {
  return CHAMPION_TARGET_RTP / winChanceDecimal;
}

export function computeDuelWinChance() {
  return 0.5;
}
