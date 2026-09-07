import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startCraftingTrip, getCraftingProductsForTier } from '../../utils/crafting.js';
import { startMagicCraftingTrip, getMagicCraftingProducts } from '../../utils/magicCrafting.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function allProductChoices() {
  const all = [];
  for (const tier of TIER_LEVELS) {
    for (const p of getCraftingProductsForTier(tier)) {
      all.push({ name: `${p.name} (Lv${tier}, ${p.threadCost} thread)`, value: String(p.id), tier });
    }
  }

  for (const p of getMagicCraftingProducts()) {
    all.push({ name: `${p.name} (Lv${p.tier}, ${p.silkCost} silk, ${p.threadCost} enchanted thread)`, value: `magic:${p.id}`, tier: p.tier });
  }
  return all;
}

export default {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Craft Ranged/Magic Armor')
    .addStringOption((opt) => opt.setName('product').setDescription('Which item to craft').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to craft this trip.')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused();
    const choices = filterTieredChoices(allProductChoices(), typed)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const rawProduct = interaction.options.getString('product');
    const quantity = interaction.options.getInteger('quantity');

    try {

      const isMagic = rawProduct.startsWith('magic:');
      const productId = Number(isMagic ? rawProduct.slice('magic:'.length) : rawProduct);
      const result = isMagic
        ? await startMagicCraftingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, productId, quantity)
        : await startCraftingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, productId, quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
