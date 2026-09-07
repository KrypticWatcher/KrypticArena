import db from '../database.js';
import { EconomyError } from './economy.js';
import { isOwnerId } from './owner.js';
import { getBadgeTag } from './tierBadgeAssets.js';

export const BITFIELD_FLAGS = {
  ADMIN: 1 << 0,
  T1: 1 << 1,
  T2: 1 << 2,
  T3: 1 << 3,
  T4: 1 << 4,
  T5: 1 << 5,
  T6: 1 << 6,
  T7: 1 << 7,
  MOD: 1 << 8,
};

export function getHighestTier(userId) {
  const flags = getBitfield(userId);
  let highest = 0;
  for (let i = 1; i <= 7; i++) {
    if ((flags & (BITFIELD_FLAGS[`T${i}`] ?? 0)) !== 0) highest = i;
  }
  return highest;
}

const TIER_BADGE_EMOJI_FALLBACK = { 5: '🦁', 6: '🐦‍🔥', 7: '💀' };

export function getTierBadge(userId) {
  const highest = getHighestTier(userId);
  if (!TIER_BADGE_EMOJI_FALLBACK[highest]) return null;
  const emoji = getBadgeTag(`T${highest}`) ?? TIER_BADGE_EMOJI_FALLBACK[highest];
  return { tier: highest, emoji };
}

export const ADVENTURE_TIER_BONUS_MINUTES = {
  T1: 5,
  T2: 10,
  T3: 15,
};

export function getAdventureTierBonusMinutes(userId) {
  const highestTier = getHighestTier(userId);
  let best = 0;
  for (let i = 1; i <= highestTier; i++) {
    const minutes = ADVENTURE_TIER_BONUS_MINUTES[`T${i}`];
    if (minutes !== undefined && minutes > best) {
      best = minutes;
    }
  }
  return best;
}

export const GLADIATOR_XP_BONUS_TIER_PERCENT = {
  T4: 10,
};

export function getTierGladiatorXpBonusPercent(userId) {
  const highestTier = getHighestTier(userId);
  let best = 0;
  for (let i = 1; i <= highestTier; i++) {
    const percent = GLADIATOR_XP_BONUS_TIER_PERCENT[`T${i}`];
    if (percent !== undefined && percent > best) {
      best = percent;
    }
  }
  return best;
}

export const BITFIELD_FLAG_CHOICES = Object.keys(BITFIELD_FLAGS).map((name) => ({
  name: name.replace(/_/g, ' '),
  value: name,
}));

const stmtGet = db.prepare('SELECT flags FROM user_bitfields WHERE user_id = ?');
const stmtUpsert = db.prepare(`
  INSERT INTO user_bitfields (user_id, flags) VALUES (?, ?)
  ON CONFLICT (user_id) DO UPDATE SET flags = excluded.flags
`);

export function getBitfield(userId) {
  return stmtGet.get(userId)?.flags ?? 0;
}

export function hasFlag(userId, flagName) {
  const bit = BITFIELD_FLAGS[flagName];
  if (bit === undefined) return false;
  return (getBitfield(userId) & bit) !== 0;
}

export function listFlags(userId) {
  const flags = getBitfield(userId);
  return Object.keys(BITFIELD_FLAGS).filter((name) => (flags & BITFIELD_FLAGS[name]) !== 0);
}

const stmtAllWithFlags = db.prepare('SELECT user_id, flags FROM user_bitfields');
export function getUsersWithFlag(flagName) {
  const bit = BITFIELD_FLAGS[flagName];
  if (bit === undefined) return [];
  return stmtAllWithFlags.all().filter((row) => (row.flags & bit) !== 0).map((row) => row.user_id);
}

export const grantFlag = db.transaction((userId, flagName) => {
  const bit = BITFIELD_FLAGS[flagName];
  if (bit === undefined) {
    throw new EconomyError(`\`${flagName}\` isn't a recognized bitfield flag.`);
  }
  const next = getBitfield(userId) | bit;
  stmtUpsert.run(userId, next);
  return next;
});

export const revokeFlag = db.transaction((userId, flagName) => {
  const bit = BITFIELD_FLAGS[flagName];
  if (bit === undefined) {
    throw new EconomyError(`\`${flagName}\` isn't a recognized bitfield flag.`);
  }
  const next = getBitfield(userId) & ~bit;
  stmtUpsert.run(userId, next);
  return next;
});

export function isAdmin(userId) {
  return isOwnerId(userId) || hasFlag(userId, 'ADMIN');
}

export async function requireAdmin(interaction) {
  if (isAdmin(interaction.user.id)) return true;
  await interaction.reply({
    content: "You need the ADMIN bitfield flag to use this command — ask the bot owner to grant it via `/owner` → Bitfield.",
    ephemeral: true,
  });
  return false;
}

export function isMod(userId) {
  return isAdmin(userId) || hasFlag(userId, 'MOD');
}

export async function requireMod(interaction) {
  if (isMod(interaction.user.id)) return true;
  await interaction.reply({
    content: "You need the MOD bitfield flag to use this command — ask the bot owner to grant it via `/owner` → Bitfield.",
    ephemeral: true,
  });
  return false;
}
