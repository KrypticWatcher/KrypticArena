import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import { getBalance, getArenaBalance } from './economy.js';
import { resolveWagerAmount } from './parseAmount.js';
import { checkGameCooldown } from './gameCooldowns.js';
import { getActiveLabel } from './activeSession.js';
import { formatDuration } from './format.js';

const REBET_IDLE_MS = 30_000;

const stmtRecord = db.prepare(
  `INSERT INTO last_gamble_bet (guild_id, user_id, game, options, placed_at) VALUES (?, ?, ?, ?, strftime('%s','now'))
   ON CONFLICT(guild_id, user_id) DO UPDATE SET game = excluded.game, options = excluded.options, placed_at = excluded.placed_at`
);
const stmtGet = db.prepare('SELECT game, options FROM last_gamble_bet WHERE guild_id = ? AND user_id = ?');

export function recordLastBet(guildId, userId, game, options) {
  stmtRecord.run(guildId, userId, game, JSON.stringify(options));
}

export function getMostRecentBet(guildId, userId) {
  const row = stmtGet.get(guildId, userId);
  if (!row) return null;
  return { game: row.game, options: JSON.parse(row.options) };
}

export const GAME_MODULES = {
  blackjack: () => import('../commands/games/blackjack.js').then((m) => m.default),
  slots: () => import('../commands/games/slots.js').then((m) => m.default),
  roulette: () => import('../commands/games/roulette.js').then((m) => m.default),
  dice: () => import('../commands/games/dice.js').then((m) => m.default),
  
  
  
  
  
  champion: () => import('../commands/economy/champion.js').then((m) => m.default),
};

