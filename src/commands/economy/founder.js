import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { setFounderTitleEnabled, hasFounderTitleActive, formatGladiatorTitledName, getGladiatorProfile } from '../../utils/gladiator.js';
import { getOwnedQuantity } from '../../utils/inventory.js';

export default {
  data: new SlashCommandBuilder()
    .setName('founder')
    .setDescription("Toggle whether your Founder's Badge title shows in front of your name")
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Show or hide the Founder title (the badge itself always still shows)')
        .setRequired(true)
        .addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (getOwnedQuantity(guildId, userId, 'founders_badge') < 1) {
      return interaction.reply({
        content: "You don't own a Founder's Badge — there's no title to toggle. Check `/store view`.",
        ephemeral: true,
      });
    }

    const choice = interaction.options.getString('title', true);
    try {
      setFounderTitleEnabled(guildId, userId, choice === 'enable');
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    const name = getGladiatorProfile(guildId, userId, interaction.user.displayName).name;
    const preview = formatGladiatorTitledName(guildId, userId, name);

    return interaction.reply({
      content:
        choice === 'enable'
          ? `Founder title enabled — you'll now show as **${preview}**.`
          : `Founder title disabled — you'll now show as **${preview}** (your Founder's Badge still shows wherever badges do).`,
      ephemeral: true,
    });
  },
};
