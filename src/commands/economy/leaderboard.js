import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureGuild } from '../../utils/economy.js';
import { leaderboardTypes, getLeaderboard } from '../../utils/leaderboards.js';
import { getAllBadges } from '../../utils/gladiator.js';

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('lb')
    .setDescription('Show a top-10 server leaderboard')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Which leaderboard to show (default: richest)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  
  
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = Object.entries(leaderboardTypes)
      .map(([value, def]) => ({ name: `${def.emoji} ${def.label}`, value }))
      .filter((choice) => choice.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'richest';
    const settings = ensureGuild(interaction.guildId);
    const result = getLeaderboard(type, interaction.guildId);

    if (!result) {
      return interaction.reply({
        content: `Unknown leaderboard type **${type}**. Run \`/leaderboard\` and pick one from the list, or leave it blank for the richest leaderboard.`,
        ephemeral: true,
      });
    }

    const { def, rows } = result;

    if (rows.length === 0) {
      return interaction.reply({
        content: `There's no data yet for the ${def.label} leaderboard.`,
        ephemeral: true,
      });
    }

    const lines = rows.map((row, i) => {
      const rank = RANK_EMOJI[i] ?? `**#${i + 1}**`;
      
      
      
      
      
      
      if (def.hideTopN && i < def.hideTopN) {
        return `${rank} 🔒 *Redacted* — ${def.formatValue(row.value, settings)}`;
      }
      const badgePrefix = getAllBadges(interaction.guildId, row.user_id)
        .map((b) => `${b.emoji} `)
        .join('');
      return `${rank} ${badgePrefix}<@${row.user_id}> — ${def.formatValue(row.value, settings)}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`${def.emoji} ${def.label} — Top ${rows.length}`)
      .setDescription(lines.join('\n'))
      
      
      
      
      .setFooter({ text: 'Global Leaderboard' });

    await interaction.reply({ embeds: [embed] });
  },
};
