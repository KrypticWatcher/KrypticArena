import { SlashCommandBuilder } from 'discord.js';
import { GEAR_SETS } from '../../utils/inventory.js';
import { EconomyError } from '../../utils/economy.js';
import { getGladiatorProfile } from '../../utils/gladiator.js';
import { SET_LABEL, blockIfEquipBusy, planBis, applyPlan, replyWithSet, footerNoteFor } from '../../utils/equipShared.js';

export default {
  data: new SlashCommandBuilder()
  .setName('bis')
  .setDescription('Auto-equip the best gear you own into a set (highest rarity you can use, then durability)')
  .addStringOption((opt) =>
    opt
      .setName('set')
      .setDescription('Which gear set to act on')
      .setRequired(true)
      .addChoices(
        { name: 'Arena', value: 'arena' },
        { name: 'Slayer', value: 'adventure' }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName('stat')
      .setDescription('Optimize for one combat style specifically, instead of just highest tier overall')
      .setRequired(false)
      .addChoices(
        { name: 'Stab', value: 'stab' },
        { name: 'Slash', value: 'slash' },
        { name: 'Crush', value: 'crush' },
        { name: 'Range', value: 'range' },
        { name: 'Magic', value: 'magic' }
      )
  ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const setName = interaction.options.getString('set', true);
    const stat = interaction.options.getString('stat');
    if (!GEAR_SETS.includes(setName)) {
      return interaction.reply({ content: `\`${setName}\` isn't a valid gear set.`, ephemeral: true });
    }

    const busyMessage = blockIfEquipBusy(guildId, userId, interaction.user.displayName);
    if (busyMessage) return interaction.reply({ content: busyMessage, ephemeral: true });

    const profile = getGladiatorProfile(guildId, userId, interaction.user.displayName);

    try {
      const plan = planBis(guildId, userId, setName, profile.level, stat);
      if (Object.keys(plan).length === 0) {
        return interaction.reply({
          content: `You're already wearing the best gear you own in every slot of your **${SET_LABEL[setName]}** set${stat ? ` for ${stat}` : ''}.`,
          ephemeral: true,
        });
      }
      const { forcedUnequips, movedFromSets } = applyPlan(guildId, userId, setName, plan, profile.level);
      return replyWithSet(interaction, setName, {
        title: `✅ Best-in-slot equipped (${SET_LABEL[setName]})`,
        footerNote: footerNoteFor(forcedUnequips, movedFromSets),
      });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
