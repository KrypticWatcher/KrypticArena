export const BUILD_TIER_COUNT = 11;

export const RESOURCE_LEVEL_BY_BUILD_TIER = { 1: 1, 2: 1, 3: 5, 4: 10, 5: 20, 6: 35, 7: 45, 8: 55, 9: 65, 10: 75, 11: 85 };

export const BUILD_MINUTES_BY_TIER = { 1: 10, 2: 20, 3: 35, 4: 55, 5: 180, 6: 270, 7: 420, 8: 600, 9: 840, 10: 1200, 11: 2160 };

export const CONSTRUCTION_XP_BY_TIER = {
  1: 2250, 2: 4500, 3: 7900, 4: 12400, 5: 40500,
  6: 60800, 7: 94500, 8: 135000, 9: 189000, 10: 270000, 11: 486600,
};

export const PASSIVE_RATE_PER_HOUR_BY_TIER = {
  1: 0, 2: 0, 3: 0, 4: 0, 5: 10, 6: 15, 7: 20, 8: 25, 9: 30, 10: 60, 11: 110,
};
export const PASSIVE_ACCRUAL_CAP_HOURS = 24;

export const MATERIAL_AMOUNT_BY_TIER = {
  primary: { 1: 40, 2: 70, 3: 120, 4: 200, 5: 320, 6: 420, 7: 550, 8: 700, 9: 900, 10: 1150, 11: 1800 },
  secondary: { 1: 24, 2: 42, 3: 72, 4: 120, 5: 192, 6: 252, 7: 330, 8: 420, 9: 540, 10: 690, 11: 1080 },
  tertiary: { 1: 14, 2: 25, 3: 42, 4: 70, 5: 112, 6: 147, 7: 193, 8: 245, 9: 315, 10: 403, 11: 630 },
};

export const TIERED_TOOL_QTY = 1;

export const FLAVOR_TOOL_QTY_BY_TIER = { 1: 2, 2: 3, 3: 5, 4: 8, 5: 12, 6: 16, 7: 22, 8: 28, 9: 36, 10: 46, 11: 60 };

export const LODGE_BOW_REQUIREMENTS_BY_TIER = {
  1: [{ name: 'Oak Bow', qty: 3 }],
  2: [{ name: 'Oak Bow', qty: 5 }],
  3: [{ name: 'Elm Bow', qty: 5 }],
  4: [{ name: 'Willow Bow', qty: 6 }],
  5: [{ name: 'Ash Bow', qty: 8 }],
  6: [{ name: 'Oak Bow', qty: 10 }, { name: 'Elm Bow', qty: 10 }],
  7: [{ name: 'Willow Bow', qty: 14 }, { name: 'Ash Bow', qty: 14 }],
  8: [{ name: 'Oak Bow', qty: 20 }, { name: 'Elm Bow', qty: 20 }],
  9: [{ name: 'Willow Bow', qty: 28 }, { name: 'Ash Bow', qty: 28 }],
  10: [{ name: 'Oak Bow', qty: 24 }, { name: 'Elm Bow', qty: 24 }, { name: 'Willow Bow', qty: 24 }, { name: 'Ash Bow', qty: 24 }],
  11: [{ name: 'Oak Bow', qty: 40 }, { name: 'Elm Bow', qty: 40 }, { name: 'Willow Bow', qty: 40 }, { name: 'Ash Bow', qty: 40 }],
};

export const GATHERING_BONUS_BY_TIER = {
  1: { tripTimePercent: 5 },
  2: { yieldPercent: 5 },
  3: { yieldPercent: 5 },
  4: { tripTimePercent: 5 },
  5: { yieldPercent: 10 },
  6: { yieldPercent: 5 },
  7: { tripTimePercent: 5 },
  8: { yieldPercent: 5 },
  9: { tripTimePercent: 5 },
  10: { yieldPercent: 10 },
  11: { yieldPercent: 15, tripTimePercent: 10 },
};
export const PRODUCTION_BONUS_BY_TIER = {
  1: { tripTimePercent: 5 },
  2: { costReductionPercent: 5 },
  3: { costReductionPercent: 5 },
  4: { tripTimePercent: 5 },
  5: { costReductionPercent: 10 },
  6: { costReductionPercent: 5 },
  7: { tripTimePercent: 5 },
  8: { costReductionPercent: 5 },
  9: { tripTimePercent: 5 },
  10: { costReductionPercent: 10 },
  11: { costReductionPercent: 15, tripTimePercent: 10 },
};

export const PROJECTS = {
  quarry: {
    name: 'Reinforced Quarry',
    skillId: 'mining',
    resourceCategories: ['ore', 'log'],
    bonusTable: GATHERING_BONUS_BY_TIER,
    tieredTool: { skill: 'mining' },
  },
  forge: {
    name: 'Master Forge',
    skillId: 'smithing',
    resourceCategories: ['bar', 'ore', 'log'],
    bonusTable: PRODUCTION_BONUS_BY_TIER,
  },
  lumberyard: {
    name: 'Grand Lumberyard',
    skillId: 'woodcutting',
    resourceCategories: ['log'],
    bonusTable: GATHERING_BONUS_BY_TIER,
    tieredTool: { skill: 'woodcutting' },
  },
  fletchers_bench: {
    name: "Fletcher's Workbench",
    skillId: 'fletching',
    resourceCategories: ['arrowhead', 'log', 'feather'],
    bonusTable: PRODUCTION_BONUS_BY_TIER,
    flavorTool: { name: 'Knife' },
  },
  dock: {
    name: 'Fishing Dock',
    skillId: 'fishing',
    resourceCategories: ['raw_fish', 'log'],
    bonusTable: GATHERING_BONUS_BY_TIER,
    tieredTool: { skill: 'fishing' },
  },
  kitchen: {
    name: 'Grand Kitchen',
    skillId: 'cooking',
    resourceCategories: ['cooked_fish', 'log', 'herb'],
    bonusTable: PRODUCTION_BONUS_BY_TIER,
  },
  apothecary: {
    name: 'Apothecary',
    skillId: 'herbalism',
    resourceCategories: ['potion', 'herb', 'log'],
    bonusTable: PRODUCTION_BONUS_BY_TIER,
  },
  lodge: {
    name: "Hunter's Lodge",
    skillId: 'hunting',
    resourceCategories: ['hide', 'log'],
    bonusTable: GATHERING_BONUS_BY_TIER,
    flavorTool: { name: 'Skinning Knife' },
    bowTribute: true,
  },
  workshop: {
    name: "Crafter's Workshop",
    skillId: 'crafting',
    resourceCategories: ['crafting_input', 'tanned_hide', 'log'],
    bonusTable: PRODUCTION_BONUS_BY_TIER,
    flavorTool: { name: 'Needle' },
  },
  greenhouse: {
    name: 'Grand Greenhouse',
    skillId: 'farming',
    resourceCategories: ['herb', 'log'],
    bonusTable: GATHERING_BONUS_BY_TIER,
    flavorTool: { name: 'Compost Bag' },
  },
};

export const MAX_CONCURRENT_BUILDS = 4;
