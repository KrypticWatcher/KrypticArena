import { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EconomyError } from '../../utils/economy.js';
import { getItem, isEquipment } from '../../data/items.js';
import { getUnequippedInstances, getOwnedQuantity } from '../../utils/inventory.js';
import { meetsTradeLevelRequirement } from '../../utils/gladiator.js';
import {
  isTradingPostLocked,
  POSTABLE_ITEMS,
  createSellListing,
  createBuyListing,
  cancelListing,
  resolveListingDisplayItem,
  getRecentSellListings,
  getRecentSellListingsForItem,
  getActiveListingsForUser,
  getSuggestedPrice,
} from '../../utils/tradingPost.js';
import { renderTradingPostGrid, SLOTS_PER_PAGE } from '../../utils/tradingPostImage.js';
import { replyPaginated } from '../../utils/pagination.js';
import { matchBuyListing, matchSellListing } from '../../utils/tradingPostMatching.js';
import { formatArena } from '../../utils/format.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { normalizeQuotes } from '../../utils/textMatch.js';

const LEVEL_GATE_MESSAGE = 'the market is only open to those who have earned abit of a name for themselves, go get some experience';
const LOCKED_MESSAGE = 'The Trading Post is currently closed.';

function buildBuyerFillDM(fill) {
  const total = fill.quantity * fill.transactionPricePerUnit;
  const taxLine = fill.tax > 0 ? `${formatArena(fill.tax)} in tax was paid.` : 'No tax was paid.';
  const remaining = fill.buyListing.quantity_remaining;
  const tail =
    fill.buyListing.status === 'fulfilled'
      ? 'This listing has now been fully fulfilled.'
      : `There are ${remaining.toLocaleString('en-US')}x remaining to buy in your listing — \`/tp cancel\` to cancel the rest.`;
  return `You bought ${fill.quantity}x **${fill.item.name}** for ${formatArena(fill.transactionPricePerUnit)} each, for a total of ${formatArena(total)}. ${taxLine} You received ${fill.quantity}x **${fill.item.name}**. ${tail}`;
}

function buildSellerFillDM(fill) {
  const total = fill.quantity * fill.transactionPricePerUnit;
  const tax = fill.tax;
  const received = total - tax;
  const taxLine = tax > 0 ? `${formatArena(tax)} in tax was paid.` : 'No tax was paid.';
  const tail =
    fill.sellListing.status === 'fulfilled'
      ? 'This listing has now been fully fulfilled.'
      : `There are ${fill.sellListing.quantity_remaining.toLocaleString('en-US')}x remaining to sell in your listing — \`/tp cancel\` to cancel the rest.`;
  return `You sold ${fill.quantity}x **${fill.item.name}** for ${formatArena(fill.transactionPricePerUnit)} each and received ${formatArena(received)}. ${taxLine} ${tail}`;
}

async function sendFillDMs(client, fills) {
  for (const fill of fills) {
    try {
      const buyer = await client.users.fetch(fill.buyListing.user_id);
      await buyer.send(buildBuyerFillDM(fill));
    } catch {

    }
    try {
      const seller = await client.users.fetch(fill.sellListing.user_id);
      await seller.send(buildSellerFillDM(fill));
    } catch {

    }
  }
}

