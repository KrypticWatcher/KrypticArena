import { EconomyError, ensureUser, getArenaBalance, addArenaCoins, addCash } from './economy.js';
import {
  computeMaxHp,
  rollFirstTurn,
  resolveAttack,
  isFatiguedRound,
  FRENZY_DURATION_TURNS,
} from './beastPitsCombat.js';

export const TOTAL_ROUNDS = 15;

function checkRoundLimit(match) {
  if (match.round > TOTAL_ROUNDS) {
    match.status = 'finished';
    
    
    
    
    
    
    
    const pctA = match.players[0].currentHp / match.players[0].maxHp;
    const pctB = match.players[1].currentHp / match.players[1].maxHp;
    if (pctA === pctB) {
      match.isDraw = true;
    } else {
      match.winnerIndex = pctA > pctB ? 0 : 1;
    }
  }
}

export function createMatch(petA, petB) {
  const firstIsA = rollFirstTurn(petA.speed, petB.speed) === 'a';
  const players = [petA, petB].map((pet) => ({
    userId: pet.userId,
    instanceId: pet.instanceId,
    displayName: pet.displayName,
    speciesName: pet.speciesName,
    imagePath: pet.imagePath ?? null, 
    attack: pet.attack,
    defense: pet.defense,
    vitality: pet.vitality,
    speed: pet.speed,
    maxHp: computeMaxHp(pet.vitality),
    currentHp: computeMaxHp(pet.vitality),
    isGuarding: false,
    frenzyTurnsRemaining: 0,
    isResting: false,
    hasUsedFrenzy: false, 
    
    
    
    
    
    
    
    
    hasSecondWind: pet.shinyAbilityType === 'pvp_survive_fatal',
    usedSecondWind: false,
    hasApexPredator: pet.shinyAbilityType === 'pvp_first_hit_double',
    
    
    
    
    
    hasNetherchargedRoar: pet.shinyAbilityType === 'nethercharged_roar',
    
    
    
    
    
    abilityName: pet.shinyAbilityName ?? null,
    
    
    
    
    shinyAbilityPercent: pet.shiny_ability_percent ?? 0,
    hasTakenFirstTurn: false, 
    buffedDamageThisTurn: false, 
  }));
  return {
    players,
    round: 1,
    actionsThisRound: 0,
    activePlayerIndex: firstIsA ? 0 : 1,
    status: 'active',
    winnerIndex: null,
    isDraw: false,
    lastTurn: null, 
  };
}

export function rollFirstTurnAbility(match) {
  const attacker = match.players[match.activePlayerIndex];
  const hasFirstTurnAbility = attacker.hasApexPredator || attacker.hasNetherchargedRoar;
  if (!hasFirstTurnAbility || attacker.hasTakenFirstTurn) return null;

  attacker.hasTakenFirstTurn = true;
  const triggered = Math.random() < attacker.shinyAbilityPercent / 100;
  if (triggered) attacker.buffedDamageThisTurn = true;

  return {
    triggered,
    isApexPredator: attacker.hasApexPredator,
    isNethercharged: attacker.hasNetherchargedRoar,
    abilityName: attacker.abilityName,
    attackerIndex: match.activePlayerIndex,
  };
}

export function resolveAction(match, action) {
  if (match.status !== 'active') return match;

  const attackerIndex = match.activePlayerIndex;
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  
  
  
  
  
  
  
  
  if (attacker.isGuarding) attacker.isGuarding = false;

  const attackerFatigued = isFatiguedRound(match.round, TOTAL_ROUNDS);
  const defenderFatigued = attackerFatigued; 

  let turnSummary = { attackerIndex, defenderIndex, action, round: match.round };

  
  
  
  
  
  
  
  
  if (action === 'guard') {
    
    
    
    
    attacker.isGuarding = true;
    turnSummary = { ...turnSummary, hit: null, damage: 0 };
  } else {
    
    
    
    
    
    
    const startingFrenzyNow = action === 'frenzy';
    if (startingFrenzyNow) {
      attacker.frenzyTurnsRemaining = FRENZY_DURATION_TURNS;
      attacker.hasUsedFrenzy = true;
    }
    const isFrenzied = attacker.frenzyTurnsRemaining > 0;

    const result = resolveAttack({
      attackerAttack: attacker.attack,
      attackerSpeed: attacker.speed,
      defenderDefense: defender.defense,
      defenderSpeed: defender.speed,
      isFrenzied,
      isFatiguedAttacker: attackerFatigued,
      isFatiguedDefender: defenderFatigued,
      isDefenderGuarding: defender.isGuarding,
    });

    
    
    
    
    
    if (result.hit && attacker.buffedDamageThisTurn) result.damage *= 2;

    if (result.hit) {
      const wouldBeFatal = result.damage >= defender.currentHp;
      
      
      
      
      
      
      
      
      
      
      
      if (wouldBeFatal && defender.hasSecondWind && !defender.usedSecondWind) {
        defender.usedSecondWind = true;
        if (Math.random() < defender.shinyAbilityPercent / 100) {
          defender.currentHp = Math.round(defender.maxHp * 0.25);
          turnSummary.secondWindTriggered = true;
        } else {
          defender.currentHp = 0;
        }
      } else {
        defender.currentHp = Math.max(0, defender.currentHp - result.damage);
      }
      if (defender.isGuarding) defender.isGuarding = false; 
    }
    
    
    
    
    
    
    
    if (isFrenzied) {
      attacker.frenzyTurnsRemaining -= 1;
      if (attacker.frenzyTurnsRemaining === 0) attacker.isResting = true;
    }

    turnSummary = {
      ...turnSummary,
      isFrenzied,
      ...result,
    };
  }

  
  
  
  
  
  attacker.buffedDamageThisTurn = false;

  match.lastTurn = turnSummary;

  
  
  if (defender.currentHp <= 0) {
    match.status = 'finished';
    match.winnerIndex = attackerIndex;
    return match;
  }

  match.actionsThisRound += 1;
  if (match.actionsThisRound >= 2) {
    match.actionsThisRound = 0;
    match.round += 1;
  }
  match.activePlayerIndex = defenderIndex;

  
  
  checkRoundLimit(match);

  return match;
}

