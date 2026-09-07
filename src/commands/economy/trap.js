import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startHuntingTrip } from '../../utils/hunting.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

const BIRD_NAMES_BY_TIER = {
  1: 'Sparrow', 5: 'Crow', 10: 'Pheasant', 20: 'Falcon', 35: 'Owl',
  45: 'Emberhawk', 55: 'Ironwing Falcon', 65: 'Stormhawk', 75: 'Duskraven', 85: 'Godhawk', 92: 'Celestial Roc',
};

function huntChoices() {
  const hideChoices = ITEMS.filter((i) => i.category === 'hide' && i.hideQuality === 'fine')
    .sort((a, b) => a.tier - b.tier)
    .map((i) => ({ name: `${i.name.replace(/ Hide$/, '')} (Lv${i.tier})`, value: `hide:${i.tier}`, tier: i.tier }));
  const birdChoices = TIER_LEVELS.map((tier) => ({ name: `${BIRD_NAMES_BY_TIER[tier]} (Lv${tier})`, value: `bird:${tier}`, tier }));
  return [...hideChoices, ...birdChoices];
}

export default {
  data: new SlashCommandBuilder()
    .setName('trap')
    .setDescription('Send your Gladiator to hunt creatures or birds for Hunting XP')
    .addStringOption((opt) => opt.setName('type').setDescription('Which creature or bird to hunt').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to hunt this trip (defaults to your max for this tier)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = filterTieredChoices(huntChoices(), focused)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const typed = interaction.options.getString('type');
    const quantity = interaction.options.getInteger('quantity');
    const [huntType, tierStr] = (typed ?? '').split(':');
    const tier = Number(tierStr);
    if ((huntType !== 'hide' && huntType !== 'bird') || !TIER_LEVELS.includes(tier)) {
      return interaction.reply({ content: 'Invalid creature or bird choice — pick one from the list.', ephemeral: true });
    }

    try {
      const result = await startHuntingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, huntType, tier, quantity);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
