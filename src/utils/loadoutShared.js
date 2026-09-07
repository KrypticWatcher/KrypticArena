import { EmbedBuilder } from 'discord.js';
import { getLoadouts, resolveLoadoutSlots, MAX_LOADOUTS } from './inventory.js';
import { SLOTS, formatItemName } from '../data/items.js';

export function buildLoadoutListReply(guildId, userId) {
  const loadouts = getLoadouts(guildId, userId);
  if (loadouts.length === 0) {
    return {
      content: `You don't have any saved loadouts yet. Use \`/loadout save\` (up to ${MAX_LOADOUTS}), then \`/equip preset:\` to load one back in.`,
      ephemeral: true,
    };
  }

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`⚔️ Your Loadouts (${loadouts.length}/${MAX_LOADOUTS})`)
    .setDescription(
      loadouts
        .map((l) => {
          const resolved = resolveLoadoutSlots(l);
          
          
          const isTwoHanded = resolved.main_hand?.twoHanded && resolved.off_hand?.instanceId === resolved.main_hand.instanceId;
          const slotsForDisplay = isTwoHanded ? SLOTS.filter((s) => s !== 'off_hand') : SLOTS;
          const gear = slotsForDisplay.map((slot) => (resolved[slot] ? formatItemName(resolved[slot]) : null)).filter(Boolean);
          return `**${l.name}**\n${gear.length > 0 ? gear.join(', ') : '*(nothing equipped when saved)*'}`;
        })
        .join('\n\n')
    );
  return { embeds: [embed], ephemeral: true };
}
