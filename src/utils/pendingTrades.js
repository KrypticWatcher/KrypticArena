import db from '../database.js';

const stmtInsert = db.prepare(`
  INSERT INTO pending_trades (trade_key, guild_id, channel_id, message_id, initiator_id, target_id, send_side_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtDelete = db.prepare('DELETE FROM pending_trades WHERE trade_key = ?');
const stmtAll = db.prepare('SELECT * FROM pending_trades');

export function recordPendingTrade(tradeKey, { guildId, channelId, messageId, initiatorId, targetId, sendSide }) {
  stmtInsert.run(tradeKey, guildId, channelId, messageId, initiatorId, targetId, JSON.stringify(sendSide));
}

export function clearPendingTrade(tradeKey) {
  stmtDelete.run(tradeKey);
}

export function getAllPendingTrades() {
  return stmtAll.all().map((row) => ({
    tradeKey: row.trade_key,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    initiatorId: row.initiator_id,
    targetId: row.target_id,
    sendSide: JSON.parse(row.send_side_json),
  }));
}
