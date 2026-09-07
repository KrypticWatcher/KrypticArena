import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getArenaStoreListing, getRarityLabel, tierToRarity, SETS, formatItemName, EFFECT_LABEL, isCollectable } from '../../data/items.js';
import { buyArenaItem } from '../../utils/arenaShop.js';
import { EconomyError, ensureGuild } from '../../utils/economy.js';
import { formatArena, formatMoney } from '../../utils/format.js';
import { replyPaginated } from '../../utils/pagination.js';
import { normalizeQuotes } from '../../utils/textMatch.js';

function parseBuyEntries(text) {
  return text
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const match = piece.match(/^(\d+)\s+(.+)$/);
      if (match) return { quantity: parseInt(match[1], 10), rawName: match[2].trim() };
      return { quantity: 1, rawName: piece };
    });
}

function resolveArenaItemId(raw) {
  const listing = getArenaStoreListing();
  if (listing.some((i) => i.id === raw)) return raw;

  const typed = normalizeQuotes(raw.trim().toLowerCase());
  const exact = listing.filter((i) => normalizeQuotes(i.name.toLowerCase()) === typed);
  const pool = exact.length > 0 ? exact : listing.filter((i) => normalizeQuotes(i.name.toLowerCase()).includes(typed));

  if (pool.length === 0) return null;
  if (pool.length > 1) {
    throw new EconomyError(`**${raw}** matches more than one item (${pool.map((i) => i.name).join(', ')}) — type the full name or use the menu.`);
  }
  return pool[0].id;
}

export default {
  data: new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Arena-related commands')
    .addSubcommandGroup((group) =>
      group
        .setName('store')
        .setDescription('Buy Arena Store gear with arena coins — sold one piece at a time')
        .addSubcommand((sub) => sub.setName('view').setDescription("See what's for sale"))
        .addSubcommand((sub) =>
          sub
            .setName('buy')
            .setDescription('Buy Arena Store items — name(s) only, e.g. "elixir" or "10 elixir, 2 attack candy"')
            .addStringOption((opt) =>
              opt.setName('items').setDescription('Item name(s), comma-separated. No number = 1 copy.').setRequired(true).setAutocomplete(true)
            )
        )
    ),

  async autocomplete(interaction) {
    const raw = interaction.options.getFocused();
    const lastCommaIndex = raw.lastIndexOf(',');
    const prefix = lastCommaIndex === -1 ? '' : raw.slice(0, lastCommaIndex + 1) + ' ';
    const rawSegment = (lastCommaIndex === -1 ? raw : raw.slice(lastCommaIndex + 1)).trim();
    const quantityMatch = rawSegment.match(/^(\d+\s+)(.*)$/);
    const quantityPrefix = quantityMatch ? quantityMatch[1] : '';
    const nameOnly = quantityMatch ? quantityMatch[2] : rawSegment;
    const currentSegment = normalizeQuotes(nameOnly.toLowerCase());

    const matches = getArenaStoreListing()
      .filter((i) => normalizeQuotes(i.name.toLowerCase()).includes(currentSegment))
      .slice(0, 25);

    await interaction.respond(
      matches.map((i) => {
        const priceLabel = isCollectable(i) ? `${i.priceArena.toLocaleString('en-US')} arena coins` : `${i.price.toLocaleString('en-US')} arena coins (Lv. ${i.levelRequirement})`;
        return { name: `${i.name} — ${priceLabel}`, value: `${prefix}${quantityPrefix}${i.name}` };
      })
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const listing = getArenaStoreListing();
      const equipment = listing.filter((i) => i.type === 'equipment');
      const tools = listing.filter((i) => i.type === 'tool');
      const collectables = listing.filter(isCollectable);

      const setOrder = [];
      const bySet = new Map();
      for (const item of equipment) {
        if (!bySet.has(item.set)) {
          bySet.set(item.set, []);
          setOrder.push(item.set);
        }
        bySet.get(item.set).push(item);
      }

      const buildSetPageEmbed = (page) => {
        const setKey = setOrder[page];
        const items = bySet.get(setKey);
        const setName = SETS[setKey]?.name ?? setKey;
        const first = items[0];
        const lines = items.map((item) => {

          const effectParts = item.effects.map((e) => `+${e.value}% ${EFFECT_LABEL[e.type] ?? e.type}`);
          return `${item.name} (${effectParts.join(', ')})`;
        });

        return new EmbedBuilder()
          .setColor(0xd4af37)
          .setTitle('🏛️ Arena Store')
          .setDescription(
            `**${setName} — ${getRarityLabel(tierToRarity(first.tier))} — Lv. ${first.levelRequirement} — ${formatArena(first.price)}/piece**\n` +
              lines.join('\n')
          );
      };

      const buildToolsPageEmbed = () => {
        const lines = tools.map((item) => `**${item.name}** — ${formatArena(item.price)}\n*${item.description}*`);
        return new EmbedBuilder().setColor(0xd4af37).setTitle('🏛️ Arena Store — Tools').setDescription(lines.join('\n\n'));
      };

      const buildCollectablesPageEmbed = () => {
        const settings = ensureGuild(interaction.guildId);
        const lines = collectables.map((item) => {
          const costParts = [`${formatArena(item.priceArena)} arena coins`];
          if (item.price) costParts.push(formatMoney(item.price, settings));
          return `**${item.name}** — ${costParts.join(' + ')}\n*${item.description}*`;
        });
        return new EmbedBuilder()
          .setColor(0xd4af37)
          .setTitle('🏛️ Arena Store — Other')
          .setDescription(lines.join('\n\n'));
      };

      const toolsPageCount = tools.length > 0 ? 1 : 0;
      const collectablesPageCount = collectables.length > 0 ? 1 : 0;
      const totalPages = setOrder.length + toolsPageCount + collectablesPageCount;
      return replyPaginated(interaction, {
        buildPagePayload: (page) => {
          if (page < setOrder.length) return { embeds: [buildSetPageEmbed(page)] };
          const afterSets = page - setOrder.length;
          if (toolsPageCount > 0 && afterSets === 0) return { embeds: [buildToolsPageEmbed()] };
          return { embeds: [buildCollectablesPageEmbed()] };
        },
        totalPages,
      });
    }

    
    const itemsRaw = interaction.options.getString('items', true);
    const entries = parseBuyEntries(itemsRaw);
    if (entries.length === 0) {
      return interaction.reply({ content: "Didn't catch any item names in that — try `10 elixir, 2 attack candy`.", ephemeral: true });
    }

    const settings = ensureGuild(interaction.guildId);
    const bought = [];
    const failed = [];
    for (const entry of entries) {
      try {
        const itemId = resolveArenaItemId(entry.rawName) ?? entry.rawName;
        const result = buyArenaItem(interaction.guildId, interaction.user.id, itemId, entry.quantity, interaction.user.displayName);
        const costLine = result.cashCost > 0 ? `${formatArena(result.cost)} + ${formatMoney(result.cashCost, settings)}` : formatArena(result.cost);
        bought.push(`**${result.quantity > 1 ? `${result.quantity}x ` : ''}${formatItemName(result.item)}** for ${costLine}`);
      } catch (err) {
        if (err instanceof EconomyError) {
          failed.push(`**${entry.rawName}** — ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    const lines = [];
    if (bought.length > 0) lines.push(`🛒 Bought: ${bought.join(', ')}`);
    if (failed.length > 0) lines.push(`❌ Couldn't buy: ${failed.join('; ')}`);
    return interaction.reply({ content: lines.join('\n'), ephemeral: bought.length === 0 });
  },
};
