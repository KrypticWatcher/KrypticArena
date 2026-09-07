import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fightChampion, previewChampionOdds, getArenaBalance } from '../../utils/arena.js';
import { getShinyChampionAbilityNote } from '../../utils/pets.js';
import { EconomyError, recordGameResult, ensureGuild } from '../../utils/economy.js';
import { awardChampionFightXp, isGladiatorAdventuring, getGladiatorProfile, formatGladiatorTitledName } from '../../utils/gladiator.js';
import { CHAMPION_BRACKETS, getUnlockedBrackets, getBracket, getBracketMaxWager, getBracketXpModifier, getBracketBaseXp } from '../../utils/championBrackets.js';
import { buildBossChallengeStatusLine } from '../../utils/bossChallenges.js';
import { describeSlayActiveTrip } from '../../utils/slay.js';
import { describeGatheringActiveTrip } from '../../utils/gathering.js';
import { formatArena } from '../../utils/format.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import { buildSoloCombatSequence, computeReadDelay, generateChampionName, sleep } from '../../utils/combatNarrative.js';
import { startSession, endSession } from '../../utils/activeSession.js';
import { getOwnedQuantity } from '../../utils/inventory.js';
import { recordLastBet, attachUniversalRebetHandler, buildUniversalRebetRow } from '../../utils/rebet.js';
import { buildRepairButtonIfNeeded } from '../../utils/durability.js';

