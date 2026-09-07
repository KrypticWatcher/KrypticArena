import { SlashCommandBuilder } from 'discord.js';
import { parseButtonCustomId } from '../../utils/panel.js';
import {
  buildHelpTopPanel,
  buildHelpArenaPanel,
  buildHelpBlackjackPanel,
  buildHelpRoulettePanel,
  buildHelpDicePanel,
  buildHelpSlotsPanel,
} from '../../utils/helpPanelScreens.js';

function renderScreen(guildId, userId, screen) {
  switch (screen) {
    case 'help-arena':
      return buildHelpArenaPanel(userId);
    case 'help-blackjack':
      return buildHelpBlackjackPanel(guildId, userId);
    case 'help-roulette':
      return buildHelpRoulettePanel(guildId, userId);
    case 'help-dice':
      return buildHelpDicePanel(guildId, userId);
    case 'help-slots':
      return buildHelpSlotsPanel(guildId, userId);
    case 'help-top':
    default:
      return buildHelpTopPanel(userId);
  }
}

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('A guide to the Arena, Gladiator system, and casino games'),

  async execute(interaction) {
    const { embeds, components } = buildHelpTopPanel(interaction.user.id);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  
  
  
  
  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;

    const { screen } = parsed;
    if (screen === 'help-close') {
      await interaction.update({ content: '✅ Closed.', embeds: [], components: [] });
      return true;
    }

    await interaction.update(renderScreen(interaction.guildId, interaction.user.id, screen));
    return true;
  },
};
