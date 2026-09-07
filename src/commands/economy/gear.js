import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getEquipment, getAllEquipmentSets, GEAR_SETS } from '../../utils/inventory.js';
import { formatEquipmentLines } from '../../utils/format.js';
import { renderGearImage, renderGearSetsOverview } from '../../utils/gearImage.js';
import { hasFlag } from '../../utils/permissions.js';
import { doesSetQualifyForContext } from '../../utils/effects.js';
import { EFFECT_TYPES } from '../../data/items.js';
import { getGladiatorRow } from '../../utils/gladiator.js';
import { resolveInventoryBackgroundPath } from '../../utils/inventoryBackgrounds.js';

const CHAMPION_EFFECT_TYPES = new Set([EFFECT_TYPES.CHAMPION_FAIL_REDUCTION, EFFECT_TYPES.CHAMPION_WAGER_BOOST]);
const ADVENTURE_EFFECT_TYPES = new Set([
  EFFECT_TYPES.ADVENTURE_FASTER_TRIPS,
  EFFECT_TYPES.ADVENTURE_BETTER_ENCOUNTERS,
  EFFECT_TYPES.ADVENTURE_SAFER_TRIPS,
]);

function displayEquippedForMiscView(guildId, userId, miscEquipped, allSets) {
  const arenaQualifies = doesSetQualifyForContext(allSets.arena, 'arena_store');
  const adventureQualifies = doesSetQualifyForContext(allSets.adventure, 'adventure');
  if (!arenaQualifies && !adventureQualifies) return miscEquipped;

  const stripped = {};
  for (const [slot, item] of Object.entries(miscEquipped)) {
    if (!item) {
      stripped[slot] = item;
      continue;
    }
    const effects = item.effects.filter((e) => {
      if (arenaQualifies && CHAMPION_EFFECT_TYPES.has(e.type)) return false;
      if (adventureQualifies && ADVENTURE_EFFECT_TYPES.has(e.type)) return false;
      return true;
    });
    stripped[slot] = { ...item, effects };
  }
  return stripped;
}

const SET_LABEL = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };

export default {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('View your equipped gear')
    .addStringOption((opt) =>
      opt
        .setName('view')
        .setDescription('Show one gear set in full detail (with stat totals) instead of the 3-set overview')
        .setRequired(false)
        .addChoices({ name: 'Arena', value: 'arena' }, { name: 'Slayer', value: 'adventure' }, { name: 'Skilling', value: 'misc' })
    )
    .addBooleanOption((opt) => opt.setName('text_format').setDescription('Show plain text instead of the gear image').setRequired(false)),

  async execute(interaction) {
    
    
    
    
    
    
    
    
    
    
    
    
    await interaction.deferReply();

    const target = interaction.user;
    const guildId = interaction.guildId;
    const setName = interaction.options.getString('view');
    const textFormat = interaction.options.getBoolean('text_format');
    const themed = hasFlag(target.id, 'T6');
    
    
    
    
    const bgRow = getGladiatorRow(guildId, target.id);
    const customBackgroundPath = bgRow?.gear_bg_id ? resolveInventoryBackgroundPath(bgRow.gear_bg_id) : null;

    
    
    
    if (setName) {
      let equipped = getEquipment(guildId, target.id, setName);
      const allSets = getAllEquipmentSets(guildId, target.id);
      if (setName === 'misc') {
        equipped = displayEquippedForMiscView(guildId, target.id, equipped, allSets);
      }

      if (textFormat) {
        const embed = new EmbedBuilder()
          .setColor(0xd4af37)
          .setTitle(`⚔️ ${target.username}'s Gear — ${SET_LABEL[setName]}`)
          .setDescription(formatEquipmentLines(equipped).join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      const png = await renderGearImage(target.username, equipped, { themed, setLabel: SET_LABEL[setName], customBackgroundPath, allSets });
      return interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'gear.png' })] });
    }

    
    if (textFormat) {
      const allSets = getAllEquipmentSets(guildId, target.id);
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle(`⚔️ ${target.username}'s Gear Sets`)
        .setDescription(
          GEAR_SETS.map((s) => `**${SET_LABEL[s]}**\n${formatEquipmentLines(allSets[s]).join('\n')}`).join('\n\n')
        );
      return interaction.editReply({ embeds: [embed] });
    }

    const allSets = getAllEquipmentSets(guildId, target.id);
    const png = await renderGearSetsOverview(target.username, allSets, { themed, customBackgroundPath });
    
    
    
    
    
    
    
    return interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'gear.png' })] });
  },
};
