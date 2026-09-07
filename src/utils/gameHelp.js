import { EmbedBuilder } from 'discord.js';

export function buildBlackjackHelp(settings) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🃏 Blackjack — How It Works')
    .setDescription(
      `Get closer to **21** than the dealer without going over. Face cards count as 10, Aces count as 11 or 1 (whichever keeps you from busting).\n\n` +
        `**A natural Blackjack** (21 on your first 2 cards) pays **6:5** on your bet.\n` +
        `**Dealer** draws until 17 or higher, then stands.\n\n` +
        `**Your options each turn:**\n` +
        `• **Hit** — take another card\n` +
        `• **Stand** — keep your current total\n` +
        `• **Double** — double your bet, take exactly one more card, then stand\n` +
        `• **Split** — if your first two cards match, split them into two separate hands (each with its own bet)\n\n` +
        `**Side bets** (if enabled on this server):\n` +
        `• **Perfect Pairs** — an optional side bet on your first two cards forming a pair\n` +
        `• **Insurance** — offered only when the dealer shows an Ace; a side bet that the dealer has Blackjack, pays 2:1\n\n` +
        `Cooldown between hands: **${settings.blackjack_cooldown_seconds}s**.`
    );
}

export function buildRouletteHelp(settings) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎡 Roulette — How It Works')
    .setDescription(
      `Every bet placed in a channel joins the same round — the round stays open for **${settings.roulette_bet_window_seconds}s** after the ` +
        `*last* bet placed in it (capped at **${settings.roulette_max_round_seconds}s** total from the first bet), then the wheel spins once for everyone.\n\n` +
        `**Bet types and payouts:**\n` +
        `• **Straight number (0-36)** — pays **35:1**\n` +
        `• **Red / Black / Odd / Even / Low (1-18) / High (19-36)** — pays **1:1**\n` +
        `• **Dozens (1-12 / 13-24 / 25-36) / Columns** — pays **2:1**\n\n` +
        `You can place multiple bets on different picks in the same round — each one settles independently based on where the ball lands.\n\n` +
        `Minimum bet: **${settings.roulette_min_bet.toLocaleString('en-US')}**. Cooldown between bets: **${settings.roulette_cooldown_seconds}s**.`
    );
}

export function buildDiceHelp(settings) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎲 Dice — How It Works')
    .setDescription(
      `A six-sided-dice take on Tali, the Roman gambling game — roll 3 dice, and the exact combination decides your payout:\n\n` +
        `• **Pair** (exactly two match) — pays **0.15x**\n` +
        `• **Straight** (three in a row, e.g. 4-5-6) — pays **0.7x**\n` +
        `• **Triple** (any three of a kind, e.g. 3-3-3) — pays **4.5x**\n` +
        `• **🌟 Venus Throw** (6-6-6 exactly) — the legendary roll, pays **30x**\n\n` +
        `Minimum bet: **${settings.dice_min_bet.toLocaleString('en-US')}**. Payout multiplier: **${settings.dice_payout_multiplier_pct}%** of the table above. Cooldown: **${settings.dice_cooldown_seconds}s**.`
    );
}

export function buildSlotsHelp(settings) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎰 Slots — How It Works')
    .setDescription(
      `Three rows of three symbols spin — only the **middle row** (marked with ⬅️) is the row that counts. The top and bottom rows are ` +
        `pure decoration, same as the blurred symbols above/below the payline on a real slot machine.\n\n` +
        `**Symbols, common to rare:** 🛡️ Shield · ⚔️ Gladius · 🔥 Torch · 🦁 Lion · 🏛️ Colosseum · 👑 Crown\n\n` +
        `• Any **matching pair** on the middle row pays out (rarer symbols pay more)\n` +
        `• **All three matching** pays out much bigger — a triple 👑 Crown is the jackpot\n\n` +
        `Minimum bet: **${settings.slots_min_bet.toLocaleString('en-US')}**. Payout multiplier: **${settings.slots_payout_multiplier_pct}%** of the base table. Cooldown: **${settings.slots_cooldown_seconds}s**.`
    );
}
