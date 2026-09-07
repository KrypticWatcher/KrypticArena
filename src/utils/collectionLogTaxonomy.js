import { ITEMS } from '../data/items.js';
import { PET_SPECIES } from '../data/pets.js';
import { SHINY_ITEM_ID_PREFIX } from './pets.js';

export const CL_CATEGORIES = [
  { id: 'mob_equipment', label: 'Mob Equipment' },
  { id: 'creatables', label: 'Creatables' },
  { id: 'skilling', label: 'Skilling' },
  { id: 'boss_varkyros', label: 'Varkyros' },
  { id: 'boss_cerberus', label: 'Cerberus' },
  { id: 'boss_acheron', label: 'Acheron' },
  { id: 'boss_thanatos', label: 'Thanatos' },
  { id: 'boss_hades', label: 'Hades' },
  { id: 'arena', label: 'Arena' },
  { id: 'misc', label: 'Misc' },
  
  
  
  
  { id: 'all_pets', label: 'All Pets' },
];

const MISC_COLLECTABLE_IDS = new Set(['ticket_stub_grand_melee', 'laurel_of_the_undying']);

const SKILL_BY_RESOURCE_CATEGORY = {
  ore: 'mining',
  bar: 'smithing',
  arrowhead: 'smithing',
  log: 'woodcutting',
  arrow: 'fletching',
  raw_fish: 'fishing',
  cooked_fish: 'cooking',
  fruit: 'farming',
  seed: 'farming',
  herb: 'herbalism',
  potion: 'herbalism',
  hide: 'hunting',
  feather: 'hunting',
  crafting_input: 'crafting',
  tanned_hide: 'crafting',
};

const SKILLING_SKILL_ORDER = [
  'mining', 'smithing', 'woodcutting', 'fletching', 'fishing',
  'cooking', 'farming', 'herbalism', 'hunting', 'crafting', 'construction',
];

const SKILLING_SECTION_RANK = { resource: 0, tool: 1, outfit: 2 };

const CREATABLE_SOURCE_ORDER = ['melee_craft', 'ranged_craft'];

export function getCollectionLogCategory(item) {
  if (item.type === 'equipment') {
    if (item.source === 'god_equipment' || /^god_(varkyros|cerberus|acheron|thanatos|hades)$/.test(item.source)) {
      
      
      
      
      
      
      
      
      const bossId = item.source === 'god_equipment' ? item.id.split('_')[1] : item.source.slice('god_'.length);
      return `boss_${bossId}`;
    }
    if (item.source === 'arena_store') return 'arena';
    if (item.source === 'melee_drop' || item.source === 'ranged_drop' || item.source === 'mage_drop') return 'mob_equipment';
    if (item.source === 'melee_craft' || item.source === 'ranged_craft') return 'creatables';
    return null; 
  }
  if (item.type === 'resource') {
    return SKILL_BY_RESOURCE_CATEGORY[item.category] ? 'skilling' : null;
  }
  if (item.type === 'tool') {
    
    
    
    return item.category === 'special_tool' ? 'skilling' : null;
  }
  if (item.type === 'outfit') {
    return 'skilling';
  }
  if (item.type === 'collectable') {
    if (item.source === 'champion' || item.source === 'adventure') return 'misc';
    if (MISC_COLLECTABLE_IDS.has(item.id)) return 'misc';
    return null; 
  }
  return null;
}

function skillingSortKey(item) {
  if (item.type === 'resource') {
    const skillId = SKILL_BY_RESOURCE_CATEGORY[item.category];
    return [SKILLING_SKILL_ORDER.indexOf(skillId), SKILLING_SECTION_RANK.resource, item.tier ?? 0];
  }
  if (item.type === 'tool') {
    return [SKILLING_SKILL_ORDER.indexOf(item.skill), SKILLING_SECTION_RANK.tool, 0];
  }
  
  return [SKILLING_SKILL_ORDER.indexOf(item.skill), SKILLING_SECTION_RANK.outfit, 0];
}

function creatablesSortKey(item) {
  return [CREATABLE_SOURCE_ORDER.indexOf(item.source), item.tier ?? 0];
}

function mobEquipmentSortKey(item) {
  return [item.tier ?? 0];
}

function compareSortKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function getPetCollectionLogCategory(species) {
  if (species.source === 'boss') return `boss_${species.bossId}`;
  return null;
}

function petAsCollectionLogItem(species) {
  return { id: species.id, name: species.name, rarity: species.rarity, isPet: true, petSpecies: species };
}

function petAsShinyCollectionLogItem(species) {
  return {
    id: `${SHINY_ITEM_ID_PREFIX}${species.id}`,
    name: `Shiny ${species.name}`,
    rarity: species.rarity,
    isPet: true,
    petSpecies: { ...species, icon: species.shinyIcon },
  };
}

function petCollectionLogItemsFor(species) {
  return species.shinyIcon ? [petAsCollectionLogItem(species), petAsShinyCollectionLogItem(species)] : [petAsCollectionLogItem(species)];
}

export function getItemsInCategory(categoryId) {
  let equipmentItems = ITEMS.filter((item) => getCollectionLogCategory(item) === categoryId);
  if (categoryId === 'skilling') {
    equipmentItems = [...equipmentItems].sort((a, b) => compareSortKeys(skillingSortKey(a), skillingSortKey(b)));
  } else if (categoryId === 'creatables') {
    equipmentItems = [...equipmentItems].sort((a, b) => compareSortKeys(creatablesSortKey(a), creatablesSortKey(b)));
  } else if (categoryId === 'mob_equipment') {
    equipmentItems = [...equipmentItems].sort((a, b) => compareSortKeys(mobEquipmentSortKey(a), mobEquipmentSortKey(b)));
  }
  const relevantSpecies =
    categoryId === 'all_pets' ? PET_SPECIES.filter((species) => species.source !== 'unique') : PET_SPECIES.filter((species) => getPetCollectionLogCategory(species) === categoryId);
  const petItems = relevantSpecies.flatMap(petCollectionLogItemsFor);
  return [...equipmentItems, ...petItems];
}

export function getAllTrackedItems() {
  const equipmentItems = ITEMS.filter((item) => getCollectionLogCategory(item) !== null);
  const petItems = PET_SPECIES.filter((species) => species.source !== 'unique').flatMap(petCollectionLogItemsFor);
  return [...equipmentItems, ...petItems];
}
