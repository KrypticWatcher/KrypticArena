import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllDomains } from '../../data/bossDomains.js';
import { getBossProgress } from '../../utils/bossChallenges.js';

export default {
  data: new SlashCommandBuilder()
    .setName('boss_progress')
    .setDescription('Check your kill counts across every boss'),

  async execute(interaction) {
    const userId = interaction.user.id;

    const embed = new EmbedBuilder().setColor(0x2de8a0).setTitle(`${interaction.user.displayName}'s Boss Progress`);

    for (const domain of getAllDomains()) {
      const lines = domain.bosses.map((boss) => {
        const progress = getBossProgress(userId, boss.id);
        const progressNote = boss.sendsRequired > 1 && progress.progress > 0 ? ` — in progress: ${progress.progress}/${boss.sendsRequired}` : '';
        return `**${boss.name}**: ${progress.kills.toLocaleString('en-US')} kill${progress.kills === 1 ? '' : 's'}${progressNote}`;
      });
      embed.addFields({ name: `${domain.godName} — ${domain.domainName}`, value: lines.join('\n') });
    }

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
