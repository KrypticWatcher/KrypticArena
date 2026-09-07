import { SlashCommandBuilder } from 'discord.js';
import { saveLoadout, getLoadouts, deleteLoadout, MAX_LOADOUTS, GEAR_SETS } from '../../utils/inventory.js';
import { EconomyError } from '../../utils/economy.js';
import { buildLoadoutListReply } from '../../utils/loadoutShared.js';

const SET_LABEL = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };
const SET_CHOICES = GEAR_SETS.map((s) => ({ name: SET_LABEL[s], value: s }));

export default {
  data: new SlashCommandBuilder()
    .setName('loadout')
    .setDescription(`Manage saved equipment presets (up to ${MAX_LOADOUTS}) — load one via /equip preset:`)
    .addSubcommand((sub) =>
      sub
        .setName('save')
        .setDescription('Save one gear set as a preset')
        .addStringOption((opt) => opt.setName('name').setDescription('Preset name, e.g. "Safe Build"').setRequired(true))
        .addStringOption((opt) => opt.setName('set').setDescription('Which gear set to snapshot').setRequired(true).addChoices(...SET_CHOICES))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show your saved presets'))
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a saved preset')
        .addStringOption((opt) => opt.setName('name').setDescription('Preset name').setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const names = getLoadouts(interaction.guildId, interaction.user.id).map((l) => l.name);
    const filtered = names.filter((n) => n.toLowerCase().includes(typed)).slice(0, 25);
    await interaction.respond(filtered.map((n) => ({ name: n, value: n })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'save') {
        const name = interaction.options.getString('name', true);
        const setName = interaction.options.getString('set', true);
        saveLoadout(interaction.guildId, interaction.user.id, name, setName);
        return interaction.reply({ content: `💾 Saved your current **${SET_LABEL[setName]}** gear as **${name}**.` });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name', true);
        deleteLoadout(interaction.guildId, interaction.user.id, name);
        return interaction.reply({ content: `🗑️ Deleted **${name}**.`, ephemeral: true });
      }

      
      return interaction.reply(buildLoadoutListReply(interaction.guildId, interaction.user.id));
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
