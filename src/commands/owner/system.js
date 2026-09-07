import { SlashCommandBuilder } from 'discord.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isOwnerId } from '../../utils/owner.js';
import { isMainServer } from '../../utils/botConfig.js';
import { deployCommands } from '../../utils/deploy.js';
import { parseButtonCustomId, buildConfirmationPanel } from '../../utils/panel.js';
import { buildSystemTopPanel, buildSystemRefreshPanel } from '../../utils/systemPanelScreens.js';
import { logAdminAction, ADMIN_ACTIONS } from '../../utils/auditLog.js';

function renderScreen(ownerId, screen) {
  switch (screen) {
    case 'system-top':
      return buildSystemTopPanel(ownerId);
    case 'system-refresh':
      return buildSystemRefreshPanel(ownerId);
    default:
      return buildSystemTopPanel(ownerId);
  }
}

const NAV_ACTIONS = new Set(['', 'back', 'refresh']);

async function denyIfNotOwner(interaction) {
  if (!isOwnerId(interaction.user.id)) {
    await interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    return true;
  }
  if (!isMainServer(interaction.guildId)) {
    await interaction.reply({ content: 'Owner tools only work in the main server.', ephemeral: true });
    return true;
  }
  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName('system')
    .setDescription('Bot process controls — bot owner only'),

  async execute(interaction) {
    if (await denyIfNotOwner(interaction)) return;
    const { embeds, components } = buildSystemTopPanel(interaction.user.id);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotOwner(interaction)) return true;

    const { targetUserId: ownerId, screen, action } = parsed;

    
    if (NAV_ACTIONS.has(action) && screen !== 'system-shutdown' && screen !== 'system-restart') {
      await interaction.update(renderScreen(ownerId, screen));
      return true;
    }

    
    if (screen === 'system-shutdown') {
      if (action === 'ask') {
        const payload = buildConfirmationPanel({
          targetUserId: ownerId,
          screen,
          confirmAction: 'confirm',
          cancelAction: 'cancel',
          title: 'Confirm Shutdown',
          description: '⚠️ This will shut the bot down completely, on **every** server, until someone starts it again manually.',
        });
        await interaction.update(payload);
        return true;
      }
      if (action === 'cancel') {
        await interaction.update(buildSystemTopPanel(ownerId));
        return true;
      }
      if (action === 'confirm') {
        await interaction.update({ content: '🛑 Shutting down now.', embeds: [], components: [] });
        logAdminAction(interaction.guildId ?? 'GLOBAL', interaction.user.id, ADMIN_ACTIONS.SYSTEM_SHUTDOWN, null, 'Bot shut down (every server)', 'system');
        interaction.client.destroy();
        process.exit(0);
      }
    }

    
    if (screen === 'system-restart') {
      if (action === 'ask') {
        const payload = buildConfirmationPanel({
          targetUserId: ownerId,
          screen,
          confirmAction: 'confirm',
          cancelAction: 'cancel',
          title: 'Confirm Restart',
          description: '⚠️ This will restart the bot process on **every** server. It should reconnect within a few seconds.',
        });
        await interaction.update(payload);
        return true;
      }
      if (action === 'cancel') {
        await interaction.update(buildSystemTopPanel(ownerId));
        return true;
      }
      if (action === 'confirm') {
        await interaction.update({ content: '🔄 Restarting now — should be back in a few seconds.', embeds: [], components: [] });
        logAdminAction(interaction.guildId ?? 'GLOBAL', interaction.user.id, ADMIN_ACTIONS.SYSTEM_RESTART, null, 'Bot restarted (every server)', 'system');

        
        
        
        
        
        
        const logPath = path.join(process.cwd(), 'restart.log');
        const logFd = fs.openSync(logPath, 'a');
        fs.writeSync(logFd, `\n--- restart requested by ${interaction.user.tag} at ${new Date().toISOString()} ---\n`);

        const child = spawn(process.execPath, process.argv.slice(1), {
          cwd: process.cwd(),
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: process.env,
        });
        child.unref();

        interaction.client.destroy();
        process.exit(0);
      }
    }

    
    if (screen === 'system-refresh' && (action === 'guild' || action === 'global')) {
      await interaction.update({ content: '📡 Refreshing commands...', embeds: [], components: [] });
      try {
        const result = await deployCommands({ guildId: action === 'guild' ? interaction.guildId : undefined });
        logAdminAction(
          interaction.guildId ?? 'GLOBAL',
          interaction.user.id,
          ADMIN_ACTIONS.SYSTEM_DEPLOY,
          null,
          `Refreshed ${result.count} command(s) ${action === 'guild' ? 'for this server' : 'globally'}`,
          'system'
        );
        await interaction.followUp({
          content:
            action === 'guild'
              ? `✅ Refreshed ${result.count} command(s) for this server (should show up immediately).`
              : `✅ Refreshed ${result.count} command(s) globally (can take up to ~1 hour to fully propagate everywhere).`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('Failed to refresh commands:', err);
        await interaction.followUp({ content: 'Something went wrong refreshing commands — check the bot logs.', ephemeral: true });
      }
      return true;
    }

    await interaction.update(buildSystemTopPanel(ownerId));
    return true;
  },

  
  
  
  async handleSelect(interaction) {
    return false;
  },
  async handleModal(interaction) {
    return false;
  },
};
