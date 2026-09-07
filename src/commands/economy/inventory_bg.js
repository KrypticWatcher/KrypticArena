import { SlashCommandBuilder } from 'discord.js';
import { getInventoryBackgroundsFor, getInventoryBackgroundById } from '../../utils/inventoryBackgrounds.js';
import { setInventoryBackground } from '../../utils/gladiator.js';

const DEFAULT_CHOICE_VALUE = '__default__';

export default {
  data: new SlashCommandBuilder()
    .setName('inventory_bg')
    .setDescription('Set a custom background for your /inventory (only shows backgrounds you have access to)')
    .addStringOption((opt) =>
      opt.setName('type').setDescription('Which background to use').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const available = getInventoryBackgroundsFor(interaction.user.id);
    const choices = [{ name: 'Default (no custom background)', value: DEFAULT_CHOICE_VALUE }, ...available.map((bg) => ({ name: bg.name, value: bg.id }))];
    const filtered = choices.filter((c) => c.name.toLowerCase().includes(typed));
    return interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const choice = interaction.options.getString('type', true);

    if (choice === DEFAULT_CHOICE_VALUE) {
      setInventoryBackground(interaction.guildId, interaction.user.id, null);
      return interaction.reply({ content: '🖼️ Your /inventory background is back to the default.', ephemeral: true });
    }

    const available = getInventoryBackgroundsFor(interaction.user.id);
    const chosen = available.find((bg) => bg.id === choice);
    if (!chosen) {
      
      
      
      
      return interaction.reply({
        content: "That's not a background available to you — pick one from the autocomplete list.",
        ephemeral: true,
      });
    }

    setInventoryBackground(interaction.guildId, interaction.user.id, chosen.id);
    return interaction.reply({ content: `🖼️ Your /inventory background is now **${chosen.name}**.`, ephemeral: true });
  },
};
