import { randomUUID } from 'crypto';
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { placeBet, addCash, getBalance, ensureGuild, EconomyError, recordGameResult, buildBalanceAutocomplete } from '../../utils/economy.js';
import { formatMoney, formatDuration } from '../../utils/format.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { createDeck, drawCard, formatHandCompact, handValue, isBlackjack, isBust } from '../../utils/cards.js';
import { startSession, endSession } from '../../utils/activeSession.js';
import { buildBlackjackHelp } from '../../utils/gameHelp.js';
import { checkGameCooldown, recordGamePlay } from '../../utils/gameCooldowns.js';
import { recordLastBet, attachUniversalRebetHandler, attachDoubleDownHandler, recordBetOutcome, canDoubleDown } from '../../utils/rebet.js';

const REBET_IDLE_MS = 30_000; 
const HIT_STAND_IDLE_MS = 45_000; 

const MAX_SPLIT_HANDS = 4;

const PERFECT_PAIRS_PAYOUT_MULTIPLIER = {
  mixed: 5, 
  colored: 10, 
  perfect: 30, 
};
const RED_SUITS = new Set(['hearts', 'diamonds']);

function evaluatePerfectPairs([first, second]) {
  if (first.rank !== second.rank) return null;
  if (first.suit === second.suit) return 'perfect';
  const sameColor = RED_SUITS.has(first.suit) === RED_SUITS.has(second.suit);
  return sameColor ? 'colored' : 'mixed';
}

const SIDE_BET_LABEL = {
  perfect: '🂡 Perfect Pair',
  colored: '🃏 Colored Pair',
  mixed: '🎴 Mixed Pair',
};

const INSURANCE_IDLE_MS = 20_000; 

function insuranceRow(roundId, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj-insurance-yes-${roundId}`).setLabel('Take Insurance').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bj-insurance-no-${roundId}`).setLabel('Decline').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

function actionRow(roundId, { canDouble, canSplit, disabled }) {
  const buttons = [
    new ButtonBuilder().setCustomId(`bj-hit-${roundId}`).setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bj-stand-${roundId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bj-double-${roundId}`)
      .setLabel('Double')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !canDouble),
  ];
  if (canSplit) {
    buttons.push(
      new ButtonBuilder().setCustomId(`bj-split-${roundId}`).setLabel('Split').setStyle(ButtonStyle.Success).setDisabled(disabled)
    );
  }
  buttons.push(new ButtonBuilder().setCustomId(`bj-help-${roundId}`).setLabel('❓ Help').setStyle(ButtonStyle.Secondary));
  return new ActionRowBuilder().addComponents(buttons);
}

function netToOutcome(net) {
  return net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
}

function buildEndRow(roundId, userId, outcome) {
  const buttons = [
    new ButtonBuilder().setCustomId(`urebet-bj-${roundId}`).setLabel('🔁 Re-Bet').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj-help-${roundId}`).setLabel('❓ Help').setStyle(ButtonStyle.Secondary),
  ];
  if (outcome === 'loss' && canDoubleDown(userId)) {
    buttons.push(new ButtonBuilder().setCustomId(`udouble-bj-${roundId}`).setLabel('⚔️ Double Down').setStyle(ButtonStyle.Danger));
  }
  return new ActionRowBuilder().addComponents(buttons);
}

function makeHand(cards, bet, { isSplitAces = false } = {}) {
  return { cards, bet, doubled: false, isSplitAces, done: isSplitAces, busted: false };
}

function canSplitHand(hand, hands, cashBalance) {
  return (
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank &&
    hands.length < MAX_SPLIT_HANDS &&
    !hand.isSplitAces &&
    cashBalance >= hand.bet
  );
}

