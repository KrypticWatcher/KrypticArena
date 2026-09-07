const SET_LABELS = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };
import { renderGearImage } from './gearImage.js';
import { getGladiatorProfile, formatGladiatorDisplayName, isGladiatorMaxed, getGladiatorRow } from './gladiator.js';
import { getArenaRankInfo } from './ranks.js';
import { listFlags, hasFlag } from './permissions.js';
import { formatMoney, formatArena, formatDuration, buildInventoryLines } from './format.js';
import { formatItemName, formatDurabilityPercent } from '../data/items.js';
import { getBalance, getArenaBalance, ensureGuild } from './economy.js';
import { getInventory, getEquipment, getAllEquipmentSets } from './inventory.js';
import { getUniqueEquippedItems } from './durability.js';
import { buildPanelEmbed, buildButtonRows, buildSelectRow, backButton } from './panel.js';
import { ButtonStyle, AttachmentBuilder } from 'discord.js';
import { findBossAnywhere } from '../data/bossDomains.js';
import { describeSlayActiveTrip } from './slay.js';
import { describeGatheringActiveTrip } from './gathering.js';
import { describeHuntingActiveTrip } from './hunting.js';
import { describeCookingActiveTrip } from './cooking.js';
import { describeHerbalismActiveTrip } from './herbalism.js';
import { describeSmithingActiveTrip } from './smithing.js';
import { describeFletchingActiveTrip } from './fletching.js';
import { describeCraftingActiveTrip } from './crafting.js';
import { describeMagicCraftingActiveTrip } from './magicCrafting.js';
import { describeFarmingActiveTrip } from './farming.js';

function describeActiveTripActivity(profile) {
  if (profile.activeBossId) {
    const found = findBossAnywhere(profile.activeBossId);
    return `Boss Challenge — ${found?.boss?.name ?? profile.activeBossId}`;
  }
  const line =
    describeGatheringActiveTrip(profile.activeMobId, '') ??
    describeHuntingActiveTrip(profile.activeMobId, '') ??
    describeCookingActiveTrip(profile.activeMobId, '') ??
    describeHerbalismActiveTrip(profile.activeMobId, '') ??
    describeSmithingActiveTrip(profile.activeMobId, '') ??
    describeFletchingActiveTrip(profile.activeMobId, '') ??
    describeCraftingActiveTrip(profile.activeMobId, '') ??
    describeMagicCraftingActiveTrip(profile.activeMobId, '') ??
    describeFarmingActiveTrip(profile.activeMobId, '') ??
    describeSlayActiveTrip(profile.activeMobId, '');
  if (line) {

    return line.replace(/^\S+\s*/, '').replace(/\.\s*Back\s*\.$/, '');
  }
  return `Quest — ${profile.adventureLocation ?? 'unknown location'}`;
}

function targetLabel(targetUser) {
  return `${targetUser.username}`;
}

