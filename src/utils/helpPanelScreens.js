import { ensureGuild } from './economy.js';
import { buildPanelEmbed, buildButtonRows, backButton } from './panel.js';
import { buildBlackjackHelp, buildRouletteHelp, buildDiceHelp, buildSlotsHelp } from './gameHelp.js';
import { ButtonStyle } from 'discord.js';

const HELP_COLOR = 0xd4af37;

const WIKI_URL = 'https://krypticarena.miraheze.org/';

export function buildHelpTopPanel(userId) {
  const embed = buildPanelEmbed({
    title: '🏛️ Help & Guide',
    description: 'Select a category below.',
    color: HELP_COLOR,
  });
  const buttons = [
    { targetUserId: userId, screen: 'help-arena', action: '', label: '🏛️ Arena & Gladiator' },
    { targetUserId: userId, screen: 'help-blackjack', action: '', label: '🃏 Blackjack' },
    { targetUserId: userId, screen: 'help-roulette', action: '', label: '🎡 Roulette' },
    { targetUserId: userId, screen: 'help-dice', action: '', label: '🎲 Dice' },
    { targetUserId: userId, screen: 'help-slots', action: '', label: '🎰 Slots' },
    
    
    
    { label: '📖 Wiki', url: WIKI_URL, style: ButtonStyle.Danger },
    { targetUserId: userId, screen: 'help-close', action: '', label: '❌ Close' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildHelpArenaPanel(userId) {
  const embed = buildPanelEmbed({
    title: '🏛️ Getting Started',
    color: HELP_COLOR,
    description:
      '`/starter` — claim your one-time starter kit.\n' +
      '`/claim` — collect from any passive-income collectibles you own.\n' +
      '`/equip` — gear up (`/bis` auto-equips your best owned gear).\n' +
      '`/quest` — send your Gladiator out to start earning XP and gear.\n\n' +
      'For everything else — Champion, Duels, currency, equipment mechanics, and more — check the wiki from the main /help menu.',
  });
  const buttons = [
    backButton(userId, 'help-top'),
    { targetUserId: userId, screen: 'help-close', action: '', label: '❌ Close' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

function buildGameHelpScreen(userId, screen, embed) {
  const buttons = [
    backButton(userId, 'help-top'),
    { targetUserId: userId, screen: 'help-close', action: '', label: '❌ Close' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildHelpBlackjackPanel(guildId, userId) {
  return buildGameHelpScreen(userId, 'help-blackjack', buildBlackjackHelp(ensureGuild(guildId)));
}

export function buildHelpRoulettePanel(guildId, userId) {
  return buildGameHelpScreen(userId, 'help-roulette', buildRouletteHelp(ensureGuild(guildId)));
}

export function buildHelpDicePanel(guildId, userId) {
  return buildGameHelpScreen(userId, 'help-dice', buildDiceHelp(ensureGuild(guildId)));
}

export function buildHelpSlotsPanel(guildId, userId) {
  return buildGameHelpScreen(userId, 'help-slots', buildSlotsHelp(ensureGuild(guildId)));
}
