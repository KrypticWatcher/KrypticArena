import db from '../database.js';
import { EconomyError } from './economy.js';
import { getArenaBalance, addArenaCoins } from './arena.js';
import { addItemToInventory, getOwnedQuantity } from './inventory.js';
import { recordCollectionLogObtain } from './collectionLog.js';
import { getBalance, addCash } from './economy.js';
import { getItem, isEquipment, isCollectable } from '../data/items.js';
import { getGladiatorProfile } from './gladiator.js';
import { consumeElixirPurchaseAllowance } from './elixir.js';

export const buyArenaItem = db.transaction((guildId, userId, itemId, quantity = 1, fallbackName) => {
  const item = getItem(itemId);
  if (!item || !(isEquipment(item) || isCollectable(item) || item.type === 'tool') || item.source !== 'arena_store') {
    throw new EconomyError("That's not something the Arena Store sells — check `/arena-shop view`.");
  }

  const isArenaCollectable = isCollectable(item);
  
  
  
  
  
  const arenaPricePerUnit = isArenaCollectable ? item.priceArena : item.price;
  const cashPricePerUnit = isArenaCollectable ? (item.price ?? 0) : 0;
  if (arenaPricePerUnit == null) {
    throw new EconomyError("That's not something the Arena Store sells — check `/arena-shop view`.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new EconomyError('Quantity must be a positive whole number.');
  }
  if (isArenaCollectable && (item.claim || item.capOwnedAt1) && quantity > 1) {
    throw new EconomyError(`**${item.name}** is capped at 1 per player — you can only buy 1.`);
  }
  if (isArenaCollectable && (item.claim || item.capOwnedAt1) && getOwnedQuantity(guildId, userId, itemId) >= 1) {
    throw new EconomyError(`You already own **${item.name}** — it's capped at 1 per player.`);
  }

  
  
  
  
  if (itemId === 'elixir') {
    consumeElixirPurchaseAllowance(guildId, userId, quantity);
  }

  
  
  
  
  if (item.levelRequirement) {
    const { level: gladiatorLevel } = getGladiatorProfile(guildId, userId, fallbackName);
    if (item.levelRequirement > gladiatorLevel) {
      throw new EconomyError(`**${item.name}** requires Gladiator level **${item.levelRequirement}** to buy — yours is **${gladiatorLevel}**.`);
    }
  }

  const arenaCost = arenaPricePerUnit * quantity;
  const arenaBalance = getArenaBalance(guildId, userId);
  if (arenaBalance < arenaCost) {
    throw new EconomyError(
      `${quantity}x **${item.name}** costs **${arenaCost.toLocaleString('en-US')}** arena coins — you only have **${arenaBalance.toLocaleString('en-US')}**.`
    );
  }
  const cashCost = cashPricePerUnit * quantity;
  const cashBalance = getBalance(guildId, userId).cash;
  if (cashCost > 0 && cashBalance < cashCost) {
    throw new EconomyError(
      `${quantity}x **${item.name}** also costs **${cashCost.toLocaleString('en-US')}** cash — you only have **${cashBalance.toLocaleString('en-US')}**.`
    );
  }

  addArenaCoins(guildId, userId, -arenaCost);
  if (cashCost > 0) addCash(guildId, userId, -cashCost);
  addItemToInventory(guildId, userId, itemId, quantity);
  
  
  
  
  
  
  
  
  
  recordCollectionLogObtain(userId, itemId, quantity);

  return {
    item,
    quantity,
    cost: arenaCost,
    cashCost,
    arenaBalance: getArenaBalance(guildId, userId),
    owned: getOwnedQuantity(guildId, userId, itemId),
  };
});
