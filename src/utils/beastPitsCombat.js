const HP_BASE = 40;
const HP_PER_VITALITY = 1.4;

export function computeMaxHp(vitalityStat) {
  return Math.round(HP_BASE + vitalityStat * HP_PER_VITALITY);
}

const DAMAGE_RANGE_WIDTH = 16;
const DAMAGE_BASE_OFFSET = 5;
const DAMAGE_ATTACK_SCALE = 0.3;

export function computeDamageRange(attackStat) {
  const min = Math.floor(attackStat * DAMAGE_ATTACK_SCALE) + DAMAGE_BASE_OFFSET;
  return { min, max: min + DAMAGE_RANGE_WIDTH };
}

const DEFENSE_K = 130;

export function applyDefenseReduction(rawDamage, defenseStat) {
  const reduction = defenseStat / (defenseStat + DEFENSE_K);
  return Math.max(1, Math.round(rawDamage * (1 - reduction)));
}

const DODGE_CHANCE_PER_SPEED = 0.002;
const DODGE_CHANCE_CAP = 0.3;
const CRIT_CHANCE_PER_SPEED = 0.0015;
const CRIT_CHANCE_CAP = 0.2;
const CRIT_MULTIPLIER = 1.5;

export function computeDodgeChance(speedStat) {
  return Math.min(DODGE_CHANCE_CAP, speedStat * DODGE_CHANCE_PER_SPEED);
}

export function computeCritChance(speedStat) {
  return Math.min(CRIT_CHANCE_CAP, speedStat * CRIT_CHANCE_PER_SPEED);
}

export function rollFirstTurn(speedA, speedB) {
  const total = speedA + speedB;
  if (total <= 0) return Math.random() < 0.5 ? 'a' : 'b';
  return Math.random() < speedA / total ? 'a' : 'b';
}

export const FRENZY_DURATION_TURNS = 2; 
export const FRENZY_MISS_CHANCE = 0.45; 
export const FRENZY_DAMAGE_MULTIPLIER = 2;

export const PVP_TURN_TIMEOUT_MS = 30_000; 

export const FATIGUE_STAT_MULTIPLIER = 0.9;

export const GUARD_DAMAGE_REDUCTION = 0.5;

export function isFatiguedRound(roundNumber, totalRounds) {
  return roundNumber > totalRounds - 2;
}

export function resolveAttack({
  attackerAttack,
  attackerSpeed,
  defenderDefense,
  defenderSpeed,
  isFrenzied = false,
  isFatiguedAttacker = false,
  isFatiguedDefender = false,
  isDefenderGuarding = false,
}) {
  if (isFrenzied && Math.random() < FRENZY_MISS_CHANCE) {
    return { hit: false, dodged: false, frenzyMissed: true, crit: false, damage: 0 };
  }

  const dodgeChance = computeDodgeChance(defenderSpeed);
  if (Math.random() < dodgeChance) {
    return { hit: false, dodged: true, frenzyMissed: false, crit: false, damage: 0 };
  }

  const effectiveAttack = isFatiguedAttacker ? attackerAttack * FATIGUE_STAT_MULTIPLIER : attackerAttack;
  const effectiveDefense = isFatiguedDefender ? defenderDefense * FATIGUE_STAT_MULTIPLIER : defenderDefense;

  
  
  
  
  
  
  
  
  
  const { min, max } = computeDamageRange(effectiveAttack);
  let damage = min + Math.floor(Math.random() * (max - min + 1));

  const crit = Math.random() < computeCritChance(attackerSpeed);
  if (crit) damage = Math.round(damage * CRIT_MULTIPLIER);
  if (isFrenzied) damage = Math.round(damage * FRENZY_DAMAGE_MULTIPLIER);

  damage = applyDefenseReduction(damage, effectiveDefense);
  if (isDefenderGuarding) damage = Math.max(1, Math.round(damage * (1 - GUARD_DAMAGE_REDUCTION)));

  return { hit: true, dodged: false, frenzyMissed: false, crit, damage };
}
