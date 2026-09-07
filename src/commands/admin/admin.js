import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from '../../utils/permissions.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import {
  parseButtonCustomId,
  parseSelectCustomId,
  parseModalCustomId,
  buildValueModal,
  buildConfirmationPanel,
  buildPanelEmbed,
  buildButtonRows,
  modalCustomId,
} from '../../utils/panel.js';
import {
  buildTopPanel,
  buildInspectPanel,
  buildBalancesPanel,
  buildManageCurrencyPanel,
  buildInventoryPanel,
  buildViewInventoryPanel,
  buildGladiatorPanel,
  buildGladiatorXpPanel,
  buildAdventurePanel,
  buildDurabilityPanel,
  buildDurabilityItemPanel,
  buildGearPanel,
  buildProgressionPanel,
  buildResetPanel,
} from '../../utils/adminPanelScreens.js';
import { addCash, addBank, getBalance, ensureGuild, EconomyError } from '../../utils/economy.js';
import { addArenaCoins, getArenaBalance } from '../../utils/arena.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { logAdminAction, ADMIN_ACTIONS } from '../../utils/auditLog.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { addItemToInventory, applyItemBatch, parseItemBatchText } from '../../utils/inventory.js';
import { ITEMS, getItem, formatItemName, SETS, isOwnerOnlyItem } from '../../data/items.js';
import { isOwnerId } from '../../utils/owner.js';
import {
  adminSetGladiatorXp,
  adminAdjustGladiatorXp,
  setGladiatorName,
  getGladiatorRow,
  endGladiatorAdventure,
  adminLockGladiatorName,
  adminUnlockGladiatorName,
  adminGrantInstantTrips,
  adminRevokeInstantTrips,
} from '../../utils/gladiator.js';
import { resolveDueAdventure, recordRepeatButton } from '../../utils/adventureScheduler.js';
import { adminSetInstanceDurability, adminRepairInstance } from '../../utils/durability.js';
import {
  resetUserEconomy,
  resetUserInventory,
  resetUserGladiator,
  resetUserArenaStats,
  resetUserCasinoStats,
  resetUserStarterClaim,
  resetUserConstruction,
  resetUserEverything,
} from '../../utils/adminReset.js';

function findItemByNameAdmin(name) {
  const norm = normalizeQuotes(name.trim().toLowerCase());
  if (!norm) return null;
  const exact = ITEMS.find((item) => normalizeQuotes(item.name.toLowerCase()) === norm || item.id === norm);
  if (exact) return exact;
  const matches = ITEMS.filter((item) => normalizeQuotes(item.name.toLowerCase()).includes(norm));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new EconomyError(
      `"${name}" matches more than one item (${matches.slice(0, 5).map((i) => i.name).join(', ')}${matches.length > 5 ? ', ...' : ''}) — be more specific.`
    );
  }
  return null;
}

function targetLabel(targetUser) {
  return targetUser.username;
}

async function fetchTargetUser(interaction, targetUserId) {
  return interaction.client.users.fetch(targetUserId);
}

async function renderScreen(guildId, targetUser, screen) {
  if (screen.startsWith('durability-item~')) {
    const instanceId = screen.split('~')[1];
    return buildDurabilityItemPanel(guildId, targetUser, instanceId);
  }
  if (screen.startsWith('gear~')) {
    const setName = screen.split('~')[1];
    return buildGearPanel(guildId, targetUser, setName);
  }
  switch (screen) {
    case 'top':
      return buildTopPanel(targetUser);
    case 'inspect':
      return buildInspectPanel(guildId, targetUser);
    case 'balances':
      return buildBalancesPanel(guildId, targetUser);
    case 'balance-cash':
      return buildManageCurrencyPanel(guildId, targetUser, 'cash');
    case 'balance-bank':
      return buildManageCurrencyPanel(guildId, targetUser, 'bank');
    case 'balance-arena':
      return buildManageCurrencyPanel(guildId, targetUser, 'arena');
    case 'inventory':
      return buildInventoryPanel(targetUser);
    case 'inventory-view':
      return buildViewInventoryPanel(guildId, targetUser);
    case 'gladiator':
      return buildGladiatorPanel(guildId, targetUser);
    case 'gladiator-xp':
      return buildGladiatorXpPanel(guildId, targetUser);
    case 'adventure':
      return buildAdventurePanel(guildId, targetUser);
    case 'durability':
      return buildDurabilityPanel(guildId, targetUser);
    case 'gear':
      return buildGearPanel(guildId, targetUser, 'arena');
    case 'progression':
      return buildProgressionPanel(guildId, targetUser);
    case 'reset':
      return buildResetPanel(targetUser);
    default:
      return buildTopPanel(targetUser);
  }
}

