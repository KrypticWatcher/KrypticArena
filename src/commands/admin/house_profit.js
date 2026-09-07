import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../../utils/permissions.js';
import { ensureGuild } from '../../utils/economy.js';
import { formatMoney } from '../../utils/format.js';
import { GLOBAL_ID } from '../../utils/globalId.js';
import db from '../../database.js';

function displayName(game) {
  return game
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const GAMBLING_GAMES = new Set(['blackjack', 'blackjack_pairs', 'blackjack_insurance', 'roulette', 'slots', 'dice']);

const stmtSumByGame = db.prepare(
  `SELECT game, SUM(net) AS playerNet, SUM(plays) AS plays FROM game_stats WHERE guild_id = ? GROUP BY game`
);

export default {
  data: new SlashCommandBuilder()
    .setName('house_profit')
    .setDescription("See the house's total net profit/loss across every gambling game, bot-wide — admin only"),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Admins only.', ephemeral: true });
    }

    
    
    
    
    
    const settings = ensureGuild(interaction.guildId);
    
    
    
    
    const rows = stmtSumByGame.all(GLOBAL_ID).filter((row) => GAMBLING_GAMES.has(row.game));

    const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('🏦 House Profit/Loss (bot-wide)');

    if (rows.length === 0) {
      embed.setDescription('No gambling games played yet.');
      return interaction.reply({ embeds: [embed] });
    }

    let totalPlayerNet = 0;
    let totalPlays = 0;
    for (const row of rows) {
      totalPlayerNet += row.playerNet;
      totalPlays += row.plays;
      const houseNet = -row.playerNet;
      embed.addFields({
        name: `${displayName(row.game)} — ${row.plays} played`,
        value: `House net: **${houseNet >= 0 ? '+' : ''}${formatMoney(houseNet, settings)}**`,
        inline: false,
      });
    }

    const totalHouseNet = -totalPlayerNet;
    embed.addFields({
      name: 'Overall',
      value: `${totalPlays} game(s) played, house net **${totalHouseNet >= 0 ? '+' : ''}${formatMoney(totalHouseNet, settings)}**`,
      inline: false,
    });

    return interaction.reply({ embeds: [embed] });
  },
};
