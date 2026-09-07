import db from '../database.js';
import { EconomyError, ensureUser, ensureGuild, addCash, getBalance, getArenaBalance } from './economy.js';
import { addArenaCoins } from './arena.js';
import { addItemToInventory, getInventory, getOwnedQuantity } from './inventory.js';
import { getItem, isCollectable, getStarterKitItems, getStoreCollectibles } from '../data/items.js';
import { GLOBAL_ID } from './globalId.js';
import { isHeistItemUnlocked, computeHeistItemPrice, HEIST_ITEM_SCALING_PCT, VAULT_FEE_INTERVAL_MS, SECURITY_CAMERA_FEE_INTERVAL_MS, isVaultFeeCurrent } from './heists.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const stmtSetStarterGranted = db.prepare('UPDATE users SET starter_granted = 1 WHERE guild_id = ? AND user_id = ?');

const STARTER_ARENA_COINS = 5000;
const STARTER_ELIXIR_COUNT = 20;

export const grantStarterKit = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  const user = ensureUser(guildId, userId);
  if (user.starter_granted) {
    throw new EconomyError("You've already claimed your starter kit.");
  }
  const items = getStarterKitItems();
  for (const item of items) {
    addItemToInventory(guildId, userId, item.id, 1);
  }
  if (STARTER_ARENA_COINS > 0) addArenaCoins(guildId, userId, STARTER_ARENA_COINS);
  if (STARTER_ELIXIR_COUNT > 0) addItemToInventory(guildId, userId, 'elixir', STARTER_ELIXIR_COUNT);
  stmtSetStarterGranted.run(guildId, userId);
  return { items, arenaCoins: STARTER_ARENA_COINS, elixirCount: STARTER_ELIXIR_COUNT };
});

const stmtGetClaim = db.prepare('SELECT * FROM collectible_claims WHERE guild_id = ? AND user_id = ? AND item_id = ?');

const stmtUpsertGamblingClaim = db.prepare(`
  INSERT INTO collectible_claims (guild_id, user_id, item_id, last_claimed_gambling_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET last_claimed_gambling_at = excluded.last_claimed_gambling_at
`);
const stmtUpsertArenaClaim = db.prepare(`
  INSERT INTO collectible_claims (guild_id, user_id, item_id, last_claimed_arena_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET last_claimed_arena_at = excluded.last_claimed_arena_at
`);

export function getClaimStatus(guildId, userId) {
  guildId = GLOBAL_ID;
  const settings = ensureGuild(guildId);
  const arenaCooldownMs = settings.claim_cooldown_arena_seconds * 1000;
  const gamblingCooldownMs = settings.claim_cooldown_gambling_seconds * 1000;
  const owned = getInventory(guildId, userId, 'collectable').filter(({ item }) => item.claim);
  const now = Date.now();

  return owned.map(({ item }) => {
    const claimRow = stmtGetClaim.get(guildId, userId, item.id);
    const lastGamblingAt = claimRow?.last_claimed_gambling_at ?? 0;
    const lastArenaAt = claimRow?.last_claimed_arena_at ?? 0;
    const nextGamblingClaimAt = lastGamblingAt + gamblingCooldownMs;
    const nextArenaClaimAt = lastArenaAt + arenaCooldownMs;
    return {
      item,
      gamblingReady: item.claim.gambling ? now >= nextGamblingClaimAt : false,
      arenaReady: item.claim.arena ? now >= nextArenaClaimAt : false,
      nextGamblingClaimAt,
      nextArenaClaimAt,
      gamblingRange: item.claim.gambling ? [item.claim.gambling.min, item.claim.gambling.max] : null,
      arenaRange: item.claim.arena ? [item.claim.arena.min, item.claim.arena.max] : null,
    };
  });
}

