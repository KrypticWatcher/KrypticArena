import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { EconomyError } from './economy.js';
import { getArenaBalance, addArenaCoins } from './economy.js';
import { addItemToInventory, getUnequippedInstances, transferInstance, getInstanceDurability } from './inventory.js';
import { isCollectable, isEquipment, hasClaimReward, isTradeableOverride, getItem, ITEMS } from '../data/items.js';
import { getHighestTier } from './permissions.js';

const stmtGetTax = db.prepare('SELECT total_collected FROM trading_post_tax WHERE guild_id = ?');
const stmtUpsertTax = db.prepare(`
  INSERT INTO trading_post_tax (guild_id, total_collected) VALUES (?, ?)
  ON CONFLICT (guild_id) DO UPDATE SET total_collected = total_collected + excluded.total_collected
`);

export const TRADING_POST_TAX_RATE = 0.01;

export function computeTradingPostTax(saleAmount) {
  if (!Number.isInteger(saleAmount) || saleAmount <= 0) return 0;
  return Math.floor(saleAmount * TRADING_POST_TAX_RATE);
}

export function recordTradingPostTax(guildId, amount) {
  guildId = GLOBAL_ID;
  if (!Number.isInteger(amount) || amount <= 0) return;
  stmtUpsertTax.run(guildId, amount);
}

export function getTradingPostTaxTotal(guildId) {
  guildId = GLOBAL_ID;
  return stmtGetTax.get(guildId)?.total_collected ?? 0;
}

const stmtGetLock = db.prepare('SELECT locked FROM trading_post_lock WHERE guild_id = ?');
const stmtSetLock = db.prepare(`
  INSERT INTO trading_post_lock (guild_id, locked) VALUES (?, ?)
  ON CONFLICT (guild_id) DO UPDATE SET locked = excluded.locked
`);

export function isTradingPostLocked(guildId) {
  guildId = GLOBAL_ID;
  return Boolean(stmtGetLock.get(guildId)?.locked);
}

export function setTradingPostLocked(guildId, locked) {
  guildId = GLOBAL_ID;
  stmtSetLock.run(guildId, locked ? 1 : 0);
}

const EQUIPMENT_DROP_CRAFT_SOURCES = new Set(['melee_drop', 'melee_craft', 'ranged_drop', 'ranged_craft', 'mage_drop']);
function isPostableEquipmentSource(source) {
  return EQUIPMENT_DROP_CRAFT_SOURCES.has(source) || (typeof source === 'string' && source.startsWith('god_') && source !== 'god_equipment');
}

export const POSTABLE_ITEMS = ITEMS.filter((item) => {
  if (item.ownerOnly) return false;
  if (isCollectable(item)) return !item.capOwnedAt1 && (!hasClaimReward(item) || isTradeableOverride(item));
  if (isEquipment(item)) return isPostableEquipmentSource(item.source);
  return false;
});

export function findPostableItemByName(name) {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;

  const exact = POSTABLE_ITEMS.find((item) => item.name.toLowerCase() === norm);
  if (exact) return exact;

  const matches = POSTABLE_ITEMS.filter((item) => item.name.toLowerCase().includes(norm));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const shown = matches.slice(0, 5).map((item) => item.name).join(', ');
    throw new EconomyError(`"${name}" matches more than one Trading Post item (${shown}${matches.length > 5 ? ', ...' : ''}) — be more specific.`);
  }
  return null;
}

export const TRADING_POST_ESCROW_USER_ID = 'trading_post_escrow';

export const TRADING_POST_LISTING_CAP_NORMAL = 8;
export const TRADING_POST_LISTING_CAP_T4 = 16;

export function getTradingPostListingCap(userId) {
  return getHighestTier(userId) >= 4 ? TRADING_POST_LISTING_CAP_T4 : TRADING_POST_LISTING_CAP_NORMAL;
}

const stmtCountActive = db.prepare(
  "SELECT COUNT(*) AS count FROM trading_post_listings WHERE guild_id = ? AND user_id = ? AND status = 'active'"
);

