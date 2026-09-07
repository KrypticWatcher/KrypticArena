import { SlashCommandBuilder } from 'discord.js';
import { isOwnerId } from '../../utils/owner.js';
import { setMainGuildId, getMainGuildId } from '../../utils/botConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set_main_server')
    .setDescription('Designate THIS server as the main server for /config, /owner, and /system — bot owner only'),

  async execute(interaction) {
    if (!isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    }

    const previous = getMainGuildId();
    setMainGuildId(interaction.guildId);

    const note = previous && previous !== interaction.guildId ? ` (was a different server before)` : '';
    return interaction.reply({
      content: `✅ This server is now the main server${note}. /config, /owner, and /system only work here from now on.`,
      ephemeral: true,
    });
  },
};
