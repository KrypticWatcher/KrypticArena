import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOSS_IMAGES_DIR = path.join(__dirname, '../assets/boss-images');

export const BOSS_DOMAINS = {
  hades: {
    id: 'hades',
    godName: 'Hades',
    domainName: 'The Underworld',
    bosses: [
      {
        id: 'varkyros',
        imageFile: 'varkyros.png',
        order: 1,
        tier: 65,
        name: 'Varkyros',
        title: 'General of the Underworld',
        lore:
          "Once a feared commander among mortals, Varkyros was chosen by Hades in death to lead the countless warriors bound to the Underworld. " +
          'Those who dare enter his master\'s domain must first cross the legions under his command, and Varkyros has never willingly allowed a living soul to pass.',
        requiresCombatStyle: 'mage',
        namedItemIds: [15007, 15018], 
        dropsCombatStyle: 'melee',
        equipmentBoostPercent: 10,
        deathChanceFloor: 6,
        killsToUnlock: 0,
        unlockedFrom: null,
        godTierIdPrefix: 'god_varkyros',
      },
      {
        id: 'cerberus',
        imageFile: 'cerberus.png',
        order: 2,
        tier: 55,
        name: 'Cerberus',
        title: 'Warden of the Dead',
        lore:
          "The monstrous guardian of Hades' realm, Cerberus stands between the wandering dead and the deeper reaches of the Underworld, " +
          'ensuring neither the living enter nor the dead escape. To continue deeper, the gladiator must overcome the beast whose loyalty to the God of the Underworld is absolute.',
        requiresCombatStyle: 'melee',
        namedItemIds: [18062, 16014], 
        dropsCombatStyle: 'ranged',
        equipmentBoostPercent: 8,
        deathChanceFloor: 4,
        killsToUnlock: 100,
        unlockedFrom: 'varkyros',
        godTierIdPrefix: 'god_cerberus',
      },
      {
        id: 'acheron',
        imageFile: 'acheron.png',
        order: 3,
        tier: 75,
        name: 'Acheron',
        title: "Hades' Eternal Champion",
        lore:
          'Acheron was once among the greatest warriors of the mortal world, his victories earning the attention of Hades himself, who claimed him as ' +
          'his eternal champion after death. Where armies and beasts have failed, Acheron waits to remind intruders why even the greatest mortal warriors eventually belong to the Underworld.',
        requiresCombatStyle: 'ranged',
        namedItemIds: [13005], 
        arrowId: 23008, 
        dropsCombatStyle: 'melee',
        equipmentBoostPercent: 12,
        deathChanceFloor: 8,
        killsToUnlock: 200,
        unlockedFrom: 'cerberus',
        godTierIdPrefix: 'god_acheron',
      },
      {
        id: 'thanatos',
        imageFile: 'thanatos.png',
        order: 4,
        tier: 85,
        name: 'Thanatos',
        title: 'Hand of Hades',
        lore:
          "Thanatos is Hades' divine executioner, called upon when a soul has defied death for far too long. By defeating those who guarded the path " +
          'before him, the gladiator has become more than an intruder — and Thanatos has been commanded to ensure they venture no farther.',
        requiresCombatStyle: 'melee',
        namedItemIds: [11006], 
        dropsCombatStyle: 'mage',
        equipmentBoostPercent: 14,
        deathChanceFloor: 10,
        killsToUnlock: 300,
        unlockedFrom: 'acheron',
        godTierIdPrefix: 'god_thanatos',
      },
      {
        id: 'hades',
        imageFile: 'hades.png',
        order: 5,
        tier: 92,
        name: 'Hades',
        title: 'God of the Underworld',
        lore:
          'The gladiator continues onward expecting to eventually find the throne of Hades, unaware that every battle, every fallen guardian, and every ' +
          'step deeper into the Underworld has been watched. But no mortal simply walks into the presence of Hades: before the gladiator can find him, the ' +
          'God of the Underworld finds them — appearing not out of anger, but fascination. A living warrior has overcome everything meant to keep mortals ' +
          'from his presence, and Hades himself intends to discover whether their legend is deserved.',
        requiresCombatStyle: 'any', 
        namedItemIds: null, 
        anyStyleTierRequirement: 85, 
        dropsCombatStyle: 'all',
        equipmentBoostPercent: 16,
        deathChanceFloor: 14,
        killsToUnlock: 500,
        unlockedFrom: 'thanatos',
        godTierIdPrefix: 'god_hades',
        isFinalBoss: true,
      },
    ],
  },
};

const ARENA_ENTRY_COST_BY_ORDER = [212500, 318750, 656250, 815000, 3056250];

export function getBossChallengeCost(bossOrder) {
  return {
    gambling: 0,
    arena: ARENA_ENTRY_COST_BY_ORDER[bossOrder - 1],
  };
}

export function getAllDomains() {
  return Object.values(BOSS_DOMAINS);
}

export function getDomain(domainId) {
  return BOSS_DOMAINS[domainId] ?? null;
}

export function getBoss(domainId, bossId) {
  return getDomain(domainId)?.bosses.find((b) => b.id === bossId) ?? null;
}

export function getBossImagePath(bossId) {
  const found = findBossAnywhere(bossId);
  if (!found?.boss.imageFile) return null;
  return path.join(BOSS_IMAGES_DIR, found.boss.imageFile);
}

export function findBossAnywhere(bossId) {
  for (const domain of getAllDomains()) {
    const boss = domain.bosses.find((b) => b.id === bossId);
    if (boss) return { domain, boss };
  }
  return null;
}
