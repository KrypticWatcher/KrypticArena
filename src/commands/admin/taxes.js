import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { requireMod } from '../../utils/permissions.js';
import { getTradingPostTaxTotal } from '../../utils/tradingPost.js';
import { formatArena } from '../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('taxes')
    .setDescription("See how many arena coins the Trading Post's 1% tax has removed from the economy — mod only"),

  async execute(interaction) {
    if (!(await requireMod(interaction))) return;

    const total = getTradingPostTaxTotal(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💰 Trading Post Tax')
      .setDescription(`**${formatArena(total)}** removed from the economy so far via the Trading Post.`);

    return interaction.reply({ embeds: [embed] });
  },
};
