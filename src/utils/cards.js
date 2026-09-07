import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let CARD_EMOJIS = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'cardEmojis.json'), 'utf8');
  CARD_EMOJIS = JSON.parse(raw);
} catch {
  
  
}

const SUITS = [
  { key: 'spades', symbol: '♠' },
  { key: 'hearts', symbol: '♥' },
  { key: 'diamonds', symbol: '♦' },
  { key: 'clubs', symbol: '♣' },
];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const RANK_TO_EMOJI_PART = { A: 'a', J: 'j', Q: 'q', K: 'k' }; 
const SUIT_TO_EMOJI_PART = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };

function cardEmojiTag(card) {
  const rankPart = RANK_TO_EMOJI_PART[card.rank] ?? card.rank;
  const suitPart = SUIT_TO_EMOJI_PART[card.suit];
  const name = `bj_${rankPart}${suitPart}`;
  const id = CARD_EMOJIS[name];
  return id ? `<:${name}:${id}>` : null;
}

function cardBackEmojiTag() {
  const id = CARD_EMOJIS['bj_back'];
  return id ? `<:bj_back:${id}>` : null;
}

export function createDeck(numDecks = 1) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit: suit.key });
      }
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function drawCard(deck) {
  if (deck.length === 0) throw new Error('Deck is empty — this should never happen with a properly sized shoe.');
  return deck.pop();
}

export function formatCard(card) {
  const emoji = cardEmojiTag(card);
  if (emoji) return emoji;
  const suit = SUITS.find((s) => s.key === card.suit);
  return `${card.rank}${suit.symbol}`;
}

export function formatHand(cards) {
  return cards.map(formatCard).join(' ');
}

export function formatHandCompact(cards, hiddenIndices = []) {
  return cards
    .map((card, idx) => (hiddenIndices.includes(idx) ? cardBackEmojiTag() ?? '??' : formatCard(card)))
    .join(' ');
}

const CARD_WIDTH = 2; 

const MAX_CARDS_PER_ROW = 4;
const TOP = `┌${'─'.repeat(CARD_WIDTH)}┐`;
const BOTTOM = `└${'─'.repeat(CARD_WIDTH)}┘`;

function centered(text) {
  const totalPad = CARD_WIDTH - text.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(Math.max(left, 0)) + text + ' '.repeat(Math.max(right, 0));
}

function cardArtLines(card) {
  const suit = SUITS.find((s) => s.key === card.suit);
  const rank = card.rank;
  return [
    TOP,
    `│${rank.padEnd(CARD_WIDTH)}│`,
    `│${centered(suit.symbol)}│`,
    `│${rank.padStart(CARD_WIDTH)}│`,
    BOTTOM,
  ];
}

function cardBackArtLines() {
  const shaded = `│${'░'.repeat(CARD_WIDTH)}│`;
  return [TOP, shaded, shaded, shaded, BOTTOM];
}

export function renderHandArt(cards, hiddenIndices = []) {
  const perCardLines = cards.map((card, idx) =>
    hiddenIndices.includes(idx) ? cardBackArtLines() : cardArtLines(card)
  );

  const rowBlocks = [];
  for (let start = 0; start < perCardLines.length; start += MAX_CARDS_PER_ROW) {
    const rowCards = perCardLines.slice(start, start + MAX_CARDS_PER_ROW);
    const rowLines = [];
    for (let row = 0; row < 5; row++) {
      rowLines.push(rowCards.map((card) => card[row]).join(' '));
    }
    rowBlocks.push(rowLines.join('\n'));
  }

  return rowBlocks.join('\n');
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  let softAcesRemaining = aces;
  while (total > 21 && softAcesRemaining > 0) {
    total -= 10;
    softAcesRemaining -= 1;
  }

  return { total, soft: softAcesRemaining > 0 };
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards) {
  return handValue(cards).total > 21;
}
