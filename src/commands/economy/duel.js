import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createDuelChallenge, refundDuelWager, resolveDuel, getArenaBalance } from '../../utils/arena.js';
import { EconomyError, ensureGuild, getBalance, recordGameResult } from '../../utils/economy.js';
import { ensureGladiator, formatGladiatorTitledName, meetsTradeLevelRequirement } from '../../utils/gladiator.js';
import { formatArena, formatMoney } from '../../utils/format.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import { buildDuelCombatSequence, computeReadDelay, sleep } from '../../utils/combatNarrative.js';
import { startSession, endSession } from '../../utils/activeSession.js';
import { recordPendingDuel, clearPendingDuel } from '../../utils/pendingDuels.js';
import { isBlacklisted } from '../../utils/blacklist.js';

const DUEL_COMEBACK_FAKEOUT_CHANCE = 0.05;

const DUEL_ACCEPT_TIMEOUT_MS = 15_000; 

function formatWager(amount, currency, guildSettings) {
  return currency === 'arena' ? formatArena(amount) : formatMoney(amount, guildSettings);
}

function getWagerBalanceForDisplay(guildId, userId, currency) {
  return currency === 'arena' ? getArenaBalance(guildId, userId) : getBalance(guildId, userId).cash;
}

const CURRENCY_CHOICES = [
  { name: 'Arena Coins', value: 'arena' },
  { name: 'Gambling Currency', value: 'gambling' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Challenge a player to a duel, wagering arena coins or gambling currency')
    .addUserOption((opt) => opt.setName('opponent').setDescription('Who to challenge').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('wager')
        .setDescription('How much both sides stake — e.g. 500, 1.5k, or "all"')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('currency')
        .setDescription('Which currency to wager (default: arena coins)')
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
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('opponent', true);

    if (opponent.id === challenger.id) {
      return interaction.reply({ content: "You can't duel yourself.", ephemeral: true });
    }
    if (opponent.bot) {
      return interaction.reply({ content: "You can't duel a bot.", ephemeral: true });
    }
    if (isBlacklisted(opponent.id)) {
      return interaction.reply({ content: 'This user is blacklisted.', ephemeral: false });
    }

    
    
    if (!meetsTradeLevelRequirement(guildId, challenger.id, challenger.displayName)) {
      return interaction.reply({ content: 'go get some experience first', ephemeral: true });
    }
    if (!meetsTradeLevelRequirement(guildId, opponent.id, opponent.displayName)) {
      return interaction.reply({ content: 'go get some experience first', ephemeral: true });
    }

    
    
    
    
    
    
    const challengerName = formatGladiatorTitledName(
      guildId,
      challenger.id,
      ensureGladiator(guildId, challenger.id, challenger.displayName).name
    );
    const opponentName = formatGladiatorTitledName(
      guildId,
      opponent.id,
      ensureGladiator(guildId, opponent.id, opponent.displayName).name
    );

    const currencyRaw = interaction.options.getString('currency');
    let currency = 'arena';
    if (currencyRaw !== null) {
      const match = CURRENCY_CHOICES.find(
        (c) => c.value === currencyRaw.toLowerCase() || c.name.toLowerCase() === currencyRaw.toLowerCase()
      );
      if (!match) {
        return interaction.reply({
          content: `**${currencyRaw}** isn't a valid currency. Try \`arena\` or \`gambling\`.`,
          ephemeral: true,
        });
      }
      currency = match.value;
    }
    const guildSettings = ensureGuild(guildId);
    const currencyLabel = currency === 'arena' ? 'arena coins' : guildSettings.currency_name;

    const raw = interaction.options.getString('wager', true).trim().toLowerCase();
    let wager;
    if (raw === 'all' || raw === 'half' || raw === 'quarter') {
      const balance = getWagerBalanceForDisplay(guildId, challenger.id, currency);
      if (balance <= 0) {
        return interaction.reply({ content: `You don't have any ${currencyLabel} to wager.`, ephemeral: true });
      }
      wager = resolveWagerAmount(raw, balance);
    } else {
      wager = parseAmount(raw);
    }
    if (wager === null || wager < 1) {
      return interaction.reply({
        content: `**${raw}** isn't a valid wager. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`1b\`, \`half\`, \`quarter\`, or \`all\`.`,
        ephemeral: true,
      });
    }

    
    
    
    
    
    
    
    
    try {
      startSession(guildId, challenger.id, 'a duel challenge');
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    
    
    try {
      createDuelChallenge(guildId, challenger.id, wager, currency);
    } catch (err) {
      endSession(guildId, challenger.id);
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    const acceptId = `duel-accept-${interaction.id}`;
    const declineId = `duel-decline-${interaction.id}`;
    const cancelId = `duel-cancel-${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('⚔️ Duel Challenge')
      .setDescription(
        `${opponent}, **${challengerName}** has challenged you to a duel for **${formatWager(wager, currency, guildSettings)}** ` +
          `(${currencyLabel}) each — winner takes the pot: **${formatWager(wager * 2, currency, guildSettings)}**. ` +
          `Flat 50/50, no gear involved.\n\n` +
          `*${challengerName}'s wager is already staked. You have ${Math.round(DUEL_ACCEPT_TIMEOUT_MS / 1000)}s to respond.*`
      );

    await interaction.reply({ embeds: [challengeEmbed], components: [row] });
    const message = await interaction.fetchReply();

    
    
    
    
    const duelKey = interaction.id;
    recordPendingDuel(duelKey, {
      guildId,
      channelId: interaction.channelId,
      messageId: message.id,
      challengerId: challenger.id,
      opponentId: opponent.id,
      wager,
      currency,
    });

    let click;
    try {
      click = await message.awaitMessageComponent({
        filter: (i) =>
          (i.user.id === opponent.id && [acceptId, declineId].includes(i.customId)) ||
          (i.user.id === challenger.id && i.customId === cancelId),
        time: DUEL_ACCEPT_TIMEOUT_MS,
      });
    } catch {
      refundDuelWager(guildId, challenger.id, wager, currency);
      clearPendingDuel(duelKey);
      endSession(guildId, challenger.id);
      return interaction.editReply({
        content: `⏱️ **${opponentName}** didn't respond in time — challenge cancelled, **${challengerName}**'s wager refunded.`,
        embeds: [],
        components: [],
      });
    }

    if (click.customId === cancelId) {
      refundDuelWager(guildId, challenger.id, wager, currency);
      clearPendingDuel(duelKey);
      endSession(guildId, challenger.id);
      return click.update({ content: '❌ Challenge cancelled — wager refunded.', embeds: [], components: [] });
    }

    if (click.customId === declineId) {
      refundDuelWager(guildId, challenger.id, wager, currency);
      clearPendingDuel(duelKey);
      endSession(guildId, challenger.id);
      return click.update({
        content: `❌ **${opponentName}** declined — **${challengerName}**'s wager refunded.`,
        embeds: [],
        components: [],
      });
    }

    
    
    
    let result;
    try {
      result = resolveDuel(guildId, challenger.id, opponent.id, wager, currency);
    } catch (err) {
      refundDuelWager(guildId, challenger.id, wager, currency);
      clearPendingDuel(duelKey);
      endSession(guildId, challenger.id);
      if (err instanceof EconomyError) {
        return click.update({
          content: `❌ ${err.message} Challenge cancelled, **${challengerName}**'s wager refunded.`,
          embeds: [],
          components: [],
        });
      }
      throw err;
    }

    
    
    
    
    
    recordGameResult(guildId, challenger.id, 'duel', {
      outcome: result.winnerId === challenger.id ? 'win' : 'loss',
      net: 0,
    });
    recordGameResult(guildId, opponent.id, 'duel', {
      outcome: result.winnerId === opponent.id ? 'win' : 'loss',
      net: 0,
    });
    clearPendingDuel(duelKey);

    try {
      const winnerUser = result.winnerId === challenger.id ? challenger : opponent;
      const winnerName = result.winnerId === challenger.id ? challengerName : opponentName;
      const loserName = result.winnerId === challenger.id ? opponentName : challengerName;
      
      
      
      
      
      
      
      
      
      const comebackFakeout = Math.random() < DUEL_COMEBACK_FAKEOUT_CHANCE;
      const beats = buildDuelCombatSequence({
        winnerName,
        loserName,
        riskyWin: false,
        comebackFakeout,
      });

      const NEUTRAL = 0x95a5a6;
      const SUCCESS = 0x2ecc71;
      const DAMAGE = 0xf1c40f;
      
      
      
      const beatColors = [NEUTRAL, NEUTRAL, comebackFakeout ? DAMAGE : SUCCESS, SUCCESS];
      const title = `⚔️ ${challengerName} vs ${opponentName}`;
      const inProgressEmbed = (description, color) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);

      await click.update({ embeds: [inProgressEmbed(beats[0], beatColors[0])], components: [] });
      for (let i = 1; i < beats.length; i++) {
        await sleep(computeReadDelay(beats[i - 1]));
        await interaction.editReply({ embeds: [inProgressEmbed(beats[i], beatColors[i])] });
      }

      await sleep(computeReadDelay(beats[beats.length - 1]));
      const resultEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`🏆 ${winnerName} wins the duel!`)
        .setDescription(
          `**Wager:** ${formatWager(result.wager, currency, guildSettings)} each\n` +
            `**Pot:** ${formatWager(result.pot, currency, guildSettings)} → ${winnerUser}\n` +
            `**${winnerName}'s balance:** ${formatWager(result.winnerBalance, currency, guildSettings)}\n` +
            `**${loserName}'s balance:** ${formatWager(result.loserBalance, currency, guildSettings)}\n\n` +
            `*Flat 50/50 coin flip — no gear involved.*`
        );
      return interaction.editReply({ embeds: [resultEmbed] });
    } finally {
      endSession(guildId, challenger.id);
    }
  },
};
