import { SlashCommandBuilder } from 'discord.js';
import { runInventoryView } from '../../utils/inventoryViewShared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('is')
    .setDescription('Inventory Search — quick search of your unequipped items')
    .addStringOption((opt) => opt.setName('search').setDescription('Filter by item name').setRequired(true)),

  async execute(interaction) {
    return runInventoryView(interaction, {
      search: interaction.options.getString('search', true),
      
      
      
      
      
      
    });
  },
};
