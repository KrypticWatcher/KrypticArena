import { getGameStats } from './economy.js';
import { CHAMPION_BRACKETS } from './championBrackets.js';

const RANK_WINS_REQUIRED = [150, 90, 60, 35, 20, 10];
const RANK_NAMES = ['Recruit', 'Fighter', 'Veteran', 'Gladiator', 'Champion', 'Legend'];

export const RANKS = CHAMPION_BRACKETS.map((bracket, i) => ({
  name: RANK_NAMES[i],
  bracket,
  winsRequired: RANK_WINS_REQUIRED[i],
}));

export const LOSER_TITLES = [
  { name: 'Practice Dummy', minLosses: 25 },
  { name: 'Human Punching Bag', minLosses: 50 },
  { name: 'Professional Loser', minLosses: 100 },
  { name: "Arena's Favorite Donor", minLosses: 200 },
];

function findHighestTier(tiers, key, value) {
  let current = null;
  for (const tier of tiers) {
    if (value >= tier[key]) current = tier;
  }
  return current;
}

export function getArenaRankInfo(guildId, userId) {
  const stats = getGameStats(guildId, userId);
  const statByGame = Object.fromEntries(stats.map((s) => [s.game, s]));

  const duelStats = statByGame['duel'];
  const championStats = statByGame['champion'];
  const wins = (duelStats?.wins ?? 0) + (championStats?.wins ?? 0);
  const losses = (duelStats?.losses ?? 0) + (championStats?.losses ?? 0);

  
  
  
  
  let achievedRank = null;
  let nextRank = null;
  for (const tier of RANKS) {
    const bracketWins = statByGame[`champion_bracket_${tier.bracket.order}`]?.wins ?? 0;
    if (nextRank) break;
    if (bracketWins >= tier.winsRequired) {
      achievedRank = tier;
    } else {
      nextRank = tier;
    }
  }

  const loserTier = findHighestTier(LOSER_TITLES, 'minLosses', losses);

  return {
    wins,
    losses,
    rank: achievedRank?.name ?? 'Unranked',
    nextRank: nextRank?.name ?? null,
    nextRankBracket: nextRank?.bracket.name ?? null,
    winsToNextRank: nextRank
      ? nextRank.winsRequired - (statByGame[`champion_bracket_${nextRank.bracket.order}`]?.wins ?? 0)
      : null,
    loserTitle: loserTier?.name ?? null,
  };
}
