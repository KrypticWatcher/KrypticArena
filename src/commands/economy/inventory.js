import { SlashCommandBuilder } from 'discord.js';
import { runInventoryView } from '../../utils/inventoryViewShared.js';

const SORT_CHOICES = [
  { name: 'Type', value: 'type' },
  { name: 'Tier', value: 'rarity' },
  { name: 'Quantity', value: 'quantity' },
  { name: 'Alphabetical', value: 'alphabetical' },
  { name: 'Slot', value: 'slot' },
];

const FORMAT_CHOICES = [{ name: 'Bank-style text (paged list)', value: 'text_paged' }];

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your unequipped items, bank-style grid')
    .addStringOption((opt) => opt.setName('search').setDescription('Filter by item name').setRequired(false))
    .addStringOption((opt) => opt.setName('sort').setDescription('How to sort this view').setRequired(false).addChoices(...SORT_CHOICES))
    .addStringOption((opt) =>
      opt.setName('format').setDescription('Display as a paged text list instead of the image grid').setRequired(false).addChoices(...FORMAT_CHOICES)
    )
    .addBooleanOption((opt) => opt.setName('show_id').setDescription("Show each item's internal ID (for trades, etc)").setRequired(false))
    .addBooleanOption((opt) => opt.setName('show_durability').setDescription('Show a durability bar under each item').setRequired(false))
    .addBooleanOption((opt) => opt.setName('show_names').setDescription('Show item names under each icon (off by default)').setRequired(false)),

  async execute(interaction) {
    return runInventoryView(interaction, {
      search: interaction.options.getString('search'),
      sort: interaction.options.getString('sort') ?? 'type',
      format: interaction.options.getString('format'),
      showId: interaction.options.getBoolean('show_id') ?? false,
      showDurability: interaction.options.getBoolean('show_durability') ?? false,
      showNames: interaction.options.getBoolean('show_names') ?? false,
    });
  },
};
