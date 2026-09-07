import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { requireAdmin } from '../../utils/permissions.js';

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Check the bot's uptime and connection status"),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const client = interaction.client;

    
    
    
    
    const uptimeMs = process.uptime() * 1000;
    const startedAt = new Date(Date.now() - uptimeMs);

    const wsPing = client.ws.ping;
    const pingDisplay = wsPing >= 0 ? `${wsPing}ms` : 'calculating…';

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setAuthor({ name: `${client.user.username} — Status`, iconURL: client.user.displayAvatarURL() })
      .addFields(
        { name: '🟢 Status', value: 'Online', inline: true },
        { name: '📶 Latency', value: pingDisplay, inline: true },
        { name: '🖥️ Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: '⏱️ Uptime', value: formatUptime(uptimeMs), inline: true },
        { name: '🚀 Started', value: `<t:${Math.floor(startedAt.getTime() / 1000)}:R>`, inline: true },
        { name: '🔢 Process ID', value: `${process.pid}`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
