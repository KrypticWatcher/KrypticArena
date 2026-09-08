import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startGreenhousePlant, startGreenhouseHarvest, getGreenhousePatchStatus, formatPatchStatusLines, seedChoicesForType } from '../../utils/farming.js';

const PATCH_TYPE_CHOICES = [
  { name: 'Herb', value: 'herb' },
  { name: 'Tree', value: 'tree' },
  { name: 'Fruit', value: 'fruit' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('greenhouse')
    .setDescription('Plant, harvest, or check your Grand Greenhouse patches (requires Greenhouse Tier 1+)')
    .addSubcommand((sub) =>
      sub
        .setName('plant')
        .setDescription('Send your Gladiator to plant one seed per Greenhouse patch type — pick any combination of the three')
        .addStringOption((opt) => opt.setName('herb_seed').setDescription('Herb seed to plant').setAutocomplete(true))
        .addStringOption((opt) => opt.setName('tree_seed').setDescription('Tree seed to plant').setAutocomplete(true))
        .addStringOption((opt) => opt.setName('fruit_seed').setDescription('Fruit seed to plant').setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('harvest')
        .setDescription('Send your Gladiator to harvest ready Greenhouse patches')
        .addStringOption((opt) =>
          opt.setName('type').setDescription('Which Greenhouse patches to harvest').setRequired(true).addChoices(...PATCH_TYPE_CHOICES, { name: 'All', value: 'all' })
        )
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Check all your Greenhouse patches')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const patchType = { herb_seed: 'herb', tree_seed: 'tree', fruit_seed: 'fruit' }[focused.name];
    if (!patchType) return interaction.respond([]);

    const typed = focused.value.toLowerCase();
    const seeds = seedChoicesForType(patchType);
    const choices = seeds.filter((s) => s.name.toLowerCase().includes(typed)).map((s) => ({ name: s.name, value: String(s.id) }));
    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'plant') {
        const seedsByType = {};
        for (const [optionName, patchType] of [
          ['herb_seed', 'herb'],
          ['tree_seed', 'tree'],
          ['fruit_seed', 'fruit'],
        ]) {
          const raw = interaction.options.getString(optionName);
          if (raw != null) seedsByType[patchType] = Number(raw);
        }
        const result = await startGreenhousePlant(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, seedsByType);
        return interaction.reply({ content: result.text });
      }

      if (sub === 'harvest') {
        const type = interaction.options.getString('type');
        const result = await startGreenhouseHarvest(interaction.guildId, interaction.user.id, interaction.channelId, interaction.user.displayName, type);
        return interaction.reply({ content: result.text });
      }

      if (sub === 'status') {
        const status = getGreenhousePatchStatus(interaction.guildId, interaction.user.id);
        const lines = formatPatchStatusLines(status);
        return interaction.reply({ content: lines.join('\n') });
      }
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
