import db from '../database.js';
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { findBossAnywhere, getBossChallengeCost } from '../data/bossDomains.js';
import { ITEMS, getItem } from '../data/items.js';
import { addItemToInventory } from './inventory.js';
import { pickBossFlavor } from '../data/bossFlavor.js';
import { formatMoney, formatArena } from './format.js';
import { ensureGuild } from './economy.js';
import { renderLootPreviewImage } from './inventoryImage.js';
import { isAdmin } from './permissions.js';
import { recordCollectionLogObtainMany, getNewlyUnlockedItemIds } from './collectionLog.js';
import {
  grantEquippedPetXp,
  formatPetLevelUpLine,
  getShinyBossWinArenaBonus,
  getShinyBossLossRefund,
  getShinyDomainCurrencyBonus,
  rollShinyDomainEquipmentBonus,
} from './pets.js';
import { awardCombatSkillXp, formatCombatSkillXpLines } from './trainingStyle.js';

export const BOSS_REPEAT_PREFIX = 'boss-repeat';

export function bossRepeatCustomId(guildId, userId, bossId) {
  return `${BOSS_REPEAT_PREFIX}:${guildId}:${userId}:${bossId}`;
}

export function parseBossRepeatCustomId(customId) {
  const [prefix, guildId, userId, bossId] = customId.split(':');
  if (prefix !== BOSS_REPEAT_PREFIX) return null;
  return { guildId, userId, bossId };
}

export function bossRepeatTripRow(guildId, userId, bossId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(bossRepeatCustomId(guildId, userId, bossId)).setLabel('🔁 Repeat Challenge').setStyle(ButtonStyle.Primary)
  );
}

export function checkBossUnlocked(boss, userId) {
  if (!boss.unlockedFrom || isAdmin(userId)) return { allowed: true, reason: null };
  const prior = getBossProgress(userId, boss.unlockedFrom);
  if (prior.kills >= boss.killsToUnlock) return { allowed: true, reason: null };
  const priorBoss = findBossAnywhere(boss.unlockedFrom)?.boss;
  return {
    allowed: false,
    reason: `${boss.killsToUnlock - prior.kills} more kill(s) of ${priorBoss?.name ?? boss.unlockedFrom} (${prior.kills}/${boss.killsToUnlock})`,
  };
}

export function checkBossGearRequirement(allSets, boss) {
  const reasons = [];
  const killSetEquipped = allSets.adventure;

  if (boss.requiresCombatStyle === 'any') {
    
    const styles = ['melee', 'ranged', 'mage'];
    const hasAnyFullSet = styles.some((style) =>
      ['helmet', 'chest', 'legs', 'gloves', 'boots'].every((slot) => {
        const item = killSetEquipped[slot];
        return item && item.combatStyle === style && item.tier >= boss.anyStyleTierRequirement;
      })
    );
    if (!hasAnyFullSet) {
      reasons.push(`a full Tier ${boss.anyStyleTierRequirement}+ set (any one combat style) equipped in your Kill-set`);
    }
    return { allowed: reasons.length === 0, reasons };
  }

  if (boss.namedItemIds) {
    for (const requiredId of boss.namedItemIds) {
      const requiredItem = getItem(requiredId);
      if (!requiredItem) continue;
      const equipped = killSetEquipped[requiredItem.slot];
      const qualifies =
        equipped &&
        equipped.combatStyle === requiredItem.combatStyle &&
        (equipped.weaponSubtype ?? null) === (requiredItem.weaponSubtype ?? null) &&
        equipped.tier >= requiredItem.tier;
      if (!qualifies) reasons.push(`${requiredItem.name} (or higher-tier) equipped in your Kill-set`);
    }
  }

  if (boss.arrowId) {
    const bow = killSetEquipped.main_hand;
    if (!bow || bow.weaponSubtype !== 'bow') reasons.push('a bow equipped');
    
  }

  return { allowed: reasons.length === 0, reasons };
}

export function checkBossGate(allSets, boss, userId) {
  const unlock = checkBossUnlocked(boss, userId);
  const gear = checkBossGearRequirement(allSets, boss);
  const reasons = [...(unlock.allowed ? [] : [unlock.reason]), ...gear.reasons];
  return { allowed: reasons.length === 0, reasons };
}

