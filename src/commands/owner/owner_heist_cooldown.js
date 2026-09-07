import { SlashCommandBuilder } from 'discord.js';
import { isOwnerId } from '../../utils/owner.js';
import { isMainServer } from '../../utils/botConfig.js';
import { isHeistOnCooldown, getHeistCooldownRemainingMs, clearHeistCooldown } from '../../utils/heistAttempts.js';
import { formatDuration } from '../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('owner_heist_cooldown')
    .setDescription("Owner only — end a user's heist cooldown early (doesn't lift their same-target lock)")
    .addUserOption((opt) => opt.setName('user').setDescription('Whose cooldown to clear').setRequired(true)),

  async execute(interaction) {
    if (!isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    }
    if (!isMainServer(interaction.guildId)) {
      return interaction.reply({ content: 'Owner tools only work in the main server.', ephemeral: true });
    }

    const target = interaction.options.getUser('user', true);

    if (!isHeistOnCooldown(interaction.guildId, target.id)) {
      return interaction.reply({ content: `<@${target.id}> isn't on a heist cooldown right now.`, ephemeral: true });
    }

    const remaining = getHeistCooldownRemainingMs(interaction.guildId, target.id);
    clearHeistCooldown(interaction.guildId, target.id);

    return interaction.reply({
      content: `🕶️ Cleared <@${target.id}>'s heist cooldown (had **${formatDuration(remaining)}** left) — they can launch a new heist now. Their same-target lock (if any) is untouched.`,
      ephemeral: true,
    });
  },
};