function settleHand(hand, dealerFinal, { guildId, userId, settings }) {
  const playerVal = handValue(hand.cards).total;
  const dealerVal = handValue(dealerFinal).total;
  const dealerBusted = isBust(dealerFinal);
  const effectiveBet = hand.bet;

  let outcome, net, emoji, text;
  if (hand.busted) {
    outcome = 'loss';
    net = -effectiveBet;
    emoji = '💥';
    text = `Bust — lost ${formatMoney(effectiveBet, settings)}`;
  } else if (dealerBusted) {
    addCash(guildId, userId, effectiveBet * 2, 'blackjack');
    outcome = 'win';
    net = effectiveBet;
    emoji = '🎉';
    text = `Dealer busts — won ${formatMoney(effectiveBet, settings)}`;
  } else if (playerVal > dealerVal) {
    addCash(guildId, userId, effectiveBet * 2, 'blackjack');
    outcome = 'win';
    net = effectiveBet;
    emoji = '🎉';
    text = `Win — won ${formatMoney(effectiveBet, settings)}`;
  } else if (playerVal === dealerVal) {
    addCash(guildId, userId, effectiveBet, 'blackjack');
    outcome = 'push';
    net = 0;
    emoji = '🤝';
    text = 'Push — bet returned';
  } else {
    outcome = 'loss';
    net = -effectiveBet;
    emoji = '😔';
    text = `Loss — lost ${formatMoney(effectiveBet, settings)}`;
  }
  recordGameResult(guildId, userId, 'blackjack', { outcome, net });
  return { emoji, text, net };
}

function buildRoundSummary(hands, settledResults, settings) {
  const totalNet = settledResults.reduce((sum, r) => sum + r.net, 0);

  if (hands.length === 1) {
    const r = settledResults[0];
    const color = r.net > 0 ? 0x2ecc71 : r.net < 0 ? 0xe74c3c : 0xf1c40f;
    const title = r.net > 0 ? '🎉 You Win' : r.net < 0 ? '😔 You Lose' : '🤝 Push';
    const footer = r.net > 0 ? 'Nice hand.' : r.net < 0 ? 'Better luck next hand.' : 'Standoff.';
    return { color, title, description: r.text, footer };
  }

  const color = totalNet > 0 ? 0x2ecc71 : totalNet < 0 ? 0xe74c3c : 0xf1c40f;
  const netText = totalNet >= 0 ? `+${formatMoney(totalNet, settings)}` : formatMoney(totalNet, settings);
  return {
    color,
    title: '🏁 Hands Settled',
    description: `Net across ${hands.length} hands: **${netText}**`,
    footer: 'See each hand above for its individual result.',
  };
}

function renderPlayerField(hands, activeIndex, settings, settledResults) {
  if (hands.length === 1) {
    const hand = hands[0];
    const total = handValue(hand.cards).total;
    const lines = [formatHandCompact(hand.cards), `**Value:** ${total}`];
    return { name: 'Your Hand', value: lines.join('\n') };
  }

  const blocks = hands.map((hand, idx) => {
    const total = handValue(hand.cards).total;
    const marker = !settledResults && idx === activeIndex ? '▶️ ' : '';
    let statusText = '';
    if (settledResults) statusText = `${settledResults[idx].emoji} ${settledResults[idx].text}`;
    else if (hand.busted) statusText = '💥 Bust';
    else if (hand.done) statusText = 'Stood';
    const lines = [
      `${marker}**Hand ${idx + 1}** (Bet ${formatMoney(hand.bet, settings)})`,
      formatHandCompact(hand.cards),
      `**Value:** ${total}`,
    ];
    if (statusText) lines.push(statusText);
    return lines.join('\n');
  });
  return { name: 'Your Hands', value: blocks.join('\n\n') };
}

