import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startHerbalismTrip } from '../../utils/herbalism.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function herbChoices() {
  return ITEMS.filter((i) => i.category === 'herb').sort((a, b) => a.tier - b.tier).map((i) => ({ name: `${i.name} (Lv${i.tier})`, value: i.tier, tier: i.tier }));
}

export default {
  data: new SlashCommandBuilder()
    .setName('apothecary')
    .setDescription('Brew at the Apothecary for a boosted Herbalism trip (requires Apothecary Tier 1+)')
    .addIntegerOption((opt) => opt.setName('type').setDescription('Which tier of herb to brew').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many potions to brew this trip (defaults to your boosted max)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = filterTieredChoices(herbChoices(), focused)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const tier = interaction.options.getInteger('type');
    const quantity = interaction.options.getInteger('quantity');
    if (!TIER_LEVELS.includes(tier)) return interaction.reply({ content: 'Invalid herb tier.', ephemeral: true });

    try {
      const result = await startHerbalismTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, tier, quantity, true);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
