export const CHAMPION_BRACKETS = [
  {
    id: 'bracket_1',
    name: 'Bracket I',
    order: 1,
    rarity: 'common',
    difficultyScore: 65,
    maxWinChancePercent: 60,
    unlockLevel: 1,
    maxWager: 2000,
    xpModifier: 0,
  },
  {
    id: 'bracket_2',
    name: 'Bracket II',
    order: 2,
    rarity: 'uncommon',
    difficultyScore: 85,
    maxWinChancePercent: 50,
    unlockLevel: 10,
    maxWager: 5000,
    xpModifier: 0,
  },
  {
    id: 'bracket_3',
    name: 'Bracket III',
    order: 3,
    rarity: 'rare',
    difficultyScore: 105,
    maxWinChancePercent: 40,
    unlockLevel: 25,
    maxWager: 15000,
    xpModifier: 5,
  },
  {
    id: 'bracket_4',
    name: 'Bracket IV',
    order: 4,
    rarity: 'epic',
    difficultyScore: 130,
    maxWinChancePercent: 30,
    unlockLevel: 45,
    maxWager: 50000,
    xpModifier: 10,
  },
  {
    id: 'bracket_5',
    name: 'Bracket V',
    order: 5,
    rarity: 'legendary',
    difficultyScore: 150,
    maxWinChancePercent: 20,
    unlockLevel: 65,
    maxWager: 150000,
    xpModifier: 15,
  },
  {
    id: 'bracket_6',
    name: 'Bracket VI',
    order: 6,
    rarity: 'mythical',
    difficultyScore: 170,
    maxWinChancePercent: 10,
    unlockLevel: 90,
    maxWager: 500000,
    xpModifier: 25,
  },
];

export function getBracket(bracketId) {
  return CHAMPION_BRACKETS.find((b) => b.id === bracketId) ?? null;
}

export function getUnlockedBrackets(level) {
  return CHAMPION_BRACKETS.filter((b) => level >= b.unlockLevel);
}

export function getHighestUnlockedBracket(level) {
  const unlocked = getUnlockedBrackets(level);
  return unlocked[unlocked.length - 1]; 
}

export function getBracketMaxWager(settings, bracket) {
  return settings[`champion_bracket_${bracket.order}_max_wager`] ?? bracket.maxWager;
}

export function getBracketXpModifier(settings, bracket) {
  return settings[`champion_bracket_${bracket.order}_xp_bonus`] ?? bracket.xpModifier;
}

export function getBracketBaseXp(settings, bracket) {
  return settings[`champion_bracket_${bracket.order}_base_xp`] ?? 0;
}
