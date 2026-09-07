import { EmbedBuilder } from 'discord.js';
import { getRepairableEquipped, getUniqueEquippedItems } from './durability.js';
import { findEquippedLocations } from './inventory.js';
import { EconomyError } from './economy.js';
import { formatMoney, formatArena } from './format.js';
import { getRepairCurrency, formatDurabilityPercent } from '../data/items.js';
import { normalizeQuotes } from './textMatch.js';
import { getGladiatorProfile } from './gladiator.js';
import { getActiveLabel } from './activeSession.js';

export function blockIfBusy(guildId, userId, displayName) {
  const profile = getGladiatorProfile(guildId, userId, displayName);
  if (profile.onAdventure) {
    return `**${profile.name}** can't repair their gear right now — they're on an adventure.`;
  }
  if (getActiveLabel(guildId, userId) === 'a Champion fight') {
    return `**${profile.name}** can't repair their gear right now — they're fighting in the arena.`;
  }
  return null;
}

const SET_LABELS = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };

export function locationTag(guildId, userId, instanceId) {
  const locations = findEquippedLocations(guildId, userId, instanceId);
  if (locations.length === 0) return '';
  const setLabel = SET_LABELS[locations[0].setName];
  const isTwoHanded = locations.length === 2 && locations[0].setName === locations[1].setName;
  if (isTwoHanded) return ` (${setLabel})`;
  return ` (${setLabel} \u00b7 ${locations[0].slot.replace('_', ' ')})`;
}

export function formatRepairCost(item, cost, settings) {
  return getRepairCurrency(item) === 'arena' ? formatArena(cost) : formatMoney(cost, settings);
}

export function resolveRepairInstanceId(guildId, userId, raw) {
  const repairable = getRepairableEquipped(guildId, userId);
  if (repairable.some((r) => r.item.instanceId === raw)) return raw;

  const typed = normalizeQuotes(raw.trim().toLowerCase());
  const exact = repairable.filter((r) => normalizeQuotes(r.item.name.toLowerCase()) === typed);
  const pool = exact.length > 0 ? exact : repairable.filter((r) => normalizeQuotes(r.item.name.toLowerCase()).includes(typed));

  if (pool.length === 0) return null;
  const distinctNames = [...new Set(pool.map((r) => r.item.name))];
  if (distinctNames.length > 1) {
    throw new EconomyError(`**${raw}** matches more than one damaged item (${distinctNames.join(', ')}) — type the full name or use the menu.`);
  }
  pool.sort((a, b) => a.durability.current - b.durability.current);
  return pool[0].item.instanceId;
}

export function buildDurabilityStatusEmbed(guildId, discordUser) {
  const items = getUniqueEquippedItems(guildId, discordUser.id);
  const lines = items.map((item) => {
    const bar = item.durability.broken ? '🔴 BROKEN' : `${formatDurabilityPercent(item.durability.current)}%`;
    const tag = locationTag(guildId, discordUser.id, item.instanceId);
    return `**${item.name}**${tag} — ${bar}`;
  });

  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setAuthor({ name: `${discordUser.username}'s Gear Durability`, iconURL: discordUser.displayAvatarURL() })
    .setDescription(lines.length > 0 ? lines.join('\n') : "You don't have anything equipped.");
}
