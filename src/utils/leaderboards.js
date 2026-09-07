import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { formatMoney, formatArena } from './format.js';
import { levelForXp } from './xp.js';
import { getAllDomains } from '../data/bossDomains.js';
import { MAX_PET_LEVEL } from './pets.js';
import { getAllTrackedItems } from './collectionLogTaxonomy.js';

export const leaderboardTypes = {
  richest: {
    label: 'Richest (Cash + Bank)',
    emoji: '💰',
    query: db.prepare(`
      SELECT user_id, (cash + bank) AS value
      FROM users
      WHERE guild_id = ? AND (cash + bank) > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value, settings) => formatMoney(value, settings),
  },
  
  
  
  
  cash: {
    label: 'Cash on Hand',
    emoji: '💵',
    query: db.prepare(`
      SELECT user_id, cash AS value
      FROM users
      WHERE guild_id = ? AND cash > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value, settings) => formatMoney(value, settings),
  },
  
  arena: {
    label: 'Arena Coins',
    emoji: '🏺',
    query: db.prepare(`
      SELECT user_id, arena_coins AS value
      FROM users
      WHERE guild_id = ? AND arena_coins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => value.toLocaleString('en-US'),
  },
  level: {
    label: 'Gladiator Level',
    emoji: '⭐',
    
    
    
    
    query: db.prepare(`
      SELECT user_id, xp AS value
      FROM gladiators
      WHERE guild_id = ? AND xp > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `Level ${levelForXp(value)}`,
  },
  xp: {
    label: 'Gladiator XP',
    emoji: '✨',
    query: db.prepare(`
      SELECT user_id, xp AS value
      FROM gladiators
      WHERE guild_id = ? AND xp > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} XP`,
  },
  duels: {
    label: 'Most Duel Wins',
    emoji: '⚔️',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'duel' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  champion: {
    label: 'Most Champion Wins (Bracket VI)',
    emoji: '🏆',
    
    
    
    
    
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'champion_bracket_6' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  losses: {
    label: 'Most Duel Losses',
    emoji: '💀',
    query: db.prepare(`
      SELECT user_id, losses AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'duel' AND losses > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} loss${value === 1 ? '' : 'es'}`,
  },
  blackjack: {
    label: 'Most Blackjack Wins',
    emoji: '🃏',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'blackjack' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  roulette: {
    label: 'Most Roulette Wins',
    emoji: '🎡',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'roulette' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  slots: {
    label: 'Most Slots Wins',
    emoji: '🎰',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'slots' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  dice: {
    label: 'Most Dice Wins',
    emoji: '🎲',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'dice' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
  
  
  
  
  
  
  blackjack_losses: {
    label: 'Most Blackjack Losses',
    emoji: '🃏',
    query: db.prepare(`
      SELECT user_id, losses AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'blackjack' AND losses > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} loss${value === 1 ? '' : 'es'}`,
  },
  roulette_losses: {
    label: 'Most Roulette Losses',
    emoji: '🎡',
    query: db.prepare(`
      SELECT user_id, losses AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'roulette' AND losses > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} loss${value === 1 ? '' : 'es'}`,
  },
  slots_losses: {
    label: 'Most Slots Losses',
    emoji: '🎰',
    query: db.prepare(`
      SELECT user_id, losses AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'slots' AND losses > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} loss${value === 1 ? '' : 'es'}`,
  },
  dice_losses: {
    label: 'Most Dice Losses',
    emoji: '🎲',
    query: db.prepare(`
      SELECT user_id, losses AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'dice' AND losses > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} loss${value === 1 ? '' : 'es'}`,
  },

  
  
  
  
  
  
  
  
  
  ...Object.fromEntries(
    getAllDomains().flatMap((domain) =>
      domain.bosses.map((boss) => [
        `boss_kills_${boss.id}`,
        {
          label: `Most ${boss.name} Kills`,
          emoji: '☠️',
          global: true,
          query: db.prepare(`SELECT user_id, kills AS value FROM boss_kills WHERE boss_id = '${boss.id}' AND kills > 0 ORDER BY value DESC LIMIT 10`),
          formatValue: (value) => `${value.toLocaleString('en-US')} kill${value === 1 ? '' : 's'}`,
        },
      ])
    )
  ),
  boss_kills_total: {
    label: 'Most Total Boss Kills (all domains)',
    emoji: '💀',
    global: true,
    query: db.prepare(`
      SELECT user_id, SUM(kills) AS value
      FROM boss_kills
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} kill${value === 1 ? '' : 's'}`,
  },

  
  
  
  
  
  
  
  
  
  
  gamble_currency_gained: {
    label: 'Gamble Currency Gained',
    emoji: '📈',
    global: true,
    query: db.prepare(`
      SELECT user_id, SUM(amount) AS value
      FROM gain_log
      WHERE kind = 'cash' AND amount > 0
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value, settings) => formatMoney(value, settings),
  },
  arena_coins_gained: {
    label: 'Arena Coins Gained',
    emoji: '📈',
    global: true,
    query: db.prepare(`
      SELECT user_id, SUM(amount) AS value
      FROM gain_log
      WHERE kind = 'arena' AND amount > 0
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => formatArena(value),
  },
  gamble_currency_lost: {
    label: 'Gamble Currency Lost',
    emoji: '📉',
    global: true,
    query: db.prepare(`
      SELECT user_id, -SUM(amount) AS value
      FROM gain_log
      WHERE kind = 'cash' AND amount < 0
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value, settings) => formatMoney(value, settings),
  },
  arena_coins_lost: {
    label: 'Arena Coins Lost',
    emoji: '📉',
    global: true,
    query: db.prepare(`
      SELECT user_id, -SUM(amount) AS value
      FROM gain_log
      WHERE kind = 'arena' AND amount < 0
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => formatArena(value),
  },

  
  
  
  
  
  
  
  
  
  pets_maxed_unique: {
    label: 'Most Unique Pets Maxed',
    emoji: '🐾',
    global: true,
    query: db.prepare(`
      SELECT user_id, COUNT(*) AS value
      FROM (
        SELECT DISTINCT user_id, species_id, is_shiny
        FROM pets
        WHERE level >= ${MAX_PET_LEVEL}
      )
      GROUP BY user_id
      HAVING value > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} unique pet${value === 1 ? '' : 's'}`,
  },

  
  
  
  
  
  
  
  
  overall: {
    label: 'Overall',
    emoji: '📖',
    global: true,
    query: (() => {
      const trackedIds = getAllTrackedItems().map((item) => item.id);
      const idList = trackedIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
      const totalTracked = trackedIds.length;
      const stmt = db.prepare(`
        SELECT user_id, COUNT(DISTINCT item_id) AS value
        FROM collection_log
        WHERE item_id IN (${idList}) AND quantity > 0
        GROUP BY user_id
        HAVING value > 0
        ORDER BY value DESC
        LIMIT 10
      `);
      
      
      
      stmt.totalTracked = totalTracked;
      return stmt;
    })(),
    formatValue(value) {
      const total = leaderboardTypes.overall.query.totalTracked;
      return `${((value / total) * 100).toFixed(2)}% (${value}/${total})`;
    },
  },

  beastpits_pvp_wins: {
    label: 'Most Beast Pits PvP Wins',
    emoji: '🐯',
    query: db.prepare(`
      SELECT user_id, wins AS value
      FROM game_stats
      WHERE guild_id = ? AND game = 'beastpits_pvp' AND wins > 0
      ORDER BY value DESC
      LIMIT 10
    `),
    formatValue: (value) => `${value.toLocaleString('en-US')} win${value === 1 ? '' : 's'}`,
  },
};

export function getLeaderboard(type, guildId) {
  guildId = GLOBAL_ID;
  const def = leaderboardTypes[type];
  if (!def) return null;
  
  
  
  
  
  
  const rows = def.global ? def.query.all() : def.query.all(guildId);
  return { def, rows };
}
