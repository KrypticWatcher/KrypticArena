import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startMultiResourceTrip } from '../../utils/gathering.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dock')
    .setDescription('Fish at the Fishing Dock for a mixed-haul Fishing trip (requires Dock Tier 1+)'),

  async execute(interaction) {
    try {
      const result = await startMultiResourceTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, 'dock');
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