const NAV_ACTIONS = new Set(['', 'back', 'refresh']);

const RESET_TYPES = {
  'reset-economy': {
    label: 'Economy',
    apply: resetUserEconomy,
    auditAction: ADMIN_ACTIONS.RESET_ECONOMY,
    description: (name) => `This will reset **${name}**'s cash, bank, and arena coins back to this server's starting values.`,
  },
  'reset-inventory': {
    label: 'Inventory',
    apply: resetUserInventory,
    auditAction: ADMIN_ACTIONS.RESET_INVENTORY,
    description: (name) => `This will permanently delete every item **${name}** owns or has equipped, and every saved loadout.`,
  },
  'reset-gladiator': {
    label: 'Gladiator',
    apply: resetUserGladiator,
    auditAction: ADMIN_ACTIONS.RESET_GLADIATOR,
    description: (name) =>
      `This will reset **${name}**'s Gladiator XP/level to 0, cancel any in-progress Adventure, and remove the Laurel of the Undying if they've earned it. Their Gladiator's name is kept.`,
  },
  'reset-arena': {
    label: 'Arena Stats',
    apply: resetUserArenaStats,
    auditAction: ADMIN_ACTIONS.RESET_ARENA_STATS,
    description: (name) => `This will wipe **${name}**'s Duel and Champion win/loss record.`,
  },
  'reset-casino': {
    label: 'Casino Stats',
    apply: resetUserCasinoStats,
    auditAction: ADMIN_ACTIONS.RESET_CASINO_STATS,
    description: (name) => `This will wipe **${name}**'s Blackjack stats.`,
  },
  'reset-starter': {
    label: 'Starter Claim',
    apply: resetUserStarterClaim,
    auditAction: ADMIN_ACTIONS.RESET_STARTER_CLAIM,
    description: (name) =>
      `This clears **${name}**'s starter-kit flag so \`/starter\` can be run again. It does NOT remove ` +
      `any items already received — if they still own any of the starter kit (the 3 capped-at-1 ` +
      `collectibles especially), re-running \`/starter\` will fail on the duplicate. Use this alone only ` +
      `if the flag got stuck without them actually receiving anything; otherwise clear their starter ` +
      `items first (Inventory reset or Remove Asset), then use this.`,
  },
  'reset-construction': {
    label: 'Construction (migration)',
    apply: resetUserConstruction,
    auditAction: ADMIN_ACTIONS.RESET_CONSTRUCTION,
    description: (name) =>
      `This wipes **${name}**'s Construction project progress (every project back to Tier 0, any ` +
      `in-progress build cancelled) and their Construction skill level/XP back to 0. Intended as a ` +
      `one-time migration tool for the 11-tier Construction rework, since the old tier numbers don't ` +
      `mean the same thing under the new system. Does not touch any other skill, inventory, or currency.`,
  },
};

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Player administration panel (admin only)')
    .addUserOption((opt) => opt.setName('user').setDescription('Player to manage').setRequired(true)),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const target = interaction.options.getUser('user', true);
    const { embeds, components } = buildTopPanel(target);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdmin(interaction))) return true;

    const { targetUserId, screen, action } = parsed;
    const guildId = interaction.guildId;
    const targetUser = await fetchTargetUser(interaction, targetUserId);

    if (screen === 'close') {
      await interaction.update({ content: '✅ Panel closed.', embeds: [], components: [] });
      return true;
    }

    if (NAV_ACTIONS.has(action)) {
      const payload = await renderScreen(guildId, targetUser, screen);
      await interaction.update({ attachments: [], ...payload });
      return true;
    }

    if (['balance-cash', 'balance-bank', 'balance-arena'].includes(screen)) {
      const currency = screen.replace('balance-', '');
      const label = currency === 'arena' ? 'Arena Coins' : currency === 'cash' ? 'Cash' : 'Bank';
      const verb = action === 'add' ? 'Add' : action === 'remove' ? 'Remove' : 'Set';
      const modal = buildValueModal({
        targetUserId,
        screen,
        action,
        title: `${verb} ${label}`,
        label: action === 'set' ? `New ${label} total` : `Amount to ${action}`,
        placeholder: 'e.g. 500, 1.5k, 2m',
      });
      await interaction.showModal(modal);
      return true;
    }

    if (screen === 'inventory-give' || screen === 'inventory-remove') {
      const isGive = screen === 'inventory-give';
      const modal = new ModalBuilder()
        .setCustomId(modalCustomId(targetUserId, screen, 'do'))
        .setTitle(isGive ? 'Give Assets' : 'Remove Assets')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('items')
              .setLabel('One item per line — e.g. "5 rusty sword"')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('5 rusty sword\n2 tarnished coin pouch\nwooden shield')
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return true;
    }

    if (screen === 'gladiator-xp') {
      const verb = action === 'add' ? 'Add' : action === 'remove' ? 'Remove' : 'Set';
      const modal = buildValueModal({
        targetUserId,
        screen,
        action,
        title: `${verb} Gladiator XP`,
        label: action === 'set' ? 'New XP total' : `XP to ${action}`,
        placeholder: 'Whole number',
      });
      await interaction.showModal(modal);
      return true;
    }

    if (screen === 'gladiator-rename') {
      const gladiator = getGladiatorRow(guildId, targetUserId);
      const modal = buildValueModal({
        targetUserId,
        screen,
        action: 'do',
        title: 'Rename Gladiator',
        label: 'New name',
        value: gladiator?.name,
      });
      await interaction.showModal(modal);
      return true;
    }

    if (screen === 'gladiator-namelock' && action === 'toggle') {
      const row = getGladiatorRow(guildId, targetUserId);
      if (row?.name_locked) {
        adminUnlockGladiatorName(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.GLADIATOR_RENAME, targetUserId, 'Unlocked Gladiator name');
      } else {
        adminLockGladiatorName(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.GLADIATOR_RENAME, targetUserId, "Locked Gladiator name to \"Zoot's plaything\"");
      }
      await interaction.update(buildGladiatorPanel(guildId, targetUser));
      return true;
    }

    if (screen === 'gladiator-instanttrips' && action === 'toggle') {
      const row = getGladiatorRow(guildId, targetUserId);
      if (row?.instant_trips) {
        adminRevokeInstantTrips(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, targetUserId, 'Revoked Instant Trips');
      } else {
        adminGrantInstantTrips(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, targetUserId, 'Granted Instant Trips');
      }
      await interaction.update(buildGladiatorPanel(guildId, targetUser));
      return true;
    }

    if (screen === 'adventure' && (action === 'complete' || action === 'cancel')) {
      const row = getGladiatorRow(guildId, targetUserId);
      if (!row || !(row.adventure_ends_at > 0)) {
        await interaction.update(buildAdventurePanel(guildId, targetUser));
        return true;
      }

      let postError = null;
      if (action === 'complete') {
        const { channelId, content, components, files } = await resolveDueAdventure(row);
        logAdminAction(
          guildId,
          interaction.user.id,
          ADMIN_ACTIONS.ADVENTURE_COMPLETE_NOW,
          targetUserId,
          `Force-completed an in-progress Adventure`
        );
        try {
          const channel = await interaction.client.channels.fetch(channelId);
          const message = await channel.send({ content, components, files });
          recordRepeatButton(guildId, targetUserId, channelId, message.id);
        } catch (err) {
          console.error("Couldn't post force-completed Adventure result:", err.message);

          postError = { channelId, message: err.message };
        }
      } else {
        endGladiatorAdventure(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.ADVENTURE_CANCEL, targetUserId, 'Cancelled an in-progress Adventure (no rewards)');
      }

      await interaction.update(buildAdventurePanel(guildId, targetUser));
      if (postError) {
        await interaction.followUp({
          content:
            `⚠️ Rewards were applied, but I couldn't post the result message in <#${postError.channelId}> — ` +
            `**${postError.message}**. This is almost always the bot missing View Channel/Send Messages permission ` +
            `in that specific channel.`,
          ephemeral: true,
        });
      }
      return true;
    }

    if (screen.startsWith('durability-item~')) {
      const instanceId = screen.split('~')[1];
      if (action === 'set') {
        const modal = buildValueModal({
          targetUserId,
          screen,
          action: 'set',
          title: 'Set Durability',
          label: 'New durability (0-100)',
          placeholder: '0-100',
        });
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'repair') {
        try {
          const { item } = adminRepairInstance(guildId, targetUserId, instanceId);
          const setTag = item.set && SETS[item.set] ? ` (${SETS[item.set].name})` : '';
          logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.DURABILITY_REPAIR, targetUserId, `Fully repaired ${item.name}${setTag} (free)`);
        } catch (err) {
          if (!(err instanceof EconomyError)) throw err;
        }
        await interaction.update(buildDurabilityItemPanel(guildId, targetUser, instanceId));
        return true;
      }
    }

    if (RESET_TYPES[screen]) {
      const meta = RESET_TYPES[screen];
      if (action === 'ask') {
        const payload = buildConfirmationPanel({
          targetUserId,
          screen,
          confirmAction: 'confirm',
          cancelAction: 'cancel',
          title: `Confirm ${meta.label} Reset`,
          description: meta.description(targetLabel(targetUser)),
        });
        await interaction.update(payload);
        return true;
      }
      if (action === 'cancel') {
        await interaction.update(buildResetPanel(targetUser));
        return true;
      }
      if (action === 'confirm') {
        meta.apply(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, meta.auditAction, targetUserId, `Reset: ${meta.label}`);
        const embed = buildPanelEmbed({ title: '✅ Reset Complete', description: `${meta.label} has been reset for **${targetLabel(targetUser)}**.` });
        await interaction.update({ embeds: [embed], components: buildButtonRows([{ targetUserId, screen: 'reset', action: '', label: '◀️ Back to Reset' }]) });
        return true;
      }
    }

    if (screen === 'reset-everything') {
      if (action === 'ask') {
        const payload = buildConfirmationPanel({
          targetUserId,
          screen,
          confirmAction: 'confirm',
          cancelAction: 'cancel',
          title: 'Confirm FULL Reset',
          description:
            `⚠️ This will reset **EVERYTHING** for **${targetLabel(targetUser)}**: economy, inventory, Gladiator progression, ` +
            `Arena stats, and Casino stats. This cannot be undone.\n\nClicking Confirm will ask you to type a confirmation phrase.`,
        });
        await interaction.update(payload);
        return true;
      }
      if (action === 'cancel') {
        await interaction.update(buildResetPanel(targetUser));
        return true;
      }
      if (action === 'confirm') {
        const modal = buildValueModal({
          targetUserId,
          screen,
          action: 'finalize',
          title: 'Type DELETE to confirm',
          label: 'Type DELETE (all caps) to proceed',
          placeholder: 'DELETE',
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    await interaction.update(buildTopPanel(targetUser));
    return true;
  },

  async handleSelect(interaction) {
    const parsed = parseSelectCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdmin(interaction))) return true;

    const { targetUserId, screen, action } = parsed;
    const guildId = interaction.guildId;
    const targetUser = await fetchTargetUser(interaction, targetUserId);

    if (screen === 'durability' && action === 'pick') {
      const instanceId = interaction.values[0];
      await interaction.update(buildDurabilityItemPanel(guildId, targetUser, instanceId));
      return true;
    }

    await interaction.update(buildTopPanel(targetUser));
    return true;
  },

  async handleModal(interaction) {
    const parsed = parseModalCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdmin(interaction))) return true;

    const { targetUserId, screen, action } = parsed;
    const guildId = interaction.guildId;
    const targetUser = await fetchTargetUser(interaction, targetUserId);
    const settings = ensureGuild(guildId);

    try {

      if (['balance-cash', 'balance-bank', 'balance-arena'].includes(screen)) {
        const currency = screen.replace('balance-', '');
        const raw = interaction.fields.getTextInputValue('value');
        const amount = parseAmount(raw);
        if (amount === null || amount < 0) {
          return interaction.reply({ content: `**${raw}** isn't a valid amount.`, ephemeral: true });
        }

        let delta;
        if (action === 'set') {
          const current = currency === 'arena' ? getArenaBalance(guildId, targetUserId) : getBalance(guildId, targetUserId)[currency];
          delta = amount - current;
        } else {
          delta = action === 'add' ? amount : -amount;
        }

        if (currency === 'arena') addArenaCoins(guildId, targetUserId, delta);
        else if (currency === 'cash') addCash(guildId, targetUserId, delta);
        else addBank(guildId, targetUserId, delta);

        const label = currency === 'arena' ? 'Arena Coins' : currency === 'cash' ? 'Cash' : 'Bank';
        const verb = action === 'set' ? 'Set' : action === 'add' ? 'Added' : 'Removed';
        const displayAmount = currency === 'arena' ? formatArena(Math.abs(delta)) : formatMoney(Math.abs(delta), settings);
        logAdminAction(
          guildId,
          interaction.user.id,
          delta >= 0 ? ADMIN_ACTIONS.MONEY_ADD : ADMIN_ACTIONS.MONEY_REMOVE,
          targetUserId,
          `${verb} ${label}: ${displayAmount} (${action})`
        );

        await interaction.update(buildManageCurrencyPanel(guildId, targetUser, currency));
        return true;
      }

      if (screen === 'inventory-give' || screen === 'inventory-remove') {
        const isGive = screen === 'inventory-give';
        const text = interaction.fields.getTextInputValue('items');

        let requested;
        try {
          requested = parseItemBatchText(text, findItemByNameAdmin);
        } catch (err) {
          if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
          throw err;
        }

        const deltas = requested.map(({ itemId, quantity }) => ({ itemId, amount: isGive ? quantity : -quantity }));

        if (isGive) {
          const blocked = requested.find(({ itemId }) => isOwnerOnlyItem(getItem(itemId)));
          if (blocked && !isOwnerId(interaction.user.id)) {
            return interaction.reply({
              content: `**${getItem(blocked.itemId).name}** is an owner-exclusive item — only the bot owner can grant it.`,
              ephemeral: true,
            });
          }
        }

        let results;
        try {
          results = applyItemBatch(guildId, targetUserId, deltas);
        } catch (err) {
          if (err instanceof EconomyError) {
            return interaction.reply({ content: `Nothing was changed — ${err.message}`, ephemeral: true });
          }
          throw err;
        }

        const summary = results
          .map(({ item, newQty }, i) => `**${requested[i].quantity}x ${formatItemName(item)}** — now owns **${newQty}**`)
          .join('\n');
        logAdminAction(
          guildId,
          interaction.user.id,
          isGive ? ADMIN_ACTIONS.ITEM_GRANT : ADMIN_ACTIONS.ITEM_REMOVE,
          targetUserId,
          `${isGive ? 'Granted' : 'Removed'} ${requested.map((r) => `${r.quantity}x ${r.item.name}${r.item.set && SETS[r.item.set] ? ` (${SETS[r.item.set].name})` : ''}`).join(', ')}`
        );
        await interaction.update(buildInventoryPanel(targetUser));
        await interaction.followUp({
          content: `${isGive ? '🎁 Granted' : '🗑️ Removed'} ${isGive ? 'to' : 'from'} ${targetLabel(targetUser)}:\n${summary}`,
          ephemeral: true,
        });
        return true;
      }

      if (screen === 'gladiator-xp') {
        const raw = interaction.fields.getTextInputValue('value');
        const amount = parseInt(raw, 10);
        if (!Number.isInteger(amount) || (action !== 'set' && amount <= 0) || (action === 'set' && amount < 0)) {
          return interaction.reply({ content: `**${raw}** isn't a valid XP amount.`, ephemeral: true });
        }
        if (action === 'set') {
          adminSetGladiatorXp(guildId, targetUserId, amount, targetUser.username);
        } else {
          adminAdjustGladiatorXp(guildId, targetUserId, action === 'add' ? amount : -amount, targetUser.username);
        }
        logAdminAction(
          guildId,
          interaction.user.id,
          action === 'set' ? ADMIN_ACTIONS.GLADIATOR_XP_SET : action === 'add' ? ADMIN_ACTIONS.GLADIATOR_XP_ADD : ADMIN_ACTIONS.GLADIATOR_XP_REMOVE,
          targetUserId,
          `XP ${action}: ${amount.toLocaleString('en-US')}`
        );
        await interaction.update(buildGladiatorXpPanel(guildId, targetUser));
        return true;
      }

      if (screen === 'gladiator-rename') {
        const newName = interaction.fields.getTextInputValue('value');
        const before = getGladiatorRow(guildId, targetUserId)?.name;
        setGladiatorName(guildId, targetUserId, newName);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.GLADIATOR_RENAME, targetUserId, `Renamed "${before}" -> "${newName}"`);
        await interaction.update(buildGladiatorPanel(guildId, targetUser));
        return true;
      }

      if (screen.startsWith('durability-item~') && action === 'set') {
        const instanceId = screen.split('~')[1];
        const raw = interaction.fields.getTextInputValue('value');
        const percent = parseInt(raw, 10);
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
          return interaction.reply({ content: `**${raw}** isn't valid — durability must be 0-100.`, ephemeral: true });
        }
        const { item } = adminSetInstanceDurability(guildId, targetUserId, instanceId, percent);
        const setTag = item.set && SETS[item.set] ? ` (${SETS[item.set].name})` : '';
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.DURABILITY_SET, targetUserId, `Set ${item.name}${setTag} durability to ${percent}%`);
        await interaction.update(buildDurabilityItemPanel(guildId, targetUser, instanceId));
        return true;
      }

      if (screen === 'reset-everything' && action === 'finalize') {
        const typed = interaction.fields.getTextInputValue('value').trim();
        if (typed.toUpperCase() !== 'DELETE') {
          return interaction.reply({ content: 'That doesn\u2019t match — nothing was reset. Try again from the Reset panel.', ephemeral: true });
        }
        resetUserEverything(guildId, targetUserId);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.RESET_EVERYTHING, targetUserId, 'FULL reset (economy, inventory, gladiator, arena stats, casino stats)');
        const embed = buildPanelEmbed({
          title: '☢️ Full Reset Complete',
          description: `Everything has been reset for **${targetLabel(targetUser)}**.`,
        });
        await interaction.update({ embeds: [embed], components: buildButtonRows([{ targetUserId, screen: 'top', action: '', label: '◀️ Back to Menu' }]) });
        return true;
      }
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    await interaction.update(buildTopPanel(targetUser));
    return true;
  },
};
