import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Collection, GatewayIntentBits, ActivityType } from 'discord.js';
import { EconomyError } from './utils/economy.js';
import { getActiveLabel, endSession } from './utils/activeSession.js';
import { getAllPendingTrades, clearPendingTrade } from './utils/pendingTrades.js';
import { refundSide, formatFinalSideLines } from './utils/trade.js';
import { getInstanceDurability } from './utils/inventory.js';
import { ensureGuild, addCash } from './utils/economy.js';
import { getAllPendingDuels, clearPendingDuel } from './utils/pendingDuels.js';
import { getOpenRounds, refundStrandedRound } from './utils/roulette.js';
import { isBlacklisted } from './utils/blacklist.js';
import { startBackupScheduler } from './utils/backupScheduler.js';
import { refundDuelWager } from './utils/arena.js';
import { formatArena, formatMoney } from './utils/format.js';
import { REPAIR_EQUIPPED_PREFIX, repairAll } from './utils/durability.js';
import { syncTierFlagsFromRoles } from './utils/tierRoles.js';
import { checkDueHeists } from './utils/heistScheduler.js';
import {
  checkDueAdventures,
  checkStaleRepeatButtons,
  startAdventureFor,
  recordRepeatButton,
  parseRepeatTripCustomId,
  getLastAdventureSettings,
  resolveInstantAdventure,
} from './utils/adventureScheduler.js';
import { buildGladiatorStatusEmbed } from './commands/economy/gladiator.js';
import { parseBossRepeatCustomId } from './utils/bossChallenges.js';
import { startSlayFor, SLAY_TRIP_TYPE } from './utils/slay.js';
import { startGatheringTrip, GATHERING_TRIP_TYPES, startMultiResourceTrip, MULTI_RESOURCE_TRIP_TYPES } from './utils/gathering.js';
import { startCookingTrip, getAffordableCookingQuantity, COOKING_TRIP_TYPE } from './utils/cooking.js';
import { startHerbalismTrip, getAffordableHerbalismQuantity, HERBALISM_TRIP_TYPE } from './utils/herbalism.js';
import { startHuntingTrip, HUNTING_TRIP_TYPE, startLodgeTrip, LODGE_TRIP_TYPE } from './utils/hunting.js';
import { startSmeltTrip, startSmithTrip, getAffordableSmeltQuantity, getAffordableSmithQuantity, SMELT_TRIP_TYPE, SMITH_TRIP_TYPE } from './utils/smithing.js';
import { startFletchingTrip, getAffordableFletchingQuantity, FLETCHING_TRIP_TYPE } from './utils/fletching.js';
import { startCraftingTrip, getAffordableCraftingQuantity, CRAFTING_TRIP_TYPE } from './utils/crafting.js';
import { startMagicCraftingTrip, getAffordableMagicCraftingQuantity, MAGIC_CRAFTING_TRIP_TYPE } from './utils/magicCrafting.js';
import { startTanningTrip, getAffordableTanningQuantity, TANNING_TRIP_TYPE } from './utils/tanning.js';
import { parseSkillRepeatTripCustomId, getMostRecentTripSettings } from './utils/lastTripSettings.js';
import { backfillMissingCollectionLogEntries, repairCorruptedCollectionLogItemIds } from './utils/collectionLog.js';
import { addArenaCoins } from './utils/arena.js';
import { addItemToInventory, deleteInstance, unlockInstance } from './utils/inventory.js';
import { getPendingSell, clearPendingSell } from './utils/pendingSells.js';
import { SELL_CONFIRM_PREFIX, SELL_CANCEL_PREFIX, PET_SELL_CONFIRM_PREFIX, PET_SELL_CANCEL_PREFIX } from './commands/economy/sell.js';
import { getPet, sellPet, PET_SELL_PRICE } from './utils/pets.js';
import { findBossAnywhere } from './data/bossDomains.js';
import { attemptBossChallenge } from './commands/economy/challenge.js';
import {
  PANEL_BUTTON_PREFIX,
  PANEL_SELECT_PREFIX,
  PANEL_MODAL_PREFIX,
  parseButtonCustomId,
  parseSelectCustomId,
  parseModalCustomId,
} from './utils/panel.js';
import adminPanel from './commands/admin/admin.js';
import configPanel from './commands/admin/config.js';
import systemPanel from './commands/owner/system.js';
import ownerPanel from './commands/owner/owner.js';
import modPanel from './commands/mod/mod.js';
import helpPanel from './commands/economy/help.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const crashLogPath = path.join(__dirname, '..', 'data', 'crash.log');

