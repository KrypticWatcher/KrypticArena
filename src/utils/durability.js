import db from '../database.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EconomyError, ensureUser, addCash, getArenaBalance, addArenaCoins } from './economy.js';
import { getAllEquipmentSets, resolveInstance, GEAR_SETS } from './inventory.js';
import { getDurabilityLossPerFight, getAdventureDurabilityLossPerTrip, getRepairCostPerPercent, getRepairCurrency, SLOTS } from '../data/items.js';
import { recordLoss } from './gainLog.js';
import { GLOBAL_ID } from './globalId.js';

const stmtSetInstanceDurability = db.prepare('UPDATE item_instances SET durability = ? WHERE instance_id = ?');

export function getUniqueEquippedItems(guildId, userId) {
  const allSets = getAllEquipmentSets(guildId, userId);
  const seen = new Set();
  const results = [];
  for (const setName of GEAR_SETS) {
    const equipped = allSets[setName];
    for (const slot of SLOTS) {
      const item = equipped[slot];
      if (!item || seen.has(item.instanceId)) continue;
      seen.add(item.instanceId);
      results.push(item);
    }
  }
  return results;
}

export function adminSetInstanceDurability(guildId, userId, instanceId, percent) {
  const equippedItem = getUniqueEquippedItems(guildId, userId).find((i) => i.instanceId === instanceId);
  if (!equippedItem) {
    throw new EconomyError("That item isn't currently equipped by this player.");
  }
  const clamped = Math.max(0, Math.min(100, percent));
  stmtSetInstanceDurability.run(clamped, instanceId);
  return { item: equippedItem, durability: { current: clamped, broken: clamped <= 0 } };
}

export function adminRepairInstance(guildId, userId, instanceId) {
  return adminSetInstanceDurability(guildId, userId, instanceId, 100);
}

export const damageEquippedGear = db.transaction((guildId, userId, instanceIds) => {
  const brokenNow = [];
  for (const instanceId of instanceIds) {
    const item = resolveInstance(instanceId);
    if (!item) continue;
    const loss = getDurabilityLossPerFight(item) ?? 0;
    const before = item.durability.current;
    const after = Math.max(0, before - loss);
    stmtSetInstanceDurability.run(after, item.instanceId);
    if (before > 0 && after === 0) brokenNow.push(item);
  }
  return brokenNow;
});

export const damageEquippedGearFromAdventure = db.transaction((guildId, userId, instanceIds, fraction = 1) => {
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const brokenNow = [];
  for (const instanceId of instanceIds) {
    const item = resolveInstance(instanceId);
    if (!item) continue;
    const loss = (getAdventureDurabilityLossPerTrip(item) ?? 0) * clampedFraction;
    const before = item.durability.current;
    const after = Math.max(0, before - loss);
    stmtSetInstanceDurability.run(after, item.instanceId);
    if (before > 0 && after === 0) brokenNow.push(item);
  }
  return brokenNow;
});

export const damageEquippedGearFromBossFight = db.transaction((guildId, userId, instanceIds) => {
  const BOSS_FIGHT_WEAR_MULTIPLIER = 1.1;
  const brokenNow = [];
  for (const instanceId of instanceIds) {
    const item = resolveInstance(instanceId);
    if (!item) continue;
    const loss = (getAdventureDurabilityLossPerTrip(item) ?? 0) * BOSS_FIGHT_WEAR_MULTIPLIER;
    const before = item.durability.current;
    const after = Math.max(0, before - loss);
    stmtSetInstanceDurability.run(after, item.instanceId);
    if (before > 0 && after === 0) brokenNow.push(item);
  }
  return brokenNow;
});

export function getRepairableEquipped(guildId, userId) {
  const results = [];
  for (const item of getUniqueEquippedItems(guildId, userId)) {
    if (item.durability.current >= 100) continue;
    const missing = 100 - item.durability.current;
    const cost = Math.ceil(missing * (getRepairCostPerPercent(item) ?? 0));
    results.push({ item, durability: item.durability, missing, cost });
  }
  return results;
}

export const REPAIR_EQUIPPED_PREFIX = 'repair-equipped';

