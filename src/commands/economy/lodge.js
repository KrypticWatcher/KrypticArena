import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startLodgeTrip } from '../../utils/hunting.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lodge')
    .setDescription("Hunt at the Hunter's Lodge for a mixed-haul Hunting trip (requires Lodge Tier 1+)"),

  async execute(interaction) {
    try {
      const result = await startLodgeTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
