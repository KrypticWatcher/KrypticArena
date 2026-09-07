import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { equipInstance, getEquipment, getUnequippedInstances, getAllEquipmentSets, equipArrows } from './inventory.js';
import { normalizeQuotes } from './textMatch.js';
import { EconomyError } from './economy.js';
import { SLOTS, getEquippableItemsForSlot, compareItemsForDisplay, ITEMS } from '../data/items.js';
import { formatEquipmentLines } from './format.js';
import { getGladiatorProfile } from './gladiator.js';
import { getActiveLabel } from './activeSession.js';
import { renderGearImage } from './gearImage.js';
import { hasFlag } from './permissions.js';
import { isUniversalArmorItem } from './effects.js';

export const SET_LABEL = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };
export const SLOT_LABEL = {
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  boots: 'Boots',
  gloves: 'Gloves',
  main_hand: 'Main Hand',
  off_hand: 'Off Hand',
};

export function blockIfEquipBusy(guildId, userId, displayName) {
  const profile = getGladiatorProfile(guildId, userId, displayName);
  if (profile.onAdventure) {
    return `**${profile.name}** can't change their equipment right now — they're on an adventure.`;
  }
  if (getActiveLabel(guildId, userId) === 'a Champion fight') {
    return `**${profile.name}** can't change their equipment right now — they're fighting in the arena.`;
  }
  return null;
}

function rarityRank(item) {
  return item.tier;
}

function compareCandidates(a, b) {
  const rarityDiff = rarityRank(b.item) - rarityRank(a.item);
  if (rarityDiff !== 0) return rarityDiff;
  if (b.durability !== a.durability) return b.durability - a.durability;
  return compareItemsForDisplay(a.item, b.item);
}

const ADVENTURE_SOURCES = new Set([
  'melee_drop', 'melee_craft', 'ranged_drop', 'ranged_craft', 'mage_drop',
  'god_acheron', 'god_cerberus', 'god_hades', 'god_thanatos', 'god_varkyros',
]);

function matchesSourceForSet(item, sourceFilterSetName) {
  if (item.type !== 'equipment') return false;
  if (sourceFilterSetName === 'adventure') return ADVENTURE_SOURCES.has(item.source) || isUniversalArmorItem(item);
  if (sourceFilterSetName === 'arena') return item.source === 'arena_store' || isUniversalArmorItem(item);
  return false;
}

