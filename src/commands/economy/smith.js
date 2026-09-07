import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startSmithTrip, getSmithProductsForTier } from '../../utils/smithing.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function allProductChoices() {
  const all = [];
  for (const tier of TIER_LEVELS) {
    for (const p of getSmithProductsForTier(tier)) {
      all.push({ name: `${p.name} (Lv${tier}, ${p.barCost} bar${p.barCost > 1 ? 's' : ''})`, value: String(p.id), tier });
    }
  }
  return all;
}

export default {
  data: new SlashCommandBuilder()
    .setName('smith')
    .setDescription('Smith bars into a specific product for Smithing XP (requires a Hammer)')
    .addStringOption((opt) => opt.setName('product').setDescription('Which item to smith').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to smith this trip (defaults to what you have, up to your max trip size)')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused();
    const choices = filterTieredChoices(allProductChoices(), typed)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const productId = interaction.options.getString('product');
    const quantity = interaction.options.getInteger('quantity');

    try {
      const result = await startSmithTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, Number(productId), quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