export function buildBossChallengeStatusLine(gladiatorName, bossId) {
  const found = findBossAnywhere(bossId);
  if (!found) return `${gladiatorName} is currently on a Boss Challenge.`;
  return `${gladiatorName} is currently challenging ${found.boss.name} in ${found.domain.domainName}.`;
}

const stmtGet = db.prepare('SELECT kills, progress FROM boss_kills WHERE user_id = ? AND boss_id = ?');
const stmtUpsertProgress = db.prepare(
  `INSERT INTO boss_kills (user_id, boss_id, kills, progress) VALUES (?, ?, 0, ?)
   ON CONFLICT (user_id, boss_id) DO UPDATE SET progress = excluded.progress`
);
const stmtUpsertKill = db.prepare(
  `INSERT INTO boss_kills (user_id, boss_id, kills, progress) VALUES (?, ?, 1, 0)
   ON CONFLICT (user_id, boss_id) DO UPDATE SET kills = kills + 1, progress = 0`
);
const stmtResetOne = db.prepare('DELETE FROM boss_kills WHERE user_id = ? AND boss_id = ?');
const stmtResetAllForUser = db.prepare('DELETE FROM boss_kills WHERE user_id = ?');
const stmtGetAllForUser = db.prepare('SELECT boss_id, kills, progress FROM boss_kills WHERE user_id = ?');

export function getBossProgress(userId, bossId) {
  return stmtGet.get(userId, bossId) ?? { kills: 0, progress: 0 };
}

export function getAllBossProgressForUser(userId) {
  return stmtGetAllForUser.all(userId);
}

export function recordBossKill(userId, bossId) {
  stmtUpsertKill.run(userId, bossId);
}

export function resetBossProgress(userId, bossId) {
  stmtResetOne.run(userId, bossId);
}

export function resetAllBossProgressForUser(userId) {
  stmtResetAllForUser.run(userId);
}

const BOSS_DEATH_CHANCE_BASE = 85;
const BOSS_DEATH_CHANCE_KC_CAP = 300;

function computeBossDeathChancePercent(boss, kills) {
  const frac = Math.min(kills / BOSS_DEATH_CHANCE_KC_CAP, 1);
  const reduced = BOSS_DEATH_CHANCE_BASE * (1 - frac);
  return Math.max(reduced, boss.deathChanceFloor);
}

function rollBossDeath(boss, kills) {
  return Math.random() * 100 < computeBossDeathChancePercent(boss, kills);
}

const BOSS_TRIP_BASE_MINUTES = 90;
const BOSS_TRIP_KC_MAX_PERCENT = 20;
const BOSS_TRIP_GEAR_MAX_PERCENT = 8;
const BOSS_TRIP_POTION_MAX_PERCENT = 6;

export function computeBossTripMinutes(kills, isOvergeared, hasTopTierPotion) {
  const kcFrac = Math.min(kills / BOSS_DEATH_CHANCE_KC_CAP, 1);
  const kcReduction = BOSS_TRIP_KC_MAX_PERCENT * kcFrac;
  const gearReduction = isOvergeared ? BOSS_TRIP_GEAR_MAX_PERCENT : 0;
  const potionReduction = hasTopTierPotion ? BOSS_TRIP_POTION_MAX_PERCENT : 0;
  const totalReduction = (kcReduction + gearReduction + potionReduction) / 100;
  return Math.round(BOSS_TRIP_BASE_MINUTES * (1 - totalReduction));
}

const BASE_DURATION_MINUTES = BOSS_TRIP_BASE_MINUTES;

export function getBossKillExperienceDurationMinutes(kills) {
  return computeBossTripMinutes(kills, false, false);
}

export function getBossKcBoostPercent(kills) {
  const minutes = getBossKillExperienceDurationMinutes(kills);
  return Math.round(((BASE_DURATION_MINUTES - minutes) / BASE_DURATION_MINUTES) * 100);
}

const BOSS_COIN_RANGE_BY_ID = {
  varkyros: [57680, 107080],
  cerberus: [41080, 76280],
  acheron: [77360, 143680],
  thanatos: [100240, 186160],
  hades: [126400, 234720],
};

