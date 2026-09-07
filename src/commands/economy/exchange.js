import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureGuild, EconomyError } from '../../utils/economy.js';
import {
  exchangeToArena,
  exchangeToGambling,
  getExchangeStatus,
  GAMBLING_TO_ARENA_RATE,
  ARENA_TO_GAMBLING_RATE,
} from '../../utils/arena.js';
import { formatMoney, formatArena, formatDuration } from '../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('exchange')
    .setDescription('Convert between your gambling currency and arena coins')
    .addSubcommand((sub) => sub.setName('status').setDescription("Check today's remaining exchange allowance"))
    .addSubcommand((sub) =>
      sub
        .setName('arena')
        .setDescription(`Buy arena coins with cash (${GAMBLING_TO_ARENA_RATE.toLocaleString('en-US')} cash per coin, daily cap applies)`)
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('How many arena coins to buy').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('casino')
        .setDescription(`Sell arena coins for cash (${ARENA_TO_GAMBLING_RATE.toLocaleString('en-US')} cash per coin)`)
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('How many arena coins to sell').setRequired(true).setMinValue(1)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = ensureGuild(interaction.guildId);

    if (sub === 'status') {
      const { usedToday, remaining, resetAt, cap, onCooldown, cooldownReadyAt } = getExchangeStatus(
        interaction.guildId,
        interaction.user.id
      );
      const cooldownLine = onCooldown ? `\n🕒 Next exchange available in **${formatDuration(cooldownReadyAt - Date.now())}**.` : '';
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setDescription(
          `🏺 You've exchanged **${usedToday}/${cap}** arena coins today.\n` +
            `Remaining: **${remaining}**\n` +
            `Resets in **${formatDuration(resetAt - Date.now())}**.${cooldownLine}`
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount', true);

    try {
      if (sub === 'arena') {
        const result = exchangeToArena(interaction.guildId, interaction.user.id, amount);
        const embed = new EmbedBuilder()
          .setColor(0xd4af37)
          .setDescription(
            `🏺 Exchanged **${formatMoney(result.cashSpent, settings)}** for **${formatArena(result.arenaGained)}**.\n` +
              `Arena balance: **${formatArena(result.arenaBalance)}**\n` +
              `Remaining today: **${result.remainingToday}/${result.cap}**`
          );
        return interaction.reply({ embeds: [embed] });
      }

      
      const result = exchangeToGambling(interaction.guildId, interaction.user.id, amount);
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setDescription(
          `🏺 Sold **${formatArena(result.arenaSpent)}** for **${formatMoney(result.cashGained, settings)}**.\n` +
            `Arena balance: **${formatArena(result.arenaBalance)}**`
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