const REPAIR_BUTTON_DURABILITY_THRESHOLD = 10;

export function buildRepairButtonIfNeeded(guildId, userId) {
  const hasCritical = getRepairableEquipped(guildId, userId).some((r) => r.durability.current <= REPAIR_BUTTON_DURABILITY_THRESHOLD);
  if (!hasCritical) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REPAIR_EQUIPPED_PREFIX}:${guildId}:${userId}`)
      .setLabel('🔧 Repair Equipped Gear')
      .setStyle(ButtonStyle.Secondary)
  );
}

export const repairInstance = db.transaction((guildId, userId, instanceId) => {
  const equippedItem = getUniqueEquippedItems(guildId, userId).find((i) => i.instanceId === instanceId);
  if (!equippedItem) {
    throw new EconomyError("That item isn't currently equipped — only equipped gear can be repaired.");
  }
  if (equippedItem.durability.current >= 100) {
    throw new EconomyError(`**${equippedItem.name}** is already at full durability.`);
  }

  const missing = 100 - equippedItem.durability.current;
  const cost = Math.ceil(missing * (getRepairCostPerPercent(equippedItem) ?? 0));
  const currency = getRepairCurrency(equippedItem);

  if (currency === 'arena') {
    const balance = getArenaBalance(guildId, userId);
    if (balance < cost) {
      throw new EconomyError(
        `Repairing **${equippedItem.name}** costs **${cost.toLocaleString('en-US')}** arena coins — you only have **${balance.toLocaleString('en-US')}**.`
      );
    }
    addArenaCoins(guildId, userId, -cost);
    if (cost > 0) recordLoss(GLOBAL_ID, userId, 'arena', cost, 'repair');
  } else {
    const user = ensureUser(guildId, userId);
    if (user.cash < cost) {
      throw new EconomyError(
        `Repairing **${equippedItem.name}** costs **${cost.toLocaleString('en-US')}** cash — you only have **${user.cash.toLocaleString('en-US')}**.`
      );
    }
    addCash(guildId, userId, -cost);
    if (cost > 0) recordLoss(GLOBAL_ID, userId, 'cash', cost, 'repair');
  }

  stmtSetInstanceDurability.run(100, instanceId);

  return { item: equippedItem, cost, currency, durability: { current: 100, broken: false } };
});

export const repairAll = db.transaction((guildId, userId) => {
  const repairable = getRepairableEquipped(guildId, userId);
  if (repairable.length === 0) {
    return { repaired: [], totalCost: 0, totalArenaCost: 0 };
  }

  const cashRepairs = repairable.filter((r) => getRepairCurrency(r.item) !== 'arena');
  const arenaRepairs = repairable.filter((r) => getRepairCurrency(r.item) === 'arena');
  const totalCost = cashRepairs.reduce((sum, r) => sum + r.cost, 0);
  const totalArenaCost = arenaRepairs.reduce((sum, r) => sum + r.cost, 0);

  const user = ensureUser(guildId, userId);
  if (user.cash < totalCost) {
    throw new EconomyError(
      `Repairing everything costs **${totalCost.toLocaleString('en-US')}** cash — you only have **${user.cash.toLocaleString('en-US')}**.`
    );
  }
  const arenaBalance = getArenaBalance(guildId, userId);
  if (arenaBalance < totalArenaCost) {
    throw new EconomyError(
      `Repairing everything costs **${totalArenaCost.toLocaleString('en-US')}** arena coins — you only have **${arenaBalance.toLocaleString('en-US')}**.`
    );
  }

  if (totalCost > 0) {
    addCash(guildId, userId, -totalCost);
    recordLoss(GLOBAL_ID, userId, 'cash', totalCost, 'repair');
  }
  if (totalArenaCost > 0) {
    addArenaCoins(guildId, userId, -totalArenaCost);
    recordLoss(GLOBAL_ID, userId, 'arena', totalArenaCost, 'repair');
  }
  for (const { item } of repairable) {
    stmtSetInstanceDurability.run(100, item.instanceId);
  }

  return { repaired: repairable.map((r) => r.item), totalCost, totalArenaCost };
});

