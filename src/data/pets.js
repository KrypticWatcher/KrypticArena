import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PET_IMAGES_DIR = path.join(__dirname, '../assets/pets');

export const PET_PRICE_BY_RARITY = {
  common: 1000,
  uncommon: 3000,
  rare: 20000,
  epic: 60000,
  legendary: 200000,
  mythical: 750000,
};

export const PET_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];

export const BASE_STAT_RANGE_BY_RARITY = {
  common: [8, 15],
  uncommon: [12, 20],
  rare: [18, 28],
  epic: [26, 38],
  legendary: [36, 50],
  mythical: [48, 65],
  
  
  
  
  
  
  
  
  
  
  nethercharged: [65, 65],
};

export const BOSS_TIER_STAT_RANGE = [55, 72];

export const STAT_CAP_BY_RARITY = {
  common: 75,
  uncommon: 80,
  rare: 90,
  epic: 100,
  legendary: 110,
  mythical: 125,
  
  
  
  nethercharged: 125,
};

export const GODLY_STAT_CAP = STAT_CAP_BY_RARITY.mythical + 5;

export const STAT_POINTS_PER_LEVEL = 4;

export const STAT_FOCUS_CANDIES = [
  { id: 'focus_attack', name: 'Attack Candy', stats: ['attack'], weights: { attack: 4, defense: 0, vitality: 0, speed: 0 } },
  { id: 'focus_defense', name: 'Defense Candy', stats: ['defense'], weights: { attack: 0, defense: 4, vitality: 0, speed: 0 } },
  { id: 'focus_vitality', name: 'Vitality Candy', stats: ['vitality'], weights: { attack: 0, defense: 0, vitality: 4, speed: 0 } },
  { id: 'focus_speed', name: 'Speed Candy', stats: ['speed'], weights: { attack: 0, defense: 0, vitality: 0, speed: 4 } },

  { id: 'focus_attack_defense', name: 'Attack-Defense Candy', stats: ['attack', 'defense'], weights: { attack: 2, defense: 2, vitality: 0, speed: 0 } },
  { id: 'focus_attack_vitality', name: 'Attack-Vitality Candy', stats: ['attack', 'vitality'], weights: { attack: 2, defense: 0, vitality: 2, speed: 0 } },
  { id: 'focus_attack_speed', name: 'Attack-Speed Candy', stats: ['attack', 'speed'], weights: { attack: 2, defense: 0, vitality: 0, speed: 2 } },
  { id: 'focus_defense_vitality', name: 'Defense-Vitality Candy', stats: ['defense', 'vitality'], weights: { attack: 0, defense: 2, vitality: 2, speed: 0 } },
  { id: 'focus_defense_speed', name: 'Defense-Speed Candy', stats: ['defense', 'speed'], weights: { attack: 0, defense: 2, vitality: 0, speed: 2 } },
  { id: 'focus_vitality_speed', name: 'Vitality-Speed Candy', stats: ['vitality', 'speed'], weights: { attack: 0, defense: 0, vitality: 2, speed: 2 } },

  { id: 'focus_attack_defense_vitality', name: 'Attack-Defense-Vitality Candy', stats: ['attack', 'defense', 'vitality'], weights: { attack: 2, defense: 1, vitality: 1, speed: 0 } },
  { id: 'focus_attack_defense_speed', name: 'Attack-Defense-Speed Candy', stats: ['attack', 'defense', 'speed'], weights: { attack: 2, defense: 1, vitality: 0, speed: 1 } },
  { id: 'focus_attack_vitality_speed', name: 'Attack-Vitality-Speed Candy', stats: ['attack', 'vitality', 'speed'], weights: { attack: 2, defense: 0, vitality: 1, speed: 1 } },
  { id: 'focus_defense_vitality_speed', name: 'Defense-Vitality-Speed Candy', stats: ['defense', 'vitality', 'speed'], weights: { attack: 0, defense: 2, vitality: 1, speed: 1 } },

  { id: 'focus_balanced', name: 'Balanced Candy', stats: ['attack', 'defense', 'vitality', 'speed'], weights: { attack: 1, defense: 1, vitality: 1, speed: 1 } },
];