function candidatesForSlot(guildId, userId, slot, gladiatorLevel, equippedItem, sourceFilterSetName, combatStyleFilter = null) {
  const items = getEquippableItemsForSlot(slot).filter(
    (i) => (i.levelRequirement ?? 0) <= gladiatorLevel && matchesSourceForSet(i, sourceFilterSetName) && (!combatStyleFilter || i.combatStyle === combatStyleFilter)
  );
  const candidates = [];
  for (const item of items) {
    for (const inst of getUnequippedInstances(guildId, userId, item.id)) {
      candidates.push({ item, instanceId: inst.instanceId, durability: inst.durability });
    }
  }
  
  
  
  
  
  if (equippedItem && matchesSourceForSet(equippedItem, sourceFilterSetName) && (!combatStyleFilter || equippedItem.combatStyle === combatStyleFilter)) {
    candidates.push({ item: equippedItem, instanceId: equippedItem.instanceId, durability: equippedItem.durability.current });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

const STAT_TO_STYLE = {
  stab: { combatStyle: 'melee', weaponSubtype: 'stab' },
  slash: { combatStyle: 'melee', weaponSubtype: 'slash' },
  crush: { combatStyle: 'melee', weaponSubtype: 'crush' },
  range: { combatStyle: 'ranged', weaponSubtype: null },
  magic: { combatStyle: 'mage', weaponSubtype: null },
};

function planBisForStyle(guildId, userId, setName, gladiatorLevel, sourceFilterSetName, styleFilter, weaponSubtypeFilter) {
  const equipped = getEquipment(guildId, userId, setName);
  const plan = {};
  let score = 0; 

  for (const slot of ['helmet', 'chest', 'legs', 'boots', 'gloves']) {
    const best = candidatesForSlot(guildId, userId, slot, gladiatorLevel, equipped[slot], sourceFilterSetName, styleFilter)[0];
    if (best && best.instanceId !== equipped[slot]?.instanceId) {
      plan[slot] = best.instanceId;
      score += best.item.tier ?? 0;
    } else if (equipped[slot] && equipped[slot].combatStyle === styleFilter) {
      score += equipped[slot].tier ?? 0;
    }
  }

  const mainHandItems = getEquippableItemsForSlot('main_hand').filter(
    (i) =>
      (i.levelRequirement ?? 0) <= gladiatorLevel &&
      matchesSourceForSet(i, sourceFilterSetName) &&
      (!styleFilter || i.combatStyle === styleFilter) &&
      (!weaponSubtypeFilter || i.weaponSubtype === weaponSubtypeFilter)
  );
  const twoHanded = [];
  const oneHandedMain = [];
  for (const item of mainHandItems) {
    const bucket = item.twoHanded ? twoHanded : oneHandedMain;
    for (const inst of getUnequippedInstances(guildId, userId, item.id)) {
      bucket.push({ item, instanceId: inst.instanceId, durability: inst.durability });
    }
  }
  const currentMain = equipped.main_hand;
  if (
    currentMain &&
    matchesSourceForSet(currentMain, sourceFilterSetName) &&
    (!styleFilter || currentMain.combatStyle === styleFilter) &&
    (!weaponSubtypeFilter || currentMain.weaponSubtype === weaponSubtypeFilter)
  ) {
    (currentMain.twoHanded ? twoHanded : oneHandedMain).push({
      item: currentMain,
      instanceId: currentMain.instanceId,
      durability: currentMain.durability.current,
    });
  }
  twoHanded.sort(compareCandidates);
  oneHandedMain.sort(compareCandidates);
  const offHand = candidatesForSlot(guildId, userId, 'off_hand', gladiatorLevel, equipped.off_hand, sourceFilterSetName, styleFilter);

  const bestTwoHanded = twoHanded[0] ?? null;
  const bestOneHandedMain = oneHandedMain[0] ?? null;
  const bestOffHand = offHand[0] ?? null;

  const twoHandedScore = bestTwoHanded ? rarityRank(bestTwoHanded.item) * 2 : -1;
  const comboScore = (bestOneHandedMain ? rarityRank(bestOneHandedMain.item) : -1) + (bestOffHand ? rarityRank(bestOffHand.item) : -1);

  if (bestTwoHanded && twoHandedScore >= comboScore) {
    if (bestTwoHanded.instanceId !== currentMain?.instanceId || equipped.off_hand?.instanceId !== bestTwoHanded.instanceId) {
      plan.main_hand = bestTwoHanded.instanceId;
    }
    score += Math.max(twoHandedScore, 0);
  } else {
    if (bestOneHandedMain && bestOneHandedMain.instanceId !== currentMain?.instanceId) {
      plan.main_hand = bestOneHandedMain.instanceId;
    }
    if (bestOffHand && bestOffHand.instanceId !== equipped.off_hand?.instanceId) {
      plan.off_hand = bestOffHand.instanceId;
    }
    score += Math.max(comboScore, 0);
  }

  return { plan, score };
}

function planBisAcrossStyles(guildId, userId, setName, gladiatorLevel, sourceFilterSetName) {
  let bestPlan = {};
  let bestScore = -1;
  for (const style of ['melee', 'ranged', 'mage']) {
    const { plan, score } = planBisForStyle(guildId, userId, setName, gladiatorLevel, sourceFilterSetName, style, null);
    if (score > bestScore) {
      bestScore = score;
      bestPlan = plan;
    }
  }
  return bestPlan;
}

function planBisForSource(guildId, userId, setName, gladiatorLevel, sourceFilterSetName, stat = null) {
  if (!stat) {
    return planBisAcrossStyles(guildId, userId, setName, gladiatorLevel, sourceFilterSetName);
  }
  const styleFilter = STAT_TO_STYLE[stat]?.combatStyle ?? null;
  const weaponSubtypeFilter = STAT_TO_STYLE[stat]?.weaponSubtype ?? null;
  const { plan } = planBisForStyle(guildId, userId, setName, gladiatorLevel, sourceFilterSetName, styleFilter, weaponSubtypeFilter);
  return plan;
}

export function planBis(guildId, userId, setName, gladiatorLevel, stat = null) {
  if (setName !== 'adventure' && setName !== 'arena') {
    throw new EconomyError('Skilling gear doesn\'t support BIS — equip your tools and outfit manually.');
  }
  return planBisForSource(guildId, userId, setName, gladiatorLevel, setName, stat);
}

export function allEquippableCatalogItems() {
  const seen = new Set();
  const all = [];
  for (const slot of SLOTS) {
    for (const item of getEquippableItemsForSlot(slot)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
    }
  }
  return all;
}

export function resolveItemByName(guildId, userId, raw) {
  const typed = normalizeQuotes(raw.trim().toLowerCase());
  const catalog = allEquippableCatalogItems();
  const exactCatalog = catalog.filter((i) => normalizeQuotes(i.name.toLowerCase()) === typed);
  const catalogPool = exactCatalog.length > 0 ? exactCatalog : catalog.filter((i) => normalizeQuotes(i.name.toLowerCase()).includes(typed));

  const owned = [];
  for (const item of catalogPool) {
    for (const inst of getUnequippedInstances(guildId, userId, item.id)) {
      owned.push({ item, instanceId: inst.instanceId, durability: inst.durability });
    }
  }
  if (owned.length === 0) return null;

  const distinctItemIds = new Set(owned.map((o) => o.item.id));
  if (distinctItemIds.size > 1) {
    const names = [...new Set(owned.map((o) => o.item.name))];
    throw new EconomyError(`**${raw}** matches more than one item you own (${names.join(', ')}) — type the full name more specifically.`);
  }
  owned.sort((a, b) => b.durability - a.durability);
  return owned[0];
}

export function planFreeTextItems(guildId, userId, rawList, gladiatorLevel) {
  const tokens = rawList.split(',').map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) {
    throw new EconomyError('`items:` needs at least one item name.');
  }
  const plan = {};
  const resolvedNames = [];
  let arrowPlan = null;
  for (const token of tokens) {
    const quantityMatch = token.match(/^(\d+)\s+(.+)$/);
    if (quantityMatch) {
      const quantity = Number(quantityMatch[1]);
      const arrowName = normalizeQuotes(quantityMatch[2].trim().toLowerCase());
      const arrowItem = ITEMS.find((i) => i.category === 'arrow' && normalizeQuotes(i.name.toLowerCase()) === arrowName);
      if (arrowItem) {
        arrowPlan = { itemId: arrowItem.id, quantity };
        resolvedNames.push(`${quantity}x ${arrowItem.name}`);
        continue;
      }
    }

    const match = resolveItemByName(guildId, userId, token);
    if (!match) {
      throw new EconomyError(`Couldn't find **${token}** among your equippable items — check the spelling, or use \`item:\` for a menu.`);
    }
    if (match.item.levelRequirement > gladiatorLevel) {
      throw new EconomyError(`**${match.item.name}** requires Gladiator level **${match.item.levelRequirement}** — yours is **${gladiatorLevel}**.`);
    }
    plan[match.item.slot] = match.instanceId;
    resolvedNames.push(match.item.name);
  }
  return { plan, resolvedNames, arrowPlan };
}

export function applyPlan(guildId, userId, setName, plan, gladiatorLevel, arrowPlan = null) {
  const forcedUnequips = new Set();
  const movedFromSets = new Set();
  for (const [slot, instanceId] of Object.entries(plan)) {
    const { forcedUnequip, movedFromSet } = equipInstance(guildId, userId, setName, slot, instanceId, gladiatorLevel);
    if (forcedUnequip) forcedUnequips.add(forcedUnequip.name);
    if (movedFromSet) movedFromSets.add(movedFromSet);
  }
  if (arrowPlan) {
    equipArrows(guildId, userId, setName, arrowPlan.itemId, arrowPlan.quantity);
  }
  return { forcedUnequips, movedFromSets };
}

export async function replyWithSet(interaction, setName, { title, footerNote } = {}) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const equipped = getEquipment(guildId, userId, setName);
  const textFormat = interaction.options.getBoolean('text_format');

  if (textFormat) {
    const lines = formatEquipmentLines(equipped);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(title ?? `✅ ${SET_LABEL[setName]} updated`)
      .setDescription(lines.join('\n'));
    if (footerNote) embed.setFooter({ text: footerNote });
    return interaction.reply({ embeds: [embed] });
  }

  const themed = hasFlag(userId, 'T6');
  const allSets = getAllEquipmentSets(guildId, userId);
  const png = await renderGearImage(interaction.user.username, equipped, { themed, setLabel: SET_LABEL[setName], allSets });
  const content = [title, footerNote].filter(Boolean).join('\n');

return interaction.reply({
  content: content || undefined,
  files: [new AttachmentBuilder(png, { name: 'gear.png' })],
});
}

export function footerNoteFor(forcedUnequips, movedFromSets) {
  const parts = [];
  if (forcedUnequips.size > 0) parts.push(`Unequipped (two-handed): ${[...forcedUnequips].join(', ')}.`);
  if (movedFromSets.size > 0) parts.push(`Moved from your ${[...movedFromSets].map((s) => SET_LABEL[s]).join('/')} set.`);
  return parts.join(' ') || undefined;
}
