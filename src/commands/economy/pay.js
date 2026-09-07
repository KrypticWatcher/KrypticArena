import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pay, payArena, getBalance, getArenaBalance, ensureGuild, EconomyError } from '../../utils/economy.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { meetsTradeLevelRequirement } from '../../utils/gladiator.js';
import { isBlacklisted } from '../../utils/blacklist.js';

const CURRENCY_CHOICES = [
  { name: 'Gambling Currency', value: 'gambling' },
  { name: 'Arena Coins', value: 'arena' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription("Send money from your bank into another player's cash on hand")
    .addUserOption((opt) => opt.setName('user').setDescription('Who to pay').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount to send — e.g. 500, 1.5k, 2m, or "all"')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('currencytype')
        .setDescription('Which currency to send — defaults to Gambling Currency')
        .addChoices(...CURRENCY_CHOICES)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sender = interaction.user;
    const target = interaction.options.getUser('user', true);
    const currency = interaction.options.getString('currencytype') ?? 'gambling';

    if (target.id === sender.id) {
      return interaction.reply({ content: "You can't pay yourself.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't pay a bot.", ephemeral: true });
    }
    if (isBlacklisted(target.id)) {
      return interaction.reply({ content: 'This user is blacklisted.', ephemeral: false });
    }

    
    
    
    
    if (currency === 'arena') {
      if (!meetsTradeLevelRequirement(guildId, sender.id, sender.displayName)) {
        return interaction.reply({ content: 'you must be level 5 to use arena coin p2p payment', ephemeral: true });
      }
      if (!meetsTradeLevelRequirement(guildId, target.id, target.displayName)) {
        return interaction.reply({ content: 'you must be level 5 to use arena coin p2p payment', ephemeral: true });
      }
    }

    const settings = ensureGuild(guildId);
    const raw = interaction.options.getString('amount', true).trim().toLowerCase();

    
    
    
    
    
    let amount;
    if (raw === 'all') {
      amount = currency === 'arena' ? getArenaBalance(guildId, sender.id) : getBalance(guildId, sender.id).bank;
      if (amount <= 0) {
        const emptySource =
          currency === 'arena'
            ? "You don't have any arena coins to send."
            : "You don't have any money in your bank to send — try `/withdraw` first if it's sitting in cash.";
        return interaction.reply({ content: emptySource, ephemeral: true });
      }
    } else {
      amount = parseAmount(raw);
      if (amount === null || amount <= 0) {
        return interaction.reply({
          content: `**${raw}** isn't a valid amount. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`1b\`, or \`all\`.`,
          ephemeral: true,
        });
      }
    }

    try {
      if (currency === 'arena') {
        const result = payArena(guildId, sender.id, target.id, amount);
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`💸 Sent **${formatArena(amount)}** to ${target}.`)
          .addFields(
            { name: `⚔️ ${sender.username}'s Arena Coins`, value: formatArena(result.sender.arenaCoins), inline: true },
            { name: `⚔️ ${target.username}'s Arena Coins`, value: formatArena(result.recipient.arenaCoins), inline: true }
          );
        return interaction.reply({ embeds: [embed] });
      }

      const result = pay(guildId, sender.id, target.id, amount);
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`💸 Sent **${formatMoney(amount, settings)}** from your bank to ${target}'s cash.`)
        .addFields(
          { name: `🏦 ${sender.username}'s Bank`, value: formatMoney(result.sender.bank, settings), inline: true },
          { name: `💵 ${target.username}'s Cash`, value: formatMoney(result.recipient.cash, settings), inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
