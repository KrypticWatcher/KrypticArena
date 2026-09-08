import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startCraftingTrip, getCraftingProductsForTier } from '../../utils/crafting.js';
import { startMagicCraftingTrip, getMagicCraftingProducts } from '../../utils/magicCrafting.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function craftProductChoices() {
  const all = [];
  for (const tier of TIER_LEVELS) {
    for (const p of getCraftingProductsForTier(tier)) {
      all.push({ name: `${p.name} (Lv${tier}, ${p.threadCost} thread)`, value: String(p.id), tier });
    }
  }
  return all;
}

function magicProductChoices() {
  return getMagicCraftingProducts().map((p) => ({
    name: `${p.name} (Lv${p.tier}, ${p.silkCost} silk, ${p.threadCost} enchanted thread)`,
    value: String(p.id),
    tier: p.tier,
  }));
}

export default {
  data: new SlashCommandBuilder()
    .setName('workshop')
    .setDescription("Use the Crafter's Workshop for a boosted trip (requires Workshop Tier 1+)")
    .addSubcommand((sub) =>
      sub
        .setName('craft')
        .setDescription('Boosted craft Ranged armor at the Workshop')
        .addStringOption((opt) => opt.setName('product').setDescription('Which item to craft').setRequired(true).setAutocomplete(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to craft this trip (defaults to your boosted max)'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('enchant')
        .setDescription('Boosted craft Magic armor at the Workshop')
        .addStringOption((opt) => opt.setName('product').setDescription('Which item to craft').setRequired(true).setAutocomplete(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to craft this trip (defaults to your boosted max)'))
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused();
    const choices = sub === 'craft' ? craftProductChoices() : magicProductChoices();
    const filtered = filterTieredChoices(choices, focused).slice(0, 25).map(({ name, value }) => ({ name, value }));
    await interaction.respond(filtered);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const productId = Number(interaction.options.getString('product'));
    const quantity = interaction.options.getInteger('quantity');

    try {
      const result =
        sub === 'enchant'
          ? await startMagicCraftingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, productId, quantity, true)
          : await startCraftingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, productId, quantity, true);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
