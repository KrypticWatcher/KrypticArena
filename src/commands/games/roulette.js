import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EconomyError, ensureGuild, getBalance, buildBalanceAutocomplete } from '../../utils/economy.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import { placeRouletteBet, scheduleRoundResolution, recordRoundMessage, takeRoundMessages, startTicking, stopTicking, replaceCountdownLine, PICK_LABEL } from '../../utils/roulette.js';
import { formatMoney } from '../../utils/format.js';
import { buildRouletteHelp } from '../../utils/gameHelp.js';
import { recordLastBet } from '../../utils/rebet.js';

const HELP_IDLE_MS = 5 * 60_000;

const TYPE_CHOICES = [
  { name: 'Number (0-36)', value: 'number' },
  { name: 'Red', value: 'red' },
  { name: 'Black', value: 'black' },
  { name: 'Odd', value: 'odd' },
  { name: 'Even', value: 'even' },
  { name: 'Low (1-18)', value: 'low' },
  { name: 'High (19-36)', value: 'high' },
  { name: '1st Dozen (1-12)', value: 'dozen1' },
  { name: '2nd Dozen (13-24)', value: 'dozen2' },
  { name: '3rd Dozen (25-36)', value: 'dozen3' },
  { name: '1st Column', value: 'col1' },
  { name: '2nd Column', value: 'col2' },
  { name: '3rd Column', value: 'col3' },
];

const PICK_ALIASES = {
  number: ['number', 'num', 'n'],
  red: ['red', 'r'],
  black: ['black', 'blk', 'b'],
  odd: ['odd', 'o'],
  even: ['even', 'ev', 'e'],
  low: ['low', 'lo', '1-18'],
  high: ['high', 'hi', '19-36'],
  dozen1: ['dozen1', '1st dozen', 'first dozen', 'dozen 1', '1-12'],
  dozen2: ['dozen2', '2nd dozen', 'second dozen', 'dozen 2', '13-24'],
  dozen3: ['dozen3', '3rd dozen', 'third dozen', 'dozen 3', '25-36'],
  col1: ['col1', '1st column', 'first column', 'column 1', 'col 1'],
  col2: ['col2', '2nd column', 'second column', 'column 2', 'col 2'],
  col3: ['col3', '3rd column', 'third column', 'column 3', 'col 3'],
};

function resolvePickType(raw) {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [value, aliases] of Object.entries(PICK_ALIASES)) {
    if (aliases.includes(t)) return value;
  }
  const found = TYPE_CHOICES.find((c) => c.value === t || c.name.toLowerCase() === t);
  return found ? found.value : null;
}

function stripCountdownLine(description) {
  return replaceCountdownLine(description, '*(superseded by a later bet — see the newest message in this round for the current countdown)*');
}

