import { SlashCommandBuilder } from 'discord.js';
import { setGladiatorName } from '../../utils/gladiator.js';
import { EconomyError } from '../../utils/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename your Gladiator (free, unlimited)')
    .addStringOption((opt) => opt.setName('name').setDescription('New name').setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('name', true);
    try {
      const gladiator = setGladiatorName(interaction.guildId, interaction.user.id, name);
      return interaction.reply({ content: `✅ Your Gladiator is now named **${gladiator.name}**.` });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