export default {
  data: new SlashCommandBuilder()
    .setName('champion')
    .setDescription('Fight the Arena Champion for arena coins')
    .addSubcommand((sub) =>
      sub
        .setName('challenge')
        .setDescription('Wager arena coins against the Champion in a chosen Bracket')
        .addStringOption((opt) =>
          opt
            .setName('bracket')
            .setDescription('Which Champion Bracket to fight in')
            .setRequired(true)
            .addChoices(...CHAMPION_BRACKETS.map((b) => ({ name: b.name, value: b.id })))
        )
        .addStringOption((opt) =>
          opt
            .setName('wager')
            .setDescription('How many arena coins to wager — e.g. 500, 1.5k, or "all"')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('hades_dart')
            .setDescription("Spend 5x Hades' Dart to guarantee a win on this fight")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) => sub.setName('odds').setDescription('Preview your odds and payout for every Bracket you have unlocked')),

  
  
  
  
  
  
  
  async autocomplete(interaction) {
    if (interaction.options.getSubcommand() !== 'challenge') return interaction.respond([]);

    const settings = ensureGuild(interaction.guildId);
    const balance = getArenaBalance(interaction.guildId, interaction.user.id);
    const minWager = settings.champion_min_wager;

    
    
    
    
    if (balance < minWager) return interaction.respond([]);

    
    
    
    
    const bracketId = interaction.options.getString('bracket');
    const bracket = bracketId ? getBracket(bracketId) : null;
    const maxWager = bracket ? getBracketMaxWager(settings, bracket) : Infinity;

    const half = Math.floor(balance / 2);
    const quarter = Math.floor(balance / 4);
    const affordableAll = Math.min(balance, maxWager);

    
    
    
    
    
    
    
    
    const candidates = [
      { name: `💰 Balance: ${balance.toLocaleString('en-US')} arena coins`, value: 'all', amount: affordableAll },
      { name: `All (${affordableAll.toLocaleString('en-US')})`, value: String(affordableAll), amount: affordableAll },
      { name: `Half (${half.toLocaleString('en-US')})`, value: String(half), amount: half },
      { name: `Quarter (${quarter.toLocaleString('en-US')})`, value: String(quarter), amount: quarter },
    ];
    const suggestions = candidates.filter((c) => c.amount >= minWager && c.amount <= maxWager);

    const typed = interaction.options.getFocused().toLowerCase().trim();
    const filtered = typed ? suggestions.filter((s) => s.name.toLowerCase().includes(typed) || s.value.includes(typed)) : suggestions;
    return interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const settings = ensureGuild(interaction.guildId);

    const sub = interaction.options.getSubcommand();

    if (sub === 'odds') {
      const profile = getGladiatorProfile(interaction.guildId, interaction.user.id, interaction.user.displayName);
      const unlocked = getUnlockedBrackets(profile.level);
      const nextLocked = CHAMPION_BRACKETS.find((b) => !unlocked.some((u) => u.id === b.id));

      const lines = unlocked.map((bracket) => {
        const { winChance, failChance, payoutMultiplier, wagerBoost } = previewChampionOdds(interaction.guildId, interaction.user.id, bracket.id, interaction.user.displayName);
        const maxWager = getBracketMaxWager(settings, bracket);
        const baseXp = getBracketBaseXp(settings, bracket);
        const xpModifier = getBracketXpModifier(settings, bracket);
        const xpLine = xpModifier > 0 ? ` — +${xpModifier}% bonus Gladiator XP` : '';
        const wagerBoostLine = wagerBoost > 0 ? `\nWager Boost: **+${wagerBoost}%**` : '';
        return (
          `**${bracket.name}**\n` +
          `Win chance: **${(winChance * 100).toFixed(1)}%** · Fail chance: **${(failChance * 100).toFixed(1)}%** · Payout: **${payoutMultiplier.toFixed(2)}x**\n` +
          `Max wager: **${maxWager.toLocaleString('en-US')}** arena coins · Base XP on a win: **${baseXp.toLocaleString('en-US')}**${xpLine}${wagerBoostLine}`
        );
      });

      let description = lines.join('\n\n');

      const shinyChampionNote = getShinyChampionAbilityNote(interaction.guildId, interaction.user.id);
      if (shinyChampionNote) {
        description = `✨ *${shinyChampionNote} is boosting the odds/payout above.*\n\n${description}`;
      }
      if (nextLocked) {
        description += `\n\n🔒 **${nextLocked.name}** — unlocks at Gladiator level **${nextLocked.unlockLevel}**.`;
      }
      description += '\n\n*Equip arena gear to improve your odds within a bracket — leveling up unlocks harder brackets.*';

      const embed = new EmbedBuilder().setColor(0xf39c12).setTitle('⚔️ Your Champion Brackets').setDescription(description);
      return interaction.reply({ embeds: [embed] });
    }

    if (isGladiatorAdventuring(interaction.guildId, interaction.user.id)) {
      const profile = getGladiatorProfile(interaction.guildId, interaction.user.id, interaction.user.displayName);
      const timestamp = `<t:${Math.floor(profile.adventureEndsAt / 1000)}:R>`;
      const statusLine = profile.activeBossId
        ? buildBossChallengeStatusLine(profile.name, profile.activeBossId)
        : describeGatheringActiveTrip(profile.activeMobId, timestamp) ??
          describeSlayActiveTrip(profile.activeMobId, timestamp) ??
          `🗺️ Out on Quest. Back ${timestamp}.`;
      const content = `${statusLine} Can't fight the Champion while your Gladiator is away (duels and blackjack are still fine).`;
      return interaction.reply({
        content,
        ephemeral: true,
      });
    }

    const bracketId = interaction.options.getString('bracket', true);
    const bracket = getBracket(bracketId);
    if (!bracket) {
      return interaction.reply({ content: "That Champion Bracket doesn't exist.", ephemeral: true });
    }

    const raw = interaction.options.getString('wager', true).trim().toLowerCase();
    const maxWager = getBracketMaxWager(settings, bracket);
    const arenaBalance = getArenaBalance(interaction.guildId, interaction.user.id);

    let wager;
    if (raw === 'all' || raw === 'half' || raw === 'quarter') {
      wager = Math.min(resolveWagerAmount(raw, arenaBalance), maxWager);
    } else {
      wager = parseAmount(raw);
    }

    if (wager === null || wager < settings.champion_min_wager) {
      return interaction.reply({
        content:
          `**${raw}** isn't a valid wager. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`, \`half\`, \`quarter\`, or \`all\` — ` +
          `minimum is **${settings.champion_min_wager.toLocaleString('en-US')}** arena coins.`,
        ephemeral: true,
      });
    }
    if (wager > maxWager) {
      return interaction.reply({
        content: `**${bracket.name}** caps wagers at **${maxWager.toLocaleString('en-US')}** arena coins.`,
        ephemeral: true,
      });
    }

    const useDart = interaction.options.getBoolean('hades_dart') ?? false;
    if (useDart && getOwnedQuantity(interaction.guildId, interaction.user.id, 'hades_dart') < 5) {
      return interaction.reply({
        content: "You need **5x Hades' Dart** to guarantee a Champion fight.",
        ephemeral: true,
      });
    }

    recordLastBet(interaction.guildId, interaction.user.id, 'champion', {
      bracket: bracketId,
      wager: String(wager),
      hades_dart: useDart,
      __subcommand: 'challenge',
    });

    try {
      startSession(interaction.guildId, interaction.user.id, 'a Champion fight');
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    let result;
    try {
      result = fightChampion(interaction.guildId, interaction.user.id, bracketId, wager, settings.champion_min_wager, maxWager, interaction.user.displayName, useDart);
    } catch (err) {
      endSession(interaction.guildId, interaction.user.id);
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    try {
      const { won, comebackWin, dartUsed, wager: staked, payout, winChance, payoutMultiplier, arenaBalance, collectibleDrop, brokenGear } = result;

      recordGameResult(interaction.guildId, interaction.user.id, 'champion', {
        outcome: won ? 'win' : 'loss',
        net: 0,
      });

      recordGameResult(interaction.guildId, interaction.user.id, `champion_bracket_${bracket.order}`, {
        outcome: won ? 'win' : 'loss',
        net: 0,
      });

      const xpResult = awardChampionFightXp(
        interaction.guildId,
        interaction.user.id,
        won,
        interaction.user.displayName,
        getBracketBaseXp(settings, bracket),
        getBracketXpModifier(settings, bracket)
      );

      const opponentName = generateChampionName(bracket.order);
      const displayName = formatGladiatorTitledName(
        interaction.guildId,
        interaction.user.id,
        getGladiatorProfile(interaction.guildId, interaction.user.id, interaction.user.displayName).name
      );
      const beats = buildSoloCombatSequence({ won, riskyWin: won && winChance < 0.3, comebackWin, dartUsed, opponentName, gladiatorName: displayName });

      const introLine = `**${displayName}** steps forward to challenge **${opponentName}** in **${bracket.name}**.`;
      const dartIntroLine = dartUsed
        ? `\n\n🗡️ *"Hades' Dart marks ${displayName} with the Underworld's protection — whatever happens in this fight, their fate has already been decided."*\n*Consumed 5x Hades' Dart*`
        : '';
      beats[0] = `${introLine}${dartIntroLine}\n\n${beats[0]}`;

      const NEUTRAL = 0x95a5a6;
      const SUCCESS = 0x2ecc71;
      const DAMAGE = 0xf1c40f;
      const FATAL = 0xe74c3c;

      const beatColors = [NEUTRAL, NEUTRAL, dartUsed ? DAMAGE : won && !comebackWin ? SUCCESS : DAMAGE, won ? SUCCESS : FATAL];

      const author = { name: displayName, iconURL: interaction.user.displayAvatarURL() };
      const inProgressEmbed = (description, color) =>
        new EmbedBuilder().setColor(color).setTitle(`⚔️ ${displayName} vs ${opponentName}`).setAuthor(author).setDescription(description);

      await interaction.reply({ embeds: [inProgressEmbed(beats[0], beatColors[0])] });
      for (let i = 1; i < beats.length; i++) {
        await sleep(computeReadDelay(beats[i - 1]));
        await interaction.editReply({ embeds: [inProgressEmbed(beats[i], beatColors[i])] });
      }

      await sleep(computeReadDelay(beats[beats.length - 1]));
      const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x2ecc71 : 0xe74c3c)
        .setTitle(
          dartUsed
            ? `🗡️ Dart-Forged Victory over ${opponentName}!`
            : comebackWin
              ? `🔥 Comeback Victory over ${opponentName}!`
              : won
                ? `🏆 Victory over ${opponentName}!`
                : `💀 Defeated by ${opponentName}`
        )
        .setAuthor(author)
        .setDescription(
          `**Bracket:** ${bracket.name}\n` +
            `**Wagered:** ${formatArena(staked)}\n` +
            (won
              ? `**Payout:** ${formatArena(payout)} *(${payoutMultiplier.toFixed(2)}x)*\n`
              : `**Lost:** ${formatArena(staked)}\n`) +
            `**Arena balance:** ${formatArena(arenaBalance)}\n` +
            `**Gladiator XP:** +${xpResult.xpGained.toLocaleString('en-US')}${xpResult.leveledUp ? ` — 🆙 **Level ${xpResult.after.level}!**` : ''}\n\n` +
            (xpResult.justMaxed
              ? `👑 **MAXED OUT!** **${displayName}** just hit the 200,000,000 XP cap — the **Laurel of the Undying** has been added to their collection.\n\n`
              : '') +
            (collectibleDrop ? `🎁 **Rare drop:** ${collectibleDrop.name}!\n\n` : '') +
            (brokenGear.length > 0
              ? `🔧 **Broke from the fight:** ${brokenGear.map((i) => i.name).join(', ')} — check \`/repair\`.\n\n`
              : '') +
            (dartUsed
              ? `*This one was headed for a loss — until the protection of Hades took hold.*`
              : comebackWin
                ? `*This one was headed for a loss — ${displayName} pulled off a comeback.*`
                : `*Odds going in: ${(winChance * 100).toFixed(1)}% to win.*`)
        );
      const rebetButtonId = `champion-${interaction.id ?? Date.now()}`;
      const rebetRow = buildUniversalRebetRow(rebetButtonId);
      const repairButtonRow = buildRepairButtonIfNeeded(interaction.guildId, interaction.user.id);
      await interaction.editReply({ embeds: [resultEmbed], components: [rebetRow, ...(repairButtonRow ? [repairButtonRow] : [])] });
      const posted = await interaction.fetchReply();
      attachUniversalRebetHandler(posted, rebetButtonId);
      return;
    } finally {
      endSession(interaction.guildId, interaction.user.id);
    }
  },
};