export function getStatFocusCandy(id) {
  return STAT_FOCUS_CANDIES.find((c) => c.id === id) ?? null;
}

export const BASE_WIN_RATE_BY_RARITY = {
  common: 0.45,
  uncommon: 0.47,
  rare: 0.5,
  epic: 0.53,
  legendary: 0.56,
  mythical: 0.6,
  
  
  
  
  nethercharged: 0.6,
};

export const WIN_RATE_CAP = 0.85;

export const RECOVERY_DAYS_BY_RARITY = {
  common: 5,
  uncommon: 4,
  rare: 3,
  epic: 2,
  legendary: 1,
  mythical: 0.5,
  nethercharged: 0.5, 
};

export const ADVENTURE_CANDY_DROP_RATE = 12;
export const ADVENTURE_CANDY_DROP_MIN = 2;
export const ADVENTURE_CANDY_DROP_MAX = 3;

export const ADVENTURE_PET_DROP_RATE_BY_RARITY = {
  common: 100,
  uncommon: 150,
  rare: 250,
  epic: 450,
  legendary: 700,
  mythical: 1000,
};

export const BOSS_PET_DROP_RATE = 1200;

export const QUEST_PET_DROP_RATE = 100;

export const SHINY_ABILITY = {
  underworlds_wealth: {
    id: 'underworlds_wealth',
    name: "Underworld's Wealth",
    category: 'Multi-effect (domain-wide)',
    type: 'domain_bonus',
    description: 'Bonus arena coins and gambling currency on Adventures, plus a boosted drop rate for equipment tied to this domain.',
  },
  underworlds_toll: {
    id: 'underworlds_toll',
    name: "Underworld's Toll",
    category: 'Boss Challenge',
    type: 'boss_cost_reduction',
    description: 'Reduces the cost of your next Boss Challenge.',
  },
  first_blood: {
    id: 'first_blood',
    name: 'First Blood',
    category: 'Boss Challenge',
    type: 'boss_win_bonus_arena',
    description: 'Bonus arena coins on a Boss Challenge win.',
  },
  ferrymans_due: {
    id: 'ferrymans_due',
    name: "Ferryman's Due",
    category: 'Boss Challenge',
    type: 'boss_loss_refund',
    description: 'Refunds a portion of the cost on a Boss Challenge loss.',
  },
  reapers_mercy: {
    id: 'reapers_mercy',
    name: "Reaper's Mercy",
    category: 'Adventure / Elixir',
    type: 'fail_elixir_save',
    description: "Chance to not lose your Elixir on a failed Adventure.",
  },
  second_wind: {
    id: 'second_wind',
    name: 'Second Wind',
    category: 'Beast Pits PvP',
    type: 'pvp_survive_fatal',
    description: 'Survive a fatal hit in a Beast Pits PvP fight and recover 25% HP. Once per fight.',
  },
  apex_predator: {
    id: 'apex_predator',
    name: 'Apex Predator',
    category: 'Beast Pits PvP',
    type: 'pvp_first_hit_double',
    description: 'Your first attack in a Beast Pits PvP fight does double damage.',
  },
  grave_robber: {
    id: 'grave_robber',
    name: 'Grave Robber',
    category: 'Equipment',
    type: 'bonus_equipment_drop',
    description: 'Chance at a bonus piece of equipment on Adventures.',
  },
  hoarders_instinct: {
    id: 'hoarders_instinct',
    name: "Hoarder's Instinct",
    category: 'Currency (Adventure)',
    type: 'bonus_arena',
    description: 'Bonus arena coins on Adventures.',
  },
  battlefield_scavenger: {
    id: 'battlefield_scavenger',
    name: 'Battlefield Scavenger',
    category: 'Adventure / Elixir',
    type: 'bonus_elixir_find',
    description: 'Chance to find a bonus Elixir on an Adventure.',
  },
  opportunist: {
    id: 'opportunist',
    name: 'Opportunist',
    category: 'Adventure / Elixir',
    type: 'next_elixir_discount',
    description: "Reduces your next Adventure's Elixir cost.",
  },
  circling_patience: {
    id: 'circling_patience',
    name: 'Circling Patience',
    category: 'Adventure / Time',
    type: 'adventure_time_reduction',
    description: "Shaves time off your current Adventure's remaining duration.",
  },
  blood_in_the_water: {
    id: 'blood_in_the_water',
    name: 'Blood in the Water',
    category: 'Champion',
    type: 'champion_payout_boost',
    description: 'Boosts your Champion payout multiplier on your next fight.',
  },
  steady_nerve: {
    id: 'steady_nerve',
    name: 'Steady Nerve',
    category: 'Champion',
    type: 'champion_odds_boost',
    description: 'Slightly improves your Champion win odds on your next fight.',
  },
  determined_little_guy: {
    id: 'determined_little_guy',
    name: 'Determined Little Guy',
    category: 'Currency (Adventure)',
    type: 'bonus_gambling',
    description: 'Flat chance at bonus gambling currency on an Adventure.',
  },
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  nethercharged_roar: {
    id: 'nethercharged_roar',
    name: 'Nethercharged Roar',
    category: 'Unique (Valtharion only)',
    type: 'nethercharged_roar',
    description:
      "10% more arena coins and gambling currency from Adventures and Boss Challenges. In Beast Pits PvP, a 10% chance to roar before its first attack, boosting that turn's damage.",
  },
};

