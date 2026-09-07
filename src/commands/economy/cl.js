import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { CL_CATEGORIES, getItemsInCategory, getAllTrackedItems } from '../../utils/collectionLogTaxonomy.js';
import { getAllCollectionLogEntries } from '../../utils/collectionLog.js';
import { getBossProgress } from '../../utils/bossChallenges.js';
import { renderCollectionLogImage, renderOverallCollectionLogImage } from '../../utils/inventoryImage.js';

const OVERALL_VALUE = '__overall__';

function buildExtraLine(categoryId, userId) {
  if (categoryId.startsWith('boss_')) {
    const bossId = categoryId.slice('boss_'.length);
    return `Kills: ${getBossProgress(userId, bossId).kills.toLocaleString('en-US')}`;
  }
  return null;
}

function buildSidebarEntries(obtainedMap, currentCategoryId) {
  return CL_CATEGORIES.map((cat) => {
    const items = getItemsInCategory(cat.id);
    const obtainedCount = items.filter((item) => obtainedMap.has(String(item.id))).length;
    const state = obtainedCount === 0 ? 'empty' : obtainedCount === items.length ? 'complete' : 'partial';
    return { label: cat.label, state, isCurrent: cat.id === currentCategoryId };
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('cl')
    .setDescription('View your Collection Log')
    .addStringOption((opt) => opt.setName('name').setDescription('Which log to view').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = [{ name: 'Overall', value: OVERALL_VALUE }, ...CL_CATEGORIES.map((c) => ({ name: c.label, value: c.id }))];
    const filtered = choices.filter((c) => c.name.toLowerCase().includes(typed));
    return interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const userId = interaction.user.id;
    const choice = interaction.options.getString('name', true);
    const displayName = interaction.user.displayName;

    const obtainedEntries = getAllCollectionLogEntries(userId);
    
    
    
    
    
    
    
    
    
    
    const obtainedMap = new Map(obtainedEntries.map((e) => [String(e.item_id), e.quantity]));

    let buf;
    if (choice === OVERALL_VALUE) {
      buf = await renderOverallCollectionLogImage(displayName, getAllTrackedItems(), obtainedMap);
    } else {
      const category = CL_CATEGORIES.find((c) => c.id === choice);
      if (!category) {
        return interaction.reply({ content: "That's not a valid log — pick one from the autocomplete list.", ephemeral: true });
      }
      const items = getItemsInCategory(choice);
      const extraLine = buildExtraLine(choice, userId);
      const sidebarEntries = buildSidebarEntries(obtainedMap, choice);
      buf = await renderCollectionLogImage(displayName, category.label, items, obtainedMap, extraLine, sidebarEntries);
    }

    return interaction.reply({ files: [new AttachmentBuilder(buf, { name: 'collection-log.png' })] });
  },
};
