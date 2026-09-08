import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startFletchingTrip, getBowProductsForTier, getRodProductsForTier, getStaveProductsForTier } from '../../utils/fletching.js';
import { ITEMS } from '../../data/items.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function fletchChoices() {
  const arrowChoices = ITEMS.filter((i) => i.category === 'arrow')
    .sort((a, b) => a.tier - b.tier)
    .map((i) => ({ name: `${i.name} (Lv${i.tier})`, value: `arrow:${i.tier}`, tier: i.tier }));
  const bowChoices = [];
  const rodChoices = [];
  const staveChoices = [];
  for (const tier of TIER_LEVELS) {
    for (const p of getBowProductsForTier(tier)) {
      bowChoices.push({ name: `${p.name} (Lv${tier}, ${p.logCost} ${p.logName})`, value: `bow:${p.id}`, tier });
    }
    for (const p of getRodProductsForTier(tier)) {
      rodChoices.push({ name: `${p.name} (Lv${tier}, ${p.barCost} ${p.barName}, ${p.logCost} ${p.logName})`, value: `rod:${p.id}`, tier });
    }
    for (const p of getStaveProductsForTier(tier)) {
      staveChoices.push({ name: `${p.name} (Lv${tier}, ${p.logCost} ${p.logName}, ${p.herbCost} ${p.herbName})`, value: `stave:${p.id}`, tier });
    }
  }
  return [...arrowChoices, ...bowChoices, ...rodChoices, ...staveChoices];
}

export default {
  data: new SlashCommandBuilder()
    .setName('fletcherbench')
    .setDescription("Fletch at the Fletcher's Workbench for a boosted trip (requires Workbench Tier 1+, and a Knife)")
    .addStringOption((opt) => opt.setName('type').setDescription('Which arrows, bow, rod, or stave to fletch').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('How many to fletch this trip (defaults to your boosted max)')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = filterTieredChoices(fletchChoices(), focused)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const typed = interaction.options.getString('type');
    const quantity = interaction.options.getInteger('quantity');
    const [itemType, keyStr] = (typed ?? '').split(':');
    const key = Number(keyStr);
    if (!['arrow', 'bow', 'rod', 'stave'].includes(itemType) || Number.isNaN(key)) {
      return interaction.reply({ content: 'Invalid choice — pick one from the list.', ephemeral: true });
    }

    try {
      const result = await startFletchingTrip(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, itemType, key, quantity, true);
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