export const PET_SPECIES = [
  
  { id: 'fox', location: 'the wanderer\'s trail', growthWeights: { attack: 1, defense: 0, vitality: 1, speed: 2 }, name: 'Fox', defaultName: 'Vulpes', rarity: 'common', source: 'quest', icon: 'VulpesPetIcon.png', image: 'VulpesPet.png' },
  { id: 'hawk', location: 'the windswept causeway', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Hawk', defaultName: 'Aquila', rarity: 'uncommon', source: 'skilling', line: 'open', icon: 'AquilaPetIcon.png', image: 'AquilaPet.png' },
  { id: 'stormcat', location: 'the racing cliffs', growthWeights: { attack: 1, defense: 0, vitality: 1, speed: 2 }, name: 'Stormcat', defaultName: 'Ferox', rarity: 'rare', source: 'slay', line: 'open', icon: 'FeroxPetIcon.png', image: 'FeroxPet.png' },
  { id: 'griffon_cub', location: 'the skyward pass', growthWeights: { attack: 2, defense: 0, vitality: 1, speed: 1 }, name: 'Griffon Cub', defaultName: 'Gryphus', rarity: 'epic', source: 'slay', line: 'open', icon: 'GryphusPetIcon.png', image: 'GryphusPet.png' },
  { id: 'gale_serpent', shinyIcon: 'ShinyVentusIcon.png', shinyImage: 'ShinyVentusPet.png', location: 'the herald\'s crossing', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Gale Serpent', defaultName: 'Ventus', rarity: 'legendary', source: 'slay', line: 'open', icon: 'VentusPetIcon.png', image: 'VentusPet.png' }, 
  { id: 'tempest_phoenix', shinyAbilityId: 'second_wind', shinyIcon: 'ShinyFulmenPetIcon.png', shinyImage: 'ShinyFulmenPet.png', location: 'the cloudspire threshold', growthWeights: { attack: 1, defense: 0, vitality: 2, speed: 1 }, name: 'Tempest Phoenix', defaultName: 'Fulmen', rarity: 'mythical', source: 'slay', line: 'open', icon: 'FulmenPetIcon.png', image: 'FulmenPet.png' },

  
  { id: 'wolf', location: 'the thicket\'s edge', growthWeights: { attack: 2, defense: 0, vitality: 1, speed: 1 }, name: 'Wolf', defaultName: 'Lupus', rarity: 'common', source: 'slay', line: 'wild', icon: 'LupusPetIcon.png', image: 'LupusPet.png' },
  { id: 'bear', location: 'the stalking grounds', growthWeights: { attack: 2, defense: 2, vitality: 0, speed: 0 }, name: 'Bear', defaultName: 'Ursus', rarity: 'uncommon', source: 'slay', line: 'wild', icon: 'UrsusPetIcon.png', image: 'UrsusPet.png' },
  { id: 'night_panther', location: 'the bramblefang wilds', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Night Panther', defaultName: 'Umbra', rarity: 'rare', source: 'slay', line: 'wild', icon: 'UmbraPetIcon.png', image: 'UmbraPet.png' },
  { id: 'direwolf', shinyIcon: 'ShinyAtroxIcon.png', shinyImage: 'ShinyAtroxPet.png', location: 'the moonlit hunting vale', growthWeights: { attack: 2, defense: 0, vitality: 2, speed: 0 }, name: 'Direwolf', defaultName: 'Atrox', rarity: 'epic', source: 'slay', line: 'wild', icon: 'AtroxPetIcon.png', image: 'AtroxPet.png' }, 
  { id: 'arena_lion', location: 'the wolfmother\'s den', growthWeights: { attack: 2, defense: 0, vitality: 1, speed: 1 }, name: 'Arena Lion', defaultName: 'Leo', rarity: 'legendary', source: 'slay', line: 'wild', icon: 'LeoPetIcon.png', image: 'LeoPet.png' }, 
  { id: 'moonfang_bear', shinyAbilityId: 'apex_predator', shinyIcon: 'ShinyNoctisPetIcon.png', shinyImage: 'ShinyNoctisPet.png', location: 'diana\'s sacred grove', growthWeights: { attack: 2, defense: 1, vitality: 1, speed: 0 }, name: 'Moonfang Bear', defaultName: 'Noctis', rarity: 'mythical', source: 'slay', line: 'wild', icon: 'NoctisPetIcon.png', image: 'NoctisPet.png' },

  
  { id: 'raven', shinyAbilityId: 'battlefield_scavenger', shinyIcon: 'ShinyCorvusPetIcon.png', shinyImage: 'ShinyCorvusPet.png', location: 'the debtor\'s hollow', growthWeights: { attack: 0, defense: 1, vitality: 1, speed: 2 }, name: 'Raven', defaultName: 'Corvus', rarity: 'common', source: 'skilling', line: 'ruins', icon: 'CorvusPetIcon.png', image: 'CorvusPet.png' },
  { id: 'jackal', shinyAbilityId: 'opportunist', shinyIcon: 'ShinyNoxPetIcon.png', shinyImage: 'ShinyNoxPet.png', location: 'the oathbreaker\'s reach', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Jackal', defaultName: 'Nox', rarity: 'uncommon', source: 'skilling', line: 'ruins', icon: 'NoxPetIcon.png', image: 'NoxPet.png' },
  { id: 'carrion_vulture', shinyAbilityId: 'circling_patience', shinyIcon: 'ShinyRuinaPetIcon.png', shinyImage: 'ShinyRuinaPet.png', location: 'the hollow crown', growthWeights: { attack: 0, defense: 2, vitality: 2, speed: 0 }, name: 'Carrion Vulture', defaultName: 'Ruina', rarity: 'rare', source: 'skilling', line: 'ruins', icon: 'RuinaPetIcon.png', image: 'RuinaPet.png' },
  { id: 'shade_hound', shinyAbilityId: 'blood_in_the_water', shinyIcon: 'ShinyVindexPetIcon.png', shinyImage: 'ShinyVindexPet.png', location: 'the weighing stones', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Shade Hound', defaultName: 'Vindex', rarity: 'epic', source: 'skilling', line: 'ruins', icon: 'VindexPetIcon.png', image: 'VindexPet.png' },
  { id: 'wraithwing', shinyAbilityId: 'grave_robber', shinyIcon: 'ShinyOccasusPetIcon.png', shinyImage: 'ShinyOccasusPet.png', location: 'the broken throne', growthWeights: { attack: 0, defense: 0, vitality: 2, speed: 2 }, name: 'Wraithwing', defaultName: 'Occasus', rarity: 'legendary', source: 'skilling', line: 'ruins', icon: 'OccasusPetIcon.png', image: 'OccasusPet.png' },
  { id: 'ruin_wyrm', shinyAbilityId: 'hoarders_instinct', shinyIcon: 'ShinyUltorPetIcon.png', shinyImage: 'ShinyUltorPet.png', location: 'the court of retribution', growthWeights: { attack: 2, defense: 0, vitality: 2, speed: 0 }, name: 'Ruin Wyrm', defaultName: 'Ultor', rarity: 'mythical', source: 'skilling', line: 'ruins', icon: 'UltorPetIcon.png', image: 'UltorPet.png' },

  
  
  
  
  
  
  { id: 'cerberus', godlyGlowColor: '#39ff6a', shinyGodlyGlowColor: '#ffe066', shinyAbilityId: 'underworlds_toll', shinyIcon: 'ShinyLilCerbyPetIcon.png', shinyImage: 'ShinyLilCerbyPet.png', growthWeights: { attack: 2, defense: 2, vitality: 0, speed: 0 }, name: 'Cerberus', defaultName: 'Lil Cerby', rarity: 'mythical', source: 'boss', bossId: 'cerberus', icon: 'LilCerbyIcon.png', image: 'LilCerbyPet.png' },
  { id: 'varkyros_pet', godlyGlowColor: '#ff4d4d', shinyGodlyGlowColor: '#4d94ff', shinyAbilityId: 'first_blood', shinyIcon: 'ShinyLilVarkyPetIcon.png', shinyImage: 'ShinyLilVarkyPet.png', growthWeights: { attack: 1, defense: 1, vitality: 1, speed: 1 }, name: 'Varkyros', defaultName: 'Lil Varky', rarity: 'mythical', source: 'boss', bossId: 'varkyros', icon: 'LilVarkyIcon.png', image: 'LilVarkyPet.png' },
  { id: 'acheron_pet', godlyGlowColor: '#39ff6a', shinyGodlyGlowColor: '#f5f5f5', shinyAbilityId: 'ferrymans_due', shinyIcon: 'ShinyArcheronPetIcon.png', shinyImage: 'ShinyArcheronPet.png', growthWeights: { attack: 1, defense: 1, vitality: 2, speed: 0 }, name: 'Acheron', defaultName: 'Lil Archy', rarity: 'mythical', source: 'boss', bossId: 'acheron', icon: 'ArcheronPetIcon.png', image: 'ArcheronPet.png' },
  
  
  
  { id: 'thanatos_pet', godlyGlowColor: '#b266ff', shinyGodlyGlowColor: '#40e0d0', shinyAbilityId: 'reapers_mercy', shinyIcon: 'ShinyThanatosPetIcon.png', shinyImage: 'ShinyThanatosPet.png', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Thanatos', defaultName: 'Lil Than', rarity: 'mythical', source: 'boss', bossId: 'thanatos', icon: 'ThanatosPetIcon.png', image: 'ThanatosPet.png' },
  { id: 'hades_pet', godlyGlowColor: '#39ff6a', shinyGodlyGlowColor: '#7fdbff', shinyAbilityId: 'underworlds_wealth', shinyIcon: 'ShinyHadesPetIcon.png', shinyImage: 'ShinyHadesPet.png', growthWeights: { attack: 1, defense: 1, vitality: 1, speed: 1 }, name: 'Hades', defaultName: 'Lil Hades', rarity: 'mythical', source: 'boss', bossId: 'hades', icon: 'HadesPetIcon.png', image: 'HadesPet.png' },

  
  
  { id: 'farm_dog', shinyAbilityId: 'determined_little_guy', shinyIcon: 'ShinyFidusPetIcon.png', shinyImage: 'ShinyFidusPet.png', growthWeights: { attack: 4, defense: 0, vitality: 0, speed: 0 }, name: 'Corgi', defaultName: 'Fidus', rarity: 'common', source: 'store', icon: 'FidusPetIcon.png', image: 'FidusPet.png' }, 
  { id: 'barn_cat', growthWeights: { attack: 2, defense: 0, vitality: 0, speed: 2 }, name: 'Barn Cat', defaultName: 'Felix', rarity: 'common', source: 'store', icon: 'FelixPetIcon.png', image: 'FelixPet.png' },
  { id: 'messenger_pigeon', shinyAbilityId: 'steady_nerve', shinyIcon: 'ShinyCelerPetIcon.png', shinyImage: 'ShinyCelerPet.png', growthWeights: { attack: 0, defense: 0, vitality: 1, speed: 3 }, name: 'Messenger Pigeon', defaultName: 'Celer', rarity: 'uncommon', source: 'store', icon: 'CelerPetIcon.png', image: 'CelerPet.png' },
  { id: 'guard_goose', growthWeights: { attack: 1, defense: 3, vitality: 0, speed: 0 }, name: 'Guard Goose', defaultName: 'Custos', rarity: 'uncommon', source: 'store', icon: 'CustosPetIcon.png', image: 'CustosPet.png' },
  
  
  
  
  
  {
    id: 'rooster',
    
    
    growthWeights: { attack: 3, defense: 0, vitality: 0, speed: 1 },
    name: 'Rooster',
    defaultName: 'Pugnax',
    rarity: 'uncommon',
    source: 'store',
    icon: 'PugnaxPetIcon.png',
    image: 'PugnaxPet.png',
    description:
      "A scrappy, sharp-spurred bird with a temper it's never lost. Old " +
      'arena records mention its bloodline fighting in pits long before ' +
      'the Beast Pits ever existed — some gladiators swear its descendants ' +
      'still turn up there today, older name and all.',
  },

  
  
  
  
  
  
  
  
  
  
  
  {
    id: 'voidstorm_lion',
    shinyAbilityId: 'nethercharged_roar',
    
    
    growthWeights: { attack: 2, defense: 0, vitality: 1, speed: 1 },
    name: 'Voidstorm Lion',
    defaultName: 'Valtharion',
    rarity: 'nethercharged',
    source: 'unique',
    untradeable: true,
    icon: 'ValtharionPetIcon.png',
    image: 'ValtharionPet.png',
  },
];

export function getPetSpecies(id) {
  return PET_SPECIES.find((s) => s.id === id) ?? null;
}

export function getPetSpeciesForLine(line) {
  return PET_SPECIES.filter((s) => s.source === 'adventure' && s.line === line);
}

export function getPetSpeciesForLocation(location) {
  return PET_SPECIES.find((s) => s.source === 'adventure' && s.location === location) ?? null;
}

export function getStorePetSpecies() {
  return PET_SPECIES.filter((s) => s.source === 'store');
}

export function getBossPetSpecies() {
  return PET_SPECIES.filter((s) => s.source === 'boss');
}

export function getQuestPetSpecies() {
  return PET_SPECIES.filter((s) => s.source === 'quest');
}

export function getRandomBotFightOpponentSpecies() {
  const eligible = PET_SPECIES.filter((s) => s.source !== 'boss' && s.source !== 'unique');
  return eligible[Math.floor(Math.random() * eligible.length)];
}

export function getPetIconPath(species) {
  if (!species?.icon) return null;
  return path.join(PET_IMAGES_DIR, species.icon);
}

export function getBossGlowColor(species, isShiny) {
  if (!species?.godlyGlowColor) return null;
  return (isShiny && species.shinyGodlyGlowColor) || species.godlyGlowColor;
}

export function getPetImagePath(species) {
  if (!species?.image) return null;
  return path.join(PET_IMAGES_DIR, species.image);
}
