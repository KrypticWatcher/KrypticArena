import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import { LEVEL_REQUIREMENT_BY_RARITY } from '../data/items.js';
import { EconomyError } from './economy.js';
import { LOCATION_TIER } from './adventureFlavor.js';
import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';

const ADVENTURE_ELIXIR_COST_BY_TIER = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythical: 7 };

const BOSS_ELIXIR_COST_BY_ORDER = [4, 5, 6, 8, 12];

const DISCOUNT_WINDOW_BY_RARITY = { common: 9, uncommon: 15, rare: 20, epic: 20, legendary: 20, mythical: 9 };
const MAX_LEVEL_DISCOUNT_PERCENT = 40;

function applyLevelDiscount(baseCost, level, rarity) {
  const unlockLevel = LEVEL_REQUIREMENT_BY_RARITY[rarity];
  const window = DISCOUNT_WINDOW_BY_RARITY[rarity];
  const levelsIntoWindow = Math.max(0, Math.min(level - unlockLevel, window));
  const discountPercent = (levelsIntoWindow / window) * MAX_LEVEL_DISCOUNT_PERCENT;
  const discounted = baseCost * (1 - discountPercent / 100);
  return Math.max(1, Math.round(discounted));
}

export function getAdventureElixirCost(locationName, level) {
  const tier = LOCATION_TIER[locationName] ?? 'common';
  return applyLevelDiscount(ADVENTURE_ELIXIR_COST_BY_TIER[tier], level, tier);
}

export function getBossElixirCost(boss, level) {
  const rarity = boss.gearRequirement.adventure ?? 'mythical';
  return applyLevelDiscount(BOSS_ELIXIR_COST_BY_ORDER[boss.order - 1], level, rarity);
}

export function requireAndConsumeElixirs(guildId, userId, amount, leadIn) {
  const owned = getOwnedQuantity(guildId, userId, 'elixir');
  if (owned < amount) {
    throw new EconomyError(`${leadIn} **${amount}x Elixir** — you currently have **${owned}**.`);
  }
  addItemToInventory(guildId, userId, 'elixir', -amount);
}

const ELIXIR_PURCHASE_WINDOW_MS = 3 * 60 * 60 * 1000;
export const ELIXIR_PURCHASE_MAX_PER_WINDOW = 40;

const stmtGetLimit = db.prepare('SELECT * FROM elixir_purchase_limit WHERE guild_id = ? AND user_id = ?');
const stmtUpsertLimit = db.prepare(`
  INSERT INTO elixir_purchase_limit (guild_id, user_id, window_started_at, purchased_in_window) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET window_started_at = excluded.window_started_at, purchased_in_window = excluded.purchased_in_window
`);

export function getElixirPurchaseAllowance(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetLimit.get(guildId, userId);
  const now = Date.now();
  if (!row || now - row.window_started_at >= ELIXIR_PURCHASE_WINDOW_MS) {
    return { remaining: ELIXIR_PURCHASE_MAX_PER_WINDOW, windowResetsAt: now + ELIXIR_PURCHASE_WINDOW_MS };
  }
  return {
    remaining: Math.max(0, ELIXIR_PURCHASE_MAX_PER_WINDOW - row.purchased_in_window),
    windowResetsAt: row.window_started_at + ELIXIR_PURCHASE_WINDOW_MS,
  };
}

export const consumeElixirPurchaseAllowance = db.transaction((guildId, userId, quantity) => {
  guildId = GLOBAL_ID;
  const row = stmtGetLimit.get(guildId, userId);
  const now = Date.now();
  const windowExpired = !row || now - row.window_started_at >= ELIXIR_PURCHASE_WINDOW_MS;
  const windowStart = windowExpired ? now : row.window_started_at;
  const purchasedSoFar = windowExpired ? 0 : row.purchased_in_window;

  if (purchasedSoFar + quantity > ELIXIR_PURCHASE_MAX_PER_WINDOW) {
    const remaining = ELIXIR_PURCHASE_MAX_PER_WINDOW - purchasedSoFar;
    const resetsAt = windowStart + ELIXIR_PURCHASE_WINDOW_MS;
    throw new EconomyError(
      `You can only buy **${remaining}** more Elixir this window (max ${ELIXIR_PURCHASE_MAX_PER_WINDOW} per 3 hours) — resets <t:${Math.floor(resetsAt / 1000)}:R>.`
    );
  }

  stmtUpsertLimit.run(guildId, userId, windowStart, purchasedSoFar + quantity);
  return ELIXIR_PURCHASE_MAX_PER_WINDOW - (purchasedSoFar + quantity);
});
