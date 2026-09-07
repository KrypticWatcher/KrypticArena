import { ButtonStyle } from 'discord.js';
import { buildPanelEmbed, buildButtonRows, backButton, buildUserSelectRow } from './panel.js';
import { getBannedWords } from './nameFilter.js';
import { getGladiatorRow } from './gladiator.js';

export function buildModTopPanel(modId) {
  const embed = buildPanelEmbed({
    title: '🛡️ Mod Controls',
    description: 'Limited moderator tools. Admins have access here too.',
  });
  const buttons = [
    { targetUserId: modId, screen: 'mod-namelock', action: '', label: '🔒 Name Lock' },
    { targetUserId: modId, screen: 'mod-namefilter', action: '', label: '🚫 Name Filter' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildModNameLockPanel(modId) {
  const embed = buildPanelEmbed({
    title: '🔒 Gladiator Name Lock',
    description: 'Lock a Gladiator\u2019s name to stop them renaming themselves, or lift an existing lock.',
  });
  const buttons = [
    { targetUserId: modId, screen: 'mod-namelock', action: 'lock', label: '🔒 Lock a Player', style: ButtonStyle.Danger },
    { targetUserId: modId, screen: 'mod-namelock', action: 'unlock', label: '🔓 Unlock a Player' },
    backButton(modId, 'mod-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildModNameLockPickerPanel(modId, { selectAction, title, description, placeholder }) {
  const embed = buildPanelEmbed({ title, description });
  return {
    embeds: [embed],
    components: [
      buildUserSelectRow({ targetUserId: modId, screen: 'mod-namelock', action: selectAction, placeholder }),
      ...buildButtonRows([backButton(modId, 'mod-namelock')]),
    ],
  };
}

export function buildModNameLockResultPanel(modId, message) {
  const embed = buildPanelEmbed({ title: '🔒 Name Lock', description: message });
  return { embeds: [embed], components: buildButtonRows([backButton(modId, 'mod-namelock')]) };
}

export function isNameLocked(guildId, userId) {
  return Boolean(getGladiatorRow(guildId, userId)?.name_locked);
}

export function buildModNameFilterPanel(modId, guildId) {
  const entries = getBannedWords(guildId);
  const wildcard = entries.filter((e) => e.match_type === 'wildcard').map((e) => e.word);
  const exact = entries.filter((e) => e.match_type === 'exact').map((e) => e.word);

  const embed = buildPanelEmbed({
    title: '🚫 Gladiator Name Filter',
    description: 'Words blocked from Gladiator names on this server.',
    fields: [
      { name: `Wildcard (${wildcard.length})`, value: wildcard.length ? wildcard.join(', ') : '*(none)*', inline: false },
      { name: `Exact (${exact.length})`, value: exact.length ? exact.join(', ') : '*(none)*', inline: false },
    ],
  });
  const buttons = [
    { targetUserId: modId, screen: 'mod-namefilter', action: 'add-wildcard', label: '➕ Add Wildcard' },
    { targetUserId: modId, screen: 'mod-namefilter', action: 'add-exact', label: '➕ Add Exact' },
    { targetUserId: modId, screen: 'mod-namefilter', action: 'remove-wildcard', label: '➖ Remove Wildcard' },
    { targetUserId: modId, screen: 'mod-namefilter', action: 'remove-exact', label: '➖ Remove Exact' },
    backButton(modId, 'mod-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}
