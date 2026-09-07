import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EconomyError, ensureGuild, getBalance, buildBalanceAutocomplete } from '../../utils/economy.js';
import { startSession, endSession } from '../../utils/activeSession.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import { playDice, DICE_PAYOUT_TABLE } from '../../utils/dice.js';
import { formatMoney } from '../../utils/format.js';
import { buildDiceHelp } from '../../utils/gameHelp.js';
import { recordLastBet, attachUniversalRebetHandler, attachDoubleDownHandler, recordBetOutcome, canDoubleDown } from '../../utils/rebet.js';

const DIE_FACE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; 
const HELP_IDLE_MS = 5 * 60_000;

export default {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll 3 dice — Roman Tali, updated for six sides. Land 6-6-6 for the legendary Venus Throw.')
    .addStringOption((opt) => opt.setName('bet').setDescription('How much to bet — e.g. 500, 1.5k, 2m, or "all"').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'bet') return interaction.respond([]);
    return interaction.respond(buildBalanceAutocomplete(interaction.guildId, interaction.user.id, focused.value));
  },

  async execute(interaction) {
    const raw = interaction.options.getString('bet', true).trim().toLowerCase();
    const cash = getBalance(interaction.guildId, interaction.user.id).cash;
    let bet;
    if (raw === 'all' || raw === 'half' || raw === 'quarter') {
      if (cash <= 0) {
        return interaction.reply({ content: "You don't have any cash on hand to bet.", ephemeral: true });
      }
      bet = resolveWagerAmount(raw, cash);
    } else {
      bet = parseAmount(raw);
    }
    if (bet === null || bet < 1) {
      return interaction.reply({
        content: `**${raw}** isn't a valid bet. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`half\`, \`quarter\`, or \`all\`.`,
        ephemeral: true,
      });
    }

    
    
    recordLastBet(interaction.guildId, interaction.user.id, 'dice', { bet: String(bet) });

    
    
    
    
    
    
    startSession(interaction.guildId, interaction.user.id, 'a Dice roll');
    try {
      const { roll, profit, payout } = playDice(interaction.guildId, interaction.user.id, bet);
      const settings = ensureGuild(interaction.guildId);

      const diceLine = roll.dice.map((n) => DIE_FACE[n - 1]).join('  ');
      const tier = DICE_PAYOUT_TABLE[roll.kind];
      const won = roll.kind !== 'none';
      
      
      
      
      recordBetOutcome(interaction.user.id, won ? 'win' : 'loss');

      let resultLine;
      let color;
      if (roll.kind === 'venus') {
        resultLine = `🌟 **VENUS THROW!** The legendary roll. You win **${formatMoney(payout, settings)}**!`;
        color = 0xf1c40f;
      } else if (roll.kind === 'none') {
        resultLine = `Nothing. You lose **${formatMoney(bet, settings)}**.`;
        color = 0xe74c3c;
      } else {
        resultLine = `${tier.label}! You win **${formatMoney(payout, settings)}**.`;
        color = 0x2ecc71;
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${interaction.user.username}'s Dice — Bet: ${formatMoney(bet, settings)}`, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(`# ${diceLine}\n\n${resultLine}`);

      const rebetButtonId = `dice-${interaction.id ?? Date.now()}`;
      const rowButtons = [
        new ButtonBuilder().setCustomId(`dice-help-${interaction.user.id}`).setLabel('❓ Help').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`urebet-${rebetButtonId}`).setLabel('🔁 Re-Bet').setStyle(ButtonStyle.Success),
      ];
      
      
      if (!won && canDoubleDown(interaction.user.id)) {
        rowButtons.push(new ButtonBuilder().setCustomId(`udouble-${rebetButtonId}`).setLabel('⚔️ Double Down').setStyle(ButtonStyle.Danger));
      }
      const buttonRow = new ActionRowBuilder().addComponents(...rowButtons);
      await interaction.reply({ embeds: [embed], components: [buttonRow] });
      const posted = await interaction.fetchReply();
      attachUniversalRebetHandler(posted, rebetButtonId);
      if (!won && canDoubleDown(interaction.user.id)) {
        attachDoubleDownHandler(posted, rebetButtonId, interaction.user.id);
      }

      const helpCollector = posted.createMessageComponentCollector({
        filter: (i) => i.customId === `dice-help-${interaction.user.id}`,
        time: HELP_IDLE_MS,
      });
      helpCollector.on('collect', async (i) => {
        
        
        return i.reply({ embeds: [buildDiceHelp(settings)], ephemeral: true });
      });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    } finally {
      endSession(interaction.guildId, interaction.user.id);
    }
  },
};