async function handlePost(interaction, side) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
    return interaction.reply({ content: LEVEL_GATE_MESSAGE, ephemeral: true });
  }
  if (isTradingPostLocked(guildId)) {
    return interaction.reply({ content: LOCKED_MESSAGE, ephemeral: true });
  }

  const itemId = interaction.options.getString('item', true);
  const item = POSTABLE_ITEMS.find((i) => String(i.id) === itemId);
  if (!item) {

    const byName = POSTABLE_ITEMS.find((i) => i.name.toLowerCase() === itemId.trim().toLowerCase());
    if (byName && side === 'sell') {
      const hasEligibleCopy = isEquipment(byName)
        ? getUnequippedInstances(guildId, userId, byName.id).some((inst) => inst.durability >= 100)
        : getOwnedQuantity(guildId, userId, byName.id) > 0;
      if (!hasEligibleCopy) {
        const message = isEquipment(byName)
          ? `You don't have a 100%-durability, unequipped copy of **${byName.name}** to sell — repair it first.`
          : `You don't own any **${byName.name}** to sell.`;
        return interaction.reply({ content: message, ephemeral: true });
      }
    }
    return interaction.reply({ content: 'That item is not tradable.', ephemeral: true });
  }

  const rawQuantity = interaction.options.getString('quantity', true);
  const rawPrice = interaction.options.getString('price', true);
  const quantity = parseAmount(rawQuantity);
  const pricePerUnit = parseAmount(rawPrice);
  if (quantity === null || quantity <= 0) {
    return interaction.reply({ content: `**${rawQuantity}** isn't a valid quantity.`, ephemeral: true });
  }
  if (pricePerUnit === null || pricePerUnit <= 0) {
    return interaction.reply({ content: `**${rawPrice}** isn't a valid price.`, ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const listing = side === 'sell' ? createSellListing(guildId, userId, item, quantity, pricePerUnit) : createBuyListing(guildId, userId, item, quantity, pricePerUnit);

    const fills = side === 'sell' ? matchSellListing(guildId, listing) : matchBuyListing(guildId, listing);
    if (fills.length > 0) {
      await sendFillDMs(interaction.client, fills);
    }
    const finalListing = fills.length > 0 ? (side === 'sell' ? fills[fills.length - 1].sellListing : fills[fills.length - 1].buyListing) : listing;

    const myListings = getActiveListingsForUser(guildId, userId);
    const myEntries = myListings.map((l) => ({ listing: l, item: resolveListingDisplayItem(l) })).filter((e) => e.item);

    if (finalListing.status === 'fulfilled') {
      const displayItem = resolveListingDisplayItem(finalListing);
      if (displayItem) myEntries.push({ listing: finalListing, item: displayItem });
    }

    const totalPages = Math.max(1, Math.ceil(myEntries.length / SLOTS_PER_PAGE));
    const lastPageEntries = myEntries.slice((totalPages - 1) * SLOTS_PER_PAGE, totalPages * SLOTS_PER_PAGE);

    const buffer = await renderTradingPostGrid(`${interaction.user.displayName}'s Trading Post Listings`, lastPageEntries, {
      page: totalPages,
      totalPages,
    });
    const attachment = new AttachmentBuilder(buffer, { name: 'trading-post.png' });

    return interaction.editReply({ files: [attachment] });
  } catch (err) {
    if (err instanceof EconomyError) {
      return interaction.editReply({ content: err.message });
    }
    throw err;
  }
}

async function handleViewOffers(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
    return interaction.reply({ content: LEVEL_GATE_MESSAGE, ephemeral: true });
  }
  if (isTradingPostLocked(guildId)) {
    return interaction.reply({ content: LOCKED_MESSAGE, ephemeral: true });
  }

  const itemFilterId = interaction.options.getString('item');
  const itemFilter = itemFilterId ? POSTABLE_ITEMS.find((i) => String(i.id) === itemFilterId) : null;

  if (itemFilterId && !itemFilter) {
    return interaction.reply({ content: 'That item is not tradable.', ephemeral: true });
  }
  const title = itemFilter ? `Trading Post — Recent Listings: ${itemFilter.name}` : 'Trading Post — Recent Listings';
  const order = interaction.options.getString('order');

  async function fetchEntries() {
    const listings = itemFilter ? getRecentSellListingsForItem(guildId, itemFilter.id) : getRecentSellListings(guildId);
    let entries = listings.map((listing) => ({ listing, item: resolveListingDisplayItem(listing) })).filter((e) => e.item);
    if (order === 'asc') entries.sort((a, b) => a.listing.price_per_unit - b.listing.price_per_unit);
    if (order === 'desc') entries.sort((a, b) => b.listing.price_per_unit - a.listing.price_per_unit);
    return entries;
  }

  async function buildPageAttachment(entries, page) {
    const totalPages = Math.max(1, Math.ceil(entries.length / SLOTS_PER_PAGE));
    const clampedPage = Math.min(page, totalPages - 1);
    const pageEntries = entries.slice(clampedPage * SLOTS_PER_PAGE, (clampedPage + 1) * SLOTS_PER_PAGE);

    const sellerIds = [...new Set(pageEntries.map((e) => e.listing.user_id))];
    const members = await interaction.guild.members.fetch({ user: sellerIds }).catch(() => new Map());
    const pageEntriesWithSellers = pageEntries.map((e) => ({
      ...e,
      sellerName: members.get(e.listing.user_id)?.displayName ?? 'Unknown',
    }));

    const buffer = await renderTradingPostGrid(title, pageEntriesWithSellers, { page: clampedPage + 1, totalPages, showProgressBar: false });
    return { attachment: new AttachmentBuilder(buffer, { name: 'trading-post.png' }), totalPages, clampedPage };
  }

  let entries = await fetchEntries();
  if (entries.length === 0) {
    const buffer = await renderTradingPostGrid(title, [], { page: 1, totalPages: 1 });
    return interaction.reply({
      content: 'No active sell listings on the Trading Post right now.',
      files: [new AttachmentBuilder(buffer, { name: 'trading-post.png' })],
    });
  }

  let page = 0;
  const uid = `tp-view-${interaction.id}`;
  const buildComponents = (totalPages) => {
    const rows = [];
    if (totalPages > 1) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${uid}-first`).setEmoji('⏮').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`${uid}-prev`).setEmoji('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`${uid}-page`).setLabel(`${page + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(`${uid}-next`).setEmoji('▶').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1),
          new ButtonBuilder().setCustomId(`${uid}-last`).setEmoji('⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        )
      );
    }

    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${uid}-refresh`).setEmoji('🔄').setLabel('Refresh').setStyle(ButtonStyle.Primary)));
    return rows;
  };

  const { attachment, totalPages } = await buildPageAttachment(entries, page);
  await interaction.reply({ files: [attachment], components: buildComponents(totalPages) });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith(`${uid}-`),
    time: 5 * 60 * 1000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== userId) {
      return i.reply({ content: "This isn't your command to control.", ephemeral: true });
    }
    if (i.customId === `${uid}-refresh`) {

      page = 0;
      entries = await fetchEntries();
      if (entries.length === 0) {
        const buffer = await renderTradingPostGrid(title, [], { page: 1, totalPages: 1 });
        return i.update({ content: 'No active sell listings on the Trading Post right now.', files: [new AttachmentBuilder(buffer, { name: 'trading-post.png' })], components: [] });
      }
    } else if (i.customId === `${uid}-first`) page = 0;
    else if (i.customId === `${uid}-prev`) page = Math.max(0, page - 1);
    else if (i.customId === `${uid}-next`) page = Math.min(Math.ceil(entries.length / SLOTS_PER_PAGE) - 1, page + 1);
    else if (i.customId === `${uid}-last`) page = Math.ceil(entries.length / SLOTS_PER_PAGE) - 1;

    const built = await buildPageAttachment(entries, page);
    page = built.clampedPage;
    await i.update({ files: [built.attachment], components: buildComponents(built.totalPages) });
  });

  collector.on('end', async () => {
    try {
      await message.edit({ components: [] });
    } catch {

    }
  });
}

async function handleMyListings(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
    return interaction.reply({ content: LEVEL_GATE_MESSAGE, ephemeral: true });
  }
  if (isTradingPostLocked(guildId)) {
    return interaction.reply({ content: LOCKED_MESSAGE, ephemeral: true });
  }

  const listings = getActiveListingsForUser(guildId, userId);
  const entries = listings.map((listing) => ({ listing, item: resolveListingDisplayItem(listing) })).filter((e) => e.item);

  if (entries.length === 0) {
    const buffer = await renderTradingPostGrid(`${interaction.user.displayName}'s Trading Post Listings`, [], { page: 1, totalPages: 1 });
    return interaction.reply({
      content: "You don't have any active Trading Post listings.",
      files: [new AttachmentBuilder(buffer, { name: 'trading-post.png' })],
    });
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / SLOTS_PER_PAGE));

  return replyPaginated(interaction, {
    totalPages,
    buildPagePayload: async (page) => {
      const pageEntries = entries.slice(page * SLOTS_PER_PAGE, (page + 1) * SLOTS_PER_PAGE);
      const buffer = await renderTradingPostGrid(`${interaction.user.displayName}'s Trading Post Listings`, pageEntries, {
        page: page + 1,
        totalPages,
      });
      return { files: [new AttachmentBuilder(buffer, { name: 'trading-post.png' })] };
    },
  });
}

