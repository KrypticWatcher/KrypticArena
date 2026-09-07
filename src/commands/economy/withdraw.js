import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { withdraw, getBalance, ensureGuild, EconomyError } from '../../utils/economy.js';
import { formatMoney } from '../../utils/format.js';
import { parseAmount } from '../../utils/parseAmount.js';

export default {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Move money from your bank into your cash on hand')
    .addStringOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount to withdraw — e.g. 500, 1.5k, 2m, or "all"')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = ensureGuild(interaction.guildId);
    const raw = interaction.options.getString('amount', true).trim().toLowerCase();

    let amount;
    if (raw === 'all') {
      amount = getBalance(interaction.guildId, interaction.user.id).bank;
      if (amount <= 0) {
        return interaction.reply({
          content: "You don't have any money in the bank to withdraw.",
          ephemeral: true,
        });
      }
    } else {
      amount = parseAmount(raw);
      if (amount === null) {
        return interaction.reply({
          content: `**${raw}** isn't a valid amount. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`1b\`, or \`all\`.`,
          ephemeral: true,
        });
      }
    }

    try {
      const balance = withdraw(interaction.guildId, interaction.user.id, amount);
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(`Withdrew **${formatMoney(amount, settings)}** from your bank.`)
        .addFields(
          { name: '💵 Cash', value: formatMoney(balance.cash, settings), inline: true },
          { name: '🏦 Bank', value: formatMoney(balance.bank, settings), inline: true },
          { name: '💰 Total', value: formatMoney(balance.total, settings), inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
