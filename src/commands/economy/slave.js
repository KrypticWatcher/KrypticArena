import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureGuild } from '../../utils/economy.js';
import { doSlaveWork } from '../../utils/arena.js';
import { formatMoney, formatArena, formatDuration } from '../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slave')
    .setDescription('Work the arena grounds for cash and a chance at arena coins (cooldown set by server admins)'),

  async execute(interaction) {
    const settings = ensureGuild(interaction.guildId);
    const result = doSlaveWork(interaction.guildId, interaction.user.id);

    if (result.status === 'cooldown') {
      const remaining = formatDuration(result.readyAt - Date.now());
      return interaction.reply({
        content: `🥵 You're worn out from your last shift — try again in **${remaining}**.`,
        ephemeral: true,
      });
    }

    const lines = [
      `⛓️ You toil in the arena grounds and scrape together **${formatMoney(result.gambling, settings)}**` +
        (result.arena > 0 ? ` and **${formatArena(result.arena)}**.` : '.'),
      `Arena balance: **${formatArena(result.arenaBalance)}**`,
    ];
    if (result.arenaCapped) {
      lines.push("🏺 You've hit today's arena coin limit from labor — more will roll in once it resets.");
    }

    const embed = new EmbedBuilder().setColor(0x8b5a2b).setDescription(lines.join('\n'));
    return interaction.reply({ embeds: [embed] });
  },
};
