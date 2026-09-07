import db from '../database.js';
import { ensureUser, ensureGuild } from './economy.js';
import { addArenaCoins, getArenaBalance } from './arena.js';
import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import { getGladiatorRow, endGladiatorAdventure } from './gladiator.js';
import { GLOBAL_ID } from './globalId.js';

const stmtSetCashBank = db.prepare(
  'UPDATE users SET cash = ?, bank = ?, wealth_peak = 0, wealth_peak_at = 0 WHERE guild_id = ? AND user_id = ?'
);
const stmtDeleteInstances = db.prepare('DELETE FROM item_instances WHERE guild_id = ? AND user_id = ?');
const stmtDeleteInventoryStacks = db.prepare('DELETE FROM inventory WHERE guild_id = ? AND user_id = ?');
const stmtClearEquipment = db.prepare(`
  UPDATE equipment SET helmet = NULL, chest = NULL, legs = NULL, boots = NULL, gloves = NULL, main_hand = NULL, off_hand = NULL
  WHERE guild_id = ? AND user_id = ?
`);
const stmtDeleteLoadouts = db.prepare('DELETE FROM loadouts WHERE guild_id = ? AND user_id = ?');
const stmtSetGladiatorXp = db.prepare('UPDATE gladiators SET xp = ?, maxed_reward_granted = 0 WHERE guild_id = ? AND user_id = ?');
const stmtClearStarterGranted = db.prepare('UPDATE users SET starter_granted = 0 WHERE guild_id = ? AND user_id = ?');

const ARENA_GAMES = ['duel', 'champion', 'champion_bracket_1', 'champion_bracket_2', 'champion_bracket_3', 'champion_bracket_4', 'champion_bracket_5', 'champion_bracket_6'];

const CASINO_GAMES = ['blackjack'];

function deleteGameStatsFor(guildId, userId, games) {
  const placeholders = games.map(() => '?').join(',');
  db.prepare(`DELETE FROM game_stats WHERE guild_id = ? AND user_id = ? AND game IN (${placeholders})`).run(
    guildId,
    userId,
    ...games
  );
}

export const resetUserEconomy = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  const settings = ensureGuild(guildId);
  ensureUser(guildId, userId);
  stmtSetCashBank.run(settings.starting_cash, settings.starting_bank, guildId, userId);
  const currentArena = getArenaBalance(guildId, userId);
  if (currentArena > 0) addArenaCoins(guildId, userId, -currentArena);
});

export const resetUserInventory = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  stmtDeleteInstances.run(guildId, userId);
  stmtDeleteInventoryStacks.run(guildId, userId);
  stmtClearEquipment.run(guildId, userId);
  stmtDeleteLoadouts.run(guildId, userId);
});

export const resetUserGladiator = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  const row = getGladiatorRow(guildId, userId);
  if (!row) return;
  stmtSetGladiatorXp.run(0, guildId, userId);
  if (getOwnedQuantity(guildId, userId, 'laurel_of_the_undying') > 0) {
    addItemToInventory(guildId, userId, 'laurel_of_the_undying', -1);
  }
  if (row.adventure_ends_at > 0) {
    endGladiatorAdventure(guildId, userId);
  }
});

export const resetUserArenaStats = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  deleteGameStatsFor(guildId, userId, ARENA_GAMES);
});

export const resetUserCasinoStats = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  deleteGameStatsFor(guildId, userId, CASINO_GAMES);
});

const stmtDeleteConstructionProjectsForUser = db.prepare('DELETE FROM construction_projects WHERE user_id = ?');
const stmtDeleteConstructionXpForUser = db.prepare("DELETE FROM skill_xp WHERE guild_id = ? AND user_id = ? AND skill_id = 'construction'");

export const resetUserConstruction = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  stmtDeleteConstructionProjectsForUser.run(userId);
  stmtDeleteConstructionXpForUser.run(guildId, userId);
});

export const resetUserStarterClaim = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  ensureUser(guildId, userId);
  stmtClearStarterGranted.run(guildId, userId);
});

export const resetUserEverything = db.transaction((guildId, userId) => {
  guildId = GLOBAL_ID;
  resetUserEconomy(guildId, userId);
  resetUserInventory(guildId, userId);
  resetUserGladiator(guildId, userId);
  resetUserArenaStats(guildId, userId);
  resetUserCasinoStats(guildId, userId);
  resetUserStarterClaim(guildId, userId);
});
