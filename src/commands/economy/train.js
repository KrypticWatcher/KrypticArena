import { SlashCommandBuilder } from 'discord.js';
import { getTrainingStyle, setTrainingStyle, TRAINING_STYLES } from '../../utils/trainingStyle.js';
import { EconomyError } from '../../utils/economy.js';

const STYLE_META = {
  attack: { icon: '⚔️', name: 'Attack', blurb: '100% of your combat XP goes to Attack.' },
  strength: { icon: '💪', name: 'Strength', blurb: '100% of your combat XP goes to Strength.' },
  defence: { icon: '🛡️', name: 'Defence', blurb: '100% of your combat XP goes to Defence.' },
  ranged: { icon: '🏹', name: 'Ranged', blurb: '100% of your combat XP goes to Ranged — needs a Bow with Arrows equipped in your Slayer set.' },
  magic: { icon: '🔮', name: 'Magic', blurb: '100% of your combat XP goes to Magic — needs a Staff equipped in your Slayer set.' },
  balanced: { icon: '⚖️', name: 'Balanced', blurb: 'Your combat XP splits evenly across Attack, Strength, and Defence.' },
};

export default {
  data: new SlashCommandBuilder()
    .setName('train')
    .setDescription('Choose which combat skill(s) your /slay and Boss Challenge kills train')
    .addStringOption((opt) =>
      opt
        .setName('style')
        .setDescription('Leave blank to just check your current style')
        .setRequired(false)
        .addChoices(...TRAINING_STYLES.map((id) => ({ name: STYLE_META[id].name, value: id })))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const chosen = interaction.options.getString('style');

    if (!chosen) {
      const current = getTrainingStyle(guildId, userId);
      const meta = STYLE_META[current];
      return interaction.reply({
        content: `You're currently training **${meta.icon} ${meta.name}**. ${meta.blurb}\n\nUse \`/train style:<...>\` to switch.`,
      });
    }

    try {
      setTrainingStyle(guildId, userId, chosen);
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message });
      throw err;
    }

    const meta = STYLE_META[chosen];
    const gearNote =
      chosen === 'ranged' || chosen === 'magic'
        ? `\n\n⚠️ Make sure you have ${chosen === 'ranged' ? 'a Bow with Arrows' : 'a Staff'} equipped in your Slayer set before your next /slay or Boss Challenge trip, or it'll be blocked.`
        : '';

    return interaction.reply({
      content: `Now training **${meta.icon} ${meta.name}**. ${meta.blurb}${gearNote}`,
    });
  },
};