export function buildRebetInteraction(buttonInteraction, options) {
  return new Proxy(buttonInteraction, {
    get(target, prop) {
      if (prop === 'options') {
        return {
          getString: (name) => options[name] ?? null,
          getInteger: (name) => (options[name] == null ? null : Number(options[name])),
          getBoolean: (name) => options[name] ?? null,
          getSubcommand: () => options.__subcommand ?? null,
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function buildUniversalRebetRow(buttonId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`urebet-${buttonId}`).setLabel('🔁 Re-Bet').setStyle(ButtonStyle.Success).setDisabled(disabled)
  );
}

const DOUBLE_DOWN_CAP = 3;
const doubleDownStreaks = new Map(); 
const consecutiveLosses = new Map(); 
const pendingDoubleDownStreakSkip = new Set(); 

export function getDoubleDownStreak(userId) {
  return doubleDownStreaks.get(userId) ?? 0;
}

export function canDoubleDown(userId) {
  return (consecutiveLosses.get(userId) ?? 0) >= 2 && getDoubleDownStreak(userId) < DOUBLE_DOWN_CAP;
}

export function recordBetOutcome(userId, outcome) {
  if (pendingDoubleDownStreakSkip.has(userId)) {
    pendingDoubleDownStreakSkip.delete(userId);
    if (outcome === 'win') {
      doubleDownStreaks.delete(userId);
      consecutiveLosses.delete(userId);
    } else if (outcome === 'loss' && getDoubleDownStreak(userId) >= DOUBLE_DOWN_CAP) {
      
      
      doubleDownStreaks.delete(userId);
      consecutiveLosses.delete(userId);
    }
    
    
    
    return;
  }

  
  if (outcome === 'win') {
    doubleDownStreaks.delete(userId);
    consecutiveLosses.delete(userId);
  } else if (outcome === 'loss') {
    consecutiveLosses.set(userId, (consecutiveLosses.get(userId) ?? 0) + 1);
    
    
    doubleDownStreaks.delete(userId);
  }
  
  
  
}

export function buildDoubleDownRow(buttonId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`udouble-${buttonId}`).setLabel('⚔️ Double Down').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

export function attachDoubleDownHandler(message, buttonId, ownerId, timeoutMs = REBET_IDLE_MS) {
  const usedUserIds = new Set();
  const collector = message.createMessageComponentCollector({
    filter: (i) => i.customId === `udouble-${buttonId}`,
    time: timeoutMs,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== ownerId) {
      await buttonInteraction.reply({ content: "This Double Down button isn't yours to use.", ephemeral: true });
      return;
    }
    if (usedUserIds.has(buttonInteraction.user.id)) {
      await buttonInteraction.reply({ content: "You've already used this Double Down button.", ephemeral: true });
      return;
    }

    const { guildId, user } = buttonInteraction;
    const userId = user.id;

    const lastBet = getMostRecentBet(guildId, userId);
    if (!lastBet) {
      await buttonInteraction.reply({ content: "You haven't placed a bet on Blackjack, Slots, Roulette, or Dice yet — nothing to double down on.", ephemeral: true });
      return;
    }
    if (lastBet.game === 'champion') {
      await buttonInteraction.reply({ content: "Double Down isn't available on Champion.", ephemeral: true });
      return;
    }

    if (!canDoubleDown(userId)) {
      usedUserIds.add(userId);
      await buttonInteraction.reply({ content: `You've already doubled down **${DOUBLE_DOWN_CAP}** times in a row — place a plain bet first before it's offered again.`, ephemeral: true });
      return;
    }

    const activeLabel = getActiveLabel(guildId, userId);
    if (activeLabel) {
      usedUserIds.add(userId);
      await buttonInteraction.reply({
        content: `You already have **${activeLabel}** in progress — finish it (or let it time out) before doubling down.`,
        ephemeral: true,
      });
      return;
    }

    const cooldown = checkGameCooldown(guildId, userId, lastBet.game);
    if (cooldown.onCooldown) {
      const waitMs = cooldown.readyAt - Date.now();
      await buttonInteraction.reply({
        content: `**${lastBet.game}** is still on cooldown for you — ready ${formatDuration(waitMs)} from now.`,
        ephemeral: true,
      });
      return;
    }

    const rawBet = lastBet.options.bet;
    const currentBalance = getBalance(guildId, userId).cash;
    const resolvedAmount = resolveWagerAmount(String(rawBet).trim().toLowerCase(), currentBalance) ?? 0;
    const doubledAmount = resolvedAmount * 2;
    const affordable = resolvedAmount > 0 && doubledAmount <= currentBalance;
    if (!affordable) {
      usedUserIds.add(userId);
      await buttonInteraction.reply({
        content: `You don't have enough cash to double down to **${doubledAmount.toLocaleString('en-US')}** right now.`,
        ephemeral: true,
      });
      return;
    }

    usedUserIds.add(userId);
    try {
      const gameModule = await GAME_MODULES[lastBet.game]();
      
      
      
      
      
      const doubledOptions = { ...lastBet.options, bet: String(doubledAmount) };
      const fakeInteraction = buildRebetInteraction(buttonInteraction, doubledOptions);
      doubleDownStreaks.set(userId, getDoubleDownStreak(userId) + 1);
      pendingDoubleDownStreakSkip.add(userId);
      await gameModule.execute(fakeInteraction);
    } catch (err) {
      usedUserIds.delete(userId);
      pendingDoubleDownStreakSkip.delete(userId);
      doubleDownStreaks.set(userId, Math.max(0, getDoubleDownStreak(userId) - 1));
      console.error(`Double down failed for ${userId} on ${lastBet.game}:`, err);
      await buttonInteraction.reply({ content: 'Something went wrong doubling that down — try the button again.', ephemeral: true }).catch(() => {});
    }
  });

  collector.on('end', async () => {
    try {
      await message.edit({ components: [buildDoubleDownRow(buttonId, true)] });
    } catch {
      
    }
  });
}

export function attachUniversalRebetHandler(message, buttonId, timeoutMs = REBET_IDLE_MS) {
  const usedUserIds = new Set();
  const collector = message.createMessageComponentCollector({
    filter: (i) => i.customId === `urebet-${buttonId}`,
    time: timeoutMs,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (usedUserIds.has(buttonInteraction.user.id)) {
      await buttonInteraction.reply({ content: "You've already used this Rebet button.", ephemeral: true });
      return;
    }

    const { guildId, user } = buttonInteraction;
    const userId = user.id;

    const lastBet = getMostRecentBet(guildId, userId);
    if (!lastBet) {
      await buttonInteraction.reply({ content: "You haven't placed a bet on Blackjack, Slots, Roulette, Dice, or Champion yet — nothing to rebet.", ephemeral: true });
      return;
    }

    
    
    
    
    
    
    
    
    
    
    
    
    

    const activeLabel = getActiveLabel(guildId, userId);
    if (activeLabel) {
      usedUserIds.add(userId);
      await buttonInteraction.reply({
        content: `You already have **${activeLabel}** in progress — finish it (or let it time out) before rebetting.`,
        ephemeral: true,
      });
      return;
    }

    const cooldown = lastBet.game === 'champion' ? { onCooldown: false } : checkGameCooldown(guildId, userId, lastBet.game);
    if (cooldown.onCooldown) {
      const waitMs = cooldown.readyAt - Date.now();
      await buttonInteraction.reply({
        content: `**${lastBet.game}** is still on cooldown for you — ready ${formatDuration(waitMs)} from now.`,
        ephemeral: true,
      });
      return;
    }

    
    
    
    
    const rawBet = lastBet.game === 'champion' ? lastBet.options.wager : lastBet.options.bet;
    const currentBalance = lastBet.game === 'champion' ? getArenaBalance(guildId, userId) : getBalance(guildId, userId).cash;
    const resolvedAmount = resolveWagerAmount(String(rawBet).trim().toLowerCase(), currentBalance) ?? 0;
    const affordable = resolvedAmount > 0 && resolvedAmount <= currentBalance;
    if (!affordable) {
      usedUserIds.add(userId); 
      const currencyLabel = lastBet.game === 'champion' ? 'arena coins' : 'cash';
      await buttonInteraction.reply({ content: `You don't have enough ${currencyLabel} to rebet **${rawBet}** on ${lastBet.game} right now.`, ephemeral: true });
      return;
    }

    usedUserIds.add(userId);
    try {
      const gameModule = await GAME_MODULES[lastBet.game]();
      const fakeInteraction = buildRebetInteraction(buttonInteraction, lastBet.options);
      await gameModule.execute(fakeInteraction);
    } catch (err) {
      
      
      
      
      
      usedUserIds.delete(userId);
      console.error(`Universal rebet failed for ${userId} on ${lastBet.game}:`, err);
      await buttonInteraction.reply({ content: 'Something went wrong rebetting that — try the button again.', ephemeral: true }).catch(() => {});
    }
  });

  collector.on('end', async () => {
    try {
      await message.edit({ components: [buildUniversalRebetRow(buttonId, true)] });
    } catch {
      
    }
  });
}