async function handleCancel(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
    return interaction.reply({ content: LEVEL_GATE_MESSAGE, ephemeral: true });
  }
  if (isTradingPostLocked(guildId)) {
    return interaction.reply({ content: LOCKED_MESSAGE, ephemeral: true });
  }

  const listingId = Number(interaction.options.getString('listing', true));
  try {
    const listing = cancelListing(guildId, userId, listingId);
    const item = getItem(listing.item_id);
    const itemName = item?.name ?? listing.item_id;
    const refundNote =
      listing.side === 'sell'
        ? `**${listing.quantity_remaining}x ${itemName}**`
        : `**${formatArena(listing.quantity_remaining * listing.price_per_unit)}**`;
    return interaction.reply({ content: `Cancelled — ${refundNote} refunded.`, ephemeral: true });
  } catch (err) {
    if (err instanceof EconomyError) {
      return interaction.reply({ content: err.message, ephemeral: true });
    }
    throw err;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('tp')
    .setDescription('The player-run Trading Post — buy/sell items for arena coins')
    .addSubcommand((sc) =>
      sc
        .setName('sell')
        .setDescription('Post a sell listing')
        .addStringOption((opt) => opt.setName('item').setDescription('Item to sell').setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName('quantity').setDescription('How many to sell — e.g. 500, 1.5k, 2m').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('price').setDescription('Price per unit, in arena coins — e.g. 500, 1.5k, 2m').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('buy')
        .setDescription('Post a buy offer')
        .addStringOption((opt) => opt.setName('item').setDescription('Item to buy').setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName('quantity').setDescription('How many to buy — e.g. 500, 1.5k, 2m').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('price').setDescription('Price per unit, in arena coins — e.g. 500, 1.5k, 2m').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('cancel')
        .setDescription('Cancel one of your own active listings')
        .addStringOption((opt) => opt.setName('listing').setDescription('Which listing to cancel').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('view_listings')
        .setDescription('Browse the 50 most recent sell listings')
        .addStringOption((opt) => opt.setName('item').setDescription('Filter to a specific item').setRequired(false).setAutocomplete(true))
        .addStringOption((opt) =>
          opt
            .setName('order')
            .setDescription('Sort by price')
            .setRequired(false)
            .addChoices({ name: 'Cheapest first', value: 'asc' }, { name: 'Highest first', value: 'desc' })
        )
    )
    .addSubcommand((sc) => sc.setName('my_listings').setDescription('View your own active listings')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (focused.name === 'price') {
      const itemId = interaction.options.getString('item');
      if (!itemId) return interaction.respond([]);
      const suggested = getSuggestedPrice(guildId, itemId, sub);
      if (suggested === null) return interaction.respond([]);
      return interaction.respond([{ name: `Suggested: ${suggested}`, value: String(suggested) }]);
    }

    if (focused.name === 'listing') {
      const typedListing = normalizeQuotes(focused.value.toLowerCase());
      const listings = getActiveListingsForUser(guildId, userId);
      const choices = listings
        .map((listing) => {
          const item = getItem(listing.item_id);
          const sideLabel = listing.side === 'sell' ? 'Sell' : 'Buy';
          const label = `${sideLabel} ${listing.quantity_remaining.toLocaleString('en-US')}x ${item?.name ?? listing.item_id}`;
          return { name: label.slice(0, 100), value: String(listing.id) };
        })
        .filter((c) => normalizeQuotes(c.name.toLowerCase()).includes(typedListing))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    const typed = normalizeQuotes(focused.value.toLowerCase());
    let candidates = POSTABLE_ITEMS;
    if (sub === 'sell') {

      candidates = POSTABLE_ITEMS.filter((item) => {
        if (isEquipment(item)) {
          return getUnequippedInstances(guildId, userId, item.id).some((inst) => inst.durability >= 100);
        }
        return getOwnedQuantity(guildId, userId, item.id) > 0;
      });
    }

    const choices = candidates
      .filter((item) => normalizeQuotes(item.name.toLowerCase()).includes(typed))
      .slice(0, 25)

      .map((item) => ({ name: item.name, value: String(item.id) }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'sell' || sub === 'buy') {
      return handlePost(interaction, sub);
    }
    if (sub === 'view_listings') {
      return handleViewOffers(interaction);
    }
    if (sub === 'my_listings') {
      return handleMyListings(interaction);
    }
    if (sub === 'cancel') {
      return handleCancel(interaction);
    }
  },
};
