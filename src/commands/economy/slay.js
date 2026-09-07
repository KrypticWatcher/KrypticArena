import { SlashCommandBuilder } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { startSlayFor } from '../../utils/slay.js';
import { MOBS } from '../../data/mobs.js';
import { TIER_LEVELS, filterTieredChoices } from '../../utils/textMatch.js';

function tierNumberForLevel(level) {
  return TIER_LEVELS.indexOf(level) + 1;
}

export default {
  data: new SlashCommandBuilder()
    .setName('slay')
    .setDescription('Send your Gladiator to hunt a mob for combat XP, resources, coins, and a chance at equipment')
    .addStringOption((opt) =>
      opt.setName('mob').setDescription('Which mob to hunt').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('quantity').setDescription("How many kills this trip — leave blank for a full trip (caps at that mob's own full-trip amount)").setRequired(false)
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused();
    const allChoices = MOBS.map((m) => ({ name: `${m.name} (Tier ${tierNumberForLevel(m.tier)})`, value: m.id, tier: m.tier }));
    const choices = filterTieredChoices(allChoices, typed)
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const mobId = interaction.options.getString('mob');
    const quantity = interaction.options.getInteger('quantity');

    try {
      const result = await startSlayFor(
        interaction.guildId,
        interaction.user.id,
        interaction.channelId,
        interaction.user.displayName,
        mobId,
        quantity
      );
      return interaction.reply({ content: result.text });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
