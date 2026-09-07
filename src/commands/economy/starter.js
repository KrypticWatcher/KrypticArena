import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { grantStarterKit } from '../../utils/collectibles.js';
import { EconomyError } from '../../utils/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('starter')
    .setDescription("Claim your Tiro's Panoply starter kit — armor, weapons, and collectibles, once per player"),

  async execute(interaction) {
    try {
      const { items, arenaCoins, elixirCount } = grantStarterKit(interaction.guildId, interaction.user.id);

      const equipment = items.filter((i) => i.type === 'equipment');
      const collectables = items.filter((i) => i.type === 'collectable');

      const bonusLines = [];
      if (elixirCount > 0) bonusLines.push(`• **${elixirCount}x** Elixir`);
      if (arenaCoins > 0) bonusLines.push(`• **${arenaCoins.toLocaleString('en-US')}** Arena Coins`);

      const embed = new EmbedBuilder()
        .setColor(0x8b5a2b)
        .setAuthor({ name: `${interaction.user.username}'s Starter Kit`, iconURL: interaction.user.displayAvatarURL() })
        .setDescription("Welcome to the arena — here's everything a fresh recruit gets.")
        .addFields(
          { name: '🛡️ Equipment', value: equipment.map((i) => `• ${i.name}`).join('\n'), inline: false },
          { name: '📦 Collectibles', value: collectables.map((i) => `• ${i.name}`).join('\n'), inline: false },
          ...(bonusLines.length > 0 ? [{ name: '🪙 To get you started', value: bonusLines.join('\n'), inline: false }] : [])
        );

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
