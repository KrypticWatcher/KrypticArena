import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGladiatorProfile } from '../../utils/gladiator.js';
import { getArenaRankInfo } from '../../utils/ranks.js';
import { buildBossChallengeStatusLine } from '../../utils/bossChallenges.js';
import { describeSlayActiveTrip } from '../../utils/slay.js';
import { describeGatheringActiveTrip } from '../../utils/gathering.js';
import { describeHuntingActiveTrip } from '../../utils/hunting.js';
import { describeCookingActiveTrip } from '../../utils/cooking.js';
import { describeHerbalismActiveTrip } from '../../utils/herbalism.js';
import { describeSmithingActiveTrip } from '../../utils/smithing.js';
import { describeFletchingActiveTrip } from '../../utils/fletching.js';
import { describeCraftingActiveTrip } from '../../utils/crafting.js';
import { describeMagicCraftingActiveTrip } from '../../utils/magicCrafting.js';
import { describeTanningActiveTrip } from '../../utils/tanning.js';
import { describeFarmingActiveTrip } from '../../utils/farming.js';

function progressBar(progress, width = 14) {
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function buildGladiatorStatusEmbed(guildId, discordUser) {
  const profile = getGladiatorProfile(guildId, discordUser.id, discordUser.displayName);
  const rankInfo = getArenaRankInfo(guildId, discordUser.id);

  const levelLine = profile.isMaxed
    ? `**Level ${profile.level}** — 👑 **MAXED OUT** — ${profile.xp.toLocaleString('en-US')}/200,000,000 XP`
    : profile.level >= profile.maxLevel
      ? `**Level ${profile.level}** (max) — ${profile.xp.toLocaleString('en-US')} XP`
      : `**Level ${profile.level}** — ${profile.xp.toLocaleString('en-US')} XP\n` +
        `${progressBar(profile.progress)}  ${profile.xpIntoLevel.toLocaleString('en-US')}/${profile.xpForNextLevel.toLocaleString('en-US')} to Level ${profile.level + 1}`;

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const timestamp = profile.onAdventure ? `<t:${Math.floor(profile.adventureEndsAt / 1000)}:R>` : null;
  const adventureLine = !profile.onAdventure
    ? '🏛️ Resting at the barracks — not currently on an adventure'
    : profile.activeBossId
      ? `⚔️ ${buildBossChallengeStatusLine(profile.name, profile.activeBossId)} Back ${timestamp}.`
      : describeGatheringActiveTrip(profile.activeMobId, timestamp) ??
        describeHuntingActiveTrip(profile.activeMobId, timestamp) ??
        describeCookingActiveTrip(profile.activeMobId, timestamp) ??
        describeHerbalismActiveTrip(profile.activeMobId, timestamp) ??
        describeSmithingActiveTrip(profile.activeMobId, timestamp) ??
        describeFletchingActiveTrip(profile.activeMobId, timestamp) ??
        describeCraftingActiveTrip(profile.activeMobId, timestamp) ??
        describeMagicCraftingActiveTrip(profile.activeMobId, timestamp) ??
        describeTanningActiveTrip(profile.activeMobId, timestamp) ??
        describeFarmingActiveTrip(profile.activeMobId, timestamp) ??
        describeSlayActiveTrip(profile.activeMobId, timestamp) ??
        `🗺️ Out on Quest. Back ${timestamp}.`;

  const titleParts = [`🏅 **${rankInfo.rank}**`];
  if (rankInfo.loserTitle) titleParts.push(`💩 **${rankInfo.loserTitle}**`);

  return new EmbedBuilder()
    .setColor(0xd4af37)
    
    
    
    
    
    
    
    
    
    
    
    .setAuthor({ name: profile.name, iconURL: discordUser.displayAvatarURL() })
    .setDescription(`${levelLine}\n\n${adventureLine}`)
    .addFields({
      name: `⚔️ Arena Record — ${rankInfo.wins}W / ${rankInfo.losses}L`,
      value:
        titleParts.join('  •  ') +
        (rankInfo.nextRank
          ? `\n*${rankInfo.winsToNextRank} more ${rankInfo.nextRankBracket} win(s) to reach ${rankInfo.nextRank}.*`
          : '\n*Max rank reached.*'),
    });
}

export default {
  data: new SlashCommandBuilder()
    .setName('gladiator')
    .setDescription("View your Gladiator's profile"),

  async execute(interaction) {
    
    
    
    const embed = buildGladiatorStatusEmbed(interaction.guildId, interaction.user);
    return interaction.reply({ embeds: [embed] });
  },
};