export function isPlayersTurn(match, userId) {
  return match.status === 'active' && match.players[match.activePlayerIndex].userId === userId;
}

export function getAvailableActions(match) {
  const active = match.players[match.activePlayerIndex];
  if (active.isResting) return [];
  if (active.frenzyTurnsRemaining > 0) return ['attack'];
  return active.hasUsedFrenzy ? ['attack', 'guard'] : ['attack', 'guard', 'frenzy'];
}

export function resolveRestTurn(match) {
  if (match.status !== 'active') return match;
  const activeIndex = match.activePlayerIndex;
  const active = match.players[activeIndex];
  active.isResting = false;
  
  
  if (active.isGuarding) active.isGuarding = false;

  match.lastTurn = { attackerIndex: activeIndex, defenderIndex: activeIndex === 0 ? 1 : 0, action: 'rest', round: match.round, hit: null, damage: 0 };

  match.actionsThisRound += 1;
  if (match.actionsThisRound >= 2) {
    match.actionsThisRound = 0;
    match.round += 1;
  }
  match.activePlayerIndex = activeIndex === 0 ? 1 : 0;

  checkRoundLimit(match);

  return match;
}

export function formatRestTurnLine(match) {
  const resting = match.players[match.lastTurn.attackerIndex];
  return `${resting.displayName} needs to rest after its frenzy.`;
}

export const BEAST_PITS_WAGER_CURRENCIES = ['arena', 'gambling'];

function assertValidWagerCurrency(currency) {
  if (!BEAST_PITS_WAGER_CURRENCIES.includes(currency)) {
    throw new EconomyError(`\`${currency}\` isn't a valid wager currency.`);
  }
}

function getWagerBalance(guildId, userId, currency) {
  return currency === 'arena' ? getArenaBalance(guildId, userId) : ensureUser(guildId, userId).cash;
}

function debitWager(guildId, userId, currency, amount) {
  return currency === 'arena' ? addArenaCoins(guildId, userId, -amount) : addCash(guildId, userId, -amount);
}

function creditWager(guildId, userId, currency, amount, source) {
  return currency === 'arena' ? addArenaCoins(guildId, userId, amount, source) : addCash(guildId, userId, amount, source);
}

export function createBeastPitsWager(guildId, userId, amount, currency) {
  assertValidWagerCurrency(currency);
  if (!Number.isInteger(amount) || amount < 1) {
    throw new EconomyError('Beast Pits wagers must be a positive whole number.');
  }
  const balance = getWagerBalance(guildId, userId, currency);
  const label = currency === 'arena' ? 'arena coin(s)' : 'cash';
  if (balance < amount) {
    throw new EconomyError(`You only have **${balance.toLocaleString('en-US')}** ${label} — not enough to wager **${amount.toLocaleString('en-US')}**.`);
  }
  debitWager(guildId, userId, currency, amount);
}

export function refundBeastPitsWager(guildId, userId, amount, currency) {
  creditWager(guildId, userId, currency, amount);
}

export function matchBeastPitsWager(guildId, userId, amount, currency) {
  const balance = getWagerBalance(guildId, userId, currency);
  const label = currency === 'arena' ? 'arena coin(s)' : 'cash';
  if (balance < amount) {
    throw new EconomyError(`You only have **${balance.toLocaleString('en-US')}** ${label} — not enough to match the **${amount.toLocaleString('en-US')}** wager.`);
  }
  debitWager(guildId, userId, currency, amount);
}

export function payoutBeastPitsWager(guildId, winnerId, amount, currency, source) {
  creditWager(guildId, winnerId, currency, amount * 2, source);
}
