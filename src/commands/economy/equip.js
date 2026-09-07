import { SlashCommandBuilder } from 'discord.js';
import { equipInstance, unequipAll, getLoadouts, loadLoadout, resolveInstance, GEAR_SETS, getUnequippedInstances, equipArrows, getOwnedQuantity } from '../../utils/inventory.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { EconomyError } from '../../utils/economy.js';
import { compareItemsForDisplay, formatDurabilityPercent, getDurabilityLossPerFight, ITEMS } from '../../data/items.js';
import { getGladiatorProfile } from '../../utils/gladiator.js';
import {
  SET_LABEL,
  SLOT_LABEL,
  blockIfEquipBusy,
  planBis,
  allEquippableCatalogItems,
  planFreeTextItems,
  applyPlan,
  replyWithSet,
  footerNoteFor,
} from '../../utils/equipShared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('equip')
    .setDescription('Equip gear into one of your 3 sets — Arena, Slayer, or Skilling')
    .addStringOption((opt) =>
      opt
        .setName('set')
        .setDescription('Which gear set to act on')
        .setRequired(true)
        .addChoices({ name: 'Arena', value: 'arena' }, { name: 'Slayer', value: 'adventure' }, { name: 'Skilling', value: 'misc' })
    )
    .addStringOption((opt) =>
      opt
        .setName('items')
        .setDescription("Type item names separated by commas — e.g. 'steel helm, iron chest, longsword'")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Pick one item from a menu instead of typing').setRequired(false).setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('preset').setDescription('Load one of your saved /loadout presets into this set').setRequired(false).setAutocomplete(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('bis')
        .setDescription('Auto-equip the best gear you own (Arena/Slayer only — highest rarity you can use, then durability)')
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('unequip_all').setDescription('Take off everything in this set, instead of picking items individually').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('text_format').setDescription('Show plain text instead of the gear image').setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'preset') {
      const typed = normalizeQuotes(focused.value.toLowerCase());
      const loadouts = getLoadouts(interaction.guildId, interaction.user.id);
      const filtered = loadouts.filter((l) => normalizeQuotes(l.name.toLowerCase()).includes(typed)).slice(0, 25);
      return interaction.respond(filtered.map((l) => ({ name: l.name, value: l.name })));
    }

    
    
    
    
    
    
    
    
    
    
    const typed = normalizeQuotes(focused.value.toLowerCase());
    const catalog = allEquippableCatalogItems().sort(compareItemsForDisplay);
    const choices = [];
    for (const item of catalog) {
      const isWearExempt = getDurabilityLossPerFight(item) === null;
      for (const inst of getUnequippedInstances(interaction.guildId, interaction.user.id, item.id)) {
        choices.push({
          name: isWearExempt
            ? `${item.name} (Tier ${item.tier}${item.twoHanded ? ', two-handed' : ''}, ${SLOT_LABEL[item.slot]})`
            : `${item.name} — ${inst.broken ? 'BROKEN' : `${formatDurabilityPercent(inst.durability)}%`} (Tier ${item.tier}${item.twoHanded ? ', two-handed' : ''}, ${SLOT_LABEL[item.slot]})`,
          value: inst.instanceId,
        });
      }
    }
    for (const arrowItem of ITEMS.filter((i) => i.category === 'arrow')) {
      const owned = getOwnedQuantity(interaction.guildId, interaction.user.id, arrowItem.id);
      if (owned > 0) {
        choices.push({ name: `${arrowItem.name} (${owned} owned, Arrows slot)`, value: `arrow:${arrowItem.id}` });
      }
    }
    const filtered = choices.filter((c) => normalizeQuotes(c.name.toLowerCase()).includes(typed)).slice(0, 25);
    await interaction.respond(filtered);
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const setName = interaction.options.getString('set', true);
    if (!GEAR_SETS.includes(setName)) {
      return interaction.reply({ content: `\`${setName}\` isn't a valid gear set.`, ephemeral: true });
    }

    const itemsRaw = interaction.options.getString('items');
    const itemPick = interaction.options.getString('item');
    const presetName = interaction.options.getString('preset');
    const bis = interaction.options.getBoolean('bis');
    const unequipAllFlag = interaction.options.getBoolean('unequip_all');

    if (bis && setName === 'misc') {
      return interaction.reply({
        content: 'Skilling gear doesn\'t support `bis:` — equip tools and your outfit manually with `item:`, `items:`, or `preset:`.',
        ephemeral: true,
      });
    }

    const provided = [itemsRaw, itemPick, presetName, bis, unequipAllFlag].filter((v) => v !== null && v !== undefined && v !== false);
    if (provided.length > 1) {
      return interaction.reply({
        content: 'Use only one of `items:`, `item:`, `preset:`, `bis:`, or `unequip_all:` at a time.',
        ephemeral: true,
      });
    }

    
    if (provided.length === 0) {
      return replyWithSet(interaction, setName, { title: `🖼️ ${SET_LABEL[setName]} Gear` });
    }

    const profile = getGladiatorProfile(guildId, userId, interaction.user.displayName);
    const busyMessage = blockIfEquipBusy(guildId, userId, interaction.user.displayName);
    if (busyMessage) return interaction.reply({ content: busyMessage, ephemeral: true });
    const gladiatorLevel = profile.level;

    try {
      
      if (unequipAllFlag) {
        const { removed } = unequipAll(guildId, userId, setName);
        return replyWithSet(interaction, setName, {
          title: `✅ ${SET_LABEL[setName]} cleared`,
          footerNote: removed.length > 0 ? `Returned to your inventory: ${removed.join(', ')}.` : "You weren't wearing anything in this set.",
        });
      }

      
      if (bis) {
        const plan = planBis(guildId, userId, setName, gladiatorLevel);
        if (Object.keys(plan).length === 0) {
          return interaction.reply({ content: `You're already wearing the best gear you own in every slot of your **${SET_LABEL[setName]}** set.`, ephemeral: true });
        }
        const { forcedUnequips, movedFromSets } = applyPlan(guildId, userId, setName, plan, gladiatorLevel);
        return replyWithSet(interaction, setName, {
          title: `✅ Best-in-slot equipped (${SET_LABEL[setName]})`,
          footerNote: footerNoteFor(forcedUnequips, movedFromSets),
        });
      }

      
      if (presetName) {
        const { applied, skipped } = loadLoadout(guildId, userId, presetName, gladiatorLevel, setName);
        const parts = [];
        if (applied.length > 0) parts.push(`Equipped: ${applied.join(', ')}.`);
        if (skipped.length > 0) parts.push(`Skipped (no longer available): ${skipped.join(', ')}.`);
        return replyWithSet(interaction, setName, {
          title: `✅ Loaded preset "${presetName}" into ${SET_LABEL[setName]}`,
          footerNote: parts.join(' ') || undefined,
        });
      }

      
      if (itemPick) {
        
        
        
        
        if (itemPick.startsWith('arrow:')) {
          const arrowItemId = Number(itemPick.slice('arrow:'.length));
          const arrowItem = ITEMS.find((i) => i.id === arrowItemId);
          if (!arrowItem) {
            return interaction.reply({ content: "Couldn't find that arrow type — try the menu again.", ephemeral: true });
          }
          equipArrows(guildId, userId, setName, arrowItemId, 1);
          return replyWithSet(interaction, setName, { title: `✅ Equipped 1x ${arrowItem.name} (${SET_LABEL[setName]})` });
        }

        const picked = resolveInstance(itemPick);
        if (!picked) {
          return interaction.reply({ content: "Couldn't find that item — try the menu again.", ephemeral: true });
        }
        const { forcedUnequip, movedFromSet } = equipInstance(guildId, userId, setName, picked.slot, itemPick, gladiatorLevel);
        const forcedUnequips = forcedUnequip ? new Set([forcedUnequip.name]) : new Set();
        const movedFromSets = movedFromSet ? new Set([movedFromSet]) : new Set();
        return replyWithSet(interaction, setName, {
          title: `✅ Equipped ${picked.name} (${SET_LABEL[setName]})`,
          footerNote: footerNoteFor(forcedUnequips, movedFromSets),
        });
      }

      
      const { plan, resolvedNames, arrowPlan } = planFreeTextItems(guildId, userId, itemsRaw, gladiatorLevel);
      const { forcedUnequips, movedFromSets } = applyPlan(guildId, userId, setName, plan, gladiatorLevel, arrowPlan);
      return replyWithSet(interaction, setName, {
        title: `✅ Equipped into ${SET_LABEL[setName]}`,
        footerNote: [`${resolvedNames.join(', ')}.`, footerNoteFor(forcedUnequips, movedFromSets)].filter(Boolean).join(' '),
      });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
