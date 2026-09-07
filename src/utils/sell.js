import { isCollectable } from '../data/items.js';

export const FLAT_SELL_VALUE_BY_TIER = {
  1: 8,
  5: 14,
  10: 30,
  20: 85,
  35: 152,
  45: 225,
  55: 352,
  65: 550,
  75: 745,
  85: 1010,
  92: 1250,
};

const GOD_TIER_FLAT_SELL_VALUE = 8000;

const RESOURCE_FLAT_SELL_VALUE_BY_TIER = {
  1: 100,
  5: 145,
  10: 209,
  20: 302,
  35: 437,
  45: 632,
  55: 915,
  65: 1323,
  75: 1913,
  85: 2766,
  92: 4000,
};

const SELL_RULES = [
  
  
  
  
  
  
  
  { matches: (item) => Array.isArray(item.stats) && item.type === 'collectable', flatArena: 20 },
  
  { matches: (item) => item.source === 'arena_store' && isCollectable(item), percent: 0.25 },
  
  { matches: (item) => item.source === 'arena_store' && item.type === 'equipment', percent: 0.35 },
  
  
  
  
  
  
  
  
  
  
  
  {
    matches: (item) => ['adventure', 'starter', 'god_equipment'].includes(item.source) && item.type === 'equipment',
    flatArenaByTier: FLAT_SELL_VALUE_BY_TIER,
  },
  
  
  
  
  
  
  {
    matches: (item) => ['melee_drop', 'melee_craft', 'ranged_drop', 'ranged_craft', 'mage_drop'].includes(item.source) && item.type === 'equipment',
    flatArenaByTier: RESOURCE_FLAT_SELL_VALUE_BY_TIER,
  },
  
  
  
  
  {
    matches: (item) => typeof item.source === 'string' && item.source.startsWith('god_') && item.source !== 'god_equipment' && item.type === 'equipment',
    flatArena: GOD_TIER_FLAT_SELL_VALUE,
  },
  
  
  
  
  {
    matches: (item) =>
      item.type === 'resource' &&
      ['ore', 'bar', 'log', 'raw_fish', 'cooked_fish', 'herb', 'potion', 'hide', 'feather', 'fruit', 'arrow', 'arrowhead', 'seed'].includes(item.category),
    flatArenaByTier: RESOURCE_FLAT_SELL_VALUE_BY_TIER,
  },
  
  
  
  
  
  
  {
    matches: (item) => item.category === 'crafting_input',
    percent: 0.2,
    minArena: 1,
  },
  
  
  
  
  
  {
    matches: (item) => item.type === 'tool' && item.recipe,
    flatArenaByTier: RESOURCE_FLAT_SELL_VALUE_BY_TIER,
  },
  
  
  
  
  {
    matches: (item) => item.type === 'tool' && ['starter_tool', 'required_basic'].includes(item.category),
    percent: 0.35,
  },
];

function getSellRule(item) {
  return SELL_RULES.find((rule) => rule.matches(item)) ?? null;
}

export function isSellable(item) {
  return getSellRule(item) !== null;
}

const DURABILITY_PRICE_TIERS = [
  { min: 91, multiplier: 1.0 },
  { min: 81, multiplier: 0.95 },
  { min: 71, multiplier: 0.85 },
  { min: 61, multiplier: 0.75 },
  { min: 51, multiplier: 0.65 },
  { min: 41, multiplier: 0.55 },
  { min: 31, multiplier: 0.45 },
  { min: 21, multiplier: 0.35 },
  { min: 11, multiplier: 0.25 },
  { min: 1, multiplier: 0.15 },
  { min: 0, multiplier: 0.01 },
];

export function getDurabilityPriceMultiplier(durabilityPercent) {
  const tier = DURABILITY_PRICE_TIERS.find((t) => durabilityPercent >= t.min);
  return tier.multiplier;
}

export function getSellValue(item, durabilityPercent = 100) {
  const rule = getSellRule(item);
  if (!rule) return null;
  const durabilityMultiplier = isCollectable(item) ? 1 : getDurabilityPriceMultiplier(durabilityPercent);

  if (rule.flatArena != null) {
    return { arena: rule.flatArena, cash: 0 };
  }

  if (rule.flatArenaByTier) {
    const base = rule.flatArenaByTier[item.tier] ?? 0;
    return { arena: Math.floor(base * durabilityMultiplier), cash: 0 };
  }

  
  
  
  
  
  
  
  const usesArenaPriceField = isCollectable(item) && item.type !== 'resource';
  const arenaCost = usesArenaPriceField ? (item.priceArena ?? 0) : (item.price ?? 0);
  const cashCost = usesArenaPriceField ? (item.price ?? 0) : 0;
  const computedArena = Math.floor(arenaCost * rule.percent * durabilityMultiplier);
  return {
    arena: rule.minArena != null && arenaCost > 0 ? Math.max(rule.minArena, computedArena) : computedArena,
    cash: Math.floor(cashCost * rule.percent * durabilityMultiplier),
  };
}
