import { randomUUID } from 'crypto';
import { EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import { EconomyError, placeBet, addCash, ensureGuild, recordGameResult } from './economy.js';
import { formatMoney, formatDuration } from './format.js';
import { checkGameCooldown, recordGamePlay } from './gameCooldowns.js';
import { buildUniversalRebetRow, attachUniversalRebetHandler, attachDoubleDownHandler, recordBetOutcome, canDoubleDown } from './rebet.js';

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

export function getColor(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

export const COLOR_EMOJI = { red: '🔴', black: '⚫', green: '🟢' };

export const PAYOUT_MULTIPLIER = {
  number: 35,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1, 
  high: 1, 
  dozen1: 2, 
  dozen2: 2, 
  dozen3: 2, 
  col1: 2, 
  col2: 2, 
  col3: 2, 
};

export const PICK_LABEL = {
  number: (n) => `Number ${n}`,
  red: () => 'Red',
  black: () => 'Black',
  odd: () => 'Odd',
  even: () => 'Even',
  low: () => 'Low (1-18)',
  high: () => 'High (19-36)',
  dozen1: () => '1st Dozen (1-12)',
  dozen2: () => '2nd Dozen (13-24)',
  dozen3: () => '3rd Dozen (25-36)',
  col1: () => '1st Column',
  col2: () => '2nd Column',
  col3: () => '3rd Column',
};

export function isWinningPick(landedNumber, pickType, pickNumber) {
  switch (pickType) {
    case 'number':
      return landedNumber === pickNumber;
    case 'red':
      return getColor(landedNumber) === 'red';
    case 'black':
      return getColor(landedNumber) === 'black';
    case 'odd':
      return landedNumber !== 0 && landedNumber % 2 === 1;
    case 'even':
      return landedNumber !== 0 && landedNumber % 2 === 0;
    case 'low':
      return landedNumber >= 1 && landedNumber <= 18;
    case 'high':
      return landedNumber >= 19 && landedNumber <= 36;
    case 'dozen1':
      return landedNumber >= 1 && landedNumber <= 12;
    case 'dozen2':
      return landedNumber >= 13 && landedNumber <= 24;
    case 'dozen3':
      return landedNumber >= 25 && landedNumber <= 36;
    case 'col1':
      return landedNumber !== 0 && landedNumber % 3 === 1;
    case 'col2':
      return landedNumber !== 0 && landedNumber % 3 === 2;
    case 'col3':
      return landedNumber !== 0 && landedNumber % 3 === 0;
    default:
      return false;
  }
}

export function validatePick(pickType, pickNumber) {
  if (!Object.prototype.hasOwnProperty.call(PAYOUT_MULTIPLIER, pickType)) {
    throw new EconomyError(`\`${pickType}\` isn't a valid bet type.`);
  }
  if (pickType === 'number') {
    if (!Number.isInteger(pickNumber) || pickNumber < 0 || pickNumber > 36) {
      throw new EconomyError('For a Number bet, pick a whole number from 0 to 36.');
    }
  }
}

const stmtFindOpenRound = db.prepare(
  'SELECT * FROM roulette_rounds WHERE guild_id = ? AND channel_id = ? AND resolved = 0'
);
const stmtInsertRound = db.prepare(
  'INSERT INTO roulette_rounds (round_id, guild_id, channel_id, opened_at, closes_at) VALUES (?, ?, ?, ?, ?)'
);
const stmtExtendRound = db.prepare('UPDATE roulette_rounds SET closes_at = ? WHERE round_id = ?');
const stmtMarkResolved = db.prepare('UPDATE roulette_rounds SET resolved = 1 WHERE round_id = ? AND resolved = 0');
const stmtGetRound = db.prepare('SELECT * FROM roulette_rounds WHERE round_id = ?');
const stmtInsertBet = db.prepare(
  'INSERT INTO roulette_bets (round_id, guild_id, user_id, amount, pick_type, pick_number) VALUES (?, ?, ?, ?, ?, ?)'
);
const stmtGetBetsForRound = db.prepare('SELECT * FROM roulette_bets WHERE round_id = ?');
const stmtGetOpenRounds = db.prepare('SELECT * FROM roulette_rounds WHERE resolved = 0');

export const placeRouletteBet = db.transaction((guildId, channelId, userId, amount, pickType, pickNumber) => {
  const settings = ensureGuild(guildId);

  const cooldown = checkGameCooldown(guildId, userId, 'roulette');
  if (cooldown.onCooldown) {
    throw new EconomyError(`Slow down — you can bet again in **${formatDuration(cooldown.readyAt - Date.now())}**.`);
  }

  if (!Number.isInteger(amount) || amount < settings.roulette_min_bet) {
    throw new EconomyError(`Bet must be a whole number of at least **${settings.roulette_min_bet.toLocaleString('en-US')}**.`);
  }
  validatePick(pickType, pickNumber);

  placeBet(guildId, userId, amount);
  recordGamePlay(guildId, userId, 'roulette');

  const now = Date.now();
  const windowMs = settings.roulette_bet_window_seconds * 1000;
  const maxRoundMs = settings.roulette_max_round_seconds * 1000;

  let round = stmtFindOpenRound.get(guildId, channelId);
  let isNewRound = false;
  let closesAt;

  if (!round) {
    isNewRound = true;
    closesAt = now + windowMs;
    const roundId = randomUUID();
    stmtInsertRound.run(roundId, guildId, channelId, now, closesAt);
    round = { round_id: roundId, opened_at: now };
  } else {
    
    
    const hardCap = round.opened_at + maxRoundMs;
    closesAt = Math.min(now + windowMs, hardCap);
    stmtExtendRound.run(closesAt, round.round_id);
  }

  stmtInsertBet.run(round.round_id, guildId, userId, amount, pickType, pickType === 'number' ? pickNumber : null);

  return { roundId: round.round_id, closesAt, isNewRound };
});

export function getOpenRounds() {
  return stmtGetOpenRounds.all();
}

const activeTimers = new Map();

const roundMessages = new Map();

export function recordRoundMessage(roundId, channelId, messageId) {
  if (!roundMessages.has(roundId)) roundMessages.set(roundId, []);
  roundMessages.get(roundId).push({ channelId, messageId });
}

export function takeRoundMessages(roundId) {
  const messages = roundMessages.get(roundId) ?? [];
  roundMessages.delete(roundId);
  return messages;
}

export function clearRoundMessages(roundId) {
  roundMessages.delete(roundId);
}

const tickTimers = new Map(); 
const TICK_INTERVAL_MS = 3000;

export const COUNTDOWN_LINE_PREFIX = '\nTime remaining: ';

export function replaceCountdownLine(description, replacementText) {
  const idx = description.indexOf(COUNTDOWN_LINE_PREFIX);
  if (idx === -1) return description;
  return description.slice(0, idx) + '\n' + replacementText;
}

export function stopTicking(roundId) {
  const existing = tickTimers.get(roundId);
  if (existing) {
    clearInterval(existing);
    tickTimers.delete(roundId);
  }
}

export function startTicking(message, roundId, closesAt, buildEmbed) {
  stopTicking(roundId); 

  const tick = async () => {
    const secondsLeft = Math.max(0, Math.round((closesAt - Date.now()) / 1000));
    if (secondsLeft <= 0) {
      stopTicking(roundId);
      return;
    }
    try {
      await message.edit({ embeds: [buildEmbed(secondsLeft)] });
    } catch {
      
      
      
      
    }
  };

  const interval = setInterval(tick, TICK_INTERVAL_MS);
  tickTimers.set(roundId, interval);
}

export function scheduleRoundResolution(client, roundId, closesAt) {
  const existing = activeTimers.get(roundId);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, closesAt - Date.now());
  const timer = setTimeout(() => {
    activeTimers.delete(roundId);
    resolveRouletteRound(client, roundId).catch((err) => {
      console.error(`Failed to resolve roulette round ${roundId}:`, err);
    });
  }, delay);
  activeTimers.set(roundId, timer);
}

export async function resolveRouletteRound(client, roundId) {
  const round = stmtGetRound.get(roundId);
  if (!round) return null;

  const marked = stmtMarkResolved.run(roundId);
  if (marked.changes === 0) return null; 
  stopTicking(roundId); 

  
  
  
  
  
  
  for (const { channelId, messageId } of takeRoundMessages(roundId)) {
    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
      const existingEmbed = message.embeds[0];
      if (existingEmbed) {
        const newDescription = replaceCountdownLine(existingEmbed.description ?? '', '🎲 **Round over!** Results below.');
        const updatedEmbed = EmbedBuilder.from(existingEmbed).setDescription(newDescription);
        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch {

      
    }
  }

  const bets = stmtGetBetsForRound.all(roundId);
  const landedNumber = Math.floor(Math.random() * 37); 
  const landedColor = getColor(landedNumber);
  const settings = ensureGuild(round.guild_id);

  const playerResults = new Map(); 

  for (const bet of bets) {
    const won = isWinningPick(landedNumber, bet.pick_type, bet.pick_number);
    const profit = won ? bet.amount * PAYOUT_MULTIPLIER[bet.pick_type] : 0;
    if (won) addCash(round.guild_id, bet.user_id, bet.amount + profit, 'roulette');
    recordGameResult(round.guild_id, bet.user_id, 'roulette', { outcome: won ? 'win' : 'loss', net: won ? profit : -bet.amount });

    const pickLabel = PICK_LABEL[bet.pick_type](bet.pick_number);
    if (!playerResults.has(bet.user_id)) playerResults.set(bet.user_id, { net: 0, details: [] });
    const entry = playerResults.get(bet.user_id);
    entry.net += won ? profit : -bet.amount;
    entry.details.push({ pickLabel, won, amount: bet.amount, profit });
  }

  
  
  
  
  
  
  for (const [userId, { net }] of playerResults) {
    recordBetOutcome(userId, net > 0 ? 'win' : net < 0 ? 'loss' : 'push');
  }

  try {
    const channel = await client.channels.fetch(round.channel_id);
    const payload = buildResultsMessage({ landedNumber, landedColor, playerResults, settings });
    const posted = await channel.send(payload);
    if (payload.__rebetButtonId) attachUniversalRebetHandler(posted, payload.__rebetButtonId);
    if (payload.__doubleDownButtonId) attachDoubleDownHandler(posted, payload.__doubleDownButtonId, payload.__doubleDownOwnerId);
  } catch (err) {
    console.error(`Couldn't post roulette results for round ${roundId} (channel gone?):`, err.message);
  }

  return { landedNumber, landedColor, playerResults };
}

export const refundStrandedRound = db.transaction((roundId) => {
  const marked = stmtMarkResolved.run(roundId);
  if (marked.changes === 0) return []; 
  const bets = stmtGetBetsForRound.all(roundId);
  for (const bet of bets) {
    addCash(bet.guild_id, bet.user_id, bet.amount);
  }
  return bets;
});

const DETAILED_PLAYER_LIMIT = 8;

function buildResultsMessage({ landedNumber, landedColor, playerResults, settings }) {
  const players = [...playerResults.entries()];
  const anyWinners = players.some(([, p]) => p.net > 0);
  const anyLosers = players.some(([, p]) => p.net <= 0);

  let summaryLine;
  let color;
  if (players.length === 0) {
    summaryLine = '*(No bets were placed this round.)*';
    color = 0x95a5a6;
  } else if (anyWinners && anyLosers) {
    summaryLine = '✅❌ We have winners and losers this round!';
    color = 0xf1c40f;
  } else if (anyWinners) {
    summaryLine = '✅ We have winners this round!';
    color = 0x2ecc71;
  } else {
    summaryLine = '❌ No winners this round.';
    color = 0xe74c3c;
  }

  const embed = new EmbedBuilder().setColor(color).setTitle('🎰 Roulette Results').setDescription(summaryLine);

  if (players.length > 0 && players.length <= DETAILED_PLAYER_LIMIT) {
    
    
    
    for (const [userId, { net, details }] of players) {
      const netLabel = net > 0 ? `Won **${formatMoney(net, settings)}** net` : net < 0 ? `Lost **${formatMoney(-net, settings)}** net` : 'Broke even';
      const betLines = details.map((d) => {
        const marker = d.won ? '✅' : '❌';
        const amount = d.won ? d.profit : d.amount;
        const sign = d.won ? '+' : '-';
        return `${marker} ${d.pickLabel} — ${sign}${formatMoney(amount, settings)}`;
      });
      
      
      
      
      
      
      embed.addFields({ name: 'Player', value: [`<@${userId}>`, netLabel, ...betLines].join('\n'), inline: false });
    }
  } else if (players.length > DETAILED_PLAYER_LIMIT) {
    
    
    
    const lines = players.map(([userId, { net, details }]) => {
      const marker = net > 0 ? '✅' : net < 0 ? '❌' : '➖';
      const netLabel = net > 0 ? `won **${formatMoney(net, settings)}** net` : net < 0 ? `lost **${formatMoney(-net, settings)}** net` : 'broke even';
      const picks = details.map((d) => d.pickLabel).join(', ');
      return `${marker} <@${userId}> ${netLabel} (${picks})`;
    });
    embed.addFields({ name: `Results (${players.length} players)`, value: lines.join('\n'), inline: false });
  }

  
  
  
  embed.addFields({
    name: '\u200b',
    value: `${COLOR_EMOJI[landedColor]} The ball landed on ${landedColor === 'green' ? '' : landedColor + ' '}**${landedNumber}**`,
    inline: false,
  });

  
  
  
  
  
  
  const isSoloRound = players.length === 1;
  const soloResult = isSoloRound ? players[0][1] : null;
  const soloUserId = isSoloRound ? players[0][0] : null;
  const showDoubleDown = isSoloRound && soloResult.net <= 0 && canDoubleDown(soloUserId);

  const rebetButtonId = `roulette-${Date.now()}`;
  const rows = [];
  if (players.length > 0) {
    const rebetRow = buildUniversalRebetRow(rebetButtonId);
    if (showDoubleDown) {
      rebetRow.addComponents(new ButtonBuilder().setCustomId(`udouble-${rebetButtonId}`).setLabel('⚔️ Double Down').setStyle(ButtonStyle.Danger));
    }
    rows.push(rebetRow);
  }
  return {
    embeds: [embed],
    components: rows,
    __rebetButtonId: rows.length > 0 ? rebetButtonId : null,
    __doubleDownButtonId: showDoubleDown ? rebetButtonId : null,
    __doubleDownOwnerId: showDoubleDown ? soloUserId : null,
  };
}
