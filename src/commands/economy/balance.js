import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getBalance, ensureGuild } from '../../utils/economy.js';
import { getArenaBalance } from '../../utils/arena.js';
import { formatMoneyShort, formatArenaShort } from '../../utils/format.js';
import { isBlacklisted } from '../../utils/blacklist.js';

export default {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription('Check your cash, bank, and total balance')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Check someone else\'s balance').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (isBlacklisted(target.id)) {
      return interaction.reply({ content: 'This user is blacklisted.', ephemeral: false });
    }
    const settings = ensureGuild(interaction.guildId);
    const { cash, bank, total } = getBalance(interaction.guildId, target.id);
    const arenaCoins = getArenaBalance(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setAuthor({ name: `${target.username}'s Balance`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Cash', value: formatMoneyShort(cash, settings), inline: true },
        { name: 'Bank', value: formatMoneyShort(bank, settings), inline: true },
        { name: 'Total', value: formatMoneyShort(total, settings), inline: true },
        { name: 'Arena Coins', value: formatArenaShort(arenaCoins), inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
