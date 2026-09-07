import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startCookingTrip } from '../../utils/cooking.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function fishChoices() {
  return ITEMS.filter((i) => i.category === 'raw_fish').sort((a, b) => a.tier - b.tier).map((i) => ({ name: `${i.name} (Lv${i.tier})`, value: i.tier, tier: i.tier }));
}

export default {
  data: new SlashCommandBuilder()
    .setName('cook')
    .setDescription('Cook raw fish for Cooking XP - requires owning the raw fish already')
    .addIntegerOption((opt) => opt.setName('type').setDescription('Which tier of fish to cook').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to cook this trip (defaults to what you have, up to your max trip size)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = filterTieredChoices(fishChoices(), focused)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const tier = interaction.options.getInteger('type');
    const quantity = interaction.options.getInteger('quantity');
    if (!TIER_LEVELS.includes(tier)) return interaction.reply({ content: 'Invalid fish tier.', ephemeral: true });

    try {
      const result = await startCookingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, tier, quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
