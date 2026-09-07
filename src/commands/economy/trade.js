import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { EconomyError, ensureGuild } from '../../utils/economy.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { startSession, endSession } from '../../utils/activeSession.js';
import { recordPendingTrade, clearPendingTrade } from '../../utils/pendingTrades.js';
import { meetsTradeLevelRequirement } from '../../utils/gladiator.js';
import { isBlacklisted } from '../../utils/blacklist.js';
import {
  parseTradeSide,
  isSideEmpty,
  prepareSideInstances,
  escrowSide,
  refundSide,
  deliverSide,
  debitSideNow,
  formatFinalSideLines,
  formatPendingSideLines,
} from '../../utils/trade.js';

const TRADE_ACCEPT_TIMEOUT_MS = 15_000; 

function formatPrice(amount, currency, guildSettings) {
  return currency === 'arena' ? formatArena(amount) : formatMoney(amount, guildSettings);
}

const CURRENCY_CHOICES = [
  { name: 'Gambling Currency', value: 'gambling' },
  { name: 'Arena Coins', value: 'arena' },
];

function finalizeSide(side, prepared) {
  return {
    coins: side.coins,
    arenaCoins: side.arenaCoins,
    equipmentItems: prepared.resolvedEquipment,
    collectableItems: prepared.collectables,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer another player a trade — gear, collectables, coins, and/or arena coins')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to trade with').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('send')
        .setDescription('What you send them, e.g. "1 rusty sword, 10k cash" or "5 arena coins" (leave blank for nothing)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('receive')
        .setDescription('What they send you (on top of price), e.g. "1 rusty sword" (leave blank for nothing)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('price')
        .setDescription('Extra amount they pay you on top of "receive" — e.g. 500, 1.5k, 2m')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('currency')
        .setDescription('Currency for "price" (default: gambling currency)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = CURRENCY_CHOICES.filter(
      (c) => c.name.toLowerCase().includes(typed) || c.value.includes(typed)
    );
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const initiator = interaction.user;
    const target = interaction.options.getUser('user', true);

    if (target.id === initiator.id) {
      return interaction.reply({ content: "You can't trade with yourself.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't trade with a bot.", ephemeral: true });
    }
    if (isBlacklisted(target.id)) {
      return interaction.reply({ content: 'This user is blacklisted.', ephemeral: false });
    }

    
    
    if (!meetsTradeLevelRequirement(guildId, initiator.id, initiator.displayName)) {
      return interaction.reply({ content: 'who would want to trade with a puny gladiator go train', ephemeral: true });
    }
    if (!meetsTradeLevelRequirement(guildId, target.id, target.displayName)) {
      return interaction.reply({ content: 'who would want to trade with a puny gladiator go train', ephemeral: true });
    }

    const guildSettings = ensureGuild(guildId);
    const currencyRaw = interaction.options.getString('currency');
    let priceCurrency = 'gambling';
    if (currencyRaw !== null) {
      const match = CURRENCY_CHOICES.find(
        (c) => c.value === currencyRaw.toLowerCase() || c.name.toLowerCase() === currencyRaw.toLowerCase()
      );
      if (!match) {
        return interaction.reply({
          content: `**${currencyRaw}** isn't a valid currency. Try \`gambling\` or \`arena\`.`,
          ephemeral: true,
        });
      }
      priceCurrency = match.value;
    }

    const priceRaw = interaction.options.getString('price');
    let priceAmount = 0;
    if (priceRaw) {
      priceAmount = parseAmount(priceRaw);
      if (priceAmount === null || priceAmount <= 0) {
        return interaction.reply({
          content: `**${priceRaw}** isn't a valid price. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`1b\`.`,
          ephemeral: true,
        });
      }
    }

    let sendSide;
    let receiveSide;
    try {
      sendSide = parseTradeSide(interaction.options.getString('send'));
      receiveSide = parseTradeSide(interaction.options.getString('receive'));
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    if (isSideEmpty(sendSide) && isSideEmpty(receiveSide) && priceAmount === 0) {
      return interaction.reply({
        content: 'That trade is empty — set `send`, `receive`, and/or `price` to something.',
        ephemeral: true,
      });
    }

    try {
      startSession(guildId, initiator.id, 'a trade offer');
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    
    
    
    
    let prepared;
    try {
      prepared = prepareSideInstances(guildId, initiator.id, sendSide);
    } catch (err) {
      endSession(guildId, initiator.id);
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    const finalSendSide = finalizeSide(sendSide, prepared);

    
    
    
    try {
      escrowSide(guildId, initiator.id, finalSendSide);
    } catch (err) {
      endSession(guildId, initiator.id);
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    const acceptId = `trade-accept-${interaction.id}`;
    const declineId = `trade-decline-${interaction.id}`;
    const cancelId = `trade-cancel-${interaction.id}`;

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    const priceLine = priceAmount > 0 ? `\n${formatPrice(priceAmount, priceCurrency, guildSettings)}` : '';

    let offerMessage;
    let tradeKey;
    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      const offerEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('🤝 Trade Offer')
        .setDescription(
          `${target}, ${initiator} wants to trade.\n\n` +
            `**${initiator.username} sends:**\n${formatFinalSideLines(finalSendSide, guildSettings).join('\n')}\n\n` +
            `**${target.username} sends:**\n${formatPendingSideLines(receiveSide, guildSettings).join('\n')}${priceLine}\n\n` +
            `*${initiator.username}'s side is already escrowed. You have ${Math.round(TRADE_ACCEPT_TIMEOUT_MS / 1000)}s to respond.*`
        );

      await interaction.reply({ embeds: [offerEmbed], components: [row] });
      offerMessage = await interaction.fetchReply();

      
      
      
      
      tradeKey = interaction.id;
      recordPendingTrade(tradeKey, {
        guildId,
        channelId: interaction.channelId,
        messageId: offerMessage.id,
        initiatorId: initiator.id,
        targetId: target.id,
        sendSide: finalSendSide,
      });
    } catch (err) {
      refundSide(guildId, initiator.id, finalSendSide);
      endSession(guildId, initiator.id);
      throw err;
    }

    let click;
    try {
      click = await offerMessage.awaitMessageComponent({
        filter: (i) =>
          (i.user.id === target.id && [acceptId, declineId].includes(i.customId)) ||
          (i.user.id === initiator.id && i.customId === cancelId),
        time: TRADE_ACCEPT_TIMEOUT_MS,
      });
    } catch {
      refundSide(guildId, initiator.id, finalSendSide);
      clearPendingTrade(tradeKey);
      endSession(guildId, initiator.id);
      return offerMessage.edit({
        content: `⏱️ ${target.username} didn't respond in time — trade cancelled, ${initiator.username}'s wager refunded.`,
        embeds: [],
        components: [],
      });
    }

    if (click.customId === cancelId) {
      refundSide(guildId, initiator.id, finalSendSide);
      clearPendingTrade(tradeKey);
      endSession(guildId, initiator.id);
      return click.update({ content: '❌ Trade cancelled — your side was refunded.', embeds: [], components: [] });
    }

    if (click.customId === declineId) {
      refundSide(guildId, initiator.id, finalSendSide);
      clearPendingTrade(tradeKey);
      endSession(guildId, initiator.id);
      return click.update({
        content: `❌ ${target.username} declined — ${initiator.username}'s side was refunded.`,
        embeds: [],
        components: [],
      });
    }

    
    
    
    
    await click.deferUpdate();

    let targetPrepared;
    try {
      targetPrepared = prepareSideInstances(guildId, target.id, receiveSide);
    } catch (err) {
      refundSide(guildId, initiator.id, finalSendSide);
      clearPendingTrade(tradeKey);
      endSession(guildId, initiator.id);
      if (err instanceof EconomyError) {
        return offerMessage.edit({
          content: `❌ ${err.message} Trade cancelled, ${initiator.username}'s side refunded.`,
          embeds: [],
          components: [],
        });
      }
      throw err;
    }

    const finalReceiveSide = finalizeSide(receiveSide, targetPrepared);

    
    
    
    try {
      debitSideNow(guildId, target.id, finalReceiveSide, priceAmount, priceCurrency);
    } catch (err) {
      refundSide(guildId, initiator.id, finalSendSide);
      clearPendingTrade(tradeKey);
      endSession(guildId, initiator.id);
      if (err instanceof EconomyError) {
        return offerMessage.edit({
          content: `❌ ${target.username} can no longer cover their side — trade cancelled, ${initiator.username}'s side refunded.`,
          embeds: [],
          components: [],
        });
      }
      throw err;
    }

    
    
    
    
    deliverSide(guildId, initiator.id, target.id, finalSendSide);
    deliverSide(guildId, target.id, initiator.id, finalReceiveSide, priceAmount, priceCurrency);
    clearPendingTrade(tradeKey);
    endSession(guildId, initiator.id);

    const resultEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Trade Complete')
      .setDescription(
        `**${initiator.username} received:**\n${formatFinalSideLines(finalReceiveSide, guildSettings).join('\n')}${priceLine}\n\n` +
          `**${target.username} received:**\n${formatFinalSideLines(finalSendSide, guildSettings).join('\n')}`
      );
    return offerMessage.edit({ content: '', embeds: [resultEmbed], components: [] });
  },
};