function renderEmbed({ user, settings, hands, activeIndex, dealer, result, revealDealer, cardsRemaining, sideBetResult, insuranceOffer, insuranceResult, settledResults }) {
  const totalBet = hands.reduce((sum, h) => sum + h.bet, 0);
  
  
  
  
  const dealerValue = revealDealer ? `${handValue(dealer).total}` : `${handValue([dealer[0]]).total}`;
  const dealerHidden = revealDealer ? [] : [1];
  const playerField = renderPlayerField(hands, activeIndex, settings, settledResults);
  const dealerLines = [formatHandCompact(dealer, dealerHidden), `**Value:** ${dealerValue}`];

  const embed = new EmbedBuilder().setAuthor({
    name: `${user.username}'s Blackjack — Bet: ${formatMoney(totalBet, settings)}`,
    iconURL: user.displayAvatarURL(),
  });

  
  
  
  if (result) {
    embed.addFields({ name: result.title, value: result.description, inline: false });
  }

  embed.addFields(
    { name: playerField.name, value: playerField.value, inline: true },
    { name: "Dealer's Hand", value: dealerLines.join('\n'), inline: true }
  );

  
  
  
  
  if (sideBetResult) {
    const { amount, pairType, profit } = sideBetResult;
    const line = pairType
      ? `${SIDE_BET_LABEL[pairType]}! Side bet **${formatMoney(amount, settings)}** wins **${formatMoney(profit, settings)}**.`
      : `No pair. Side bet **${formatMoney(amount, settings)}** lost.`;
    embed.addFields({ name: '🎲 Perfect Pairs', value: line, inline: false });
  }

  
  
  
  if (insuranceOffer) {
    embed.addFields({
      name: '🛡️ Insurance?',
      value: `Dealer is showing an Ace. Take Insurance for **${formatMoney(Math.floor(hands[0].bet / 2), settings)}** (pays 2:1 if the dealer has blackjack)?`,
      inline: false,
    });
  } else if (insuranceResult) {
    const { amount, won, profit } = insuranceResult;
    const line = won
      ? `Dealer had blackjack. Insurance **${formatMoney(amount, settings)}** wins **${formatMoney(profit, settings)}**.`
      : `Dealer didn't have blackjack. Insurance **${formatMoney(amount, settings)}** lost.`;
    embed.addFields({ name: '🛡️ Insurance', value: line, inline: false });
  }

  
  
  
  
  embed.addFields({ name: '\u200b', value: `🃏 Cards remaining: **${cardsRemaining}**`, inline: false });

  if (result) {
    embed.setColor(result.color).setFooter({ text: result.footer });
  } else {
    embed.setColor(0xf1c40f);
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack against the dealer')
    .addStringOption((opt) =>
      opt
        .setName('bet')
        .setDescription('How much cash to bet — e.g. 500, 1.5k, 2m, or "all"')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('side_bet')
        .setDescription('Optional Perfect Pairs side bet — pays if your first 2 cards are a pair (5:1/10:1/30:1)')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'bet') return interaction.respond([]);
    return interaction.respond(buildBalanceAutocomplete(interaction.guildId, interaction.user.id, focused.value));
  },

  async execute(interaction) {
    const raw = interaction.options.getString('bet', true).trim().toLowerCase();

    
    
    
    
    
    
    
    const guildSettings = ensureGuild(interaction.guildId);
    const sideBetRaw = interaction.options.getString('side_bet');
    let sideBet = null;
    if (sideBetRaw !== null) {
      const settings = guildSettings;
      if (!settings.blackjack_side_bets_enabled) {
        return interaction.reply({ content: 'Side bets are turned off on this server.', ephemeral: true });
      }
      sideBet = parseAmount(sideBetRaw.trim().toLowerCase());
      if (sideBet === null || sideBet < 1) {
        return interaction.reply({
          content: `**${sideBetRaw}** isn't a valid side bet. Try a plain number or shorthand like \`500\`, \`1.5k\`, or \`2m\` (no \`all\` — it stacks on top of your main bet).`,
          ephemeral: true,
        });
      }
    }

    let bet;
    if (raw === 'all' || raw === 'half' || raw === 'quarter') {
      const cash = getBalance(interaction.guildId, interaction.user.id).cash;
      const available = cash - (sideBet ?? 0);
      if (cash <= 0) {
        return interaction.reply({
          content: "You don't have any cash on hand to bet.",
          ephemeral: true,
        });
      }
      bet = raw === 'all' ? available : raw === 'half' ? Math.floor(available / 2) : Math.floor(available / 4);
      if (bet < 1) {
        return interaction.reply({
          content: `Your side bet of **${formatMoney(sideBet, guildSettings)}** would eat your whole balance — you need at least 1 left over for the main bet.`,
          ephemeral: true,
        });
      }
    } else {
      bet = parseAmount(raw);
    }

    if (bet === null || bet < 1) {
      return interaction.reply({
        content: `**${raw}** isn't a valid bet. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`1b\`, \`half\`, \`quarter\`, or \`all\`.`,
        ephemeral: true,
      });
    }

    
    
    
    
    
    
    
    
    
    
    recordLastBet(interaction.guildId, interaction.user.id, 'blackjack', { bet: String(bet), side_bet: sideBetRaw });

    await playHand({
      guildId: interaction.guildId,
      user: interaction.user,
      bet,
      sideBet,
      respond: (payload) => interaction.reply(payload),
      fetchReply: () => interaction.fetchReply(),
    });
  },
};

