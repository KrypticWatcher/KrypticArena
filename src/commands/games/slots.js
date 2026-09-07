import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EconomyError, ensureGuild, getBalance, buildBalanceAutocomplete } from '../../utils/economy.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import { playSlots, SLOTS_PAYOUT_TABLE } from '../../utils/slots.js';
import { formatMoney } from '../../utils/format.js';
import { sleep } from '../../utils/combatNarrative.js';
import { buildSlotsHelp } from '../../utils/gameHelp.js';
import { recordLastBet, attachUniversalRebetHandler, attachDoubleDownHandler, recordBetOutcome, canDoubleDown } from '../../utils/rebet.js';
import { startSession, endSession } from '../../utils/activeSession.js';

const HELP_IDLE_MS = 5 * 60_000;

const SPIN_FRAME_MS = 450;
const REEL_STOP_DELAY_MS = 700;

function randomSymbol() {
  return SLOTS_PAYOUT_TABLE[Math.floor(Math.random() * SLOTS_PAYOUT_TABLE.length)].emoji;
}

function renderGrid(finalSymbols, locked) {
  const topRow = [randomSymbol(), randomSymbol(), randomSymbol()];
  const middleRow = finalSymbols.map((sym, i) => (i < locked ? sym.emoji : randomSymbol()));
  const bottomRow = [randomSymbol(), randomSymbol(), randomSymbol()];

  return [`${topRow.join('  |  ')}`, `${middleRow.join('  |  ')}  ⬅️`, `${bottomRow.join('  |  ')}`].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slots — e.g. 500, 1.5k, 2m, or "all"')
    .addStringOption((opt) => opt.setName('bet').setDescription('How much to bet').setRequired(true).setAutocomplete(true)),

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

    
    
    
    
    recordLastBet(interaction.guildId, interaction.user.id, 'slots', { bet: String(bet) });

    
    
    
    
    
    
    
    startSession(interaction.guildId, interaction.user.id, 'a Slots spin');
    try {
      
      
      const { spin, profit, payout } = playSlots(interaction.guildId, interaction.user.id, bet);
      const settings = ensureGuild(interaction.guildId);

      const baseEmbed = () =>
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setAuthor({ name: `${interaction.user.username}'s Slots — Bet: ${formatMoney(bet, settings)}`, iconURL: interaction.user.displayAvatarURL() });

      
      await interaction.reply({ embeds: [baseEmbed().setDescription(`${renderGrid(spin.reels, 0)}\n\n🎰 Spinning...`)] });

      
      
      for (let locked = 1; locked <= 2; locked++) {
        await sleep(REEL_STOP_DELAY_MS);
        await interaction.editReply({ embeds: [baseEmbed().setDescription(`${renderGrid(spin.reels, locked)}\n\n🎰 Spinning...`)] });
      }

      
      
      
      for (let i = 0; i < 2; i++) {
        await sleep(SPIN_FRAME_MS);
        await interaction.editReply({ embeds: [baseEmbed().setDescription(`${renderGrid(spin.reels, 2)}\n\n🎰 Spinning...`)] });
      }

      await sleep(REEL_STOP_DELAY_MS);

      
      
      
      
      let resultLine;
      let color;
      const won = spin.kind === 'triple' || spin.kind === 'pair';
      
      
      recordBetOutcome(interaction.user.id, won ? 'win' : 'loss');
      if (spin.kind === 'triple') {
        resultLine = `🎉 **TRIPLE ${spin.matchedSymbol.emoji}!** You win **${formatMoney(payout, settings)}**!`;
        color = 0xf1c40f;
      } else if (spin.kind === 'pair') {
        resultLine = `Pair of ${spin.matchedSymbol.emoji}! You win **${formatMoney(payout, settings)}**.`;
        color = 0x2ecc71;
      } else {
        resultLine = `No match. You lose **${formatMoney(bet, settings)}**.`;
        color = 0xe74c3c;
      }

      const finalEmbed = baseEmbed().setColor(color).setDescription(`${renderGrid(spin.reels, 3)}\n\n${resultLine}`);
      const rebetButtonId = `slots-${interaction.id ?? Date.now()}`;
      const rowButtons = [
        new ButtonBuilder().setCustomId(`slots-help-${interaction.user.id}`).setLabel('❓ Help').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`urebet-${rebetButtonId}`).setLabel('🔁 Re-Bet').setStyle(ButtonStyle.Success),
      ];
      if (!won && canDoubleDown(interaction.user.id)) {
        rowButtons.push(new ButtonBuilder().setCustomId(`udouble-${rebetButtonId}`).setLabel('⚔️ Double Down').setStyle(ButtonStyle.Danger));
      }
      const buttonRow = new ActionRowBuilder().addComponents(...rowButtons);
      await interaction.editReply({ embeds: [finalEmbed], components: [buttonRow] });
      const posted = await interaction.fetchReply();
      attachUniversalRebetHandler(posted, rebetButtonId);
      if (!won && canDoubleDown(interaction.user.id)) {
        attachDoubleDownHandler(posted, rebetButtonId, interaction.user.id);
      }

      const helpCollector = posted.createMessageComponentCollector({
        filter: (i) => i.customId === `slots-help-${interaction.user.id}`,
        time: HELP_IDLE_MS,
      });
      helpCollector.on('collect', async (i) => {
        
        
        return i.reply({ embeds: [buildSlotsHelp(settings)], ephemeral: true });
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
