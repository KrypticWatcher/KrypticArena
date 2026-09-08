import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startSmeltTrip, startSmithTrip, getSmithProductsForTier } from '../../utils/smithing.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function barChoices() {
  return ITEMS.filter((i) => i.category === 'bar').sort((a, b) => a.tier - b.tier).map((i) => ({ name: `${i.name} (Lv${i.tier})`, value: i.tier, tier: i.tier }));
}

function smithProductChoices() {
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
    .setName('forge')
    .setDescription('Use the Master Forge for a boosted Smithing trip (requires Forge Tier 1+)')
    .addSubcommand((sub) =>
      sub
        .setName('smelt')
        .setDescription('Boosted smelt ore into bars at the Master Forge')
        .addIntegerOption((opt) => opt.setName('type').setDescription('Which tier of bar to smelt').setRequired(true).setAutocomplete(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many bars to smelt this trip (defaults to your boosted max for this tier)'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('smith')
        .setDescription('Boosted smith bars into a product at the Master Forge (requires a Hammer)')
        .addStringOption((opt) => opt.setName('product').setDescription('Which item to smith').setRequired(true).setAutocomplete(true))
        .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to smith this trip (defaults to your boosted max)'))
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused();
    if (sub === 'smelt') {
      const choices = filterTieredChoices(barChoices(), focused).slice(0, 25).map(({ name, value }) => ({ name, value }));
      return interaction.respond(choices);
    }
    const choices = filterTieredChoices(smithProductChoices(), focused).slice(0, 25).map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const quantity = interaction.options.getInteger('quantity');

    try {
      if (sub === 'smelt') {
        const tier = interaction.options.getInteger('type');
        if (!TIER_LEVELS.includes(tier)) return interaction.reply({ content: 'Invalid tier.', ephemeral: true });
        const result = await startSmeltTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, tier, quantity, true);
        return interaction.reply({ content: result.text });
      }

      const productId = Number(interaction.options.getString('product'));
      const result = await startSmithTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, productId, quantity, true);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
