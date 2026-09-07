import { EconomyError, getBalance, addCash } from './economy.js';
import { getArenaBalance, addArenaCoins } from './arena.js';
import {
  addItemToInventory,
  getOwnedQuantity,
  getUnequippedInstances,
  transferInstance,
  lockInstance,
  unlockInstance,
} from './inventory.js';
import { ITEMS, isEquipment, isCollectable, hasClaimReward, isTradeableOverride } from '../data/items.js';
import { formatMoney, formatArena } from './format.js';
import { normalizeQuotes } from './textMatch.js';

const TRADEABLE_ITEMS = ITEMS.filter(
  (item) =>
    !item.ownerOnly &&
    (isEquipment(item) || (isCollectable(item) && !item.capOwnedAt1 && (!hasClaimReward(item) || isTradeableOverride(item))))
);

const SUFFIX_MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  t: 1_000_000_000_000,
};

function findItemByName(name) {
  const norm = normalizeQuotes(name.trim().toLowerCase());
  if (!norm) return null;

  const exact = TRADEABLE_ITEMS.find((item) => normalizeQuotes(item.name.toLowerCase()) === norm);
  if (exact) return exact;

  const matches = TRADEABLE_ITEMS.filter((item) => {
    const itemName = normalizeQuotes(item.name.toLowerCase());
    return itemName.includes(norm) || norm.includes(itemName);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const shown = matches.slice(0, 5).map((item) => item.name).join(', ');
    throw new EconomyError(
      `"${name}" matches more than one tradeable item (${shown}${matches.length > 5 ? ', ...' : ''}) — be more specific.`
    );
  }
  return null;
}

function nameExistsInFullCatalog(name) {
  const norm = normalizeQuotes(name.trim().toLowerCase());
  if (!norm) return false;
  return ITEMS.some((item) => {
    const itemName = normalizeQuotes(item.name.toLowerCase());
    return itemName === norm || itemName.includes(norm) || norm.includes(itemName);
  });
}

export function parseTradeSide(raw) {
  const result = { coins: 0, arenaCoins: 0, items: [] };
  if (!raw || !raw.trim()) return result;

  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^(\d+(?:\.\d+)?)\s*([kmbt])?\s+(.+)$/i);

    let quantity = 1;
    let name = segment;
    if (match) {
      const [, numPart, suffix, rest] = match;
      const multiplier = suffix ? SUFFIX_MULTIPLIERS[suffix.toLowerCase()] : 1;
      quantity = Math.floor(Number(numPart) * multiplier);
      name = rest.trim();
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new EconomyError(`"${segment}" doesn't have a valid quantity.`);
    }
    if (!name) {
      throw new EconomyError(`"${segment}" is missing an item name.`);
    }

    const normalized = name.toLowerCase();
    
    
    
    
    
    
    if (normalized === 'cash') {
      result.coins += quantity;
      continue;
    }
    if (normalized === 'coin' || normalized === 'coins') {
      result.arenaCoins += quantity;
      continue;
    }

    const item = findItemByName(name);
    if (!item) {
      throw new EconomyError(nameExistsInFullCatalog(name) ? 'That item is not tradeable.' : "That item doesn't exist.");
    }

    const existing = result.items.find((entry) => entry.itemId === item.id);
    if (existing) existing.quantity += quantity;
    else result.items.push({ itemId: item.id, item, quantity });
  }

  return result;
}

export function isSideEmpty(side) {
  return side.coins === 0 && side.arenaCoins === 0 && side.items.length === 0;
}

export function prepareSideInstances(guildId, userId, side) {
  const resolvedEquipment = []; 
  const collectables = []; 

  for (const { itemId, item, quantity } of side.items) {
    if (isCollectable(item)) {
      if (getOwnedQuantity(guildId, userId, itemId) < quantity) {
        throw new EconomyError(`You only have ${getOwnedQuantity(guildId, userId, itemId)}x ${item.name} — can't offer ${quantity}.`);
      }
      collectables.push({ itemId, item, quantity });
      continue;
    }

    
    
    
    
    const available = getUnequippedInstances(guildId, userId, itemId).filter((a) => a.durability >= 100);
    if (available.length < quantity) {
      throw new EconomyError(`You don't own ${quantity}x ${item.name}, make sure they're 100%.`);
    }
    
    
    
    
    resolvedEquipment.push({ itemId, item, instanceIds: available.slice(0, quantity).map((a) => a.instanceId) });
  }

  return { resolvedEquipment, collectables };
}

export function lockSideInstances(finalSide) {
  for (const { instanceIds } of finalSide.equipmentItems) {
    for (const id of instanceIds) lockInstance(id);
  }
}
export function unlockSideInstances(finalSide) {
  for (const { instanceIds } of finalSide.equipmentItems) {
    for (const id of instanceIds) unlockInstance(id);
  }
}

