import { SlashCommandBuilder } from 'discord.js';
import { repairInstance, repairAll, getRepairableEquipped } from '../../utils/durability.js';
import { EconomyError, ensureGuild } from '../../utils/economy.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { formatDurabilityPercent } from '../../data/items.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { blockIfBusy, locationTag, formatRepairCost, resolveRepairInstanceId } from '../../utils/repairShared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('repair')
    .setDescription('Repair worn-down equipment — Champion fights and Adventures both cause wear, duels never do')
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Which equipped item to repair').setRequired(false).setAutocomplete(true)
    )
    .addBooleanOption((opt) =>
      opt.setName('all').setDescription('Repair every damaged piece of equipped gear at once').setRequired(false)
    ),

  
  
  
  
  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    const settings = ensureGuild(interaction.guildId);
    const repairable = getRepairableEquipped(interaction.guildId, interaction.user.id);

    const matches = repairable
      .filter((r) => normalizeQuotes(r.item.name.toLowerCase()).includes(typed))
      .map((r) => ({ r, slotTag: locationTag(interaction.guildId, interaction.user.id, r.item.instanceId) }))
      .slice(0, 25);

    await interaction.respond(
      matches.map(({ r, slotTag }) => ({
        name: `${r.item.name}${slotTag} — ${r.durability.broken ? 'BROKEN' : `${formatDurabilityPercent(r.durability.current)}%`} (${formatRepairCost(r.item, r.cost, settings)} to fix)`,
        value: r.item.instanceId,
      }))
    );
  },

  async execute(interaction) {
    const settings = ensureGuild(interaction.guildId);
    const repairAllFlag = interaction.options.getBoolean('all') ?? false;
    const itemRaw = interaction.options.getString('item');

    if (!repairAllFlag && !itemRaw) {
      return interaction.reply({
        content: 'Specify `item:` to repair one piece, or `all:True` to repair everything damaged.',
        ephemeral: true,
      });
    }

    const busyMessage = blockIfBusy(interaction.guildId, interaction.user.id, interaction.user.displayName);
    if (busyMessage) return interaction.reply({ content: busyMessage, ephemeral: true });

    if (repairAllFlag) {
      try {
        const { repaired, totalCost, totalArenaCost } = repairAll(interaction.guildId, interaction.user.id);
        if (repaired.length === 0) {
          return interaction.reply({ content: 'Everything you have equipped is already at full durability.', ephemeral: true });
        }
        const totalParts = [
          totalCost > 0 ? formatMoney(totalCost, settings) : null,
          totalArenaCost > 0 ? formatArena(totalArenaCost) : null,
        ].filter(Boolean);
        return interaction.reply({
          content: `🔧 Repaired **${repaired.map((i) => i.name).join(', ')}** for a total of **${totalParts.join(' and ')}**.`,
        });
      } catch (err) {
        if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
        throw err;
      }
    }

    
    try {
      const instanceId = resolveRepairInstanceId(interaction.guildId, interaction.user.id, itemRaw) ?? itemRaw;
      const { item, cost } = repairInstance(interaction.guildId, interaction.user.id, instanceId);
      return interaction.reply({
        content: `🔧 Repaired **${item.name}** to full durability for **${formatRepairCost(item, cost, settings)}**.`,
      });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  },
};
