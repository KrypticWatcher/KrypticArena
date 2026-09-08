import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startMultiResourceTrip } from '../../utils/gathering.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lumberyard')
    .setDescription('Chop at the Grand Lumberyard for a mixed-haul Woodcutting trip (requires Lumberyard Tier 1+)'),

  async execute(interaction) {
    try {
      const result = await startMultiResourceTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, 'lumberyard');
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
