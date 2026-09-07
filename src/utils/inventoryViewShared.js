import { AttachmentBuilder } from 'discord.js';
import { getInventoryGrid } from './inventory.js';
import { renderInventoryImage, ITEMS_PER_PAGE } from './inventoryImage.js';
import { buildArenaCoinIcon } from './gearImage.js';
import { getArenaBalance } from './economy.js';
import { formatDurabilityPercent } from '../data/items.js';
import { hasFlag } from './permissions.js';
import { normalizeQuotes } from './textMatch.js';
import { replyPaginated } from './pagination.js';
import { getGladiatorRow } from './gladiator.js';
import { resolveInventoryBackgroundPath } from './inventoryBackgrounds.js';
import { hasUserFlag } from './userFlags.js';

const TEXT_ITEMS_PER_PAGE = 15;

function sortCells(cells, sort) {
  const sorted = [...cells];
  switch (sort) {
    case 'rarity':
      return sorted.sort((a, b) => b.item.tier - a.item.tier || a.item.name.localeCompare(b.item.name));
    case 'quantity':
      return sorted.sort((a, b) => b.quantity - a.quantity || a.item.name.localeCompare(b.item.name));
    case 'slot':
      
      
      
      
      
      
      return sorted.sort((a, b) => (a.item.slot ?? '').localeCompare(b.item.slot ?? '') || a.item.name.localeCompare(b.item.name));
    case 'type': {
      
      
      
      
      
      
      
      
      
      
      
      const groups = new Map();
      for (const cell of sorted) {
        const key = cell.item.slot ?? cell.item.category ?? 'other';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cell);
      }
      const groupKeys = [...groups.keys()].sort((a, b) => {
        const aMin = Math.min(...groups.get(a).map((c) => c.item.tier ?? 0));
        const bMin = Math.min(...groups.get(b).map((c) => c.item.tier ?? 0));
        return aMin - bMin || a.localeCompare(b);
      });
      const result = [];
      for (const key of groupKeys) {
        groups
          .get(key)
          .sort((a, b) => (a.item.tier ?? 0) - (b.item.tier ?? 0) || a.item.name.localeCompare(b.item.name))
          .forEach((cell) => result.push(cell));
      }
      return result;
    }
    case 'alphabetical':
      return sorted.sort((a, b) => a.item.name.localeCompare(b.item.name));
    default:
      return sortCells(cells, 'type');
  }
}

function buildArenaCoinCell(guildId, userId) {
  const amount = getArenaBalance(guildId, userId);
  if (amount <= 0) return null; 
  return {
    item: {
      id: 'arena_coins',
      name: 'Arena Coins',
      slot: 'currency',
      rarity: 'mythical',
      iconOverride: buildArenaCoinIcon(amount),
    },
    quantity: amount,
    durability: null,
  };
}

export async function runInventoryView(
  interaction,
  { search = null, sort = 'type', format = null, showId = false, showDurability = false, showNames = false, includeCurrency = true } = {}
) {
  let cells = getInventoryGrid(interaction.guildId, interaction.user.id);
  if (search) {
    const needle = normalizeQuotes(search.toLowerCase());
    cells = cells.filter((c) => normalizeQuotes(c.item.name.toLowerCase()).includes(needle));
  }
  cells = sortCells(cells, sort);

  
  
  
  
  
  
  
  
  
  
  
  
  
  const ARENA_COIN_SEARCH_TERMS = ['arena coins', 'arena', 'coins', 'coin', 'aren'];
  const searchMatchesCoins =
    includeCurrency && (!search || ARENA_COIN_SEARCH_TERMS.some((term) => term.includes(normalizeQuotes(search.toLowerCase())) || normalizeQuotes(search.toLowerCase()).includes(term)));
  if (searchMatchesCoins) {
    const coinCell = buildArenaCoinCell(interaction.guildId, interaction.user.id);
    if (coinCell) cells = [coinCell, ...cells];
  }

  const perPage = format === 'text_paged' ? TEXT_ITEMS_PER_PAGE : ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(cells.length / perPage));
  const themed = hasFlag(interaction.user.id, 'T6');
  
  
  
  
  const bgRow = getGladiatorRow(interaction.guildId, interaction.user.id);
  const customBackgroundPath = bgRow?.inventory_bg_id ? resolveInventoryBackgroundPath(bgRow.inventory_bg_id) : null;
  const fullSize = hasUserFlag(interaction.user.id, 'full_inventory');
  const displayName = interaction.user.displayName ?? interaction.user.username;

  if (cells.length === 0) {
    return interaction.reply({
      content: search
        ? `Nothing in your inventory matches **${search}**.`
        : 'Your inventory is empty — equip or unequip something with /equip, or head out on a /quest.',
      ephemeral: true,
    });
  }

  
  
  
  
  if (format === 'text_paged') {
    return replyPaginated(interaction, {
      totalPages,
      buildPagePayload: async (page) => {
        const pageCells = cells.slice(page * perPage, (page + 1) * perPage);
        const lines = pageCells.map((c) => {
          let line = `${c.item.name}: ${c.quantity.toLocaleString()}`;
          if (showDurability && c.durability !== null) line += ` (${c.durability <= 0 ? 'BROKEN' : `${formatDurabilityPercent(c.durability)}%`})`;
          if (showId) line += ` \`${c.item.id}\``;
          return line;
        });
        return { content: `**${displayName}'s Inventory**\n${lines.join('\n')}`, files: [] };
      },
    });
  }

  return replyPaginated(interaction, {
    totalPages,
    buildPagePayload: async (page) => {
      const pageCells = cells.slice(page * perPage, (page + 1) * perPage);
      const buf = await renderInventoryImage(displayName, pageCells, {
        page: page + 1,
        totalPages,
        themed,
        showDurability,
        showNames,
        showId, 
        customBackgroundPath,
        fullSize,
      });
      return { files: [new AttachmentBuilder(buf, { name: 'inventory.png' })] };
    },
  });
}