function logCrash(kind, error) {
  const timestamp = new Date().toISOString();
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const entry = `\n[${timestamp}] ${kind}\n${detail}\n`;
  console.error(entry);
  try {
    fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
    fs.appendFileSync(crashLogPath, entry);
  } catch (writeErr) {
    console.error('Also failed to write to crash.log:', writeErr.message);
  }
}

process.on('uncaughtException', (err) => logCrash('uncaughtException', err));
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', reason));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,

    GatewayIntentBits.GuildMembers,
  ],
});
client.commands = new Collection();

const heartbeatPath = path.join(process.cwd(), 'data', 'bot-heartbeat.json');
let heartbeatTimer = null;

function writeHeartbeat(state = 'online') {
  try {
    fs.mkdirSync(path.dirname(heartbeatPath), { recursive: true });
    fs.writeFileSync(
      heartbeatPath,
      JSON.stringify({
        state,
        updatedAt: Date.now(),
        pid: process.pid,
        botTag: client.user?.tag ?? null,
        guildCount: client.guilds?.cache?.size ?? 0,
        ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : null,
      }, null, 2),
      'utf8',
    );
  } catch (error) {
    console.error('Failed to write bot heartbeat:', error);
  }
}

function startHeartbeat() {
  writeHeartbeat('online');
  heartbeatTimer = setInterval(() => writeHeartbeat('online'), 30_000);
  heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  writeHeartbeat('offline');
}

process.once('SIGINT', () => {
  stopHeartbeat();
  client.destroy();
  process.exit(0);
});

process.once('SIGTERM', () => {
  stopHeartbeat();
  client.destroy();
  process.exit(0);
});

async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const categories = fs.readdirSync(commandsPath, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category.name);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      const { default: command } = await import(pathToFileURL(filePath).href);

      if (!command?.data || !command?.execute) {
        console.warn(`[WARN] ${filePath} is missing "data" or "execute" — skipping.`);
        continue;
      }
      client.commands.set(command.data.name, command);
    }
  }
  console.log(`Loaded ${client.commands.size} command(s).`);
}

