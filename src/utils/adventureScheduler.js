import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { AttachmentBuilder } from 'discord.js';
import { renderLootPreviewImage } from './inventoryImage.js';
import { EconomyError, ensureGuild } from './economy.js';
import {
  ensureGladiator,
  isGladiatorAdventuring,
  hasUnclaimedAdventure,
  startGladiatorAdventure,
  endGladiatorAdventure,
  getAllDueAdventures,
  getGladiatorRow,
  getGladiatorProfile,
  formatGladiatorDisplayName,
  hasInstantTrips,
  addGladiatorXp,
  applyGladiatorXpBonus,
  getGladiatorQp,
  addGladiatorQp,
  rollQuestPointsReward,
} from './gladiator.js';
import { buildBossChallengeStatusLine, resolveDueBossFight } from './bossChallenges.js';
import { resolveDueSlay } from './slay.js';
import { resolveDueGathering } from './gathering.js';
import { resolveDueCooking } from './cooking.js';
import { resolveDueHerbalism } from './herbalism.js';
import { resolveDueHunting } from './hunting.js';
import { resolveDueSmelt, resolveDueSmith } from './smithing.js';
import { resolveDueFletching } from './fletching.js';
import { resolveDueCrafting } from './crafting.js';
import { resolveDueMagicCrafting } from './magicCrafting.js';
import { resolveDueTanning } from './tanning.js';
import { resolveDueFarmingPlant, resolveDueFarmingHarvest, resolveDueFarmingReplant, cancelFarmingTrip } from './farming.js';
import { addCash } from './economy.js';
import { addArenaCoins } from './arena.js';
import { formatMoney, formatArena } from './format.js';
import { buildQuestSendOffText, buildQuestReturnText } from './questFlavor.js';
import { PET_ADVENTURE_FLAVOR, getPetFlavorLine } from '../data/petFlavor.js';
import {
  grantEquippedPetXp,
  formatPetLevelUpLine,
  getActivePet,
  rollQuestPetFind,
} from './pets.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const ADVENTURE_DURATION_VARIATION_MINUTES = 3;

const INSTANT_RESOLVE_DELAY_MS = 2000;

function rollAdventureDurationMinutes(baseMinutes) {
  const variation = Math.floor(Math.random() * (2 * ADVENTURE_DURATION_VARIATION_MINUTES + 1)) - ADVENTURE_DURATION_VARIATION_MINUTES;
  return Math.max(0, baseMinutes + variation);
}

const REPEAT_BUTTON_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const REPEAT_TRIP_PREFIX = 'adventure-repeat';

export function repeatTripCustomId(guildId, userId) {
  return `${REPEAT_TRIP_PREFIX}:${guildId}:${userId}`;
}

export function parseRepeatTripCustomId(customId) {
  const [prefix, guildId, userId] = customId.split(':');
  if (prefix !== REPEAT_TRIP_PREFIX) return null;
  return { guildId, userId };
}