export function countActiveListings(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtCountActive.get(guildId, userId).count;
}

const stmtInsertListing = db.prepare(`
  INSERT INTO trading_post_listings (guild_id, user_id, side, item_id, price_per_unit, quantity_total, quantity_remaining)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetListing = db.prepare('SELECT * FROM trading_post_listings WHERE id = ?');
const stmtCancelListing = db.prepare(
  "UPDATE trading_post_listings SET status = 'cancelled', updated_at = strftime('%s','now') WHERE id = ? AND status = 'active'"
);
const stmtGetActiveForUser = db.prepare(
  "SELECT * FROM trading_post_listings WHERE guild_id = ? AND user_id = ? AND status = 'active' ORDER BY created_at ASC"
);
const stmtInsertListingInstance = db.prepare('INSERT INTO trading_post_listing_instances (listing_id, instance_id) VALUES (?, ?)');
const stmtGetListingInstances = db.prepare('SELECT instance_id FROM trading_post_listing_instances WHERE listing_id = ?');
const stmtDeleteListingInstances = db.prepare('DELETE FROM trading_post_listing_instances WHERE listing_id = ?');

function assertNotLocked(guildId) {
  if (isTradingPostLocked(guildId)) {
    throw new EconomyError('The Trading Post is currently closed.');
  }
}

function assertUnderCap(guildId, userId) {
  const cap = getTradingPostListingCap(userId);
  if (countActiveListings(guildId, userId) >= cap) {
    throw new EconomyError('you already have the max 8 active listings, t4 get an extra 8.');
  }
}

function assertValidPosting(item, quantity, pricePerUnit) {
  if (!item) throw new EconomyError("Couldn't find that item on the Trading Post.");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EconomyError('Quantity must be a positive whole number.');
  }
  if (!Number.isInteger(pricePerUnit) || pricePerUnit <= 0) {
    throw new EconomyError('Price per unit must be a positive whole number of arena coins.');
  }
}

export const createSellListing = db.transaction((guildId, userId, item, quantity, pricePerUnit) => {
  guildId = GLOBAL_ID;
  assertNotLocked(guildId);
  assertUnderCap(guildId, userId);
  assertValidPosting(item, quantity, pricePerUnit);

  const result = stmtInsertListing.run(guildId, userId, 'sell', item.id, pricePerUnit, quantity, quantity);
  const listingId = result.lastInsertRowid;

  if (isEquipment(item)) {
    const candidates = getUnequippedInstances(guildId, userId, item.id).filter((a) => a.durability >= 100);
    if (candidates.length < quantity) {
      throw new EconomyError("You don't own any of those items or they need repairing.");
    }
    for (let i = 0; i < quantity; i++) {
      const instanceId = candidates[i].instanceId;
      transferInstance(guildId, userId, TRADING_POST_ESCROW_USER_ID, instanceId);
      stmtInsertListingInstance.run(listingId, instanceId);
    }
  } else {
    addItemToInventory(guildId, userId, item.id, -quantity);
    addItemToInventory(guildId, TRADING_POST_ESCROW_USER_ID, item.id, quantity);
  }

  return stmtGetListing.get(listingId);
});

export const createBuyListing = db.transaction((guildId, userId, item, quantity, pricePerUnit) => {
  guildId = GLOBAL_ID;
  assertNotLocked(guildId);
  assertUnderCap(guildId, userId);
  assertValidPosting(item, quantity, pricePerUnit);

  const totalCost = quantity * pricePerUnit;
  const balance = getArenaBalance(guildId, userId);
  if (balance < totalCost) {
    throw new EconomyError("You don't have enough arena coins for this offer.");
  }
  addArenaCoins(guildId, userId, -totalCost);
  const result = stmtInsertListing.run(guildId, userId, 'buy', item.id, pricePerUnit, quantity, quantity);
  return stmtGetListing.get(result.lastInsertRowid);
});

export const cancelListing = db.transaction((guildId, userId, listingId) => {
  guildId = GLOBAL_ID;
  assertNotLocked(guildId);
  const listing = stmtGetListing.get(listingId);
  if (!listing || listing.guild_id !== guildId || listing.user_id !== userId) {
    throw new EconomyError("Couldn't find that listing — might've already been fulfilled or cancelled.");
  }
  if (listing.status !== 'active') {
    throw new EconomyError('That listing is no longer active.');
  }

  if (listing.side === 'sell') {
    const item = getItem(listing.item_id);
    if (item && isEquipment(item)) {
      const rows = stmtGetListingInstances.all(listingId);
      for (const row of rows) {
        transferInstance(guildId, TRADING_POST_ESCROW_USER_ID, userId, row.instance_id);
      }
      stmtDeleteListingInstances.run(listingId);
    } else {
      addItemToInventory(guildId, TRADING_POST_ESCROW_USER_ID, listing.item_id, -listing.quantity_remaining);
      addItemToInventory(guildId, userId, listing.item_id, listing.quantity_remaining);
    }
  } else {
    addArenaCoins(guildId, userId, listing.quantity_remaining * listing.price_per_unit);
  }
  stmtCancelListing.run(listingId);
  return stmtGetListing.get(listingId);
});

const stmtGetRecentTradeHistory = db.prepare(`
  SELECT price_per_unit, buyer_user_id, seller_user_id FROM trading_post_trade_history
  WHERE guild_id = ? AND item_id = ? AND triggering_side = ?
  ORDER BY created_at DESC LIMIT 50
`);

const MIN_DISTINCT_TRADING_PAIRS = 3;

export function getSuggestedPrice(guildId, itemId, side) {
  guildId = GLOBAL_ID;
  const rows = stmtGetRecentTradeHistory.all(guildId, itemId, side);
  if (rows.length === 0) return null;

  
  
  const mostRecentPriceByPair = new Map();
  for (const row of rows) {
    const pairKey = [row.buyer_user_id, row.seller_user_id].sort().join('|');
    if (!mostRecentPriceByPair.has(pairKey)) mostRecentPriceByPair.set(pairKey, row.price_per_unit);
  }

  if (mostRecentPriceByPair.size < MIN_DISTINCT_TRADING_PAIRS) return null;

  const prices = [...mostRecentPriceByPair.values()];
  const counts = new Map();
  for (const price of prices) counts.set(price, (counts.get(price) ?? 0) + 1);
  let best = prices[0];
  let bestCount = 0;
  for (const price of prices) {
    const count = counts.get(price);
    if (count > bestCount) {
      bestCount = count;
      best = price;
    }
  }
  return best;
}

const stmtGetRecentSellListings = db.prepare(
  "SELECT * FROM trading_post_listings WHERE guild_id = ? AND side = 'sell' AND status = 'active' ORDER BY created_at DESC LIMIT 50"
);

export function getRecentSellListings(guildId) {
  guildId = GLOBAL_ID;
  return stmtGetRecentSellListings.all(guildId);
}

const stmtGetRecentSellListingsForItem = db.prepare(
  "SELECT * FROM trading_post_listings WHERE guild_id = ? AND side = 'sell' AND status = 'active' AND item_id = ? ORDER BY created_at DESC LIMIT 50"
);

export function getRecentSellListingsForItem(guildId, itemId) {
  guildId = GLOBAL_ID;
  return stmtGetRecentSellListingsForItem.all(guildId, itemId);
}

export function getActiveListingsForUser(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetActiveForUser.all(guildId, userId);
}

export function resolveListingDisplayItem(listing) {
  const item = getItem(listing.item_id);
  if (!item) return null;
  if (isEquipment(item)) {
    const rows = stmtGetListingInstances.all(listing.id);
    const current = rows.length > 0 ? getInstanceDurability(rows[0].instance_id) : null;
    return { ...item, durability: current !== null ? { current, broken: current <= 0 } : null };
  }
  return item;
}