export function buildTopPanel(targetUser) {
  const embed = buildPanelEmbed({
    title: `🛠️ Player Administration — ${targetLabel(targetUser)}`,
    description: 'Select a section to manage.',
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'inspect', action: '', label: '🔎 Inspect' },
    { targetUserId: targetUser.id, screen: 'balances', action: '', label: '💰 Balances' },
    { targetUserId: targetUser.id, screen: 'inventory', action: '', label: '📦 Inventory' },
    { targetUserId: targetUser.id, screen: 'gladiator', action: '', label: '🧑\u200d⚔️ Gladiator' },
    { targetUserId: targetUser.id, screen: 'adventure', action: '', label: '🗺️ Adventure' },
    { targetUserId: targetUser.id, screen: 'durability', action: '', label: '🛡️ Durability' },
    { targetUserId: targetUser.id, screen: 'gear', action: '', label: '🖼️ Gear' },
    { targetUserId: targetUser.id, screen: 'progression', action: '', label: '🏆 Progression' },
    { targetUserId: targetUser.id, screen: 'reset', action: '', label: '🗑️ Reset', style: ButtonStyle.Danger },
    { targetUserId: targetUser.id, screen: 'close', action: '', label: '❌ Close', style: ButtonStyle.Secondary },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildInspectPanel(guildId, targetUser) {
  const balance = getBalance(guildId, targetUser.id);
  const arena = getArenaBalance(guildId, targetUser.id);
  const settings = ensureGuild(guildId);
  const profile = getGladiatorProfile(guildId, targetUser.id, targetUser.displayName);
  const rankInfo = getArenaRankInfo(guildId, targetUser.id);
  const flags = listFlags(targetUser.id);
  const tierFlag = flags.find((f) => /^T[1-7]$/.test(f));

  const adventureLine = profile.onAdventure
    ? `Active — ${describeActiveTripActivity(profile)}, back ${formatDuration(profile.adventureEndsAt - Date.now())}`
    : 'Not adventuring';

  const embed = buildPanelEmbed({
    title: `🔎 Player Inspection — ${targetLabel(targetUser)}`,
    fields: [
      {
        name: '💰 Balances',
        value: `Cash: ${formatMoney(balance.cash, settings)}\nBank: ${formatMoney(balance.bank, settings)}\nArena Coins: ${formatArena(arena)}`,
      },
      {
        name: '🧑\u200d⚔️ Gladiator',
        value: `${formatGladiatorDisplayName(guildId, targetUser.id, profile.name)}\nLevel ${profile.level}${isGladiatorMaxed(guildId, targetUser.id) ? ' (MAXED)' : ''} — ${profile.xp.toLocaleString('en-US')} XP`,
      },
      { name: '🗺️ Adventure', value: adventureLine },
      {
        name: '⚔️ Arena Record',
        value: `${rankInfo.wins}W / ${rankInfo.losses}L\nRank: ${rankInfo.rank}${rankInfo.loserTitle ? ` • ${rankInfo.loserTitle}` : ''}`,
      },
      { name: '🎟️ Access', value: flags.length ? flags.join(', ') : 'None' },
    ],
  });

  const buttons = [
    { targetUserId: targetUser.id, screen: 'inventory', action: '', label: '📦 Inventory' },
    { targetUserId: targetUser.id, screen: 'durability', action: '', label: '🛡️ Durability' },
    { targetUserId: targetUser.id, screen: 'gear', action: '', label: '🖼️ Gear' },
    { targetUserId: targetUser.id, screen: 'inspect', action: 'refresh', label: '🔄 Refresh' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildBalancesPanel(guildId, targetUser) {
  const balance = getBalance(guildId, targetUser.id);
  const arena = getArenaBalance(guildId, targetUser.id);
  const settings = ensureGuild(guildId);

  const embed = buildPanelEmbed({
    title: `💰 Balances — ${targetLabel(targetUser)}`,
    description: `Cash: ${formatMoney(balance.cash, settings)}\nBank: ${formatMoney(balance.bank, settings)}\nArena Coins: ${formatArena(arena)}`,
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'balance-cash', action: '', label: '💵 Cash' },
    { targetUserId: targetUser.id, screen: 'balance-bank', action: '', label: '🏦 Bank' },
    { targetUserId: targetUser.id, screen: 'balance-arena', action: '', label: '🪙 Arena Coins' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

const CURRENCY_META = {
  cash: { label: 'Cash', screen: 'balance-cash' },
  bank: { label: 'Bank', screen: 'balance-bank' },
  arena: { label: 'Arena Coins', screen: 'balance-arena' },
};

export function buildManageCurrencyPanel(guildId, targetUser, currency) {
  const meta = CURRENCY_META[currency];
  const settings = ensureGuild(guildId);
  const current =
    currency === 'arena'
      ? formatArena(getArenaBalance(guildId, targetUser.id))
      : formatMoney(getBalance(guildId, targetUser.id)[currency], settings);

  const embed = buildPanelEmbed({
    title: `Manage ${meta.label} — ${targetLabel(targetUser)}`,
    description: `Current: **${current}**`,
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: meta.screen, action: 'add', label: '➕ Add' },
    { targetUserId: targetUser.id, screen: meta.screen, action: 'remove', label: '➖ Remove' },
    { targetUserId: targetUser.id, screen: meta.screen, action: 'set', label: '✏️ Set' },
    backButton(targetUser.id, 'balances'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildInventoryPanel(targetUser) {
  const embed = buildPanelEmbed({
    title: `📦 Inventory Administration — ${targetLabel(targetUser)}`,
    description: 'Give or remove an asset, or view everything currently owned.',
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'inventory-give', action: 'open', label: '➕ Give Asset' },
    { targetUserId: targetUser.id, screen: 'inventory-remove', action: 'open', label: '➖ Remove Asset' },
    { targetUserId: targetUser.id, screen: 'inventory-view', action: '', label: '👀 View Inventory' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildViewInventoryPanel(guildId, targetUser) {
  const equipment = getInventory(guildId, targetUser.id, 'equipment');
  const collectables = getInventory(guildId, targetUser.id, 'collectable');

  const equipLines = equipment.length ? buildInventoryLines(equipment, 'equipment') : ['*None owned.*'];
  const collectLines = collectables.length ? buildInventoryLines(collectables, 'collectable') : ['*None owned.*'];

  const embed = buildPanelEmbed({
    title: `📦 ${targetLabel(targetUser)}'s Inventory`,
    fields: [
      { name: '⚔️ Equipment (unequipped)', value: equipLines.join('\n').slice(0, 1024) },
      { name: '🎁 Collectables', value: collectLines.join('\n').slice(0, 1024) },
    ],
    footer: 'Equipped gear is shown in 🛡️ Durability, not here.',
  });
  const buttons = [backButton(targetUser.id, 'inventory')];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildGladiatorPanel(guildId, targetUser) {
  const profile = getGladiatorProfile(guildId, targetUser.id, targetUser.displayName);
  const row = getGladiatorRow(guildId, targetUser.id);
  const embed = buildPanelEmbed({
    title: `🧑\u200d⚔️ Gladiator Administration — ${targetLabel(targetUser)}`,
    description:
      `Name: ${formatGladiatorDisplayName(guildId, targetUser.id, profile.name)}${row.name_locked ? ' 🔒' : ''}\n` +
      `Level: ${profile.level}\nXP: ${profile.xp.toLocaleString('en-US')} / 200,000,000` +
      `\nInstant Trips: ${row.instant_trips ? '✅ Granted' : '❌ Not granted'}`,
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'gladiator-xp', action: '', label: '⭐ XP' },
    { targetUserId: targetUser.id, screen: 'gladiator-rename', action: 'open', label: '✏️ Rename' },
    {
      targetUserId: targetUser.id,
      screen: 'gladiator-namelock',
      action: 'toggle',
      label: row.name_locked ? '🔓 Unlock Name' : '🔒 Lock Name',
      style: row.name_locked ? undefined : ButtonStyle.Danger,
    },
    {
      targetUserId: targetUser.id,
      screen: 'gladiator-instanttrips',
      action: 'toggle',
      label: row.instant_trips ? '🐌 Revoke Instant Trips' : '⚡ Grant Instant Trips',
      style: row.instant_trips ? ButtonStyle.Danger : ButtonStyle.Success,
    },
    { targetUserId: targetUser.id, screen: 'gladiator', action: 'refresh', label: '🔄 Refresh' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildGladiatorXpPanel(guildId, targetUser) {
  const profile = getGladiatorProfile(guildId, targetUser.id, targetUser.displayName);
  const embed = buildPanelEmbed({
    title: `⭐ Gladiator XP — ${targetLabel(targetUser)}`,
    description: `Current XP: ${profile.xp.toLocaleString('en-US')}\nCurrent Level: ${profile.level}`,
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'gladiator-xp', action: 'add', label: '➕ Add XP' },
    { targetUserId: targetUser.id, screen: 'gladiator-xp', action: 'remove', label: '➖ Remove XP' },
    { targetUserId: targetUser.id, screen: 'gladiator-xp', action: 'set', label: '✏️ Set XP' },
    backButton(targetUser.id, 'gladiator'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildAdventurePanel(guildId, targetUser) {
  const profile = getGladiatorProfile(guildId, targetUser.id, targetUser.displayName);
  let status = 'Not adventuring';

if (profile.onAdventure) {
  if (profile.activeBossId) {
  const found = findBossAnywhere(profile.activeBossId);
  const bossName = found?.boss?.name ?? profile.activeBossId;

  status = `Boss Challenge — ${bossName}, back ${formatDuration(profile.adventureEndsAt - Date.now())}`;
} else {
    status = `${describeActiveTripActivity(profile)}, back ${formatDuration(profile.adventureEndsAt - Date.now())}`;
  }
}

  const embed = buildPanelEmbed({
    title: `🗺️ Adventure Administration — ${targetLabel(targetUser)}`,
    description: `Status: ${status}`,
  });
  const buttons = [
    {
      targetUserId: targetUser.id,
      screen: 'adventure',
      action: 'complete',
      label: '⚡ Complete Now',
      disabled: !profile.onAdventure,
    },
    {
      targetUserId: targetUser.id,
      screen: 'adventure',
      action: 'cancel',
      label: '❌ Cancel Adventure',
      style: ButtonStyle.Danger,
      disabled: !profile.onAdventure,
    },
    { targetUserId: targetUser.id, screen: 'adventure', action: 'refresh', label: '🔄 Refresh' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export async function buildGearPanel(guildId, targetUser, setName = 'arena') {
  const equipped = getEquipment(guildId, targetUser.id, setName);
  const allSets = getAllEquipmentSets(guildId, targetUser.id);

  const themed = hasFlag(targetUser.id, 'T6');
  const png = await renderGearImage(targetUser.username, equipped, { themed, setLabel: SET_LABELS[setName], allSets });
  const embed = buildPanelEmbed({
    title: `🖼️ Equipped Gear — ${targetLabel(targetUser)} (${SET_LABELS[setName]})`,
    footer: 'View-only — use 🛡️ Durability to edit a piece.',
  }).setImage('attachment://gear.png');
  const buttons = [
    { targetUserId: targetUser.id, screen: 'gear~arena', action: '', label: 'Arena', disabled: setName === 'arena' },
    { targetUserId: targetUser.id, screen: 'gear~adventure', action: '', label: 'Slayer', disabled: setName === 'adventure' },
    { targetUserId: targetUser.id, screen: 'gear~misc', action: '', label: 'Skilling', disabled: setName === 'misc' },
    { targetUserId: targetUser.id, screen: 'durability', action: '', label: '🛡️ Durability' },
    { targetUserId: targetUser.id, screen: `gear~${setName}`, action: 'refresh', label: '🔄 Refresh' },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons), files: [new AttachmentBuilder(png, { name: 'gear.png' })] };
}

export function buildDurabilityPanel(guildId, targetUser) {
  const equipped = getUniqueEquippedItems(guildId, targetUser.id);
  const embed = buildPanelEmbed({
    title: `🛡️ Equipment Durability — ${targetLabel(targetUser)}`,
    description: equipped.length ? 'Select a piece of equipped gear to manage.' : '*Nothing currently equipped.*',
  });
  if (equipped.length === 0) {
    return { embeds: [embed], components: buildButtonRows([backButton(targetUser.id, 'top')]) };
  }
  const selectRow = buildSelectRow({
    targetUserId: targetUser.id,
    screen: 'durability',
    action: 'pick',
    placeholder: 'Select Equipment',
    options: equipped.map((item) => ({
      label: item.isWearExempt ? `${item.name} — no durability` : `${item.name} — ${item.durability.broken ? 'BROKEN' : `${formatDurabilityPercent(item.durability.current)}%`}`,
      value: item.instanceId,
    })),
  });
  const backRow = buildButtonRows([backButton(targetUser.id, 'top')]);
  return { embeds: [embed], components: [selectRow, ...backRow] };
}

export function buildDurabilityItemPanel(guildId, targetUser, instanceId) {
  const item = getUniqueEquippedItems(guildId, targetUser.id).find((i) => i.instanceId === instanceId);
  if (!item) {
    const embed = buildPanelEmbed({
      title: '🛡️ Durability',
      description: "That item is no longer equipped — it may have been unequipped or traded since this panel opened.",
    });
    return { embeds: [embed], components: buildButtonRows([backButton(targetUser.id, 'durability')]) };
  }
  const embed = buildPanelEmbed({
    title: formatItemName(item),
    description: item.isWearExempt ? 'This item never loses durability.' : `Durability: ${Math.round(item.durability.current)} / 100`,
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: `durability-item~${instanceId}`, action: 'set', label: '✏️ Set Durability' },
    { targetUserId: targetUser.id, screen: `durability-item~${instanceId}`, action: 'repair', label: '🔧 Fully Repair' },
    backButton(targetUser.id, 'durability'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildProgressionPanel(guildId, targetUser) {
  const rankInfo = getArenaRankInfo(guildId, targetUser.id);
  const embed = buildPanelEmbed({
    title: `🏆 Progression — ${targetLabel(targetUser)}`,
    description:
      `**Rank:** ${rankInfo.rank}\n` +
      `${rankInfo.loserTitle ? `**Loser Title:** ${rankInfo.loserTitle}\n` : ''}` +
      `**Record:** ${rankInfo.wins}W / ${rankInfo.losses}L\n\n` +
      `*Achievements, Titles, and Badges as a full grantable system aren't built yet — this is everything that currently exists for this player.*`,
  });
  const buttons = [backButton(targetUser.id, 'top')];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildResetPanel(targetUser) {
  const embed = buildPanelEmbed({
    title: `🗑️ Player Reset — ${targetLabel(targetUser)}`,
    description: 'Choose what to reset. Every option asks for confirmation first — nothing here fires on a single click.',
  });
  const buttons = [
    { targetUserId: targetUser.id, screen: 'reset-economy', action: 'ask', label: '💰 Economy' },
    { targetUserId: targetUser.id, screen: 'reset-inventory', action: 'ask', label: '📦 Inventory' },
    { targetUserId: targetUser.id, screen: 'reset-gladiator', action: 'ask', label: '🧑\u200d⚔️ Gladiator' },
    { targetUserId: targetUser.id, screen: 'reset-arena', action: 'ask', label: '⚔️ Arena Stats' },
    { targetUserId: targetUser.id, screen: 'reset-casino', action: 'ask', label: '🎰 Casino Stats' },
    { targetUserId: targetUser.id, screen: 'reset-starter', action: 'ask', label: '🎁 Starter Claim' },
    { targetUserId: targetUser.id, screen: 'reset-construction', action: 'ask', label: '🏗️ Construction (migration)' },
    { targetUserId: targetUser.id, screen: 'reset-everything', action: 'ask', label: '☢️ Everything', style: ButtonStyle.Danger },
    backButton(targetUser.id, 'top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}