async function playHand({ guildId, user, bet, sideBet, respond, fetchReply }) {
  const settings = ensureGuild(guildId);

  
  
  
  
  
  
  
  
  
  const cooldown = checkGameCooldown(guildId, user.id, 'blackjack');
  if (cooldown.onCooldown) {
    await respond({ content: `Slow down — you can start another hand in **${formatDuration(cooldown.readyAt - Date.now())}**.`, ephemeral: true });
    return { started: false };
  }

  
  
  
  try {
    startSession(guildId, user.id, 'Blackjack');
  } catch (err) {
    if (err instanceof EconomyError) {
      await respond({ content: err.message, ephemeral: true });
      return { started: false };
    }
    throw err;
  }

  
  
  
  try {
    placeBet(guildId, user.id, bet + (sideBet ?? 0));
    recordGamePlay(guildId, user.id, 'blackjack');
  } catch (err) {
    endSession(guildId, user.id);
    if (err instanceof EconomyError) {
      await respond({ content: err.message, ephemeral: true });
      return { started: false };
    }
    throw err;
  }

  const roundId = randomUUID();
  const deck = createDeck(settings.deck_count);
  const player = [drawCard(deck), drawCard(deck)];
  const dealer = [drawCard(deck), drawCard(deck)];

  
  
  
  let sideBetResult = null;
  if (sideBet) {
    const pairType = evaluatePerfectPairs(player);
    const profit = pairType ? sideBet * PERFECT_PAIRS_PAYOUT_MULTIPLIER[pairType] : 0;
    if (pairType) addCash(guildId, user.id, sideBet + profit, 'blackjack');
    recordGameResult(guildId, user.id, 'blackjack_pairs', {
      outcome: pairType ? 'win' : 'loss',
      net: pairType ? profit : -sideBet,
    });
    sideBetResult = { amount: sideBet, pairType, profit };
  }

  
  
  
  
  
  
  
  let insuranceResult = null;
  let dealerRevealedBlackjack = false;
  if (settings.blackjack_side_bets_enabled && dealer[0].rank === 'A') {
    const insuranceStake = Math.floor(bet / 2);
    const offerEmbed = renderEmbed({
      user,
      settings,
      hands: [makeHand(player, bet)],
      activeIndex: 0,
      dealer,
      revealDealer: false,
      cardsRemaining: deck.length,
      sideBetResult,
      insuranceOffer: true,
    });
    await respond({ embeds: [offerEmbed], components: [insuranceRow(roundId, false)] });
    const insuranceMessage = await fetchReply();

    const takeInsurance = await new Promise((resolve) => {
      const insCollector = insuranceMessage.createMessageComponentCollector({
        filter: (i) => i.customId.startsWith('bj-insurance-') && i.customId.endsWith(`-${roundId}`),
        max: 1,
        time: INSURANCE_IDLE_MS,
      });
      let decided = false;
      insCollector.on('collect', async (i) => {
        if (i.user.id !== user.id) {
          return i.reply({ content: "This isn't your hand — start your own with `/blackjack`.", ephemeral: true });
        }
        decided = true;
        await i.deferUpdate(); 
        resolve(i.customId.startsWith('bj-insurance-yes-'));
      });
      insCollector.on('end', () => {
        if (!decided) resolve(false); 
      });
    });

    dealerRevealedBlackjack = isBlackjack(dealer);
    if (takeInsurance && insuranceStake > 0) {
      const profit = dealerRevealedBlackjack ? insuranceStake * 2 : 0;
      placeBet(guildId, user.id, insuranceStake); 
      if (dealerRevealedBlackjack) addCash(guildId, user.id, insuranceStake + profit, 'blackjack');
      recordGameResult(guildId, user.id, 'blackjack_insurance', {
        outcome: dealerRevealedBlackjack ? 'win' : 'loss',
        net: dealerRevealedBlackjack ? profit : -insuranceStake,
      });
      insuranceResult = { amount: insuranceStake, won: dealerRevealedBlackjack, profit };
    }

    
    
    
    respond = (payload) => insuranceMessage.edit(payload);
    fetchReply = () => insuranceMessage;
  }

  
  
  
  
  
  
  
  function settleNatural(hand) {
    let dealerFinal = dealer;

    if (!isBlackjack(hand.cards)) {
      let dealerHand = handValue(dealerFinal);
      while (dealerHand.total < 17 || (dealerHand.total === 17 && dealerHand.soft)) {
        dealerFinal = [...dealerFinal, drawCard(deck)];
        dealerHand = handValue(dealerFinal);
      }
    }

    const playerVal = handValue(hand.cards).total;
    const dealerVal = handValue(dealerFinal).total;
    const playerNatural = isBlackjack(hand.cards);
    const dealerNatural = isBlackjack(dealer);

    let net;
    if (playerNatural && dealerNatural) {
      addCash(guildId, user.id, hand.bet, 'blackjack');
      net = 0;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'push', net: 0 });
    } else if (playerNatural) {
      
      
      
      
      const payout = hand.bet + Math.floor(hand.bet * 1.2);
      addCash(guildId, user.id, payout, 'blackjack');
      net = payout - hand.bet;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'win', net });
    } else if (playerVal > dealerVal) {
      addCash(guildId, user.id, hand.bet * 2, 'blackjack');
      net = hand.bet;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'win', net });
    } else if (playerVal === dealerVal) {
      addCash(guildId, user.id, hand.bet, 'blackjack');
      net = 0;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'push', net: 0 });
    } else {
      net = -hand.bet;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'loss', net });
    }

    const emoji = net > 0 ? '🎉' : net < 0 ? '😔' : '🤝';
    const text = playerNatural && net > 0
      ? `Natural 21 pays 6:5 — you win **${formatMoney(net, settings)}**.`
      : net > 0
      ? `${playerVal} beats ${dealerVal}. You win **${formatMoney(net, settings)}**.`
      : net < 0
      ? `${dealerVal} beats ${playerVal}. You lose **${formatMoney(hand.bet, settings)}**.`
      : `Both hands total ${playerVal}. Your **${formatMoney(hand.bet, settings)}** bet is returned.`;

    return { dealerFinal, settledResults: [{ emoji, text, net }] };
  }

  
  
  
  
  
  const naturalDone = isBlackjack(player) || dealerRevealedBlackjack;

  if (naturalDone) {
    const initialHand = makeHand(player, bet);
    const { dealerFinal, settledResults } = settleNatural(initialHand);
    const summary = { color: settledResults[0].net > 0 ? 0x2ecc71 : settledResults[0].net < 0 ? 0xe74c3c : 0xf1c40f, title: settledResults[0].net > 0 ? (isBlackjack(player) ? '🂡 Blackjack!' : '🎉 You Win') : settledResults[0].net < 0 ? '😔 Dealer Wins' : '🤝 Push', description: settledResults[0].text, footer: settledResults[0].net > 0 ? 'Nice hand.' : settledResults[0].net < 0 ? 'Better luck next hand.' : 'Standoff.' };
    const embed = renderEmbed({
      user,
      settings,
      hands: [initialHand],
      activeIndex: 0,
      dealer: dealerFinal,
      result: summary,
      revealDealer: true,
      cardsRemaining: deck.length,
      sideBetResult,
      insuranceResult,
    });
    await respond({ embeds: [embed], components: [buildEndRow(roundId, user.id, netToOutcome(settledResults[0].net))] });
    const message = await fetchReply();
    endSession(guildId, user.id);
    recordBetOutcome(user.id, netToOutcome(settledResults[0].net));
    setupRebetCollector({ message, guildId, userId: user.id, roundId, won: settledResults[0].net > 0 });
    return { started: true };
  }

  
  
  
  
  
  
  
  const hands = [makeHand(player, bet)];
  let activeIndex = 0;

  function currentButtons() {
    const hand = hands[activeIndex];
    const balance = getBalance(guildId, user.id).cash;
    return actionRow(roundId, {
      canDouble: hand.cards.length === 2 && !hand.isSplitAces && balance >= hand.bet,
      canSplit: canSplitHand(hand, hands, balance),
      disabled: false,
    });
  }

  const initialEmbed = renderEmbed({
    user,
    settings,
    hands,
    activeIndex,
    dealer,
    revealDealer: false,
    cardsRemaining: deck.length,
    sideBetResult,
    insuranceResult,
  });
  await respond({ embeds: [initialEmbed], components: [currentButtons()] });
  const message = await fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith('bj-') && i.customId.endsWith(`-${roundId}`) && !i.customId.startsWith('bj-rebet-'),
    idle: HIT_STAND_IDLE_MS,
  });

  
  
  
  
  async function finishRound(i) {
    collector.stop('resolved');

    let dealerFinal = dealer;
    const anyLive = hands.some((h) => !h.busted);
    if (anyLive) {
      let dealerHand = handValue(dealerFinal);
      while (dealerHand.total < 17 || (dealerHand.total === 17 && dealerHand.soft)) {
        dealerFinal = [...dealerFinal, drawCard(deck)];
        dealerHand = handValue(dealerFinal);
      }
    }

    const settledResults = hands.map((hand) => settleHand(hand, dealerFinal, { guildId, userId: user.id, settings }));
    const totalNet = settledResults.reduce((sum, r) => sum + r.net, 0);
    const won = totalNet > 0;
    const outcome = netToOutcome(totalNet);
    recordBetOutcome(user.id, outcome);
    const summary = buildRoundSummary(hands, settledResults, settings);
    const finalEmbed = renderEmbed({
      user,
      settings,
      hands,
      activeIndex,
      dealer: dealerFinal,
      result: summary,
      revealDealer: true,
      cardsRemaining: deck.length,
      sideBetResult,
      insuranceResult,
      settledResults,
    });
    await i.update({ embeds: [finalEmbed], components: [buildEndRow(roundId, user.id, outcome)] });
    setupRebetCollector({ message, guildId, userId: user.id, roundId, won });
  }

  
  
  
  async function advance(i) {
    const nextIndex = hands.findIndex((h) => !h.done);
    if (nextIndex === -1) {
      return finishRound(i);
    }
    activeIndex = nextIndex;
    const embed = renderEmbed({
      user,
      settings,
      hands,
      activeIndex,
      dealer,
      revealDealer: false,
      cardsRemaining: deck.length,
      sideBetResult,
      insuranceResult,
    });
    await i.update({ embeds: [embed], components: [currentButtons()] });
  }

  collector.on('collect', async (i) => {
    try {
      await handleClick(i);
    } catch (err) {
      console.error('Blackjack click handler error:', err);
      collector.stop('error');
      const totalBet = hands.reduce((sum, h) => sum + h.bet, 0);
      const result = {
        color: 0xe74c3c,
        title: '⚠️ Error',
        description: `Something went wrong with this hand — your **${formatMoney(totalBet, settings)}** bet was not returned. Please let the bot owner know.`,
        footer: 'Sorry about that.',
      };
      const errorEmbed = renderEmbed({ user, settings, hands, activeIndex, dealer, result, revealDealer: true, cardsRemaining: deck.length, sideBetResult, insuranceResult });
      recordBetOutcome(user.id, 'loss');
      await message.edit({ embeds: [errorEmbed], components: [buildEndRow(roundId, user.id, 'loss')] }).catch(() => {});
      setupRebetCollector({ message, guildId, userId: user.id, roundId, won: false });
    }
  });

  async function handleClick(i) {
    const action = i.customId.split('-')[1]; 

    
    
    
    if (action === 'help') {
      return i.reply({ embeds: [buildBlackjackHelp(settings)], ephemeral: true });
    }

    if (i.user.id !== user.id) {
      return i.reply({ content: "This isn't your hand — start your own with `/blackjack`.", ephemeral: true });
    }

    const hand = hands[activeIndex];

    if (action === 'split') {
      try {
        placeBet(guildId, user.id, hand.bet);
      } catch (err) {
        if (err instanceof EconomyError) {
          return i.reply({ content: err.message, ephemeral: true });
        }
        throw err;
      }
      const [first, second] = hand.cards;
      const isAces = first.rank === 'A';
      const left = makeHand([first, drawCard(deck)], hand.bet, { isSplitAces: isAces });
      const right = makeHand([second, drawCard(deck)], hand.bet, { isSplitAces: isAces });
      hands.splice(activeIndex, 1, left, right);
      return advance(i);
    }

    if (action === 'double') {
      try {
        placeBet(guildId, user.id, hand.bet);
      } catch (err) {
        if (err instanceof EconomyError) {
          return i.reply({ content: err.message, ephemeral: true });
        }
        throw err;
      }
      
      
      hand.cards.push(drawCard(deck));
      hand.bet *= 2;
      hand.doubled = true;
      hand.busted = isBust(hand.cards);
      hand.done = true;
      return advance(i);
    }

    if (action === 'hit') {
      hand.cards.push(drawCard(deck));

      if (isBust(hand.cards) || handValue(hand.cards).total === 21) {
        hand.busted = isBust(hand.cards);
        hand.done = true;
        return advance(i);
      }

      
      
      const midEmbed = renderEmbed({ user, settings, hands, activeIndex, dealer, revealDealer: false, cardsRemaining: deck.length, sideBetResult, insuranceResult });
      return i.update({ embeds: [midEmbed], components: [actionRow(roundId, { canDouble: false, canSplit: false, disabled: false })] });
    }

    if (action === 'stand') {
      hand.done = true;
      return advance(i);
    }
  }

  collector.on('end', (_collected, reason) => {
    endSession(guildId, user.id);
    if (reason === 'resolved' || reason === 'error') return;

    
    
    
    
    
    
    const totalBet = hands.reduce((sum, h) => sum + h.bet, 0);
    for (const hand of hands) {
      if (hand.done) continue;
      hand.done = true;
      hand.busted = false;
      recordGameResult(guildId, user.id, 'blackjack', { outcome: 'loss', net: -hand.bet });
    }
    const result = {
      color: 0xe74c3c,
      title: '⏱️ Timed Out',
      description: `No action taken in time — hand forfeited, **${formatMoney(totalBet, settings)}** stays lost.`,
      footer: 'Use Re-Bet to try again.',
    };
    const finalEmbed = renderEmbed({ user, settings, hands, activeIndex, dealer, result, revealDealer: true, cardsRemaining: deck.length, sideBetResult, insuranceResult });
    recordBetOutcome(user.id, 'loss');
    message.edit({ embeds: [finalEmbed], components: [buildEndRow(roundId, user.id, 'loss')] }).catch(() => {});
    setupRebetCollector({ message, guildId, userId: user.id, roundId, won: false });
  });

  
  
  
  
  
  
  return { started: true };
}

function setupRebetCollector({ message, guildId, userId, roundId, won }) {
  attachUniversalRebetHandler(message, `bj-${roundId}`, REBET_IDLE_MS);
  if (!won && canDoubleDown(userId)) {
    attachDoubleDownHandler(message, `bj-${roundId}`, userId, REBET_IDLE_MS);
  }

  const helpCollector = message.createMessageComponentCollector({
    filter: (i) => i.customId === `bj-help-${roundId}`,
    time: REBET_IDLE_MS,
  });
  helpCollector.on('collect', async (i) => {
    return i.reply({ embeds: [buildBlackjackHelp(ensureGuild(guildId))], ephemeral: true });
  });
}
