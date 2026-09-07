import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGameStats, ensureGuild } from '../../utils/economy.js';
import { formatMoney } from '../../utils/format.js';

function displayName(game) {
  return game
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const GAMBLING_GAMES = new Set(['blackjack', 'blackjack_pairs', 'blackjack_insurance', 'roulette', 'slots', 'dice']);

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('See how much you\u2019re up or down, per gambling game')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Only show one game — leave blank to see all of them')
        .setRequired(false)
        .addChoices(
          { name: 'Blackjack', value: 'blackjack' },
          { name: 'Blackjack — Perfect Pairs', value: 'blackjack_pairs' },
          { name: 'Blackjack — Insurance', value: 'blackjack_insurance' },
          { name: 'Roulette', value: 'roulette' },
          { name: 'Slots', value: 'slots' },
          { name: 'Dice', value: 'dice' }
        )
    ),

  async execute(interaction) {
    const target = interaction.user;
    const settings = ensureGuild(interaction.guildId);
    const type = interaction.options.getString('type');
    let rows = getGameStats(interaction.guildId, target.id).filter((row) => GAMBLING_GAMES.has(row.game));
    if (type) rows = rows.filter((row) => row.game === type);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setAuthor({ name: `${target.username}'s P&L`, iconURL: target.displayAvatarURL() });

    if (rows.length === 0) {
      embed.setDescription(
        type ? `No **${displayName(type)}** played yet — this shows up here after your first game.` : 'No gambling games played yet — this shows up here after your first hand.'
      );
      return interaction.reply({ embeds: [embed] });
    }

    let totalNet = 0;
    let totalPlays = 0;

    for (const row of rows) {
      totalPlays += row.plays;
      totalNet += row.net;
      const netStr = `${row.net >= 0 ? '+' : ''}${formatMoney(row.net, settings)}`;
      embed.addFields({
        name: `${displayName(row.game)} — ${row.plays} played`,
        value: `${row.wins}W / ${row.losses}L / ${row.pushes}P  •  Net: **${netStr}**`,
        inline: false,
      });
    }

    if (rows.length > 1) {
      embed.setFooter({
        text: `Overall: ${totalPlays} game(s) played, net ${totalNet >= 0 ? '+' : ''}${formatMoney(totalNet, settings)}`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
