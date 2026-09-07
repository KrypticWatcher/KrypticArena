import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { applyConstructionResources, getConstructionStatus, PROJECTS } from '../../utils/construction.js';

const PROJECT_CHOICES = Object.entries(PROJECTS).map(([id, p]) => ({ name: p.name, value: id }));

export default {
  data: new SlashCommandBuilder()
    .setName('building')
    .setDescription("Apply resources to a Construction project, or check your projects' status")
    .addSubcommand((sub) =>
      sub
        .setName('apply')
        .setDescription("Apply a resource-application trip toward a project's next tier")
        .addStringOption((opt) => opt.setName('project').setDescription('Which project').setRequired(true).addChoices(...PROJECT_CHOICES))
    )
    .addSubcommand((sub) => sub.setName('status').setDescription("Check all your projects' tiers and progress")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'apply') {
        const projectId = interaction.options.getString('project');
        const result = await applyConstructionResources(interaction.guildId, interaction.user.id, interaction.user.displayName, projectId);
        return interaction.reply({ content: result.text });
      }
      if (sub === 'status') {
        const status = getConstructionStatus(interaction.user.id);
        const lines = Object.values(status).map((p) => `**${p.name}**: Tier ${p.tier}/5${p.tier < 5 ? ` (${p.tripsThisTier} trips applied this tier)` : ' — complete!'}`);
        return interaction.reply({ content: lines.join('\n') });
      }
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
