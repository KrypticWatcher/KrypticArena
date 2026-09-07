import { randomUUID } from 'crypto';
import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { EconomyError } from './economy.js';
import { isOwnerId } from './owner.js';
import { recordGain } from './gainLog.js';
import {
  getItem,
  isEquipment,
  isCollectable,
  isTradeableOverride,
  isOwnerOnlyItem,
  SLOTS,
  compareHeistItemsForDisplay,
  getDurabilityLossPerFight,
} from '../data/items.js';

export const MAX_LOADOUTS = 6;

const stmtGetInvRow = db.prepare('SELECT * FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?');
const stmtUpsertInv = db.prepare(`
  INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity
`);
const stmtGetAllInv = db.prepare('SELECT * FROM inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0');

function getOwnedCollectableQuantity(guildId, userId, itemId) {
  return stmtGetInvRow.get(guildId, userId, itemId)?.quantity ?? 0;
}

const addCollectableToInventory = db.transaction((guildId, userId, itemId, amount) => {
  const item = getItem(itemId);
  const current = getOwnedCollectableQuantity(guildId, userId, itemId);
  const next = current + amount;
  if (next < 0) {
    throw new EconomyError(`Can't remove ${-amount}x ${item.name} — only ${current} owned.`);
  }
  if (item.claim && next > 1 && !isTradeableOverride(item)) {
    throw new EconomyError(`**${item.name}** is capped at 1 per player — you already own it.`);
  }
  stmtUpsertInv.run(guildId, userId, itemId, amount);
  return getOwnedCollectableQuantity(guildId, userId, itemId);
});

const BATCH_QTY_SUFFIX_MULTIPLIERS = { k: 1_000, m: 1_000_000, b: 1_000_000_000, t: 1_000_000_000_000 };
const MAX_BATCH_LINES = 25;

export function parseItemBatchText(text, findItemByName) {
  const lines = (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new EconomyError('Enter at least one item, one per line (e.g. "5 rusty sword").');
  }
  if (lines.length > MAX_BATCH_LINES) {
    throw new EconomyError(`Too many lines — max ${MAX_BATCH_LINES} items per batch.`);
  }

  const results = [];
  for (const line of lines) {
    const match = line.match(/^(\d+(?:\.\d+)?)\s*([kmbt])?\s+(.+)$/i);
    let quantity = 1;
    let name = line;
    if (match) {
      const [, numPart, suffix, rest] = match;
      const multiplier = suffix ? BATCH_QTY_SUFFIX_MULTIPLIERS[suffix.toLowerCase()] : 1;
      quantity = Math.floor(Number(numPart) * multiplier);
      name = rest.trim();
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new EconomyError(`"${line}" doesn't have a valid quantity.`);
    }
    if (!name) {
      throw new EconomyError(`"${line}" is missing an item name.`);
    }

    const item = findItemByName(name);
    if (!item) {
      throw new EconomyError(`Couldn't find an item called "${name}" (from line "${line}").`);
    }

    const existing = results.find((r) => r.itemId === item.id);
    if (existing) existing.quantity += quantity;
    else results.push({ itemId: item.id, item, quantity });
  }

  return results;
}

const stmtInsertInstance = db.prepare(
  'INSERT INTO item_instances (instance_id, guild_id, user_id, item_id, durability) VALUES (?, ?, ?, ?, ?)'
);
const stmtGetInstance = db.prepare('SELECT * FROM item_instances WHERE instance_id = ?');
const stmtGetInstancesOfItem = db.prepare(
  'SELECT * FROM item_instances WHERE guild_id = ? AND user_id = ? AND item_id = ? ORDER BY durability DESC, created_at ASC'
);
const stmtGetAllInstancesForUser = db.prepare('SELECT * FROM item_instances WHERE guild_id = ? AND user_id = ?');
const stmtSetInstanceDurability = db.prepare('UPDATE item_instances SET durability = ? WHERE instance_id = ?');
const stmtSetInstanceOwner = db.prepare('UPDATE item_instances SET user_id = ? WHERE instance_id = ?');
const stmtSetInstanceItemId = db.prepare('UPDATE item_instances SET item_id = ? WHERE instance_id = ?');
const stmtDeleteInstance = db.prepare('DELETE FROM item_instances WHERE instance_id = ?');