function repeatTripRow(guildId, userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(repeatTripCustomId(guildId, userId))
      .setLabel('🔁 Repeat Trip')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

const stmtRecordLastSettings = db.prepare(`
  INSERT INTO adventure_last_settings (guild_id, user_id, location_line, location_tier, dart_used, sent_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET
    location_line = excluded.location_line, location_tier = excluded.location_tier,
    dart_used = excluded.dart_used, sent_at = excluded.sent_at
`);
const stmtGetLastSettings = db.prepare('SELECT * FROM adventure_last_settings WHERE guild_id = ? AND user_id = ?');

export function recordLastAdventureSettings(guildId, userId, locationChoice, dartUsed) {
  guildId = GLOBAL_ID;
  stmtRecordLastSettings.run(guildId, userId, locationChoice?.line ?? null, locationChoice?.tier ?? null, dartUsed ? 1 : 0, Date.now());
}

export function getLastAdventureSettings(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetLastSettings.get(guildId, userId);
  if (!row) return null;
  const locationChoice = row.location_line && row.location_tier ? { line: row.location_line, tier: row.location_tier } : null;
  return { locationChoice, dartUsed: Boolean(row.dart_used), sentAt: row.sent_at };
}

const stmtGetButtonRow = db.prepare('SELECT * FROM adventure_repeat_buttons WHERE guild_id = ? AND user_id = ?');
const stmtUpsertButtonRow = db.prepare(`
  INSERT INTO adventure_repeat_buttons (guild_id, user_id, channel_id, message_id, dart_used) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id, dart_used = excluded.dart_used, created_at = strftime('%s','now')
`);
const stmtDeleteButtonRow = db.prepare('DELETE FROM adventure_repeat_buttons WHERE guild_id = ? AND user_id = ?');
const stmtStaleButtonRows = db.prepare('SELECT * FROM adventure_repeat_buttons WHERE created_at <= ?');

const PENDING_DELIVERY_MAX_ATTEMPTS = 60;
const stmtInsertPendingDelivery = db.prepare(
  'INSERT INTO pending_trip_deliveries (guild_id, user_id, channel_id, content) VALUES (?, ?, ?, ?)'
);
const stmtGetPendingDeliveries = db.prepare('SELECT * FROM pending_trip_deliveries ORDER BY id ASC');
const stmtDeletePendingDelivery = db.prepare('DELETE FROM pending_trip_deliveries WHERE id = ?');
const stmtBumpPendingDeliveryAttempts = db.prepare('UPDATE pending_trip_deliveries SET attempts = attempts + 1 WHERE id = ?');

function queuePendingDelivery(guildId, userId, channelId, content) {
  try {
    stmtInsertPendingDelivery.run(guildId, userId, channelId, content);
  } catch (err) {
    console.error(`Couldn't queue a pending delivery for ${userId} in ${guildId} (message is lost):`, err.message);
  }
}

export async function flushPendingDeliveries(client) {
  const rows = stmtGetPendingDeliveries.all();
  for (const row of rows) {
    try {
      const channel = await client.channels.fetch(row.channel_id);
      await channel.send({
        content: `${row.content}\n\n*(This result was delayed — the bot was briefly unreachable when your trip finished.)*`,
      });
      stmtDeletePendingDelivery.run(row.id);
    } catch (err) {
      stmtBumpPendingDeliveryAttempts.run(row.id);
      if (row.attempts + 1 >= PENDING_DELIVERY_MAX_ATTEMPTS) {
        console.error(
          `Giving up on a pending delivery for ${row.user_id} in ${row.guild_id} after ${row.attempts + 1} attempts - message lost:`,
          row.content
        );
        stmtDeletePendingDelivery.run(row.id);
      } else {
        console.error(`Retry failed for a pending delivery (${row.user_id} in ${row.guild_id}, attempt ${row.attempts + 1}):`, err.message);
      }
    }
  }
}

export function recordRepeatButton(guildId, userId, channelId, messageId, dartUsed = false) {
  guildId = GLOBAL_ID;
  stmtUpsertButtonRow.run(guildId, userId, channelId, messageId, dartUsed ? 1 : 0);
}

function takeRepeatButton(guildId, userId) {
  guildId = GLOBAL_ID;
  const row = stmtGetButtonRow.get(guildId, userId);
  if (row) stmtDeleteButtonRow.run(guildId, userId);
  return row;
}

async function disableButtonMessage(client, channelId, messageId, guildId, userId) {
  const channel = await client.channels.fetch(channelId);
  const message = await channel.messages.fetch(messageId);
  await message.edit({ components: [repeatTripRow(guildId, userId, true)] });
}

const QUEST_MIN_MINUTES = 30;
const QUEST_MAX_MINUTES = 45;

function rollQuestDurationMinutes() {
  return QUEST_MIN_MINUTES + Math.floor(Math.random() * (QUEST_MAX_MINUTES - QUEST_MIN_MINUTES + 1));
}

export async function startAdventureFor(guildId, userId, channelId, fallbackName, client) {
  if (isGladiatorAdventuring(guildId, userId)) {
    const profile = getGladiatorProfile(guildId, userId, fallbackName);
    throw new EconomyError(
      profile.activeBossId ? buildBossChallengeStatusLine(profile.name, profile.activeBossId) : 'Your Gladiator is already out on Quest.'
    );
  }
  if (hasUnclaimedAdventure(guildId, userId)) {
    throw new EconomyError("Your Gladiator's last Quest hasn't finished resolving yet — try again in a moment.");
  }
  const gladiatorRow = ensureGladiator(guildId, userId, fallbackName);
  const gladiatorName = gladiatorRow.name;

  recordLastAdventureSettings(guildId, userId);

  const oldButton = takeRepeatButton(guildId, userId);
  if (oldButton && client) {
    try {
      await disableButtonMessage(client, oldButton.channel_id, oldButton.message_id, guildId, userId);
    } catch {

    }
  }

  const isInstant = hasInstantTrips(guildId, userId);
  const totalMinutes = rollQuestDurationMinutes();

  const endsAt = isInstant ? Date.now() + INSTANT_RESOLVE_DELAY_MS : Date.now() + totalMinutes * 60_000;

  startGladiatorAdventure(guildId, userId, endsAt, channelId, null, fallbackName, totalMinutes, false, null, 0);

  const timestamp = `<t:${Math.floor(endsAt / 1000)}:R>`;
  const displayName = formatGladiatorDisplayName(guildId, userId, gladiatorName);
  let text = buildQuestSendOffText({ name: displayName, timestamp });
  const equippedPet = getActivePet(guildId, userId);
  if (equippedPet) {
    const petLine = getPetFlavorLine(PET_ADVENTURE_FLAVOR, equippedPet.species_id, equippedPet.nickname ?? equippedPet.given_name, displayName);
    if (petLine) text += `\n🐾 ${petLine}`;
  }
  return { instant: isInstant, text, endsAt };
}

export async function resolveInstantAdventure(guildId, userId) {
  const row = getGladiatorRow(guildId, userId);
  return resolveDueAdventure(row);
}

const CANCELLED_QUEST_ARENA_REWARD = [10, 30];

const SKILL_TRIP_PREFIXES = ['gathering:', 'cooking:', 'herbalism:', 'hunting:', 'smelt:', 'smith:', 'fletching:', 'crafting:', 'magic_crafting:'];

function classifyActiveTrip(row) {
  if (!row || !(row.adventure_ends_at > Date.now())) return null;
  if (row.active_boss_id) return 'boss';
  if (row.active_mob_id?.startsWith('farming:')) return 'farming';
  if (row.active_mob_id && SKILL_TRIP_PREFIXES.some((p) => row.active_mob_id.startsWith(p))) return 'skill';
  if (row.active_mob_id) return 'slay';
  return 'adventure';
}

export function cancelActiveTripFor(guildId, userId) {
  const row = getGladiatorRow(guildId, userId);
  const kind = classifyActiveTrip(row);

  if (!kind) {
    throw new EconomyError("Your Gladiator isn't currently on a trip.");
  }

  const displayName = formatGladiatorDisplayName(guildId, userId, row.name);

  if (kind === 'adventure') {
    const [lo, hi] = CANCELLED_QUEST_ARENA_REWARD;
    const arena = lo + Math.floor(Math.random() * (hi - lo + 1));
    addArenaCoins(guildId, userId, arena, 'quest');
    endGladiatorAdventure(guildId, userId);
    const text = `🏳️ **${displayName}** was called back early — cutting a quest short never pays like finishing it. They brought back a fraction of what they might have: ${formatArena(arena)}. No QP, no XP.`;
    return { text, kind, arena };
  }

  if (kind === 'farming') {
    const { text } = cancelFarmingTrip(guildId, userId, row);
    return { text, kind };
  }

  endGladiatorAdventure(guildId, userId);
  const label = kind === 'boss' ? 'Boss Challenge' : kind === 'slay' ? 'Slayer' : 'Skilling';
  const text = `🏳️ **${displayName}**'s ${label} trip was called back early. Everything's forfeited — no resources, no loot, no XP.`;

  return { text, kind };
}

export async function resolveDueAdventure(row) {

  if (row.active_boss_id) {
    return resolveDueBossFight(row, { endGladiatorAdventure, addGladiatorXp, formatGladiatorDisplayName, addCash, addArenaCoins, applyGladiatorXpBonus });
  }

  if (row.active_mob_id?.startsWith('gathering:')) {
    return resolveDueGathering(row);
  }
  if (row.active_mob_id?.startsWith('cooking:')) {
    return resolveDueCooking(row);
  }
  if (row.active_mob_id?.startsWith('herbalism:')) {
    return resolveDueHerbalism(row);
  }
  if (row.active_mob_id?.startsWith('hunting:')) {
    return resolveDueHunting(row);
  }
  if (row.active_mob_id?.startsWith('smelt:')) {
    return resolveDueSmelt(row);
  }
  if (row.active_mob_id?.startsWith('smith:')) {
    return resolveDueSmith(row);
  }
  if (row.active_mob_id?.startsWith('fletching:')) {
    return resolveDueFletching(row);
  }
  if (row.active_mob_id?.startsWith('crafting:')) {
    return resolveDueCrafting(row);
  }
  if (row.active_mob_id?.startsWith('magic_crafting:')) {
    return resolveDueMagicCrafting(row);
  }
  if (row.active_mob_id?.startsWith('tanning:')) {
    return resolveDueTanning(row);
  }

  if (row.active_mob_id === 'farming:plant') {
    return resolveDueFarmingPlant(row);
  }
  if (row.active_mob_id === 'farming:harvest') {
    return resolveDueFarmingHarvest(row);
  }
  if (row.active_mob_id === 'farming:replant') {
    return resolveDueFarmingReplant(row);
  }
  if (row.active_mob_id) {
    return resolveDueSlay(row);
  }

  const { guild_id: guildId, user_id: userId, name, adventure_channel_id: channelId } = row;

  const baseXp = 400;
  const boostedXp = applyGladiatorXpBonus(guildId, userId, baseXp, 'quest');
  const xpResult = addGladiatorXp(guildId, userId, boostedXp, name);

  const displayName = formatGladiatorDisplayName(guildId, userId, name);

  const currentQp = getGladiatorQp(guildId, userId);
  const qpReward = rollQuestPointsReward(currentQp);
  const qpResult = qpReward > 0 ? addGladiatorQp(guildId, userId, qpReward, name) : null;
  const arenaReward = 200 + Math.floor(Math.random() * 300);
  addArenaCoins(guildId, userId, arenaReward, 'quest');

  let text = buildQuestReturnText({ name: displayName });
  text += `\n\n💰 **Earned:** ${formatArena(arenaReward)}`;
  if (qpResult) text += ` · ${qpResult.qpGained} QP`;
  text += `\n✨ **+${xpResult.xpGained.toLocaleString('en-US')} Gladiator XP**`;
  if (xpResult.leveledUp && !xpResult.justMaxed) {
    text += ` — 🆙 **Level ${xpResult.after.level}!**`;
  }
  if (xpResult.justMaxed) {
    text += `\n\n👑 **MAXED OUT!** ${displayName} just hit the 200,000,000 XP cap — the **Laurel of the Undying** has been added to their collection.`;
  }

  const petXpResult = grantEquippedPetXp(guildId, userId, 'common', xpResult.after.level, true);
  if (petXpResult) {
    text += `\n\n${formatPetLevelUpLine(petXpResult)}`;
  }

  let foundPet = null;
  const questPetRoll = rollQuestPetFind(guildId, userId);
  if (questPetRoll) {
    foundPet = questPetRoll;
    text += `\n\n🐾 A pet joins you: **${questPetRoll.pet.given_name}**!`;
    if (questPetRoll.pet.is_shiny) {
      text += `\n✨ **It's shiny!** ${questPetRoll.pet.given_name} isn't like the others.`;
    }
  }

  endGladiatorAdventure(guildId, userId);

  const newUnlockIds = new Set();
  const lootPreviewBuf = await renderLootPreviewImage(guildId, userId, name, [], newUnlockIds);
  const files = lootPreviewBuf ? [new AttachmentBuilder(lootPreviewBuf, { name: 'loot.png' })] : [];

  return { guildId, userId, channelId, content: `<@${userId}> ${text}`, components: [repeatTripRow(guildId, userId)], files };
}

export async function checkDueAdventures(client) {

  await flushPendingDeliveries(client);
  const due = getAllDueAdventures();
  for (const row of due) {
    try {
      const { guildId, userId, channelId, content, components, dartUsed, files } = await resolveDueAdventure(row);
      try {
        const channel = await client.channels.fetch(channelId);
        const message = await channel.send({ content, components, files });
        recordRepeatButton(guildId, userId, channelId, message.id, dartUsed);
      } catch (postErr) {
        console.error(`Couldn't post Adventure result for ${row.user_id} in ${row.guild_id}:`, postErr.message);

        queuePendingDelivery(guildId, userId, channelId, content);
      }
    } catch (err) {
      console.error(`Failed to resolve Adventure for ${row.user_id} in ${row.guild_id}:`, err);
    }
  }
}

export async function checkStaleRepeatButtons(client) {
  const cutoff = Math.floor((Date.now() - REPEAT_BUTTON_MAX_AGE_MS) / 1000);
  const stale = stmtStaleButtonRows.all(cutoff);
  for (const row of stale) {
    try {
      await disableButtonMessage(client, row.channel_id, row.message_id, row.guild_id, row.user_id);
    } catch (err) {
      console.error(`Couldn't grey out a stale Repeat Trip button for ${row.user_id}:`, err.message);
    } finally {
      stmtDeleteButtonRow.run(row.guild_id, row.user_id);
    }
  }
}
