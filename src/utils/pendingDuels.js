import db from '../database.js';

const stmtInsert = db.prepare(`
  INSERT INTO pending_duels (duel_key, guild_id, channel_id, message_id, challenger_id, opponent_id, wager, currency)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtDelete = db.prepare('DELETE FROM pending_duels WHERE duel_key = ?');
const stmtAll = db.prepare('SELECT * FROM pending_duels');

export function recordPendingDuel(duelKey, { guildId, channelId, messageId, challengerId, opponentId, wager, currency }) {
  stmtInsert.run(duelKey, guildId, channelId, messageId, challengerId, opponentId, wager, currency);
}

export function clearPendingDuel(duelKey) {
  stmtDelete.run(duelKey);
}

export function getAllPendingDuels() {
  return stmtAll.all().map((row) => ({
    duelKey: row.duel_key,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    wager: row.wager,
    currency: row.currency,
  }));
}