export function getAllOwnedInstances(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetAllInstancesForUser.all(guildId, userId).map((row) => ({
    instanceId: row.instance_id,
    itemId: row.item_id,
    durability: row.durability,
  }));
}

export function updateInstanceItemId(instanceId, newItemId) {
  stmtSetInstanceItemId.run(newItemId, instanceId);
}

function createEquipmentInstances(guildId, userId, itemId, count, durability = 100) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const instanceId = randomUUID();
    stmtInsertInstance.run(instanceId, guildId, userId, itemId, durability);
    created.push(instanceId);
  }
  return created;
}

function removeEquipmentInstances(guildId, userId, itemId, count, itemName) {
  const equippedIds = getEquippedInstanceIdSet(guildId, userId);
  const available = stmtGetInstancesOfItem
    .all(guildId, userId, itemId)
    .filter((row) => !equippedIds.has(row.instance_id))
    .sort((a, b) => a.durability - b.durability); 
  if (available.length < count) {
    throw new EconomyError(`Can't remove ${count}x ${itemName} — only ${available.length} owned (unequipped).`);
  }
  for (let i = 0; i < count; i++) {
    stmtDeleteInstance.run(available[i].instance_id);
  }
}

export function getOwnedQuantity(guildId, userId, itemId) {
  guildId = GLOBAL_ID;
  const item = getItem(itemId);
  if (!item) return 0;
  if (isEquipment(item)) return getUnequippedInstances(guildId, userId, itemId).length;
  return getOwnedCollectableQuantity(guildId, userId, itemId);
}

export const addItemToInventory = db.transaction((guildId, userId, itemId, amount, source) => {
  guildId = GLOBAL_ID;
  const item = getItem(itemId);
  if (!item) {
    throw new EconomyError(`No item with id \`${itemId}\` exists in the catalog.`);
  }
  if (!Number.isInteger(amount) || amount === 0) {
    throw new EconomyError('Quantity must be a non-zero whole number.');
  }

  
  
  
  
  
  
  
  
  
  if (amount > 0 && isOwnerOnlyItem(item) && !isOwnerId(userId)) {
    throw new EconomyError(`**${item.name}** is an owner-exclusive item and can't be given to anyone else.`);
  }

  recordGain(guildId, userId, 'item', amount, source, itemId);

  if (isEquipment(item)) {
    if (amount > 0) {
      createEquipmentInstances(guildId, userId, itemId, amount);
    } else {
      removeEquipmentInstances(guildId, userId, itemId, -amount, item.name);
    }
    return getOwnedQuantity(guildId, userId, itemId);
  }

  return addCollectableToInventory(guildId, userId, itemId, amount);
});

export const applyItemBatch = db.transaction((guildId, userId, deltas) => {
  guildId = GLOBAL_ID;
  return deltas.map(({ itemId, amount }) => {
    const newQty = addItemToInventory(guildId, userId, itemId, amount);
    return { itemId, item: getItem(itemId), newQty };
  });
});

