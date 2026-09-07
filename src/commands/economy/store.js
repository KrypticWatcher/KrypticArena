import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStoreListing, buyCollectible } from '../../utils/collectibles.js';
import { EconomyError, ensureGuild } from '../../utils/economy.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { replyPaginated } from '../../utils/pagination.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { HEIST_ITEM_SCALING_PCT } from '../../utils/heists.js';

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

function describeClaim(item, settings) {
  if (!item.claim) return null;
  const parts = [];
  if (item.claim.gambling) {
    parts.push(`${formatMoney(item.claim.gambling.min, settings)}–${formatMoney(item.claim.gambling.max, settings)}`);
  }
  if (item.claim.arena) {
    parts.push(`${formatArena(item.claim.arena.min)}–${formatArena(item.claim.arena.max)}`);
  }
  return `${parts.join(' + ')} per claim (capped at 1 owned)`;
}

function resolveStoreItemId(raw) {
  const listing = getStoreListing();
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
    .setName('store')
    .setDescription('Buy passive-income collectibles')
    .addSubcommand((sub) => sub.setName('view').setDescription('See what the store has for sale'))
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy collectibles with cash — name(s) only, e.g. "10 elixir, 2 attack candy"')
        .addStringOption((opt) =>
          opt.setName('items').setDescription('Item name(s), comma-separated. No number = 1 copy.').setRequired(true).setAutocomplete(true)
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

    const matches = getStoreListing()
      .filter((i) => normalizeQuotes(i.name.toLowerCase()).includes(currentSegment))
      .slice(0, 25);

    await interaction.respond(
      matches.map((i) => ({ name: `${i.name} — ${i.price.toLocaleString('en-US')} cash`, value: `${prefix}${quantityPrefix}${i.name}` }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = ensureGuild(interaction.guildId);

    if (sub === 'view') {
      const listing = getStoreListing();
      const ITEMS_PER_PAGE = 5;
      const totalPages = Math.max(1, Math.ceil(listing.length / ITEMS_PER_PAGE));

      const buildPageEmbed = (page) => {
        const pageItems = listing.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + ITEMS_PER_PAGE);
        const lines = pageItems.map((item) => {
          const claimLine = describeClaim(item, settings);
          const isHeistItem = Object.prototype.hasOwnProperty.call(HEIST_ITEM_SCALING_PCT, item.id);
          
          
          
          
          
          
          const costLine = item.priceArena
            ? `${formatMoney(item.price, settings)} + ${formatArena(item.priceArena)}`
            : isHeistItem
              ? `${formatMoney(item.price, settings)}+ (scales with your balance)`
              : formatMoney(item.price, settings);
          return (
            `**${item.name}** (Tier ${item.tier}) — ${costLine}\n` +
            `*${item.description}*` +
            (claimLine ? `\nPays: ${claimLine}` : '')
          );
        });

        return new EmbedBuilder()
          .setColor(0xd4af37)
          .setTitle('🕴️ Black Market Dealer')
          .setDescription(lines.join('\n\n'));
      };

      return replyPaginated(interaction, { buildPagePayload: (page) => ({ embeds: [buildPageEmbed(page)] }), totalPages });
    }

    
    const itemsRaw = interaction.options.getString('items', true);
    const entries = parseBuyEntries(itemsRaw);
    if (entries.length === 0) {
      return interaction.reply({ content: "Didn't catch any item names in that — try `10 elixir, 2 attack candy`.", ephemeral: true });
    }

    const bought = [];
    const failed = [];
    for (const entry of entries) {
      try {
        const itemId = resolveStoreItemId(entry.rawName) ?? entry.rawName;
        const result = buyCollectible(interaction.guildId, interaction.user.id, itemId, entry.quantity);
        bought.push(`**${result.quantity > 1 ? `${result.quantity}x ` : ''}${result.item.name}** for ${formatMoney(result.cost, settings)}`);
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
