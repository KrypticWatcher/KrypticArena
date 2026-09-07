import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startAdventureFor, recordRepeatButton, resolveInstantAdventure } from '../../utils/adventureScheduler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Send your Gladiator out on Quest — earns QP, Arena Coins, and Gladiator XP'),

  async execute(interaction) {
    try {
      const result = await startAdventureFor(
        interaction.guildId,
        interaction.user.id,
        interaction.channelId,
        interaction.user.displayName,
        interaction.client
      );

      
      
      
      
      
      
      await interaction.reply({ content: result.text });

      if (result.instant) {
        const { content, components, files } = await resolveInstantAdventure(interaction.guildId, interaction.user.id);
        const returnMessage = await interaction.followUp({ content, components, files });
        recordRepeatButton(interaction.guildId, interaction.user.id, interaction.channelId, returnMessage.id);
      }
      return;
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
