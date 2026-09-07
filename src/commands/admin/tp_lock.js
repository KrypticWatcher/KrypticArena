import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { requireAdmin } from '../../utils/permissions.js';
import { isMainServer } from '../../utils/botConfig.js';
import { isTradingPostLocked, setTradingPostLocked } from '../../utils/tradingPost.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tp_lock')
    .setDescription('Lock or unlock the Trading Post entirely — admin only')
    .addBooleanOption((opt) => opt.setName('locked').setDescription('true to lock, false to unlock').setRequired(true)),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    if (!isMainServer(interaction.guildId)) {
      return interaction.reply({ content: '/tp_lock only works in the main server.', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const locked = interaction.options.getBoolean('locked', true);
    const wasLocked = isTradingPostLocked(guildId);
    setTradingPostLocked(guildId, locked);

    const embed = new EmbedBuilder()
      .setColor(locked ? 0xe15b4f : 0x2ecc71)
      .setDescription(
        locked
          ? '🔒 The Trading Post is now **locked** — every /tp command will show "The Trading Post is currently closed." until unlocked.'
          : '🔓 The Trading Post is now **unlocked** — normal operation resumed.'
      );
    if (locked === wasLocked) {
      embed.setFooter({ text: `It was already ${locked ? 'locked' : 'unlocked'} — no change.` });
    }
    return interaction.reply({ embeds: [embed] });
  },
};
