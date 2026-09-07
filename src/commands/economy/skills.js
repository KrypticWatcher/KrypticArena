import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllSkillData, MAX_SKILL_LEVEL } from '../../utils/skills.js';
import { getGladiatorQp, getGladiatorProfile } from '../../utils/gladiator.js';
import { isBlacklisted } from '../../utils/blacklist.js';
import { getAllTrackedItems } from '../../utils/collectionLogTaxonomy.js';
import { getAllCollectionLogEntries } from '../../utils/collectionLog.js';

const SKILL_META = {
  attack: { icon: '⚔️', name: 'Attack' },
  strength: { icon: '💪', name: 'Strength' },
  defence: { icon: '🛡️', name: 'Defence' },
  ranged: { icon: '🏹', name: 'Ranged' },
  magic: { icon: '🔮', name: 'Magic' },
  mining: { icon: '⛏️', name: 'Mining' },
  woodcutting: { icon: '🪓', name: 'Woodcutting' },
  fishing: { icon: '🎣', name: 'Fishing' },
  hunting: { icon: '🐾', name: 'Hunting' },
  herbalism: { icon: '🌿', name: 'Herbalism' },
  smithing: { icon: '🔨', name: 'Smithing' },
  fletching: { icon: '🪶', name: 'Fletching' },
  cooking: { icon: '🍳', name: 'Cooking' },
  farming: { icon: '🌾', name: 'Farming' },
  crafting: { icon: '🧵', name: 'Crafting' },
  construction: { icon: '🏗️', name: 'Construction' },
};

const COLUMNS = [
  { label: '⚔️ Combat', skills: ['attack', 'strength', 'defence', 'ranged', 'magic'] },
  { label: '⛏️ Gathering', skills: ['mining', 'woodcutting', 'fishing', 'hunting', 'herbalism'] },
  { label: '🔨 Production', skills: ['smithing', 'fletching', 'cooking', 'farming', 'crafting', 'construction'] },
];

function buildSkillsEmbed(guildId, discordUser) {
  const skillData = getAllSkillData(guildId, discordUser.id);
  const qp = getGladiatorQp(guildId, discordUser.id);
  const profile = getGladiatorProfile(guildId, discordUser.id, discordUser.displayName ?? discordUser.username);

  
  
  
  
  const trackedItems = getAllTrackedItems();
  const obtainedEntries = getAllCollectionLogEntries(discordUser.id);
  
  
  
  const obtainedIds = new Set(obtainedEntries.map((e) => String(e.item_id)));
  const obtainedCount = trackedItems.filter((item) => obtainedIds.has(String(item.id))).length;
  const clPercent = trackedItems.length > 0 ? (obtainedCount / trackedItems.length) * 100 : 0;

  let totalLevel = 0;
  let totalXp = 0;
  for (const skillId of Object.keys(SKILL_META)) {
    totalLevel += skillData[skillId].level;
    totalXp += skillData[skillId].xp;
  }
  const maxTotalLevel = MAX_SKILL_LEVEL * Object.keys(SKILL_META).length;

  const fields = COLUMNS.map((col) => ({
    name: col.label,
    value: col.skills
      .map((skillId) => {
        const { icon, name } = SKILL_META[skillId];
        const { level } = skillData[skillId];
        return `${icon} ${name} — **${level}**`;
      })
      .join('\n'),
    inline: true,
  }));

  fields.push({
    name: '📊 Overall',
    value:
      `**Gladiator Level:** ${profile.level}/${profile.maxLevel}\n` +
      `**Total Level:** ${totalLevel.toLocaleString('en-US')}/${maxTotalLevel.toLocaleString('en-US')}\n` +
      `**Total XP:** ${totalXp.toLocaleString('en-US')}\n` +
      `**QP:** ${qp.toLocaleString('en-US')}\n` +
      `**Collection Log:** ${clPercent.toFixed(1)}% (${obtainedCount}/${trackedItems.length})`,
    inline: false,
  });

  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setAuthor({ name: `${discordUser.displayName ?? discordUser.username}'s Skills`, iconURL: discordUser.displayAvatarURL() })
    .addFields(fields);
}

export default {
  data: new SlashCommandBuilder()
    .setName('skills')
    .setDescription("View your Gladiator's skill levels")
    .addUserOption((opt) =>
      opt.setName('user').setDescription("Check someone else's skills").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (isBlacklisted(target.id)) {
      return interaction.reply({ content: 'This user is blacklisted.', ephemeral: false });
    }
    const embed = buildSkillsEmbed(interaction.guildId, target);
    return interaction.reply({ embeds: [embed] });
  },
};
