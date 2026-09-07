import { ensureGuild } from './economy.js';
import { formatMoney, formatArena, formatDuration } from './format.js';
import { buildPanelEmbed, buildButtonRows, backButton } from './panel.js';
import { CHAMPION_BRACKETS, getBracketMaxWager, getBracketXpModifier, getBracketBaseXp } from './championBrackets.js';

export function buildConfigTopPanel(adminUserId) {
  const embed = buildPanelEmbed({
    title: '⚙️ Server Configuration',
    description: 'Select a category to configure.',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-economy', action: '', label: '💰 Economy' },
    { targetUserId: adminUserId, screen: 'config-casino', action: '', label: '🎰 Casino' },
    { targetUserId: adminUserId, screen: 'config-arena', action: '', label: '⚔️ Arena' },
    { targetUserId: adminUserId, screen: 'config-top', action: 'refresh', label: '🔄 Refresh' },
    { targetUserId: adminUserId, screen: 'config-close', action: '', label: '❌ Close' },
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildEconomyPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '💰 Economy Settings',
    fields: [
      { name: 'Currency Name', value: settings.currency_name, inline: true },
      { name: 'Currency Symbol', value: settings.currency_symbol, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Starting Cash', value: formatMoney(settings.starting_cash, settings), inline: true },
      { name: 'Starting Bank', value: formatMoney(settings.starting_bank, settings), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Rob Cooldown', value: formatDuration(settings.rob_cooldown_seconds * 1000), inline: true },
    ],
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-economy-currency', action: '', label: '💵 Currency' },
    { targetUserId: adminUserId, screen: 'config-economy-balance', action: '', label: '🏦 Starting Balance' },
    backButton(adminUserId, 'config-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildCurrencyPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '💵 Currency Settings',
    fields: [
      { name: 'Current Name', value: settings.currency_name, inline: true },
      { name: 'Current Symbol', value: settings.currency_symbol, inline: true },
    ],
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-economy-currency', action: 'name', label: '✏️ Change Name' },
    { targetUserId: adminUserId, screen: 'config-economy-currency', action: 'symbol', label: '💲 Change Symbol' },
    backButton(adminUserId, 'config-economy'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildStartingBalancePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🏦 Starting Balance',
    fields: [
      { name: 'Cash', value: formatMoney(settings.starting_cash, settings), inline: true },
      { name: 'Bank', value: formatMoney(settings.starting_bank, settings), inline: true },
    ],
    footer: 'Only applies to members who join the economy after this change — existing balances are untouched.',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-economy-balance', action: 'cash', label: '💵 Set Starting Cash' },
    { targetUserId: adminUserId, screen: 'config-economy-balance', action: 'bank', label: '🏦 Set Starting Bank' },
    backButton(adminUserId, 'config-economy'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildCasinoConfigPanel(adminUserId) {
  const embed = buildPanelEmbed({ title: '🎰 Casino Settings', description: 'Select a game to configure.' });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-casino-blackjack', action: '', label: '🃏 Blackjack' },
    { targetUserId: adminUserId, screen: 'config-casino-roulette', action: '', label: '🎡 Roulette' },
    { targetUserId: adminUserId, screen: 'config-casino-slots', action: '', label: '🎰 Slots' },
    { targetUserId: adminUserId, screen: 'config-casino-dice', action: '', label: '🎲 Dice' },
    backButton(adminUserId, 'config-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildBlackjackPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🃏 Blackjack Settings',
    fields: [
      { name: 'Deck Count', value: `${settings.deck_count}`, inline: true },
      { name: 'Side Bets', value: settings.blackjack_side_bets_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Cooldown', value: `${settings.blackjack_cooldown_seconds}s`, inline: true },
    ],
    footer:
      'Deck Count: how many 52-card decks shuffle into one shoe (1-8). Side Bets: turns Perfect Pairs and Insurance on/off together — off means neither is offered. Cooldown: how long a player waits after finishing a hand before starting another (0 disables it).',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-casino-blackjack', action: 'decks', label: '🂠 Deck Count' },
    {
      targetUserId: adminUserId,
      screen: 'config-casino-blackjack',
      action: 'sidebets',
      label: settings.blackjack_side_bets_enabled ? '❌ Disable Side Bets' : '✅ Enable Side Bets',
    },
    { targetUserId: adminUserId, screen: 'config-casino-blackjack', action: 'cooldown', label: '⏱️ Cooldown' },
    backButton(adminUserId, 'config-casino'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildRoulettePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🎡 Roulette Settings',
    fields: [
      { name: 'Betting Window', value: `${settings.roulette_bet_window_seconds}s`, inline: true },
      { name: 'Max Round Length', value: `${settings.roulette_max_round_seconds}s`, inline: true },
      { name: 'Minimum Bet', value: `${settings.roulette_min_bet.toLocaleString('en-US')}`, inline: true },
      { name: 'Cooldown', value: `${settings.roulette_cooldown_seconds}s`, inline: true },
    ],
    footer:
      'Betting Window: how long a round stays open after the LAST bet placed in it. Max Round Length: the hard ceiling on a round\u2019s total length from its very first bet, no matter how many more bets keep extending it. Cooldown: how long a player waits between individual bets (0 disables it).',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-casino-roulette', action: 'window', label: '⏱️ Betting Window' },
    { targetUserId: adminUserId, screen: 'config-casino-roulette', action: 'maxlength', label: '⏳ Max Round Length' },
    { targetUserId: adminUserId, screen: 'config-casino-roulette', action: 'minbet', label: '💵 Minimum Bet' },
    { targetUserId: adminUserId, screen: 'config-casino-roulette', action: 'cooldown', label: '🕑 Cooldown' },
    backButton(adminUserId, 'config-casino'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildSlotsPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🎰 Slots Settings',
    fields: [
      { name: 'Minimum Bet', value: `${settings.slots_min_bet.toLocaleString('en-US')}`, inline: true },
      { name: 'Payout Multiplier', value: `${settings.slots_payout_multiplier_pct}%`, inline: true },
      { name: 'Cooldown', value: `${settings.slots_cooldown_seconds}s`, inline: true },
    ],
    footer:
      'Payout Multiplier scales every symbol\u2019s payout at once (100% = default table, 90% = 10% stingier across the board, 110% = 10% more generous) rather than editing each symbol individually. Cooldown: how long a player waits between spins (0 disables it).',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-casino-slots', action: 'minbet', label: '💵 Minimum Bet' },
    { targetUserId: adminUserId, screen: 'config-casino-slots', action: 'payout', label: '📈 Payout Multiplier' },
    { targetUserId: adminUserId, screen: 'config-casino-slots', action: 'cooldown', label: '⏱️ Cooldown' },
    backButton(adminUserId, 'config-casino'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildDicePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🎲 Dice Settings',
    fields: [
      { name: 'Minimum Bet', value: `${settings.dice_min_bet.toLocaleString('en-US')}`, inline: true },
      { name: 'Payout Multiplier', value: `${settings.dice_payout_multiplier_pct}%`, inline: true },
      { name: 'Cooldown', value: `${settings.dice_cooldown_seconds}s`, inline: true },
    ],
    footer:
      'Payout Multiplier scales every tier at once (Pair/Straight/Triple/Venus Throw) — 100% = default table, 90% = 10% stingier, 110% = 10% more generous. Cooldown: how long a player waits between rolls (0 disables it).',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-casino-dice', action: 'minbet', label: '💵 Minimum Bet' },
    { targetUserId: adminUserId, screen: 'config-casino-dice', action: 'payout', label: '📈 Payout Multiplier' },
    { targetUserId: adminUserId, screen: 'config-casino-dice', action: 'cooldown', label: '⏱️ Cooldown' },
    backButton(adminUserId, 'config-casino'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildArenaConfigPanel(adminUserId) {
  const embed = buildPanelEmbed({ title: '⚔️ Arena Settings', description: 'Select a system to configure.' });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-slave', action: '', label: '💼 Slave' },
    { targetUserId: adminUserId, screen: 'config-arena-claims', action: '', label: '🎁 Collectible Claims' },
    { targetUserId: adminUserId, screen: 'config-arena-exchange', action: '', label: '💱 Exchange' },
    { targetUserId: adminUserId, screen: 'config-arena-adventure', action: '', label: '🗺️ Adventures' },
    { targetUserId: adminUserId, screen: 'config-arena-champion', action: '', label: '👑 Champion' },
    backButton(adminUserId, 'config-top'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildSlavePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '💼 Slave Settings',
    fields: [
      { name: 'Cooldown', value: formatDuration(settings.slave_cooldown_seconds * 1000), inline: true },
      {
        name: 'Cash Reward',
        value: `${formatMoney(settings.slave_gambling_min, settings)} – ${formatMoney(settings.slave_gambling_max, settings)}`,
        inline: true,
      },
      { name: '\u200b', value: '\u200b', inline: true },
      {
        name: 'Arena Coin Reward',
        value: `${formatArena(settings.slave_arena_min)} – ${formatArena(settings.slave_arena_max)}`,
        inline: true,
      },
      { name: 'Arena Coin Daily Cap', value: `${formatArena(settings.slave_arena_daily_cap)} / 24h`, inline: true },
    ],
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-slave', action: 'cooldown', label: '⏱️ Cooldown' },
    { targetUserId: adminUserId, screen: 'config-arena-slave', action: 'cash', label: '💰 Cash Rewards' },
    { targetUserId: adminUserId, screen: 'config-arena-slave', action: 'arena', label: '🪙 Arena Coin Rewards' },
    { targetUserId: adminUserId, screen: 'config-arena-slave', action: 'cap', label: '📈 Daily Cap' },
    backButton(adminUserId, 'config-arena'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildClaimsPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🎁 Collectible Claim Settings',
    fields: [
      { name: 'Arena Cooldown', value: formatDuration(settings.claim_cooldown_arena_seconds * 1000), inline: true },
      { name: 'Gambling Cooldown', value: formatDuration(settings.claim_cooldown_gambling_seconds * 1000), inline: true },
    ],
    footer: 'Applies to every collectible on this server — there is no per-item cooldown. A collectible that gives both currencies claims each on its own independent timer.',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-claims', action: 'cooldown-arena', label: '⏱️ Change Arena Cooldown' },
    { targetUserId: adminUserId, screen: 'config-arena-claims', action: 'cooldown-gambling', label: '⏱️ Change Gambling Cooldown' },
    backButton(adminUserId, 'config-arena'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildExchangePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '💱 Exchange Settings',
    fields: [
      {
        name: 'Cooldown',
        value: settings.exchange_cooldown_seconds > 0 ? formatDuration(settings.exchange_cooldown_seconds * 1000) : 'Disabled',
        inline: true,
      },
      { name: 'Daily Arena Coin Limit', value: `${formatArena(settings.exchange_daily_cap)} / 24h`, inline: true },
    ],
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-exchange', action: 'cooldown', label: '⏱️ Exchange Cooldown' },
    { targetUserId: adminUserId, screen: 'config-arena-exchange', action: 'cap', label: '🪙 Daily Coin Limit' },
    backButton(adminUserId, 'config-arena'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildAdventurePanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '🗺️ Adventure Settings',
    fields: [{ name: 'Base Trip Time', value: `${settings.adventure_base_minutes} min` }],
    footer:
      'Actual trip length varies +/- a few minutes around this. Set to 0 to let testers experience a full trip near-instantly without needing the ADMIN bitfield flag (ADMIN holders always get instant trips regardless of this setting).',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-adventure', action: 'duration', label: '⏱️ Base Trip Time' },
    backButton(adminUserId, 'config-arena'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}

export function buildChampionPanel(guildId, adminUserId) {
  const settings = ensureGuild(guildId);
  const embed = buildPanelEmbed({
    title: '👑 Champion Settings',
    fields: [
      { name: 'Minimum Wager', value: formatArena(settings.champion_min_wager) },
      ...CHAMPION_BRACKETS.map((bracket) => ({
        name: `${bracket.name} Max Wager`,
        value: formatArena(getBracketMaxWager(settings, bracket)),
        inline: true,
      })),
      ...CHAMPION_BRACKETS.map((bracket) => ({
        name: `${bracket.name} Base XP`,
        value: getBracketBaseXp(settings, bracket).toLocaleString('en-US'),
        inline: true,
      })),
      ...CHAMPION_BRACKETS.map((bracket) => ({
        name: `${bracket.name} Bonus XP`,
        value: `+${getBracketXpModifier(settings, bracket)}%`,
        inline: true,
      })),
    ],
    footer: 'Max wager, base XP, and bonus XP are the per-bracket numbers exposed here — win chance and unlock level stay fixed by design.',
  });
  const buttons = [
    { targetUserId: adminUserId, screen: 'config-arena-champion', action: 'wager', label: '💰 Minimum Wager' },
    ...CHAMPION_BRACKETS.map((bracket) => ({
      targetUserId: adminUserId,
      screen: 'config-arena-champion',
      action: `wager_b${bracket.order}`,
      label: `${bracket.name} Max`,
    })),
    ...CHAMPION_BRACKETS.map((bracket) => ({
      targetUserId: adminUserId,
      screen: 'config-arena-champion',
      action: `basexp_b${bracket.order}`,
      label: `${bracket.name} Base XP`,
    })),
    ...CHAMPION_BRACKETS.map((bracket) => ({
      targetUserId: adminUserId,
      screen: 'config-arena-champion',
      action: `xp_b${bracket.order}`,
      label: `${bracket.name} XP`,
    })),
    backButton(adminUserId, 'config-arena'),
  ];
  return { embeds: [embed], components: buildButtonRows(buttons) };
}
