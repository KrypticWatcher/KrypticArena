import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { cancelActiveTripFor } from '../../utils/adventureScheduler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gladiator_cancel')
    .setDescription("Cancel your current trip early — Quest gets a small consolation, everything else forfeits"),

  async execute(interaction) {
    try {
      const { text } = cancelActiveTripFor(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: text });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