function rollBossCoins(bossId) {
  const [lo, hi] = BOSS_COIN_RANGE_BY_ID[bossId];
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const BOSS_EQUIP_GATE_MULTIPLIER = 4;
const BOSS_GOD_TIER_CHANCE = 0.02;

const REGULAR_EQUIP_GATE_PERCENT_BY_TIER = { 1: 4.5, 5: 4.0, 10: 3.5, 20: 3.2, 35: 3.0, 45: 2.7, 55: 2.4, 65: 1.8, 75: 1.2, 85: 0.5, 92: 0.25 };

function getStyleDropPool(combatStyle, tier) {
  return ITEMS.filter((i) => i.type === 'equipment' && i.combatStyle === combatStyle && i.tier === tier && i.source === `${combatStyle}_drop`);
}

function getGodTierPool(boss) {
  return ITEMS.filter((i) => i.source === boss.godTierIdPrefix);
}

function getResourcePoolForTier(tier) {
  return ITEMS.filter((i) => i.type === 'resource' && i.tier === tier && i.category !== 'seed');
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function rollBossLoot(boss) {
  const resourcePool = getResourcePoolForTier(boss.tier);
  const resourceIds = [];
  for (let i = 0; i < 4 && resourcePool.length > 0; i++) {
    resourceIds.push(pickRandom(resourcePool).id);
  }

  const equipmentIds = [];
  const dropStyle = boss.dropsCombatStyle === 'all' ? pickRandom(['melee', 'ranged', 'mage']) : boss.dropsCombatStyle;
  const equipPool = getStyleDropPool(dropStyle, boss.tier);
  const gatePercent = (REGULAR_EQUIP_GATE_PERCENT_BY_TIER[boss.tier] ?? 1) * BOSS_EQUIP_GATE_MULTIPLIER;
  for (let i = 0; i < 2; i++) {
    if (equipPool.length > 0 && Math.random() * 100 < gatePercent) {
      equipmentIds.push(pickRandom(equipPool).id);
    }
  }

  const godTierIds = [];
  if (Math.random() < BOSS_GOD_TIER_CHANCE) {
    const godPool = getGodTierPool(boss);
    if (godPool.length > 0) godTierIds.push(pickRandom(godPool).id);
  }

  return { resourceIds, equipmentIds, godTierIds };
}

const BOSS_ORDER_PET_XP_TIER = ['rare', 'rare', 'epic', 'legendary', 'mythical'];

export async function resolveDueBossFight(row, deps) {
  const { guildId, userId, name, channelId, bossId } = {
    guildId: row.guild_id,
    userId: row.user_id,
    name: row.name,
    channelId: row.adventure_channel_id,
    bossId: row.active_boss_id,
  };
  const { endGladiatorAdventure, addGladiatorXp, formatGladiatorDisplayName, addCash, addArenaCoins, applyGladiatorXpBonus } = deps;

  const found = findBossAnywhere(bossId);
  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  if (!found) {
    endGladiatorAdventure(guildId, userId);
    return { guildId, userId, channelId, content: `<@${userId}> **${displayName}**'s Boss Challenge ended unexpectedly.`, components: [], files: [] };
  }
  const { boss } = found;

  const progress = getBossProgress(userId, bossId);
  const died = rollBossDeath(boss, progress.kills);
  let content;
  let grantedItems = [];
  let newUnlockIds = new Set();

  if (died) {
    const bossCost = getBossChallengeCost(boss.order);
    const shinyRefund = getShinyBossLossRefund(guildId, userId, bossCost);
    if (shinyRefund.gambling > 0) addCash(guildId, userId, shinyRefund.gambling, 'boss_challenge');
    if (shinyRefund.arena > 0) addArenaCoins(guildId, userId, shinyRefund.arena, 'boss_challenge');
    const settingsForRefund = shinyRefund.gambling > 0 || shinyRefund.arena > 0 ? ensureGuild(guildId) : null;
    const refundLine =
      shinyRefund.gambling > 0 || shinyRefund.arena > 0
        ? `\n\n✨ **Ferryman's Due** triggered — refunded ${[
            shinyRefund.gambling > 0 ? formatMoney(shinyRefund.gambling, settingsForRefund) : null,
            shinyRefund.arena > 0 ? formatArena(shinyRefund.arena) : null,
          ]
            .filter(Boolean)
            .join(', ')}.`
        : '';
    const flavor =
      pickBossFlavor(bossId, 'defeat', displayName) ??
      `**${displayName}** falls before **${boss.name}** — the challenge is lost.`;
    content = `<@${userId}> ${flavor}${refundLine}`;
  } else {
    recordBossKill(userId, bossId);
    const arenaReward = rollBossCoins(bossId);
    const shinyWinBonus = getShinyBossWinArenaBonus(guildId, userId, arenaReward);
    const shinyDomainBonus = getShinyDomainCurrencyBonus(guildId, userId, { gambling: 0, arena: arenaReward });
    if (shinyDomainBonus.bonusGambling > 0) addCash(guildId, userId, shinyDomainBonus.bonusGambling, 'boss_challenge');
    addArenaCoins(guildId, userId, arenaReward + shinyWinBonus + shinyDomainBonus.bonusArena, 'boss_challenge');

    const baseXp = Math.floor(1000 * boss.order);
    const boostedXp = applyGladiatorXpBonus(guildId, userId, baseXp, 'boss_challenge');
    const gladiatorXpResult = addGladiatorXp(guildId, userId, boostedXp, name);
    const petXpResult = grantEquippedPetXp(guildId, userId, BOSS_ORDER_PET_XP_TIER[boss.order - 1], gladiatorXpResult.after.level, true);
    
    
    const combatSkillResults = awardCombatSkillXp(guildId, userId, boostedXp);

    const settings = ensureGuild(guildId);

    const rewardLine =
      `💰 **Earned:** ${formatArena(arenaReward)}` +
      `\n\n✨ **+${boostedXp.toLocaleString('en-US')} Gladiator XP**` +
      formatCombatSkillXpLines(combatSkillResults).map((line) => `\n${line}`).join('') +
      (petXpResult ? `\n${formatPetLevelUpLine(petXpResult)}` : '') +
      (shinyWinBonus > 0 ? `\n✨ **First Blood** triggered — +${formatArena(shinyWinBonus)}!` : '') +
      (shinyDomainBonus.bonusGambling > 0 || shinyDomainBonus.bonusArena > 0
        ? `\n✨ **${shinyDomainBonus.abilityName}** triggered — ${[
            shinyDomainBonus.bonusGambling > 0 ? `+${formatMoney(shinyDomainBonus.bonusGambling, settings)}` : null,
            shinyDomainBonus.bonusArena > 0 ? `+${formatArena(shinyDomainBonus.bonusArena)}` : null,
          ]
            .filter(Boolean)
            .join(', ')}!`
        : '');

    const { resourceIds, equipmentIds, godTierIds } = rollBossLoot(boss);
    let bonusEquipmentIds = [];
    if (rollShinyDomainEquipmentBonus(guildId, userId, bossId)) {
      bonusEquipmentIds = rollBossLoot(boss).equipmentIds;
    }
    const droppedIds = [...resourceIds, ...equipmentIds, ...bonusEquipmentIds, ...godTierIds];
    for (const itemId of droppedIds) addItemToInventory(guildId, userId, itemId, 1, 'boss_challenge');
    newUnlockIds = getNewlyUnlockedItemIds(userId, droppedIds);
    recordCollectionLogObtainMany(userId, droppedIds);
    grantedItems = droppedIds.map((id) => getItem(id)).filter(Boolean);
    const lootLine = droppedIds.length > 0 ? `\n🎁 **Dropped:** ${droppedIds.map((id) => getItem(id)?.name ?? id).join(', ')}!` : '';
    const godTierLine = godTierIds.length > 0 ? `\n💎 **God-tier drop!**` : '';

    const flavor =
      pickBossFlavor(bossId, 'win', displayName) ??
      (boss.isFinalBoss ? `**${displayName}** has subdued **${boss.name}**.` : `**${displayName}** has defeated **${boss.name}**.`);
    content = `<@${userId}> ${flavor}\n${rewardLine}${lootLine}${godTierLine}\n*Total kills: ${progress.kills + 1}*`;
  }

  endGladiatorAdventure(guildId, userId);
  const lootPreviewBuf = await renderLootPreviewImage(guildId, userId, name, grantedItems, newUnlockIds);
  const files = lootPreviewBuf ? [new AttachmentBuilder(lootPreviewBuf, { name: 'loot.png' })] : [];
  return {
    guildId,
    userId,
    channelId,
    content,
    components: [bossRepeatTripRow(guildId, userId, bossId)],
    files,
  };
}

