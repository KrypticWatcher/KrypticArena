import { buildPanelEmbed, buildButtonRows, backButton, buildUserSelectRow, buildRoleSelectRow, buildSelectRow, modalCustomId, buttonCustomId } from './panel.js';
import { ButtonStyle, ButtonBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { previewGuildEconomyReset, GLOBAL_RESET_TABLES } from './economyReset.js';
import { grantOwnerProgressiveSet } from './ownerProgressiveGear.js';
import { getGladiatorProfile } from './gladiator.js';
import { getItem, getRarityLabel } from '../data/items.js';
import { getBlacklist } from './blacklist.js';
import { BITFIELD_FLAG_CHOICES } from './permissions.js';
import { getAllBackgrounds, getInventoryBackgroundById, getUsersWithAccess, isBackgroundPublic } from './inventoryBackgrounds.js';

const FLAG_SELECT_OPTIONS = BITFIELD_FLAG_CHOICES.map((c) => ({ label: c.name, value: c.value }));

export function buildOwnerTopPanel(ownerId) {
  const embed = buildPanelEmbed({
    title: '👑 Owner Controls',
    description: 'Bot owner only.',
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'owner-bitfield', action: '', label: '🎚️ Bitfield' },
    { targetUserId: ownerId, screen: 'owner-blacklist', action: '', label: '🚫 Blacklist' },
    { targetUserId: ownerId, screen: 'owner-hades', action: '', label: "👑 Hades" },
    { targetUserId: ownerId, screen: 'owner-inv-bg', action: '', label: '🖼️ Inventory BGs' },
    { targetUserId: ownerId, screen: 'owner-reset', action: '', label: '☢️ Economy Reset', style: ButtonStyle.Danger },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerResetTopPanel(ownerId, guildId, guildName) {
  const embed = buildPanelEmbed({
    title: '☢️ Full Economy Reset',
    description:
      `A genuine fresh slate. Wipes every player's progress in **${guildName}** — cash, bank, arena coins, Gladiator ` +
      `(XP/level/name/gear), inventory, all 3 gear sets, loadouts, claim history, game stats, Skill XP/levels, owned ` +
      `pets, heist state, any active Trading Post listings, and any in-flight duels/trades/sells/roulette rounds.\n\n` +
      `**⚠️ ALSO GLOBAL — every server, not just ${guildName}:** boss kills/progress, the collection log, per-tier ` +
      `Adventure completion counts, per-user display flags, /slay kill counts, Farming plots, and Construction ` +
      `progress are all bot-wide (they have no per-server concept at all), so ` +
      `running this here wipes them for that player everywhere the bot is installed, not just this server. Same as the ` +
      `ADMIN bitfield flag below.\n\n` +
      `**Does NOT touch:** server config (\`/config\`), the name filter word list, the bot-wide blacklist, the admin audit log, ` +
      `custom inventory/gear backgrounds and who has access to them, or anyone's T1-7 perk flags.\n\n` +
      `**⚠️ ALSO GLOBAL:** the ADMIN bitfield flag is cleared for ANYONE holding it, in ANY server this bot ` +
      `is in — not just ${guildName}'s. T1-7 are left alone on purpose (they're meant to track a real subscription, not ` +
      `bot-testing state).`,
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'owner-reset', action: 'preview', label: '🔍 Preview What Would Be Deleted' },
    backButton(ownerId, 'owner-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerResetPreviewPanel(ownerId, guildId, guildName) {
  const counts = previewGuildEconomyReset(guildId);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const lines = Object.entries(counts)
    .filter(([table, n]) => table !== 'user_bitfields' && n > 0)
    .map(([table, n]) =>
      `**${n.toLocaleString('en-US')}** row(s) — \`${table}\`` +
      (GLOBAL_RESET_TABLES.has(table) ? ` ⚠️ *(global — every server, not just ${guildName})*` : '')
    );

  const bitfieldCount = counts.user_bitfields;
  if (bitfieldCount > 0) {
    lines.push(
      `**${bitfieldCount.toLocaleString('en-US')}** row(s) — \`user_bitfields\` ADMIN flag cleared ⚠️ *(global — every server, not just ${guildName}; T1-7 untouched)*`
    );
  }

  const embed = buildPanelEmbed({
    title: '🔍 Reset Preview',
    description:
      total === 0
        ? `**${guildName}** has no player data at all right now — nothing to reset.`
        : `This is exactly what would be permanently deleted:\n\n${lines.join('\n')}\n\n**Total: ${total.toLocaleString('en-US')} row(s).**`,
  });
  const buttons = [
    ...(total > 0
      ? [{ targetUserId: ownerId, screen: 'owner-reset', action: 'ask', label: '☢️ Continue to Confirmation', style: ButtonStyle.Danger }]
      : []),
    backButton(ownerId, 'owner-reset'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerHadesPanel(guildId, ownerId, displayName) {
  const profile = getGladiatorProfile(guildId, ownerId, displayName);
  const embed = buildPanelEmbed({
    title: "👑 Hades — The Unseen King's Dominion",
    description:
      `Spawns (or upgrades) the full 10-piece Unseen King's Dominion set for your own Gladiator in this server, ` +
      `scaled to your current level (**${profile.level}**). Already-owned pieces are left untouched — the set ` +
      `auto-upgrades further on its own as you level up, no need to re-run this after every level.`,
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'owner-hades', action: 'spawn', label: '👑 Spawn / Upgrade Set' },
    backButton(ownerId, 'owner-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerHadesResultPanel(ownerId, { granted, alreadyOwned, rarity }, level) {
  const rarityLabel = getRarityLabel(rarity);
  const embed = buildPanelEmbed({
    title: "👑 The Unseen King's Dominion",
    color: 0x6a0dad,
    description:
      granted.length === 0
        ? `You already own the full Unseen King's Dominion — currently at **${rarityLabel}**, matching Gladiator level ${level}. Nothing new to spawn.`
        : `Spawned at **${rarityLabel}** (matching your Gladiator's level ${level}) — it'll automatically upgrade further as you level up.\n\n` +
          `**New pieces:**\n${granted.map((id) => `• ${getItem(id).name}`).join('\n')}` +
          (alreadyOwned.length > 0 ? `\n\n*${alreadyOwned.length} piece(s) you already had were left untouched.*` : ''),
  });
  return { embeds: [embed], components: buildButtonRows([backButton(ownerId, 'owner-hades')]) };
}

export function buildOwnerBlacklistPanel(ownerId) {
  const embed = buildPanelEmbed({
    title: '🚫 Blacklist',
    description:
      'Blocks a user from every command, button, and interaction in every server this bot is in — bot-wide, not scoped to this server.',
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'owner-blacklist', action: 'add', label: '➕ Add User', style: ButtonStyle.Danger },
    
    
    
    
    
    { targetUserId: ownerId, screen: 'owner-blacklist', action: 'add-by-id', label: '🆔 Add by ID', style: ButtonStyle.Danger },
    { targetUserId: ownerId, screen: 'owner-blacklist', action: 'remove', label: '➖ Remove User' },
    { targetUserId: ownerId, screen: 'owner-blacklist', action: 'remove-by-id', label: '🆔 Remove by ID' },
    { targetUserId: ownerId, screen: 'owner-blacklist', action: 'list', label: '📋 View List' },
    backButton(ownerId, 'owner-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerBlacklistAddPickerPanel(ownerId) {
  const embed = buildPanelEmbed({ title: '🚫 Blacklist — Add User', description: 'Pick who to blacklist.' });
  const rows = [
    buildUserSelectRow({ targetUserId: ownerId, screen: 'owner-blacklist', action: 'add-user', placeholder: 'Select a user to blacklist' }),
    ...buildButtonRows([backButton(ownerId, 'owner-blacklist')]),
  ];
  return { embeds: [embed], components: rows };
}

export function buildOwnerBlacklistRemovePickerPanel(ownerId) {
  const embed = buildPanelEmbed({ title: '🚫 Blacklist — Remove User', description: 'Pick who to remove from the blacklist.' });
  const rows = [
    buildUserSelectRow({ targetUserId: ownerId, screen: 'owner-blacklist', action: 'remove-user', placeholder: 'Select a user to remove' }),
    ...buildButtonRows([backButton(ownerId, 'owner-blacklist')]),
  ];
  return { embeds: [embed], components: rows };
}

export function buildOwnerBlacklistListPanel(ownerId) {
  const entries = getBlacklist();
  let description = 'The blacklist is empty.';
  if (entries.length > 0) {
    description = entries
      .map((e) => {
        const when = `<t:${e.blacklisted_at}:R>`;
        const reasonText = e.reason ? ` — ${e.reason}` : '';
        return `<@${e.user_id}> (\`${e.user_id}\`), blacklisted by <@${e.blacklisted_by}> ${when}${reasonText}`;
      })
      .join('\n');
    
    
    
    
    if (description.length > 3900) {
      description = `${description.slice(0, 3900)}\n… and more (${entries.length} total — trim the list to see the rest).`;
    }
  }
  const embed = buildPanelEmbed({ title: '🚫 Blacklist', description, footer: entries.length ? `${entries.length} user(s)` : undefined });
  return { embeds: [embed], components: buildButtonRows([backButton(ownerId, 'owner-blacklist')]) };
}

export function buildOwnerBlacklistResultPanel(ownerId, message) {
  const embed = buildPanelEmbed({ title: '🚫 Blacklist', description: message });
  return { embeds: [embed], components: buildButtonRows([backButton(ownerId, 'owner-blacklist')]) };
}

export function buildOwnerBitfieldPanel(ownerId) {
  const embed = buildPanelEmbed({
    title: '🎚️ Bitfield',
    description:
      'Bot-wide permission flags (ADMIN, T1-7) — a separate system from Discord\'s own server permissions, scoped globally by user, not per-server.',
  });
  const buttons = [
    { targetUserId: ownerId, screen: 'owner-bitfield', action: 'grant', label: '➕ Grant Flag', style: ButtonStyle.Success },
    { targetUserId: ownerId, screen: 'owner-bitfield', action: 'revoke', label: '➖ Revoke Flag', style: ButtonStyle.Danger },
    { targetUserId: ownerId, screen: 'owner-bitfield', action: 'list', label: '📋 List Flags' },
    { targetUserId: ownerId, screen: 'owner-bitfield', action: 'grant-role', label: '➕ Grant to Role', style: ButtonStyle.Success },
    { targetUserId: ownerId, screen: 'owner-bitfield', action: 'revoke-role', label: '➖ Revoke from Role', style: ButtonStyle.Danger },
    backButton(ownerId, 'owner-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildOwnerBitfieldUserPickerPanel(ownerId, { selectAction, title, description, placeholder }) {
  const embed = buildPanelEmbed({ title, description });
  const rows = [
    buildUserSelectRow({ targetUserId: ownerId, screen: 'owner-bitfield', action: selectAction, placeholder }),
    ...buildButtonRows([backButton(ownerId, 'owner-bitfield')]),
  ];
  return { embeds: [embed], components: rows };
}

export function buildOwnerBitfieldRolePickerPanel(ownerId, { selectAction, title, description, placeholder }) {
  const embed = buildPanelEmbed({ title, description });
  const rows = [
    buildRoleSelectRow({ targetUserId: ownerId, screen: 'owner-bitfield', action: selectAction, placeholder }),
    ...buildButtonRows([backButton(ownerId, 'owner-bitfield')]),
  ];
  return { embeds: [embed], components: rows };
}

export function buildOwnerBitfieldFlagPickerPanel(ownerId, { selectAction, title, description, placeholder }) {
  const embed = buildPanelEmbed({ title, description });
  const rows = [
    buildSelectRow({ targetUserId: ownerId, screen: 'owner-bitfield', action: selectAction, placeholder, options: FLAG_SELECT_OPTIONS }),
    ...buildButtonRows([backButton(ownerId, 'owner-bitfield')]),
  ];
  return { embeds: [embed], components: rows };
}

export function buildOwnerBitfieldResultPanel(ownerId, message) {
  const embed = buildPanelEmbed({ title: '🎚️ Bitfield', description: message });
  return { embeds: [embed], components: buildButtonRows([backButton(ownerId, 'owner-bitfield')]) };
}

export function buildOwnerInvBgTopPanel(ownerId) {
  const backgrounds = getAllBackgrounds();
  const embed = buildPanelEmbed({
    title: '🖼️ Inventory Backgrounds',
    description:
      backgrounds.length === 0
        ? "None yet — add one below. Paste a direct image URL (right-click an image in Discord -> Copy Link) and a name."
        : backgrounds
            .map((bg) => (isBackgroundPublic(bg.id) ? `**${bg.name}** — 🌐 Public, everyone has access` : `**${bg.name}** — ${getUsersWithAccess(bg.id).length} player(s) have access`))
            .join('\n'),
  });
  const rows = [];
  if (backgrounds.length > 0) {
    rows.push(
      buildSelectRow({
        targetUserId: ownerId,
        screen: 'owner-inv-bg',
        action: 'manage',
        placeholder: 'Select a background to manage',
        options: backgrounds.map((bg) => ({ label: bg.name, value: bg.id })),
      })
    );
  }
  rows.push(...buildButtonRows([{ targetUserId: ownerId, screen: 'owner-inv-bg', action: 'add', label: '➕ Add New' }, backButton(ownerId, 'owner-top')]));
  return { embeds: [embed], components: rows };
}

export function buildInvBgAddModal(ownerId) {
  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('Image URL (right-click image -> Copy Link)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const nameInput = new TextInputBuilder().setCustomId('name').setLabel('Name (shown in /inventory_bg)').setStyle(TextInputStyle.Short).setRequired(true);
  return new ModalBuilder()
    .setCustomId(modalCustomId(ownerId, 'owner-inv-bg', 'add'))
    .setTitle('Add Inventory Background')
    .addComponents(new ActionRowBuilder().addComponents(urlInput), new ActionRowBuilder().addComponents(nameInput));
}

export function buildOwnerInvBgManagePanel(ownerId, backgroundId) {
  const bg = getInventoryBackgroundById(backgroundId);
  if (!bg) return buildOwnerInvBgTopPanel(ownerId);

  const isManual = bg.created_by === 'manual';
  const isPublic = isBackgroundPublic(bg.id);
  const grants = getUsersWithAccess(bg.id);
  const embed = buildPanelEmbed({
    title: `🖼️ ${bg.name}`,
    description:
      (isManual ? "*Manually registered in code — access/deletion are edited directly in data/manualInventoryBackgrounds.js, not here.*\n\n" : '') +
      (isPublic
        ? '🌐 **Public** — every player already has access, everywhere a custom background can be used. Grants below still work but are redundant while this stays public.\n\n'
        : '') +
      (grants.length === 0
        ? "Nobody has been individually granted access yet."
        : `**Individually granted:**\n${grants.map((g) => `<@${g.userId}>`).join('\n')}`),
  });
  const rows = isManual
    ? buildButtonRows([backButton(ownerId, 'owner-inv-bg')])
    : [

        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(buttonCustomId(ownerId, 'owner-inv-bg', `toggle-public:${bg.id}`))
            .setLabel(isPublic ? '🌐 Make Private' : '🌐 Make Public')
            .setStyle(isPublic ? ButtonStyle.Danger : ButtonStyle.Success)
        ),
        buildUserSelectRow({
          targetUserId: ownerId,
          screen: 'owner-inv-bg',
          action: `grant:${bg.id}`,
          placeholder: 'Grant access to a player',
        }),

        buildRoleSelectRow({
          targetUserId: ownerId,
          screen: 'owner-inv-bg',
          action: `grant-role:${bg.id}`,
          placeholder: 'Grant access to everyone in a role',
        }),
        buildUserSelectRow({ targetUserId: ownerId, screen: 'owner-inv-bg', action: `revoke:${bg.id}`, placeholder: 'Revoke access from a player' }),
        ...buildButtonRows([
          { targetUserId: ownerId, screen: 'owner-inv-bg', action: `delete-ask:${bg.id}`, label: '🗑️ Delete This Background', style: ButtonStyle.Danger },
          backButton(ownerId, 'owner-inv-bg'),
        ]),
      ];
  return { embeds: [embed], components: rows };
}