export default {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Bet on the roulette wheel — a shared round that spins once the betting window closes')
    .addStringOption((opt) => opt.setName('bet').setDescription('How much to bet — e.g. 500, 1.5k, 2m, or "all"').setRequired(true).setAutocomplete(true))
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('What to bet on — e.g. red, black, odd, dozen1, or just type a number 0-36')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('number').setDescription('Only used with Number bets — pick 0-36').setRequired(false).setMinValue(0).setMaxValue(36)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'bet') {
      return interaction.respond(buildBalanceAutocomplete(interaction.guildId, interaction.user.id, focused.value));
    }
    if (focused.name !== 'type') return interaction.respond([]);
    const typed = focused.value.trim().toLowerCase();

    let choices = TYPE_CHOICES.filter(
      (c) => c.name.toLowerCase().includes(typed) || c.value.includes(typed)
    );

    
    
    if (typed !== '' && /^\d+$/.test(typed)) {
      const numberMatches = [];
      for (let n = 0; n <= 36; n++) {
        if (String(n).startsWith(typed)) numberMatches.push({ name: `Number ${n}`, value: String(n) });
      }
      choices = [...numberMatches, ...choices];
    }

    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const raw = interaction.options.getString('bet', true).trim().toLowerCase();
    const cash = getBalance(interaction.guildId, interaction.user.id).cash;
    let amount;
    if (raw === 'all' || raw === 'half' || raw === 'quarter') {
      if (cash <= 0) {
        return interaction.reply({ content: "You don't have any cash on hand to bet.", ephemeral: true });
      }
      amount = resolveWagerAmount(raw, cash);
    } else {
      amount = parseAmount(raw);
    }
    if (amount === null || amount < 1) {
      return interaction.reply({
        content: `**${raw}** isn't a valid bet. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`half\`, \`quarter\`, or \`all\`.`,
        ephemeral: true,
      });
    }

    const typeRaw = interaction.options.getString('type', true);
    let pickType;
    let pickNumber = interaction.options.getInteger('number');

    
    
    
    if (/^\d+$/.test(typeRaw.trim())) {
      pickType = 'number';
      if (pickNumber === null) pickNumber = parseInt(typeRaw.trim(), 10);
    } else {
      pickType = resolvePickType(typeRaw);
      if (!pickType) {
        return interaction.reply({
          content: `**${typeRaw}** isn't a valid bet type. Try \`red\`, \`black\`, \`odd\`, \`even\`, \`low\`, \`high\`, \`dozen1\`/\`dozen2\`/\`dozen3\`, \`col1\`/\`col2\`/\`col3\`, or a number 0-36.`,
          ephemeral: true,
        });
      }
    }

    if (pickType === 'number' && (pickNumber === null || pickNumber < 0 || pickNumber > 36)) {
      return interaction.reply({ content: 'Pick a number from 0 to 36 for a Number bet.', ephemeral: true });
    }

    
    
    
    
    
    recordLastBet(interaction.guildId, interaction.user.id, 'roulette', { bet: String(amount), type: typeRaw, number: pickNumber });

    try {
      const { roundId, closesAt, isNewRound } = placeRouletteBet(
        interaction.guildId,
        interaction.channelId,
        interaction.user.id,
        amount,
        pickType,
        pickNumber
      );

      const settings = ensureGuild(interaction.guildId);
      const pickLabel = PICK_LABEL[pickType](pickNumber);

      
      
      
      
      
      const buildEmbed = (secondsLeft) =>
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('🎰 Roulette Bet Placed')
          .setDescription(
            `<@${interaction.user.id}> has placed a bet of **${formatMoney(amount, settings)}** on **${pickLabel}**` +
              `${isNewRound ? ' — a new round is opening!' : ''}\n` +
              `Time remaining: ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}`
          );

      
      
      
      
      
      
      
      if (!isNewRound) {
        stopTicking(roundId);
        const previous = takeRoundMessages(roundId);
        for (const { channelId, messageId } of previous) {
          try {
            const channel = await interaction.client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            const existingEmbed = message.embeds[0];
            if (existingEmbed) {
              const newDescription = stripCountdownLine(existingEmbed.description ?? '');
              const updatedEmbed = EmbedBuilder.from(existingEmbed).setDescription(newDescription);
              await message.edit({ embeds: [updatedEmbed] });
            }
          } catch {

          }
        }
      }

      const initialSecondsLeft = Math.max(0, Math.round((closesAt - Date.now()) / 1000));
      const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`roulette-help-${interaction.user.id}`).setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [buildEmbed(initialSecondsLeft)], components: [helpRow] });
      const posted = await interaction.fetchReply();
      recordRoundMessage(roundId, interaction.channelId, posted.id);

      
      
      
      
      const helpCollector = posted.createMessageComponentCollector({
        filter: (i) => i.customId === `roulette-help-${interaction.user.id}`,
        time: HELP_IDLE_MS,
      });
      helpCollector.on('collect', async (i) => {
        
        
        return i.reply({ embeds: [buildRouletteHelp(settings)], ephemeral: true });
      });

      
      
      
      
      
      startTicking(posted, roundId, closesAt, buildEmbed);

      
      
      
      scheduleRoundResolution(interaction.client, roundId, closesAt);
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
