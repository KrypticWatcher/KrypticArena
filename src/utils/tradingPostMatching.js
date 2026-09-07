import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { addArenaCoins } from './economy.js';
import { addItemToInventory, transferInstance, getInstanceDurability } from './inventory.js';
import { getItem, isEquipment } from '../data/items.js';
import { computeTradingPostTax, recordTradingPostTax, TRADING_POST_ESCROW_USER_ID } from './tradingPost.js';

const stmtFindQualifyingSells = db.prepare(`
  SELECT * FROM trading_post_listings
  WHERE guild_id = ? AND side = 'sell' AND item_id = ? AND status = 'active' AND price_per_unit <= ? AND user_id != ?
  ORDER BY price_per_unit DESC, created_at ASC
`);
const stmtFindQualifyingBuys = db.prepare(`
  SELECT * FROM trading_post_listings
  WHERE guild_id = ? AND side = 'buy' AND item_id = ? AND status = 'active' AND price_per_unit >= ? AND user_id != ?
  ORDER BY price_per_unit DESC, created_at DESC
`);
const stmtDecrementListing = db.prepare(`
  UPDATE trading_post_listings
  SET quantity_remaining = quantity_remaining - ?,
      status = CASE WHEN quantity_remaining - ? <= 0 THEN 'fulfilled' ELSE status END,
      updated_at = strftime('%s','now')
  WHERE id = ?
`);
const stmtGetListing = db.prepare('SELECT * FROM trading_post_listings WHERE id = ?');
const stmtGetListingInstances = db.prepare('SELECT instance_id FROM trading_post_listing_instances WHERE listing_id = ? LIMIT ?');
const stmtDeleteListingInstance = db.prepare('DELETE FROM trading_post_listing_instances WHERE listing_id = ? AND instance_id = ?');
const stmtInsertTradeHistory = db.prepare(`
  INSERT INTO trading_post_trade_history (guild_id, item_id, triggering_side, price_per_unit, quantity, buyer_user_id, seller_user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function deliverFromEscrow(guildId, sellListingId, item, quantity, buyerUserId) {
  if (isEquipment(item)) {
    const rows = stmtGetListingInstances.all(sellListingId, quantity);
    for (const row of rows) {
      transferInstance(guildId, TRADING_POST_ESCROW_USER_ID, buyerUserId, row.instance_id);
      stmtDeleteListingInstance.run(sellListingId, row.instance_id);
    }
  } else {
    addItemToInventory(guildId, TRADING_POST_ESCROW_USER_ID, item.id, -quantity);
    addItemToInventory(guildId, buyerUserId, item.id, quantity);
  }
}

const executeFill = db.transaction((guildId, buyListing, sellListing, quantity, transactionPricePerUnit, triggeringSide) => {
  const item = getItem(sellListing.item_id);
  if (!item) return null;

  deliverFromEscrow(guildId, sellListing.id, item, quantity, buyListing.user_id);

  const totalAtTransactionPrice = quantity * transactionPricePerUnit;
  const tax = computeTradingPostTax(totalAtTransactionPrice);
  const sellerProceeds = totalAtTransactionPrice - tax;
  addArenaCoins(guildId, sellListing.user_id, sellerProceeds);
  if (tax > 0) recordTradingPostTax(guildId, tax);

  
  
  
  
  
  const buyerReserved = quantity * buyListing.price_per_unit;
  const buyerRefund = buyerReserved - totalAtTransactionPrice;
  if (buyerRefund > 0) addArenaCoins(guildId, buyListing.user_id, buyerRefund);

  stmtDecrementListing.run(quantity, quantity, buyListing.id);
  stmtDecrementListing.run(quantity, quantity, sellListing.id);

  
  
  
  
  
  
  
  stmtInsertTradeHistory.run(guildId, item.id, triggeringSide, transactionPricePerUnit, quantity, buyListing.user_id, sellListing.user_id);

  return {
    item,
    quantity,
    transactionPricePerUnit,
    tax,
    buyListing: stmtGetListing.get(buyListing.id),
    sellListing: stmtGetListing.get(sellListing.id),
  };
});

export function matchBuyListing(guildId, buyListing) {
  guildId = GLOBAL_ID;
  const fills = [];
  let remaining = buyListing.quantity_remaining;
  let current = buyListing;

  while (remaining > 0) {
    const candidates = stmtFindQualifyingSells.all(guildId, current.item_id, current.price_per_unit, current.user_id);
    if (candidates.length === 0) break;
    const sell = candidates[0];
    const fillQty = Math.min(remaining, sell.quantity_remaining);
    
    const fill = executeFill(guildId, current, sell, fillQty, sell.price_per_unit, 'buy');
    if (!fill) break;
    fills.push(fill);
    current = fill.buyListing;
    remaining = current.quantity_remaining;
    if (current.status !== 'active') break;
  }
  return fills;
}

export function matchSellListing(guildId, sellListing) {
  guildId = GLOBAL_ID;
  const fills = [];
  let remaining = sellListing.quantity_remaining;
  let current = sellListing;

  while (remaining > 0) {
    const candidates = stmtFindQualifyingBuys.all(guildId, current.item_id, current.price_per_unit, current.user_id);
    if (candidates.length === 0) break;
    const buy = candidates[0];
    const fillQty = Math.min(remaining, buy.quantity_remaining);
    
    
    const fill = executeFill(guildId, buy, current, fillQty, buy.price_per_unit, 'sell');
    if (!fill) break;
    fills.push(fill);
    current = fill.sellListing;
    remaining = current.quantity_remaining;
    if (current.status !== 'active') break;
  }
  return fills;
}
