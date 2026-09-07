import { SlashCommandBuilder } from 'discord.js';
import { USER_FLAGS, setUserFlag } from '../../utils/userFlags.js';

const FLAG_CHOICES = Object.entries(USER_FLAGS).map(([value, { label }]) => ({ name: label, value }));

export default {
  data: new SlashCommandBuilder()
    .setName('user_flags')
    .setDescription('Toggle personal display/behavior preferences')
    .addStringOption((opt) => opt.setName('flag').setDescription('Which setting to change').setRequired(true).addChoices(...FLAG_CHOICES))
    .addBooleanOption((opt) => opt.setName('enable').setDescription('On or off').setRequired(true)),

  async execute(interaction) {
    const flag = interaction.options.getString('flag', true);
    const enable = interaction.options.getBoolean('enable', true);

    const flagInfo = USER_FLAGS[flag];
    if (!flagInfo) {
      
      
      return interaction.reply({ content: "That's not a recognized flag.", ephemeral: true });
    }

    setUserFlag(interaction.user.id, flag, enable);
    return interaction.reply({
      content: `**${flagInfo.label}** is now **${enable ? 'ON' : 'OFF'}**.`,
      ephemeral: true,
    });
  },
};