function canAfford(guildId, userId, finalSide, priceAmount, priceCurrency) {
  const balance = getBalance(guildId, userId);
  const arenaBalance = getArenaBalance(guildId, userId);

  let neededCash = finalSide.coins;
  let neededArena = finalSide.arenaCoins;
  if (priceAmount > 0) {
    if (priceCurrency === 'arena') neededArena += priceAmount;
    else neededCash += priceAmount;
  }

  if (balance.cash < neededCash) return false;
  if (arenaBalance < neededArena) return false;
  for (const { itemId, quantity } of finalSide.collectableItems) {
    if (getOwnedQuantity(guildId, userId, itemId) < quantity) return false;
  }
  return true;
}

export function verifySideAffordable(guildId, userId, finalSide, priceAmount = 0, priceCurrency = null) {
  if (!canAfford(guildId, userId, finalSide, priceAmount, priceCurrency)) {
    throw new EconomyError("They don't have enough to cover their side of the trade.");
  }
}

export const escrowSide = (guildId, userId, finalSide) => {
  if (!canAfford(guildId, userId, finalSide, 0, null)) {
    throw new EconomyError("You don't have enough to cover your side of the trade.");
  }
  if (finalSide.coins > 0) addCash(guildId, userId, -finalSide.coins);
  if (finalSide.arenaCoins > 0) addArenaCoins(guildId, userId, -finalSide.arenaCoins);
  for (const { itemId, quantity } of finalSide.collectableItems) {
    addItemToInventory(guildId, userId, itemId, -quantity);
  }
  lockSideInstances(finalSide);
};

export function refundSide(guildId, userId, finalSide) {
  if (finalSide.coins > 0) addCash(guildId, userId, finalSide.coins);
  if (finalSide.arenaCoins > 0) addArenaCoins(guildId, userId, finalSide.arenaCoins);
  for (const { itemId, quantity } of finalSide.collectableItems) {
    addItemToInventory(guildId, userId, itemId, quantity);
  }
  unlockSideInstances(finalSide);
}

export function deliverSide(guildId, fromUserId, toUserId, finalSide, priceAmount = 0, priceCurrency = null) {
  if (finalSide.coins > 0) addCash(guildId, toUserId, finalSide.coins);
  if (finalSide.arenaCoins > 0) addArenaCoins(guildId, toUserId, finalSide.arenaCoins);
  for (const { itemId, quantity } of finalSide.collectableItems) {
    addItemToInventory(guildId, toUserId, itemId, quantity);
  }
  for (const { instanceIds } of finalSide.equipmentItems) {
    for (const id of instanceIds) {
      transferInstance(guildId, fromUserId, toUserId, id);
      unlockInstance(id);
    }
  }
  if (priceAmount > 0) {
    if (priceCurrency === 'arena') addArenaCoins(guildId, toUserId, priceAmount);
    else addCash(guildId, toUserId, priceAmount);
  }
}

export function debitSideNow(guildId, userId, finalSide, priceAmount = 0, priceCurrency = null) {
  verifySideAffordable(guildId, userId, finalSide, priceAmount, priceCurrency);
  if (finalSide.coins > 0) addCash(guildId, userId, -finalSide.coins);
  if (finalSide.arenaCoins > 0) addArenaCoins(guildId, userId, -finalSide.arenaCoins);
  for (const { itemId, quantity } of finalSide.collectableItems) {
    addItemToInventory(guildId, userId, itemId, -quantity);
  }
  if (priceAmount > 0) {
    if (priceCurrency === 'arena') addArenaCoins(guildId, userId, -priceAmount);
    else addCash(guildId, userId, -priceAmount);
  }
}

export function formatFinalSideLines(finalSide, guildSettings) {
  const lines = [];
  if (finalSide.coins > 0) lines.push(formatMoney(finalSide.coins, guildSettings));
  if (finalSide.arenaCoins > 0) lines.push(formatArena(finalSide.arenaCoins));
  for (const { item, instanceIds } of finalSide.equipmentItems) {
    for (const instanceId of instanceIds) {
      lines.push(item.name);
    }
  }
  for (const { item, quantity } of finalSide.collectableItems) {
    lines.push(`${quantity}x ${item.name}`);
  }
  if (lines.length === 0) lines.push('*nothing*');
  return lines;
}

export function formatPendingSideLines(side, guildSettings) {
  const lines = [];
  if (side.coins > 0) lines.push(formatMoney(side.coins, guildSettings));
  if (side.arenaCoins > 0) lines.push(formatArena(side.arenaCoins));
  for (const { item, quantity } of side.items) {
    lines.push(`${quantity}x ${item.name}`);
  }
  if (lines.length === 0) lines.push('*nothing*');
  return lines;
}
