import { buildPanelEmbed, buildButtonRows, backButton } from './panel.js';
import { ButtonStyle } from 'discord.js';

export function buildSystemTopPanel(ownerId) {
  const embed = buildPanelEmbed({
    title: '⚙️ System Controls',
    description: 'Bot owner only — these affect every server the bot is in.',
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'system-shutdown', action: 'ask', label: '🛑 Shutdown', style: ButtonStyle.Danger },
    { targetUserId: ownerId, screen: 'system-restart', action: 'ask', label: '🔄 Restart', style: ButtonStyle.Danger },
    { targetUserId: ownerId, screen: 'system-refresh', action: '', label: '📡 Refresh Commands' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildSystemRefreshPanel(ownerId) {
  const embed = buildPanelEmbed({
    title: '📡 Refresh Commands',
    description: 'Where should the refreshed command list be deployed?',
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'system-refresh', action: 'guild', label: 'This Server (instant)' },
    { targetUserId: ownerId, screen: 'system-refresh', action: 'global', label: 'Global — all servers (up to ~1hr)' },
    backButton(ownerId, 'system-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}
