import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import {
  startBuild,
  completeBuild,
  collectPassive,
  collectPassiveAll,
  getActiveBuilds,
  getProjectSummary,
  discordRelativeTimestamp,
  PROJECTS,
} from '../../utils/construction.js';

const PROJECT_CHOICES = Object.entries(PROJECTS).map(([id, p]) => ({ name: p.name, value: id }));
const PROJECT_CHOICES_WITH_ALL = [...PROJECT_CHOICES, { name: 'All', value: 'all' }];

export default {
  data: new SlashCommandBuilder()
    .setName('building')
    .setDescription('Start, complete, and collect from your Construction projects')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription("Submit materials and start the timer for a project's next tier")
        .addStringOption((opt) => opt.setName('project').setDescription('Which project').setRequired(true).addChoices(...PROJECT_CHOICES))
    )
    .addSubcommand((sub) =>
      sub
        .setName('complete')
        .setDescription('Finish a build whose timer has run out')
        .addStringOption((opt) => opt.setName('project').setDescription('Which project (or All)').setRequired(true).addChoices(...PROJECT_CHOICES_WITH_ALL))
    )
    .addSubcommand((sub) =>
      sub
        .setName('collect')
        .setDescription('Collect banked passive resources')
        .addStringOption((opt) => opt.setName('project').setDescription('Which project (or All)').setRequired(true).addChoices(...PROJECT_CHOICES_WITH_ALL))
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Check builds currently in progress'))
    .addSubcommand((sub) => sub.setName('summary').setDescription('Check every project\'s tier progress')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'start') {
        const projectId = interaction.options.getString('project', true);
        const result = await startBuild(interaction.guildId, interaction.user.id, interaction.user.displayName, projectId);
        return interaction.reply({ content: result.text });
      }

      if (sub === 'complete') {
        const projectId = interaction.options.getString('project', true);
        if (projectId === 'all') {
          const results = [];
          const errors = [];
          for (const id of Object.keys(PROJECTS)) {
            try {
              const result = await completeBuild(interaction.guildId, interaction.user.id, interaction.user.displayName, id);
              results.push(result.text);
            } catch (err) {
              if (!(err instanceof EconomyError)) throw err;

            }
          }
          if (results.length === 0) {
            return interaction.reply({ content: "You don't have any builds ready to complete.", ephemeral: true });
          }
          return interaction.reply({ content: results.join('\n\n') });
        }
        const result = await completeBuild(interaction.guildId, interaction.user.id, interaction.user.displayName, projectId);
        return interaction.reply({ content: result.text });
      }

      if (sub === 'collect') {
        const projectId = interaction.options.getString('project', true);
        if (projectId === 'all') {
          const result = await collectPassiveAll(interaction.guildId, interaction.user.id, interaction.user.displayName);
          return interaction.reply({ content: result.text, files: result.files });
        }
        const result = await collectPassive(interaction.guildId, interaction.user.id, interaction.user.displayName, projectId);
        return interaction.reply({ content: result.text, files: result.files });
      }

      if (sub === 'status') {
        const builds = getActiveBuilds(interaction.user.id);
        if (builds.length === 0) {
          return interaction.reply({ content: "You don't have any builds in progress." });
        }
        const lines = builds.map((b) => {
          if (b.ready) return `**${b.name}** — Tier ${b.tier} is ready to complete!`;
          return `**${b.name}** — Tier ${b.tier} building, ready ${discordRelativeTimestamp(b.readyAt)}.`;
        });
        return interaction.reply({ content: lines.join('\n') });
      }

      if (sub === 'summary') {
        const summary = getProjectSummary(interaction.user.id);
        const lines = Object.values(summary).map((p) => {
          let line = `**${p.name}**: Tier ${p.currentTier}/${p.maxTier}`;
          if (p.atCollectionCap) line += ' — 🔋 resources ready to collect!';
          return line;
        });
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