client.on('interactionCreate', async (interaction) => {

  if (isBlacklisted(interaction.user.id)) {
    if (interaction.isAutocomplete()) {
      return interaction.respond([]).catch(() => {});
    }
    if (interaction.isRepliable()) {
      return interaction.reply({ content: 'You are blocked from using this bot.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${PANEL_BUTTON_PREFIX}:`)) {
    const parsed = parseButtonCustomId(interaction.customId);
    const panel = parsed?.screen.startsWith('config-')
      ? configPanel
      : parsed?.screen.startsWith('system-')
        ? systemPanel
        : parsed?.screen.startsWith('owner-')
          ? ownerPanel
          : parsed?.screen.startsWith('mod-')
            ? modPanel
            : parsed?.screen.startsWith('help-')
              ? helpPanel
              : adminPanel;
    try {
      await panel.handleButton(interaction);
    } catch (err) {
      console.error('Admin panel button failed:', err);
    }
    return;
  }
  if (interaction.isAnySelectMenu() && interaction.customId.startsWith(`${PANEL_SELECT_PREFIX}:`)) {
    const parsed = parseSelectCustomId(interaction.customId);
    const panel = parsed?.screen.startsWith('config-')
      ? configPanel
      : parsed?.screen.startsWith('system-')
        ? systemPanel
        : parsed?.screen.startsWith('owner-')
          ? ownerPanel
          : parsed?.screen.startsWith('mod-')
            ? modPanel
            : adminPanel;
    try {
      await panel.handleSelect(interaction);
    } catch (err) {
      console.error('Admin panel select failed:', err);
    }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(`${PANEL_MODAL_PREFIX}:`)) {
    const parsed = parseModalCustomId(interaction.customId);
    const panel = parsed?.screen.startsWith('config-')
      ? configPanel
      : parsed?.screen.startsWith('system-')
        ? systemPanel
        : parsed?.screen.startsWith('owner-')
          ? ownerPanel
          : parsed?.screen.startsWith('mod-')
            ? modPanel
            : adminPanel;
    try {
      await panel.handleModal(interaction);
    } catch (err) {
      console.error('Admin panel modal failed:', err);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith(`${REPAIR_EQUIPPED_PREFIX}:`)) {
    const [, repairGuildId, repairUserId] = interaction.customId.split(':');
    if (interaction.user.id !== repairUserId) {
      return interaction.reply({ content: "That's not your gear to repair.", ephemeral: true });
    }
    try {
      const { repaired, totalCost, totalArenaCost } = repairAll(repairGuildId, repairUserId);
      if (repaired.length === 0) {
        return interaction.reply({ content: 'Nothing left to repair — someone already took care of it.', ephemeral: true });
      }
      const settings = ensureGuild(repairGuildId);
      const costParts = [];
      if (totalCost > 0) costParts.push(formatMoney(totalCost, settings));
      if (totalArenaCost > 0) costParts.push(formatArena(totalArenaCost));
      return interaction.reply({
        content: `🔧 Repaired ${repaired.map((i) => i.name).join(', ')} for ${costParts.join(' + ')}.`,
        ephemeral: true,
      });
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }
  }

  if (interaction.isButton() && (interaction.customId.startsWith(`${SELL_CONFIRM_PREFIX}:`) || interaction.customId.startsWith(`${SELL_CANCEL_PREFIX}:`))) {
    const isConfirm = interaction.customId.startsWith(`${SELL_CONFIRM_PREFIX}:`);
    const sellKey = interaction.customId.split(':')[1];
    const pending = getPendingSell(sellKey);
    if (!pending) {
      return interaction.update({ content: 'This sell request has already been resolved.', components: [] });
    }
    if (interaction.user.id !== pending.user_id) {
      return interaction.reply({ content: "That's not your sell request to confirm or cancel.", ephemeral: true });
    }

    if (isConfirm) {
      if (pending.arena_value > 0) addArenaCoins(pending.guild_id, pending.user_id, pending.arena_value);
      if (pending.cash_value > 0) addCash(pending.guild_id, pending.user_id, pending.cash_value);

      for (const entry of pending.items) {
        if (entry.kind === 'equipment') {
          deleteInstance(entry.instanceId);
          unlockInstance(entry.instanceId);
        }
      }
      clearPendingSell(sellKey);
      endSession(pending.guild_id, pending.user_id);
      const settings = ensureGuild(pending.guild_id);
      const totalLine = `${formatArena(pending.arena_value)}${pending.cash_value > 0 ? ` + ${formatMoney(pending.cash_value, settings)}` : ''}`;
      const soldCounts = new Map();
      for (const entry of pending.items) soldCounts.set(entry.name, (soldCounts.get(entry.name) ?? 0) + (entry.quantity ?? 1));
      const soldLabels = [...soldCounts.entries()].map(([name, qty]) => `${qty}x ${name}`).join(', ');
      return interaction.update({ content: `You sold ${soldLabels} for ${totalLine}.`, components: [] });
    } else {

      for (const entry of pending.items) {
        if (entry.kind === 'equipment') {
          unlockInstance(entry.instanceId);
        } else {
          addItemToInventory(pending.guild_id, pending.user_id, entry.itemId, entry.quantity);
        }
      }
      clearPendingSell(sellKey);
      endSession(pending.guild_id, pending.user_id);
      return interaction.update({ content: 'Sale cancelled — everything has been refunded.', components: [] });
    }
  }

  if (interaction.isButton() && (interaction.customId.startsWith(`${PET_SELL_CONFIRM_PREFIX}:`) || interaction.customId.startsWith(`${PET_SELL_CANCEL_PREFIX}:`))) {
    const isConfirm = interaction.customId.startsWith(`${PET_SELL_CONFIRM_PREFIX}:`);
    const instanceId = interaction.customId.split(':')[1];
    const pet = getPet(instanceId);
    if (!pet) {
      return interaction.update({ content: 'That pet is already gone.', components: [] });
    }
    if (interaction.user.id !== pet.user_id) {
      return interaction.reply({ content: "That's not your pet to sell.", ephemeral: true });
    }
    if (!isConfirm) {
      endSession(pet.guild_id, pet.user_id);
      return interaction.update({ content: `Alright, ${pet.nickname ?? pet.given_name} stays with you.`, components: [] });
    }
    const sold = sellPet(pet.guild_id, pet.user_id, instanceId);
    addArenaCoins(pet.guild_id, pet.user_id, PET_SELL_PRICE);
    endSession(pet.guild_id, pet.user_id);
    const soldName = sold.nickname ?? sold.given_name;
    return interaction.update({
      content: `You sold **${soldName}** for **${PET_SELL_PRICE}** arena coins. You meanie. 💔`,
      components: [],
    });
  }

  if (interaction.isButton()) {
    const bossParsed = parseBossRepeatCustomId(interaction.customId);
    if (bossParsed) {
      if (interaction.user.id !== bossParsed.userId) {
        return interaction.reply({ content: "That's not your Gladiator's challenge to repeat.", ephemeral: true });
      }
      const boss = findBossAnywhere(bossParsed.bossId)?.boss;
      const domain = findBossAnywhere(bossParsed.bossId)?.domain;
      if (!boss || !domain) {
        return interaction.reply({ content: "That boss no longer exists.", ephemeral: true });
      }
      const payload = await attemptBossChallenge(bossParsed.guildId, bossParsed.userId, interaction.channelId, interaction.user.displayName, domain, boss);
      return interaction.reply(payload);
    }
  }

  if (interaction.isButton()) {
    const isSkillRepeat = parseSkillRepeatTripCustomId(interaction.customId);
    if (isSkillRepeat) {
      const clickerId = interaction.user.id;
      const recent = getMostRecentTripSettings(clickerId);
      if (!recent) {
        return interaction.reply({ content: "You haven't sent a Slay or skilling trip yet - send one manually first, then Repeat Trip will work.", ephemeral: true });
      }
      const { tripType, settings } = recent;

      try {
        if (tripType === SLAY_TRIP_TYPE) {
          const result = await startSlayFor(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.mobId, settings.quantity);
          return interaction.reply({ content: result.text });
        }
        if (Object.values(GATHERING_TRIP_TYPES).includes(tripType)) {
          const result = await startGatheringTrip(
            interaction.guildId,
            clickerId,
            interaction.channelId,
            interaction.user.displayName,
            settings.skillKey,
            settings.tier,
            settings.quantity
          );
          return interaction.reply({ content: result.text });
        }
        if (tripType === COOKING_TRIP_TYPE) {
          const clamped = getAffordableCookingQuantity(interaction.guildId, clickerId, settings.tier, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough raw fish left to repeat this trip.", ephemeral: true });
          const result = await startCookingTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.tier, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === HERBALISM_TRIP_TYPE) {
          const clamped = getAffordableHerbalismQuantity(interaction.guildId, clickerId, settings.tier, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough herbs or Vials of Water left to repeat this trip.", ephemeral: true });
          const result = await startHerbalismTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.tier, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === HUNTING_TRIP_TYPE) {
          const result = await startHuntingTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.huntType, settings.tier, settings.quantity);
          return interaction.reply({ content: result.text });
        }
        if (tripType === LODGE_TRIP_TYPE) {
          const result = await startLodgeTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName);
          return interaction.reply({ content: result.text });
        }
        if (Object.values(MULTI_RESOURCE_TRIP_TYPES).includes(tripType)) {
          const result = await startMultiResourceTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.projectId);
          return interaction.reply({ content: result.text });
        }
        if (tripType === SMELT_TRIP_TYPE) {
          const clamped = getAffordableSmeltQuantity(interaction.guildId, clickerId, settings.tier, settings.barQuantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough ore left to repeat this trip.", ephemeral: true });
          const result = await startSmeltTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.tier, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === SMITH_TRIP_TYPE) {
          const clamped = getAffordableSmithQuantity(interaction.guildId, clickerId, settings.productId, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough bars left to repeat this trip.", ephemeral: true });
          const result = await startSmithTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.productId, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === FLETCHING_TRIP_TYPE) {
          const clamped = getAffordableFletchingQuantity(interaction.guildId, clickerId, settings.itemType, settings.key, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough materials left to repeat this trip.", ephemeral: true });
          const result = await startFletchingTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.itemType, settings.key, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === CRAFTING_TRIP_TYPE) {
          const clamped = getAffordableCraftingQuantity(interaction.guildId, clickerId, settings.productId, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough hides or Thread left to repeat this trip.", ephemeral: true });
          const result = await startCraftingTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.productId, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === MAGIC_CRAFTING_TRIP_TYPE) {
          const clamped = getAffordableMagicCraftingQuantity(interaction.guildId, clickerId, settings.productId, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have enough Imbued Silk or Enchanted Thread left to repeat this trip.", ephemeral: true });
          const result = await startMagicCraftingTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.productId, clamped);
          return interaction.reply({ content: result.text });
        }
        if (tripType === TANNING_TRIP_TYPE) {
          const clamped = getAffordableTanningQuantity(interaction.guildId, clickerId, settings.tier, settings.usePerfect, settings.quantity);
          if (clamped < 1) return interaction.reply({ content: "You don't have any hides left to repeat this trip.", ephemeral: true });
          const result = await startTanningTrip(interaction.guildId, clickerId, interaction.channelId, interaction.user.displayName, settings.tier, settings.usePerfect, clamped);
          return interaction.reply({ content: result.text });
        }
        return interaction.reply({ content: "That trip type couldn't be repeated.", ephemeral: true });
      } catch (err) {
        if (err instanceof EconomyError) {
          return interaction.reply({ content: err.message, ephemeral: true });
        }
        throw err;
      }
    }
  }

  if (interaction.isButton()) {
    const parsed = parseRepeatTripCustomId(interaction.customId);
    if (!parsed) return;

    const lastSettings = getLastAdventureSettings(parsed.guildId, interaction.user.id);
    if (!lastSettings) {
      return interaction.reply({
        content: "You haven't sent a Quest yet - use `/quest` to send one manually first.",
        ephemeral: true,
      });
    }

    try {

      const result = await startAdventureFor(
        parsed.guildId,
        interaction.user.id,
        interaction.channelId,
        interaction.user.displayName,
        interaction.client,
        lastSettings.locationChoice,
        lastSettings.dartUsed
      );

      if (result.instant) {
        const resolved = await resolveInstantAdventure(parsed.guildId, interaction.user.id);
        await interaction.reply({ content: resolved.content, components: resolved.components, files: resolved.files });
        const message = await interaction.fetchReply();
        recordRepeatButton(resolved.guildId, resolved.userId, resolved.channelId, message.id);
        return;
      }
      const consumedLines = [
        result.dartUsed ? "*Consumed 1x Hades' Dart*" : null,
        result.elixirsConsumed > 0 ? `*Consumed ${result.elixirsConsumed}x Elixir*` : null,
      ].filter(Boolean);
      const sendOffText = consumedLines.length > 0 ? `${result.text}\n${consumedLines.join('\n')}` : result.text;
      return interaction.reply({ content: sendOffText });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      console.error('Repeat Trip button failed:', err);
      return interaction.reply({ content: 'Something went wrong starting that adventure.', ephemeral: true });
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(`Error in autocomplete for /${interaction.commandName}:`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  if (interaction.guildId) {
    const activeLabel = getActiveLabel(interaction.guildId, interaction.user.id);
    if (activeLabel) {
      return interaction.reply({
        content: `⏳ You have **${activeLabel}** in progress — finish it (or let it time out) before doing anything else.`,
        ephemeral: true,
      });
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    if (err instanceof EconomyError) {

      const payload = { content: err.message, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
      return;
    }

    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
});

async function recoverPendingTrades() {
  const pending = getAllPendingTrades();
  if (pending.length === 0) return;

  console.log(`Recovering ${pending.length} trade(s) left pending by a restart...`);
  for (const trade of pending) {
    try {
      refundSide(trade.guildId, trade.initiatorId, trade.sendSide);
      clearPendingTrade(trade.tradeKey);

      const lines = formatFinalSideLines(trade.sendSide, ensureGuild(trade.guildId), (id) => getInstanceDurability(id));
      const content =
        `⚠️ This trade was cancelled because the bot restarted while it was still pending. ` +
        `Refunded to the sender: ${lines.join(', ')}.`;

      try {
        const channel = await client.channels.fetch(trade.channelId);
        const message = await channel.messages.fetch(trade.messageId);
        await message.edit({ content, embeds: [], components: [] });
      } catch {

      }
    } catch (err) {
      console.error(`Failed to recover pending trade ${trade.tradeKey}:`, err);
    }
  }
}

async function recoverPendingDuels() {
  const pending = getAllPendingDuels();
  if (pending.length === 0) return;

  console.log(`Recovering ${pending.length} duel challenge(s) left pending by a restart...`);
  for (const duel of pending) {
    try {
      refundDuelWager(duel.guildId, duel.challengerId, duel.wager, duel.currency);
      clearPendingDuel(duel.duelKey);

      const settings = ensureGuild(duel.guildId);
      const wagerText = duel.currency === 'arena' ? formatArena(duel.wager) : formatMoney(duel.wager, settings);
      const content =
        `⚠️ This duel challenge was cancelled because the bot restarted while it was still pending. ` +
        `Refunded to the challenger: ${wagerText}.`;

      try {
        const channel = await client.channels.fetch(duel.channelId);
        const message = await channel.messages.fetch(duel.messageId);
        await message.edit({ content, embeds: [], components: [] });
      } catch {

      }
    } catch (err) {
      console.error(`Failed to recover pending duel ${duel.duelKey}:`, err);
    }
  }
}

async function recoverStrandedRouletteRounds() {
  const stranded = getOpenRounds();
  if (stranded.length === 0) return;

  console.log(`Recovering ${stranded.length} roulette round(s) left open by a restart...`);
  for (const round of stranded) {
    try {
      const refundedBets = refundStrandedRound(round.round_id);
      if (refundedBets.length === 0) continue;

      const total = refundedBets.reduce((sum, b) => sum + b.amount, 0);
      const content = `⚠️ This roulette round was cancelled because the bot restarted while it was still open — all ${refundedBets.length} bet(s) (${total.toLocaleString('en-US')} total) were refunded.`;
      try {
        const channel = await client.channels.fetch(round.channel_id);
        await channel.send(content);
      } catch {

      }
    } catch (err) {
      console.error(`Failed to recover roulette round ${round.round_id}:`, err);
    }
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;

  if (message.reference) return;
  if (!message.mentions.has(client.user)) return;

  try {
    const embed = buildGladiatorStatusEmbed(message.guildId, message.author);
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (err) {
    console.error('Failed to handle bot mention:', err);
  }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  const tierGuildId = process.env.TIER_ROLES_GUILD_ID;
  if (!tierGuildId || newMember.guild.id !== tierGuildId) return;
  if (oldMember.roles.cache.equals(newMember.roles.cache)) return;

  try {
    syncTierFlagsFromRoles(newMember.guild.id, newMember);
  } catch (err) {
    console.error('Failed to sync tier flags from roles:', err);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Arena Battles',
        type: ActivityType.Watching,
      },
    ],
  });

  startHeartbeat();
  recoverPendingTrades();
  recoverPendingDuels();
  recoverStrandedRouletteRounds();
  startBackupScheduler();
  repairCorruptedCollectionLogItemIds();
  backfillMissingCollectionLogEntries();

  checkDueAdventures(client);
  const adventureTimer = setInterval(() => checkDueAdventures(client), 30_000);
  checkDueHeists(client);
  const heistTimer = setInterval(() => checkDueHeists(client), 30_000);
  adventureTimer.unref();
  heistTimer.unref();

  checkStaleRepeatButtons(client);
  const repeatButtonTimer = setInterval(() => checkStaleRepeatButtons(client), 10 * 60_000);
  repeatButtonTimer.unref();
});

await loadCommands();
client.login(process.env.DISCORD_TOKEN);