export const claimAll = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  const statuses = getClaimStatus(guildId, userId);
  const now = Date.now();

  const claimed = [];
  const stillOnCooldown = [];
  let gamblingTotal = 0;
  let arenaTotal = 0;

  for (const status of statuses) {
    const { item, gamblingReady, arenaReady } = status;
    if (!gamblingReady && !arenaReady) {
      stillOnCooldown.push(status);
      continue;
    }

    let gambling = 0;
    let arena = 0;
    if (gamblingReady) {
      gambling = randInt(item.claim.gambling.min, item.claim.gambling.max);
      addCash(guildId, userId, gambling, 'claim');
      stmtUpsertGamblingClaim.run(guildId, userId, item.id, now);
      gamblingTotal += gambling;
    }
    if (arenaReady) {
      arena = randInt(item.claim.arena.min, item.claim.arena.max);
      addArenaCoins(guildId, userId, arena, 'claim');
      stmtUpsertArenaClaim.run(guildId, userId, item.id, now);
      arenaTotal += arena;
    }

    claimed.push({ item, gambling, arena });
    
    
    
    if (!gamblingReady || !arenaReady) stillOnCooldown.push(status);
  }

  return { claimed, stillOnCooldown, gamblingTotal, arenaTotal };
});

export function getStoreListing() {
  return getStoreCollectibles();
}

export const buyCollectible = db.transaction((guildId, userId, itemId, quantity = 1) => {
  guildId = GLOBAL_ID;
  const item = getItem(itemId);
  if (!item || !isCollectable(item) || item.price == null) {
    throw new EconomyError("That's not something the store sells — check `/store view`.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new EconomyError('Quantity must be a positive whole number.');
  }
  if (item.claim || item.capOwnedAt1) {
    if (quantity > 1) {
      throw new EconomyError(`**${item.name}** is capped at 1 per player — you can only buy 1.`);
    }
    if (getOwnedQuantity(guildId, userId, itemId) >= 1) {
      throw new EconomyError(`You already own **${item.name}** — it's capped at 1 per player.`);
    }
  }

  const user = ensureUser(guildId, userId);

  
  
  
  
  if (itemId === 'heist_security_camera') {
    const ownsVault = getOwnedQuantity(guildId, userId, 'heist_vault') >= 1;
    const vaultRow = ownsVault ? db.prepare('SELECT vault_paid_until FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId) : null;
    const vaultActive = ownsVault && isVaultFeeCurrent(vaultRow?.vault_paid_until ?? 0);
    if (!vaultActive) {
      throw new EconomyError("A Security Camera requires an active Vault (fee currently paid up) — check `/vault fee`.");
    }
  }

  
  
  
  
  
  
  
  const isHeistItem = Object.prototype.hasOwnProperty.call(HEIST_ITEM_SCALING_PCT, itemId);
  let unitPrice = item.price;
  if (isHeistItem) {
    const playerTotal = user.cash + user.bank;
    if (!isHeistItemUnlocked(item, playerTotal)) {
      throw new EconomyError(
        `**${item.name}** requires at least **${item.price.toLocaleString('en-US')}** combined cash+bank before it's available to buy — you have **${playerTotal.toLocaleString('en-US')}**.`
      );
    }
    unitPrice = computeHeistItemPrice(item, playerTotal);
  }

  const cost = unitPrice * quantity;
  const arenaCost = (item.priceArena ?? 0) * quantity;
  if (user.cash < cost) {
    throw new EconomyError(
      `**${item.name}** x${quantity} costs **${cost.toLocaleString('en-US')}** cash — you only have **${user.cash.toLocaleString('en-US')}**.`
    );
  }
  const arenaBalance = getArenaBalance(guildId, userId);
  if (arenaCost > 0 && arenaBalance < arenaCost) {
    throw new EconomyError(
      `**${item.name}** x${quantity} also costs **${arenaCost.toLocaleString('en-US')}** arena coins — you only have **${arenaBalance.toLocaleString('en-US')}**.`
    );
  }

  addCash(guildId, userId, -cost);
  if (arenaCost > 0) addArenaCoins(guildId, userId, -arenaCost);
  addItemToInventory(guildId, userId, itemId, quantity);

  
  
  
  
  if (itemId === 'heist_vault') {
    db.prepare('UPDATE users SET vault_paid_until = ? WHERE guild_id = ? AND user_id = ?').run(Date.now() + VAULT_FEE_INTERVAL_MS, guildId, userId);
  }
  
  if (itemId === 'heist_security_camera') {
    db.prepare('UPDATE users SET security_camera_paid_until = ? WHERE guild_id = ? AND user_id = ?').run(
      Date.now() + SECURITY_CAMERA_FEE_INTERVAL_MS,
      guildId,
      userId
    );
  }

  return {
    item,
    quantity,
    cost,
    arenaCost,
    balance: getBalance(guildId, userId),
    owned: getOwnedQuantity(guildId, userId, itemId),
  };
});
