import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureGuild } from '../../utils/economy.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { getGainsSummarySince } from '../../utils/gainLog.js';

const WINDOW_MS = 12 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('gains')
    .setDescription('See what you\'ve gained (cash, arena coins, items) in the last 12 hours'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const settings = ensureGuild(guildId);
    const since = Date.now() - WINDOW_MS;

    const { cash, arena, items } = getGainsSummarySince(guildId, userId, since);

    if (cash.bySource.length === 0 && arena.bySource.length === 0 && items.bySource.length === 0) {
      return interaction.reply({
        content: "You haven't gained anything in the last 12 hours — go play something!",
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: `${interaction.user.username}'s Gains — Last 12 Hours`, iconURL: interaction.user.displayAvatarURL() });

    if (cash.bySource.length > 0) {
      const lines = cash.bySource.map((row) => `${row.label}: **${formatMoney(row.amount, settings)}**`);
      embed.addFields({ name: `💵 Cash — Total: ${formatMoney(cash.total, settings)}`, value: lines.join('\n') });
    }

    if (arena.bySource.length > 0) {
      const lines = arena.bySource.map((row) => `${row.label}: **${formatArena(row.amount)}**`);
      embed.addFields({ name: `🏺 Arena Coins — Total: ${formatArena(arena.total)}`, value: lines.join('\n') });
    }

    if (items.bySource.length > 0) {
      
      
      
      
      const bySourceLabel = new Map();
      for (const row of items.bySource) {
        if (!bySourceLabel.has(row.label)) bySourceLabel.set(row.label, []);
        bySourceLabel.get(row.label).push(`${row.amount}x ${row.itemName}`);
      }
      const lines = [...bySourceLabel.entries()].map(([label, entries]) => `**${label}:** ${entries.join(', ')}`);
      embed.addFields({ name: '🎁 Items', value: lines.join('\n') });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
