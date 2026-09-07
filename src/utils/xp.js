export const MAX_GLADIATOR_LEVEL = 99;

export const MAX_GLADIATOR_XP = 200_000_000;

const XP_TABLE = (() => {
  const table = [0]; 
  let cumulative = 0;
  for (let level = 1; level < MAX_GLADIATOR_LEVEL; level++) {
    cumulative += Math.floor(level + 300 * Math.pow(2, level / 7));
    table.push(Math.floor(cumulative / 4));
  }
  return table; 
})();

export function xpForLevel(level) {
  const clamped = Math.max(1, Math.min(MAX_GLADIATOR_LEVEL, level));
  return XP_TABLE[clamped - 1];
}

export function levelForXp(xp) {
  let level = 1;
  for (let l = MAX_GLADIATOR_LEVEL; l >= 1; l--) {
    if (xp >= XP_TABLE[l - 1]) {
      level = l;
      break;
    }
  }
  return level;
}

const ADVENTURE_TARGET_BREAKPOINTS = [
  { level: 1, target: 3 },
  { level: 20, target: 5 },
  { level: 21, target: 5 },
  { level: 40, target: 8 },
  { level: 41, target: 8 },
  { level: 60, target: 12 },
  { level: 61, target: 12 },
  { level: 80, target: 18 },
  { level: 81, target: 18 },
  { level: 90, target: 25 },
  { level: 91, target: 25 },
  { level: 97, target: 35 },
  { level: 98, target: 42 }, 
];

export function adventuresNeededForLevel(level) {
  const clamped = Math.max(1, Math.min(MAX_GLADIATOR_LEVEL - 1, level));
  const points = ADVENTURE_TARGET_BREAKPOINTS;
  if (clamped <= points[0].level) return points[0].target;
  if (clamped >= points[points.length - 1].level) return points[points.length - 1].target;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (clamped >= a.level && clamped <= b.level) {
      if (a.level === b.level) return a.target;
      const t = (clamped - a.level) / (b.level - a.level);
      return a.target + (b.target - a.target) * t;
    }
  }
  return points[points.length - 1].target; 
}

export function adventureXpForLevel(level) {
  if (level >= MAX_GLADIATOR_LEVEL) {
    
    
    level = MAX_GLADIATOR_LEVEL - 1;
  }
  const gap = xpForLevel(level + 1) - xpForLevel(level);
  const target = adventuresNeededForLevel(level);
  return Math.max(1, Math.ceil(gap / target));
}

const ADVENTURE_FAIL_CHANCE_AT_LEVEL_1 = 0.65;
const ADVENTURE_FAIL_CHANCE_ZERO_AT_LEVEL = 50;

export function adventureFailChance(level) {
  if (level >= ADVENTURE_FAIL_CHANCE_ZERO_AT_LEVEL) return 0;
  const clamped = Math.max(1, level);
  const t = (ADVENTURE_FAIL_CHANCE_ZERO_AT_LEVEL - clamped) / (ADVENTURE_FAIL_CHANCE_ZERO_AT_LEVEL - 1);
  return ADVENTURE_FAIL_CHANCE_AT_LEVEL_1 * t;
}

export function getLevelProgress(xp) {
  const level = levelForXp(xp);
  const currentLevelXp = xpForLevel(level);
  if (level >= MAX_GLADIATOR_LEVEL) {
    return { level, xp, xpIntoLevel: xp - currentLevelXp, xpForNextLevel: null, xpToNextLevel: null, progress: 1 };
  }
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = xp - currentLevelXp;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  return {
    level,
    xp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: nextLevelXp - xp,
    progress: xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 1,
  };
}
