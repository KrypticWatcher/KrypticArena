import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin, listFlags } from '../../utils/permissions.js';
import { getGladiatorProfile, getGladiatorRow, getAllBadges, formatGladiatorDisplayName } from '../../utils/gladiator.js';
import { getHighestUnlockedBracket } from '../../utils/championBrackets.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewuser')
    .setDescription("View a player's Gladiator profile — admin only")
    .addUserOption((opt) => opt.setName('user').setDescription('Whose profile to view (defaults to your own)').setRequired(false)),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Admins only.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guildId;

    const profile = getGladiatorProfile(guildId, target.id, target.displayName ?? target.username);
    const row = getGladiatorRow(guildId, target.id);
    const displayName = formatGladiatorDisplayName(guildId, target.id, profile.name);

    const highestBracket = getHighestUnlockedBracket(profile.level);

    const createdAtSeconds = Math.floor((row?.created_at ?? Math.floor(Date.now() / 1000)));
    
    
    
    
    const ageLine = `<t:${createdAtSeconds}:R>`;
    const startedLine = `<t:${createdAtSeconds}:D>`;

    const badges = getAllBadges(guildId, target.id).map((b) => `${b.emoji} ${b.label}`);

    const flags = listFlags(target.id);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      
      
      
      
      
      
      
      
      .setDescription(`**<@${target.id}>'s Profile**`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Discord', value: `${target.username} (${target.id})`, inline: false },
        { name: "Gladiator's Name", value: displayName, inline: true },
        { name: 'Max Bracket Unlocked', value: highestBracket ? highestBracket.name : 'None', inline: true },
        { name: 'Age', value: ageLine, inline: true },
        { name: 'Started', value: startedLine, inline: false },
        { name: 'Badges', value: badges.length > 0 ? badges.join('\n') : '*None yet*', inline: false },
        { name: 'Bitfields', value: flags.length > 0 ? flags.join(', ') : '*None*', inline: false }
      );

    
    
    
    
    
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
