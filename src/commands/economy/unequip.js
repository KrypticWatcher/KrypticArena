import { SlashCommandBuilder } from 'discord.js';
import { unequipAll, equipInstance, unequipArrows, getEquipment, GEAR_SETS } from '../../utils/inventory.js';
import { SLOTS } from '../../data/items.js';
import { blockIfEquipBusy, SET_LABEL, replyWithSet } from '../../utils/equipShared.js';
import { getGladiatorProfile } from '../../utils/gladiator.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unequip')
    .setDescription('Take off gear from one of your sets — everything at once, or just one item')
    .addStringOption((opt) =>
      opt
        .setName('set')
        .setDescription('Which gear set to act on')
        .setRequired(true)
        .addChoices({ name: 'Arena', value: 'arena' }, { name: 'Slayer', value: 'adventure' }, { name: 'Skilling', value: 'misc' })
    )
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Unequip just this one item instead of everything').setRequired(false).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const setName = interaction.options.getString('set');
    if (!setName || !GEAR_SETS.includes(setName)) return interaction.respond([]);

    const equipped = getEquipment(interaction.guildId, interaction.user.id, setName);
    const choices = [];
    for (const slot of SLOTS) {
      const item = equipped[slot];
      if (item) choices.push({ name: `${item.name} (${slot.replace('_', ' ')})`, value: `slot:${slot}` });
    }
    if (equipped.arrows) {
      choices.push({ name: `${equipped.arrows.item.name} (${equipped.arrows.quantity} equipped, arrows)`, value: 'arrows' });
    }
    const filtered = choices.filter((c) => c.name.toLowerCase().includes(typed));
    await interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const setName = interaction.options.getString('set', true);
    if (!GEAR_SETS.includes(setName)) {
      return interaction.reply({ content: `\`${setName}\` isn't a valid gear set.`, ephemeral: true });
    }

    const busyMessage = blockIfEquipBusy(guildId, userId, interaction.user.displayName);
    if (busyMessage) return interaction.reply({ content: busyMessage, ephemeral: true });

    const itemPick = interaction.options.getString('item');

    
    if (itemPick) {
      if (itemPick === 'arrows') {
        unequipArrows(guildId, userId, setName);
        return replyWithSet(interaction, setName, { title: `✅ Arrows unequipped (${SET_LABEL[setName]})` });
      }
      if (itemPick.startsWith('slot:')) {
        const slot = itemPick.slice('slot:'.length);
        if (!SLOTS.includes(slot)) {
          return interaction.reply({ content: "Couldn't find that item — try the menu again.", ephemeral: true });
        }
        const profile = getGladiatorProfile(guildId, userId, interaction.user.displayName);
        equipInstance(guildId, userId, setName, slot, null, profile.level);
        return replyWithSet(interaction, setName, { title: `✅ Unequipped from ${slot.replace('_', ' ')} (${SET_LABEL[setName]})` });
      }
      return interaction.reply({ content: "Couldn't find that item — try the menu again.", ephemeral: true });
    }

    
    const equippedBefore = getEquipment(guildId, userId, setName);
    const { removed } = unequipAll(guildId, userId, setName);
    if (equippedBefore.arrows) {
      unequipArrows(guildId, userId, setName);
      removed.push(`${equippedBefore.arrows.quantity}x ${equippedBefore.arrows.item.name}`);
    }
    return replyWithSet(interaction, setName, {
      title: `✅ ${SET_LABEL[setName]} cleared`,
      footerNote: removed.length > 0 ? `Returned to your inventory: ${removed.join(', ')}.` : "You weren't wearing anything in this set.",
    });
  },
};
