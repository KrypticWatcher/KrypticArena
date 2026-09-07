import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { claimAll } from '../../utils/collectibles.js';
import { ensureGuild } from '../../utils/economy.js';
import { formatMoney, formatArena, formatDuration } from '../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim passive rewards from every collectible you own that\'s off cooldown'),

  async execute(interaction) {
    const settings = ensureGuild(interaction.guildId);
    const { claimed, stillOnCooldown, gamblingTotal, arenaTotal } = claimAll(interaction.guildId, interaction.user.id);

    const lines = [];

    if (claimed.length === 0) {
      lines.push("Nothing to claim right now — check the cooldowns below.");
    } else {
      lines.push('**✅ Claimed:**');
      for (const c of claimed) {
        const parts = [];
        if (c.gambling > 0) parts.push(formatMoney(c.gambling, settings));
        if (c.arena > 0) parts.push(formatArena(c.arena));
        lines.push(`**${c.item.name}** — ${parts.join(' + ')}`);
      }
      const totalParts = [];
      if (gamblingTotal > 0) totalParts.push(formatMoney(gamblingTotal, settings));
      if (arenaTotal > 0) totalParts.push(formatArena(arenaTotal));
      if (claimed.length > 1 && totalParts.length > 0) {
        lines.push(`**Total:** ${totalParts.join(' + ')}`);
      }
    }

    if (stillOnCooldown.length > 0) {
      lines.push('', '**⏳ On cooldown:**');
      for (const s of stillOnCooldown) {
        const parts = [];

        
        
        
        
        if (s.arenaRange && !s.arenaReady) parts.push(`arena in **${formatDuration(s.nextArenaClaimAt - Date.now())}**`);
        if (s.gamblingRange && !s.gamblingReady) parts.push(`gold in **${formatDuration(s.nextGamblingClaimAt - Date.now())}**`);
        lines.push(`**${s.item.name}** — ${parts.join(', ')}`);
      }
    }

    if (claimed.length === 0 && stillOnCooldown.length === 0) {
      lines.push("You don't own any collectibles yet — check `/store view`, or fight the Champion for a chance at a rare one.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setAuthor({ name: `${interaction.user.username}'s Collectible Claims`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(lines.join('\n'));

    return interaction.reply({ embeds: [embed] });
  },
};
