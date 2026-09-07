import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startTanningTrip } from '../../utils/tanning.js';
import { ITEMS } from '../../data/items.js';

function hideChoices() {
  return ITEMS.filter((i) => i.category === 'hide' && i.hideQuality === 'fine')
    .sort((a, b) => a.tier - b.tier)
    .map((i) => ({ name: `${i.name.replace(/ Hide$/, '')} (Lv${i.tier})`, value: i.tier }));
}

export default {
  data: new SlashCommandBuilder()
    .setName('tan')
    .setDescription('Tan raw hides into Tanned Hides for Crafting (part of the Crafting skill)')
    .addIntegerOption((opt) => opt.setName('hide').setDescription('Which animal hide to tan').setRequired(true).addChoices(...hideChoices()))
    .addBooleanOption((opt) => opt.setName('perfect_hide').setDescription('Use Perfect hides too (2 Tanned Hides each) - defaults to false, Fine hides only'))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many raw hides to process (defaults to what you have, up to your max trip size)')),

  async execute(interaction) {
    const tier = interaction.options.getInteger('hide', true);
    const usePerfect = interaction.options.getBoolean('perfect_hide') ?? false;
    const quantity = interaction.options.getInteger('quantity');

    try {
      const result = await startTanningTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, tier, usePerfect, quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