export function getInventory(guildId, userId, type = null) {
  guildId = GLOBAL_ID;
  const collectableRows =
    type === 'equipment'
      ? []
      : stmtGetAllInv
          .all(guildId, userId)
          .map((row) => ({ item: getItem(row.item_id), quantity: row.quantity, instances: null }))
          
          
          
          
          
          
          
          
          
          
          .filter((entry) => entry.item && !isEquipment(entry.item));

  const equipmentRows = [];
  if (type !== 'collectable') {
    const equippedIds = getEquippedInstanceIdSet(guildId, userId);
    const grouped = new Map(); 
    const allInstances = db
      .prepare('SELECT * FROM item_instances WHERE guild_id = ? AND user_id = ?')
      .all(guildId, userId);
    for (const row of allInstances) {
      if (equippedIds.has(row.instance_id)) continue;
      if (!grouped.has(row.item_id)) grouped.set(row.item_id, []);
      grouped.get(row.item_id).push({ instanceId: row.instance_id, durability: row.durability, broken: row.durability <= 0 });
    }
    for (const [itemId, instances] of grouped) {
      const item = getItem(itemId);
      if (!item) continue;
      instances.sort((a, b) => b.durability - a.durability);
      equipmentRows.push({ item, quantity: instances.length, instances });
    }
  }

  return [...collectableRows, ...equipmentRows]
    .filter((entry) => entry.quantity > 0)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

export function getInventoryGrid(guildId, userId) {
  guildId = GLOBAL_ID;
  const rawEntries = getInventory(guildId, userId);
  const cells = [];

  for (const entry of rawEntries) {
    
    
    
    
    
    
    
    
    
    
    if (String(entry.item.id).startsWith('heist_')) continue;

    if (entry.instances === null) {
      cells.push({ item: entry.item, quantity: entry.quantity, durability: null });
      continue;
    }

    const countByDurability = new Map();
    for (const inst of entry.instances) {
      countByDurability.set(inst.durability, (countByDurability.get(inst.durability) ?? 0) + 1);
    }
    
    
    
    const durabilities = [...countByDurability.keys()].sort((a, b) => b - a);
    for (const durability of durabilities) {
      cells.push({ item: entry.item, quantity: countByDurability.get(durability), durability });
    }
  }

  return cells;
}

export function getHeistInventoryGrid(guildId, userId) {
  guildId = GLOBAL_ID;
  const rawEntries = getInventory(guildId, userId);
  const cells = [];

  for (const entry of rawEntries) {
    if (!String(entry.item.id).startsWith('heist_')) continue;

    if (entry.instances === null) {
      cells.push({ item: entry.item, quantity: entry.quantity, durability: null });
      continue;
    }

    const countByDurability = new Map();
    for (const inst of entry.instances) {
      countByDurability.set(inst.durability, (countByDurability.get(inst.durability) ?? 0) + 1);
    }
    const durabilities = [...countByDurability.keys()].sort((a, b) => b - a);
    for (const durability of durabilities) {
      cells.push({ item: entry.item, quantity: countByDurability.get(durability), durability });
    }
  }

  return cells.sort((a, b) => compareHeistItemsForDisplay(a.item, b.item));
}

const stmtGetEquipment = db.prepare('SELECT * FROM equipment WHERE guild_id = ? AND user_id = ? AND set_name = ?');
const stmtInsertEquipment = db.prepare('INSERT INTO equipment (guild_id, user_id, set_name) VALUES (?, ?, ?)');
const stmtSetEquipmentSlots = db.prepare(`
  UPDATE equipment SET helmet = ?, chest = ?, legs = ?, boots = ?, gloves = ?, main_hand = ?, off_hand = ?
  WHERE guild_id = ? AND user_id = ? AND set_name = ?
`);

export const GEAR_SETS = ['arena', 'adventure', 'misc'];

function ensureEquipmentRow(guildId, userId, setName) {
  let row = stmtGetEquipment.get(guildId, userId, setName);
  if (!row) {
    stmtInsertEquipment.run(guildId, userId, setName);
    row = stmtGetEquipment.get(guildId, userId, setName);
  }
  return row;
}

function resolveInstance(instanceId) {
  if (!instanceId) return null;
  const row = stmtGetInstance.get(instanceId);
  if (!row) return null;
  const item = getItem(row.item_id);
  if (!item) return null;
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const isWearExempt = getDurabilityLossPerFight(item) === null;
  return { ...item, instanceId: row.instance_id, isWearExempt, durability: { current: row.durability, broken: row.durability <= 0 } };
}

export function getEquipment(guildId, userId, setName) {
  guildId = GLOBAL_ID;
  const row = ensureEquipmentRow(guildId, userId, setName);
  const resolved = {};
  for (const slot of SLOTS) {
    resolved[slot] = resolveInstance(row[slot]);
  }
  
  
  
  resolved.arrows = row.arrows_item_id ? { item: getItem(row.arrows_item_id), quantity: row.arrows_qty } : null;
  return resolved;
}

export function getAllEquipmentSets(guildId, userId) {
  guildId = GLOBAL_ID;
  const result = {};
  for (const setName of GEAR_SETS) {
    result[setName] = getEquipment(guildId, userId, setName);
  }
  return result;
}

function writeEquipmentRow(guildId, userId, setName, slots) {
  ensureEquipmentRow(guildId, userId, setName);
  stmtSetEquipmentSlots.run(
    slots.helmet, slots.chest, slots.legs, slots.boots, slots.gloves, slots.main_hand, slots.off_hand,
    guildId, userId, setName
  );
}

function getEquippedInstanceIdSet(guildId, userId) {
  const ids = new Set();
  for (const setName of GEAR_SETS) {
    const row = ensureEquipmentRow(guildId, userId, setName);
    for (const slot of SLOTS) {
      if (row[slot]) ids.add(row[slot]);
    }
  }
  return ids;
}

export function getUnequippedInstances(guildId, userId, itemId) {
  guildId = GLOBAL_ID;
  const equippedIds = getEquippedInstanceIdSet(guildId, userId);
  return stmtGetInstancesOfItem
    .all(guildId, userId, itemId)
    .filter((row) => !equippedIds.has(row.instance_id) && !lockedInstanceIds.has(row.instance_id))
    .map((row) => ({ instanceId: row.instance_id, itemId: row.item_id, durability: row.durability, broken: row.durability <= 0 }));
}

export const equipInstance = db.transaction((guildId, userId, setName, slot, instanceId, gladiatorLevel) => {
  guildId = GLOBAL_ID;
  if (!GEAR_SETS.includes(setName)) {
    throw new EconomyError(`\`${setName}\` isn't a valid gear set.`);
  }
  if (!SLOTS.includes(slot)) {
    throw new EconomyError(`\`${slot}\` isn't a valid equipment slot.`);
  }

  const row = ensureEquipmentRow(guildId, userId, setName);
  const current = { ...row };

  const currentMainItem = resolveInstance(current.main_hand);
  const wearingTwoHanded = Boolean(currentMainItem?.twoHanded && current.off_hand === current.main_hand);

  function clearSlots(slotsToClear) {
    const clearingBothHands = wearingTwoHanded && slotsToClear.includes('main_hand') && slotsToClear.includes('off_hand');
    if (clearingBothHands) {
      current.main_hand = null;
      current.off_hand = null;
    }
    for (const s of slotsToClear) {
      if ((s === 'main_hand' || s === 'off_hand') && clearingBothHands) continue;
      current[s] = null;
    }
  }

  if (instanceId === null) {
    const slotsToClear = wearingTwoHanded && (slot === 'main_hand' || slot === 'off_hand')
      ? ['main_hand', 'off_hand']
      : [slot];
    clearSlots(slotsToClear);
    writeEquipmentRow(guildId, userId, setName, current);
    return { equipment: getEquipment(guildId, userId, setName), forcedUnequip: null, movedFromSet: null };
  }

  const instanceRow = stmtGetInstance.get(instanceId);
  if (!instanceRow || instanceRow.user_id !== userId || instanceRow.guild_id !== guildId) {
    throw new EconomyError("You don't own that item.");
  }
  if (lockedInstanceIds.has(instanceId)) {
    throw new EconomyError("That item is tied up in a pending trade offer right now — wait for it to resolve first.");
  }
  const item = getItem(instanceRow.item_id);
  if (!item) {
    throw new EconomyError(`No item with id \`${instanceRow.item_id}\` exists in the catalog.`);
  }
  if (!isEquipment(item)) {
    throw new EconomyError(`**${item.name}** is a collectable and can't be equipped.`);
  }
  if (item.levelRequirement > gladiatorLevel) {
    throw new EconomyError(`**${item.name}** requires Gladiator level **${item.levelRequirement}** — yours is **${gladiatorLevel}**.`);
  }
  
  
  
  
  if (item.slot !== slot) {
    throw new EconomyError(`**${item.name}** goes in the ${item.slot.replace('_', ' ')} slot, not ${slot.replace('_', ' ')}.`);
  }

  
  
  
  let movedFromSet = null;
  for (const otherSetName of GEAR_SETS) {
    if (otherSetName === setName) continue;
    const otherRow = ensureEquipmentRow(guildId, userId, otherSetName);
    const otherSlotWithThisInstanceElsewhere = SLOTS.find((s) => otherRow[s] === instanceId);
    if (!otherSlotWithThisInstanceElsewhere) continue;
    movedFromSet = otherSetName;
    const otherCurrent = { ...otherRow };
    const otherMainItem = resolveInstance(otherCurrent.main_hand);
    const otherWearingTwoHanded = Boolean(otherMainItem?.twoHanded && otherCurrent.off_hand === otherCurrent.main_hand);
    if (otherWearingTwoHanded && (otherSlotWithThisInstanceElsewhere === 'main_hand' || otherSlotWithThisInstanceElsewhere === 'off_hand')) {
      otherCurrent.main_hand = null;
      otherCurrent.off_hand = null;
    } else {
      otherCurrent[otherSlotWithThisInstanceElsewhere] = null;
    }
    writeEquipmentRow(guildId, userId, otherSetName, otherCurrent);
    break; 
  }

  
  
  
  
  const otherSlotWithThisInstance = SLOTS.find((s) => s !== slot && current[s] === instanceId);

  let forcedUnequip = null;
  if (wearingTwoHanded && (slot === 'main_hand' || slot === 'off_hand')) {
    forcedUnequip = currentMainItem;
    clearSlots(['main_hand', 'off_hand']);
  } else {
    const targetSlots = slot === 'main_hand' && item.twoHanded ? ['main_hand', 'off_hand'] : [slot];
    clearSlots(otherSlotWithThisInstance ? [...targetSlots, otherSlotWithThisInstance] : targetSlots);
  }

  current[slot] = instanceId;
  if (slot === 'main_hand' && item.twoHanded) {
    current.off_hand = instanceId;
  }

  writeEquipmentRow(guildId, userId, setName, current);
  return { equipment: getEquipment(guildId, userId, setName), forcedUnequip, movedFromSet };
});

export const equipArrows = db.transaction((guildId, userId, setName, arrowItemId, quantity) => {
  guildId = GLOBAL_ID;
  if (!GEAR_SETS.includes(setName)) {
    throw new EconomyError(`\`${setName}\` isn't a valid gear set.`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EconomyError('Quantity must be a positive whole number.');
  }

  const row = ensureEquipmentRow(guildId, userId, setName);
  const bow = resolveInstance(row.main_hand);
  if (!bow || bow.weaponSubtype !== 'bow') {
    throw new EconomyError('You need a Bow equipped in main_hand before you can equip arrows.');
  }

  const arrowItem = getItem(arrowItemId);
  if (!arrowItem || arrowItem.category !== 'arrow') {
    throw new EconomyError('That item is not a valid arrow type.');
  }
  if (arrowItem.tier > bow.arrowMaxTier) {
    throw new EconomyError(`Your bow can't fire **${arrowItem.name}** — it's above the bow's own tier.`);
  }

  const owned = getOwnedCollectableQuantity(guildId, userId, arrowItemId);
  if (owned < quantity) {
    throw new EconomyError(`You only own ${owned}x ${arrowItem.name}.`);
  }

  if (row.arrows_item_id && row.arrows_item_id !== arrowItemId && row.arrows_qty > 0) {
    addItemToInventory(guildId, userId, row.arrows_item_id, row.arrows_qty);
  }

  addItemToInventory(guildId, userId, arrowItemId, -quantity);
  const newQty = row.arrows_item_id === arrowItemId ? row.arrows_qty + quantity : quantity;
  db.prepare('UPDATE equipment SET arrows_item_id = ?, arrows_qty = ? WHERE guild_id = ? AND user_id = ? AND set_name = ?').run(
    arrowItemId, newQty, guildId, userId, setName
  );

  return { equipment: getEquipment(guildId, userId, setName) };
});

export const unequipArrows = db.transaction((guildId, userId, setName) => {
  guildId = GLOBAL_ID;
  const row = ensureEquipmentRow(guildId, userId, setName);
  if (row.arrows_item_id && row.arrows_qty > 0) {
    addItemToInventory(guildId, userId, row.arrows_item_id, row.arrows_qty);
  }
  db.prepare('UPDATE equipment SET arrows_item_id = NULL, arrows_qty = 0 WHERE guild_id = ? AND user_id = ? AND set_name = ?').run(guildId, userId, setName);
  return { equipment: getEquipment(guildId, userId, setName) };
});

export const consumeEquippedArrows = db.transaction((guildId, userId, setName, amount) => {
  guildId = GLOBAL_ID;
  const row = ensureEquipmentRow(guildId, userId, setName);
  if (!row.arrows_item_id || row.arrows_qty < amount) {
    throw new EconomyError(`Not enough arrows equipped — you have ${row.arrows_qty ?? 0} equipped, need ${amount}.`);
  }
  const newQty = row.arrows_qty - amount;
  db.prepare('UPDATE equipment SET arrows_qty = ? WHERE guild_id = ? AND user_id = ? AND set_name = ?').run(newQty, guildId, userId, setName);
  if (newQty === 0) {
    db.prepare('UPDATE equipment SET arrows_item_id = NULL WHERE guild_id = ? AND user_id = ? AND set_name = ?').run(guildId, userId, setName);
  }
});

export const unequipAll = db.transaction((guildId, userId, setName) => {
  guildId = GLOBAL_ID;
  const before = ensureEquipmentRow(guildId, userId, setName);
  const seen = new Set();
  const removed = [];
  for (const slot of SLOTS) {
    const instanceId = before[slot];
    if (!instanceId || seen.has(instanceId)) continue;
    seen.add(instanceId);
    const item = resolveInstance(instanceId);
    if (item) removed.push(item.name);
  }
  for (const slot of SLOTS) {
    if (before[slot]) equipInstance(guildId, userId, setName, slot, null, Infinity); 
  }
  return { removed, equipment: getEquipment(guildId, userId, setName) };
});

const stmtGetLoadout = db.prepare('SELECT * FROM loadouts WHERE guild_id = ? AND user_id = ? AND name = ?');
const stmtGetAllLoadouts = db.prepare('SELECT * FROM loadouts WHERE guild_id = ? AND user_id = ? ORDER BY created_at');
const stmtUpsertLoadout = db.prepare(`
  INSERT INTO loadouts (guild_id, user_id, name, helmet, chest, legs, boots, gloves, main_hand, off_hand)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, name) DO UPDATE SET
    helmet = excluded.helmet, chest = excluded.chest, legs = excluded.legs, boots = excluded.boots,
    gloves = excluded.gloves, main_hand = excluded.main_hand, off_hand = excluded.off_hand
`);
const stmtDeleteLoadout = db.prepare('DELETE FROM loadouts WHERE guild_id = ? AND user_id = ? AND name = ?');

export function getLoadouts(guildId, userId) {
  guildId = GLOBAL_ID;
  return stmtGetAllLoadouts.all(guildId, userId);
}

export function resolveLoadoutSlots(loadoutRow) {
  const resolved = {};
  for (const slot of SLOTS) {
    resolved[slot] = resolveInstance(loadoutRow[slot]);
  }
  return resolved;
}

export const saveLoadout = db.transaction((guildId, userId, name, setName) => {
  guildId = GLOBAL_ID;
  if (!name || name.length > 32) {
    throw new EconomyError('Loadout name must be 1-32 characters.');
  }
  if (!GEAR_SETS.includes(setName)) {
    throw new EconomyError(`\`${setName}\` isn't a valid gear set.`);
  }
  const existing = stmtGetLoadout.get(guildId, userId, name);
  if (!existing) {
    const count = stmtGetAllLoadouts.all(guildId, userId).length;
    if (count >= MAX_LOADOUTS) {
      throw new EconomyError(
        `You already have ${MAX_LOADOUTS} loadouts saved (the max). Delete one with \`/loadout delete\` first, or overwrite an existing one by reusing its name.`
      );
    }
  }
  const equipped = ensureEquipmentRow(guildId, userId, setName);
  stmtUpsertLoadout.run(
    guildId, userId, name,
    equipped.helmet, equipped.chest, equipped.legs, equipped.boots, equipped.gloves,
    equipped.main_hand, equipped.off_hand
  );
  return stmtGetLoadout.get(guildId, userId, name);
});

export const loadLoadout = db.transaction((guildId, userId, name, gladiatorLevel, setName) => {
  guildId = GLOBAL_ID;
  if (!GEAR_SETS.includes(setName)) {
    throw new EconomyError(`\`${setName}\` isn't a valid gear set.`);
  }
  const preset = stmtGetLoadout.get(guildId, userId, name);
  if (!preset) {
    throw new EconomyError(`No loadout named **${name}**. Check \`/loadout list\`.`);
  }

  for (const slot of SLOTS) {
    equipInstance(guildId, userId, setName, slot, null, Infinity); 
  }

  const applied = [];
  const skipped = [];

  for (const slot of SLOTS) {
    const instanceId = preset[slot];
    if (!instanceId) continue;

    
    
    
    if (slot === 'off_hand' && instanceId === preset.main_hand) {
      const mainItem = resolveInstance(preset.main_hand);
      if (mainItem?.twoHanded) continue;
    }

    const instanceRow = stmtGetInstance.get(instanceId);
    const stillOwned = instanceRow && instanceRow.user_id === userId && instanceRow.guild_id === guildId;
    if (!stillOwned) {
      const item = instanceRow ? getItem(instanceRow.item_id) : null;
      skipped.push(item?.name ?? 'an item you no longer own');
      continue;
    }

    try {
      equipInstance(guildId, userId, setName, slot, instanceId, gladiatorLevel);
      applied.push(getItem(instanceRow.item_id).name);
    } catch (err) {
      if (err instanceof EconomyError) {
        skipped.push(getItem(instanceRow.item_id)?.name ?? 'an item you no longer own');
        continue;
      }
      throw err;
    }
  }

  return { applied, skipped, equipment: getEquipment(guildId, userId, setName) };
});

export function deleteLoadout(guildId, userId, name) {
  guildId = GLOBAL_ID;
  const result = stmtDeleteLoadout.run(guildId, userId, name);
  if (result.changes === 0) {
    throw new EconomyError(`No loadout named **${name}**.`);
  }
}

export function transferInstance(guildId, fromUserId, toUserId, instanceId) {
  guildId = GLOBAL_ID;
  const row = stmtGetInstance.get(instanceId);
  if (!row || row.user_id !== fromUserId || row.guild_id !== guildId) {
    throw new EconomyError("That item isn't currently theirs to trade.");
  }
  const item = getItem(row.item_id);
  
  
  
  
  if (isOwnerOnlyItem(item) && !isOwnerId(toUserId)) {
    throw new EconomyError(`**${item?.name ?? 'That item'}** is an owner-exclusive item and can't be traded away.`);
  }
  const equippedIds = getEquippedInstanceIdSet(guildId, fromUserId);
  if (equippedIds.has(instanceId)) {
    throw new EconomyError(`**${item?.name ?? 'That item'}** is currently equipped — unequip it before trading it away.`);
  }
  stmtSetInstanceOwner.run(toUserId, instanceId);
}

const lockedInstanceIds = new Set();

export function lockInstance(instanceId) {
  lockedInstanceIds.add(instanceId);
}
export function unlockInstance(instanceId) {
  lockedInstanceIds.delete(instanceId);
}
export function isInstanceLocked(instanceId) {
  return lockedInstanceIds.has(instanceId);
}

export function deleteInstance(instanceId) {
  stmtDeleteInstance.run(instanceId);
}

export function getInstanceDurability(instanceId) {
  return stmtGetInstance.get(instanceId)?.durability ?? null;
}

export function findEquippedLocations(guildId, userId, instanceId) {
  guildId = GLOBAL_ID;
  const locations = [];
  for (const setName of GEAR_SETS) {
    const row = ensureEquipmentRow(guildId, userId, setName);
    for (const slot of SLOTS) {
      if (row[slot] === instanceId) locations.push({ setName, slot });
    }
  }
  return locations;
}

export { resolveInstance, getEquippedInstanceIdSet };
