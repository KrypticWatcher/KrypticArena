import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startGatheringTrip } from '../../utils/gathering.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function oreChoices() {
  return ITEMS.filter((i) => i.category === 'ore').sort((a, b) => a.tier - b.tier).map((i) => ({ name: `${i.name} (Lv${i.tier})`, value: i.tier, tier: i.tier }));
}

export default {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Send your Gladiator to mine ore for Mining XP')
    .addIntegerOption((opt) => opt.setName('type').setDescription('Which tier of ore to mine').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How much to gather this trip (defaults to your max for this tier)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = filterTieredChoices(oreChoices(), focused)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const tier = interaction.options.getInteger('type');
    const quantity = interaction.options.getInteger('quantity');
    if (!TIER_LEVELS.includes(tier)) return interaction.reply({ content: 'Invalid ore tier.', ephemeral: true });

    try {
      const result = await startGatheringTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, 'mining', tier, quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
