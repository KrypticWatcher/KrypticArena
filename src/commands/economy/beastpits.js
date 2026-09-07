import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import {
  getActivePet,
  getPetsForUser,
  describePet,
  isPetRestingFromBotFights,
  isPetInTotalRest,
  recordBotFightAttempt,
  rollBotFightOutcome,
  adjustPetWinRateAfterBotFight,
  grantBotFightWinXp,
  formatPetLevelUpLine,
} from '../../utils/pets.js';
import { isGladiatorAdventuring } from '../../utils/gladiator.js';
import { getPetImagePath, getRandomBotFightOpponentSpecies } from '../../data/pets.js';
import { buildBotFightFlavorBeats } from '../../utils/beastPitsBotFightFlavor.js';
import { sleep, computeReadDelay } from '../../utils/combatNarrative.js';
import { renderBeastPitsBattleImage, renderBeastPitsResultImage } from '../../utils/beastPitsBattleImage.js';
import { startSession, endSession, getActiveLabel } from '../../utils/activeSession.js';
import { EconomyError, ensureGuild, getArenaBalance, ensureUser, recordGameResult } from '../../utils/economy.js';
import { formatArena, formatMoney } from '../../utils/format.js';
import { parseAmount, resolveWagerAmount } from '../../utils/parseAmount.js';
import {
  createMatch,
  resolveAction,
  rollFirstTurnAbility,
  resolveRestTurn,
  getAvailableActions,
  formatRestTurnLine,
  TOTAL_ROUNDS,
  BEAST_PITS_WAGER_CURRENCIES,
  createBeastPitsWager,
  refundBeastPitsWager,
  matchBeastPitsWager,
  payoutBeastPitsWager,
} from '../../utils/beastPitsMatch.js';
import { PVP_TURN_TIMEOUT_MS } from '../../utils/beastPitsCombat.js';
import { recordLoss } from '../../utils/gainLog.js';

const CHALLENGE_ACCEPT_TIMEOUT_MS = 15_000;

const ACTION_LABEL = { attack: '⚔️ Attack', guard: '🛡️ Guard', frenzy: '💥 Frenzy' };
const ACTION_STYLE = { attack: ButtonStyle.Danger, guard: ButtonStyle.Primary, frenzy: ButtonStyle.Success };

function buildTurnResultLine(match) {
  const t = match.lastTurn;
  if (!t) return null;
  if (t.action === 'rest') return `😮\u200d💨 ${formatRestTurnLine(match)}`;
  const attacker = match.players[t.attackerIndex];
  const defender = match.players[t.defenderIndex];
  if (t.action === 'guard') {
    
    
    
    
    
    
    return `🛡️ **${attacker.displayName}** braces for the next hit.`;
  }
  
  
  
  
  
  
  const frenzyStartPrefix = t.action === 'frenzy' ? `🔥 **${attacker.displayName}** enters a Frenzy!\n` : '';
  if (t.dodged) return `${frenzyStartPrefix}💨 **${defender.displayName}** dodged **${attacker.displayName}**'s attack!`;
  if (t.frenzyMissed) return `${frenzyStartPrefix}💥 **${attacker.displayName}**'s frenzied attack missed wildly!`;
  const critText = t.crit ? ' **CRITICAL HIT!**' : '';
  const secondWindText = t.secondWindTriggered ? `\n🔥 **${defender.displayName}**'s Second Wind kicks in — it's still standing!` : '';
  return `${frenzyStartPrefix}⚔️ **${attacker.displayName}** hits **${defender.displayName}** for **${t.damage}** damage!${critText}${secondWindText}`;
}

function buildActionRow(match) {
  const actions = getAvailableActions(match);
  const row = new ActionRowBuilder();
  for (const action of actions) {
    row.addComponents(new ButtonBuilder().setCustomId(action).setLabel(ACTION_LABEL[action]).setStyle(ACTION_STYLE[action]));
  }
  return row;
}

async function buildBattlePayload(match, resultLine, components) {
  const [left, right] = match.players;
  const buffer = await renderBeastPitsBattleImage(match, left.imagePath, right.imagePath, resultLine);
  const attachment = new AttachmentBuilder(buffer, { name: 'beastpits.png' });
  return { content: '', embeds: [new EmbedBuilder().setColor(0xe74c3c).setImage('attachment://beastpits.png')], files: [attachment], components };
}

function buildAbilityAnnouncementLine(match, rollResult) {
  const attacker = match.players[rollResult.attackerIndex];
  const name = rollResult.abilityName;
  if (!rollResult.triggered) return null;
  if (rollResult.isApexPredator) {
    return `🐾 **${attacker.displayName}**'s ${name ?? 'Apex Predator'} stirs to life — its first strike this match will hit twice as hard!`;
  }
  return `🔥 **${attacker.displayName}**'s **${name ?? 'Nethercharged Roar'}** echoes out — its attack damage is empowered for this turn!`;
}

async function runBotFight(interaction, challenger, challengerPet, wagerAmount, wagerCurrency) {
  const guildId = interaction.guildId;

  if (isPetInTotalRest(challengerPet)) {
    if (wagerAmount > 0) refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
    const readyAt = Math.ceil((challengerPet.total_rest_until - Date.now()) / (24 * 60 * 60 * 1000));
    return interaction.reply({
      content: `**${challengerPet.displayName}** lost too many Beast Pits fights in a row and needs a real rest — ready again in about ${readyAt} day${readyAt === 1 ? '' : 's'}. It can't fight anyone, players included, until then. Your wager was refunded.`,
      ephemeral: true,
    });
  }

  if (isPetRestingFromBotFights(challengerPet)) {
    if (wagerAmount > 0) refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
    const readyAt = Math.ceil((challengerPet.cooldown_until - Date.now()) / (24 * 60 * 60 * 1000));
    return interaction.reply({
      content: `**${challengerPet.displayName}** is worn out from the Beast Pits and needs to rest — ready again in about ${readyAt} day${readyAt === 1 ? '' : 's'}. Your wager was refunded. It can still fight other players' pets in the meantime.`,
      ephemeral: true,
    });
  }

  const opponentSpecies = getRandomBotFightOpponentSpecies();
  const won = rollBotFightOutcome(challengerPet.win_rate);
  const justEnteredRest = recordBotFightAttempt(challengerPet.instance_id, challengerPet.rarity);
  const newWinRate = adjustPetWinRateAfterBotFight(challengerPet.instance_id, challengerPet.win_rate, won, challengerPet.rarity);

  const petXpResult = won ? grantBotFightWinXp(challengerPet) : null;

  if (wagerAmount > 0) {
    if (won) {
      payoutBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency, 'beastpits_bot');
    } else {

      recordLoss(guildId, challenger.id, wagerCurrency === 'arena' ? 'arena' : 'cash', wagerAmount, 'beastpits_bot');
    }
  }

  const beats = buildBotFightFlavorBeats({ won, petName: challengerPet.displayName, speciesName: opponentSpecies.name });
  const winPct = Math.round(newWinRate * 100);
  const wagerLine =
    wagerAmount > 0
      ? won
        ? `\n\nYou won **${wagerCurrency === 'arena' ? formatArena(wagerAmount * 2) : formatMoney(wagerAmount * 2, ensureGuild(guildId))}**!`
        : `\n\nYou lost your wager of **${wagerCurrency === 'arena' ? formatArena(wagerAmount) : formatMoney(wagerAmount, ensureGuild(guildId))}**.`
      : '';
  const restLine = justEnteredRest
    ? `\n\n**${challengerPet.displayName}** is worn out after 3 straight Beast Pits fights and needs to rest before doing this again — it can still fight other players' pets, though.`
    : '';

  const NEUTRAL = 0x95a5a6;
  const SUCCESS = 0x2ecc71;
  const DAMAGE = 0xf1c40f;
  const FATAL = 0xe74c3c;
  const RESULT_COLOR = won ? SUCCESS : FATAL;
  const beatColors = [NEUTRAL, NEUTRAL, won ? DAMAGE : FATAL, RESULT_COLOR];
  const beatEmbed = (description, color) => new EmbedBuilder().setColor(color).setTitle(`Beast Pits — ${challengerPet.displayName}`).setDescription(description);

  await interaction.reply({ embeds: [beatEmbed(beats[0], beatColors[0])] });
  for (let i = 1; i < beats.length; i++) {
    await sleep(computeReadDelay(beats[i - 1]));
    await interaction.editReply({ embeds: [beatEmbed(beats[i], beatColors[i])] });
  }

  await sleep(computeReadDelay(beats[beats.length - 1]));
  const petXpLine = petXpResult ? formatPetLevelUpLine(petXpResult) : null;
  const resultDescription = [wagerLine.trim(), petXpLine, restLine.trim()].filter(Boolean).join('\n\n') || 'A well-fought match.';
  const resultEmbed = new EmbedBuilder()
    .setColor(RESULT_COLOR)
    .setTitle(won ? 'Victory!' : 'Defeat')
    .setDescription(resultDescription)
    .setFooter({ text: `${challengerPet.displayName}'s win rate: ${winPct}%` });

  return interaction.editReply({ embeds: [resultEmbed] });}

async function runMatch(interaction, match) {

  while (match.status === 'active' && getAvailableActions(match).length === 0) {
    match = resolveRestTurn(match);
    await interaction.editReply(await buildBattlePayload(match, buildTurnResultLine(match), []));
    await new Promise((r) => setTimeout(r, 1500)); 
  }

  if (match.status === 'finished') return match;

  
  
  
  
  
  
  const abilityRoll = rollFirstTurnAbility(match);
  let persistentAnnouncement = null;
  if (abilityRoll) {
    const announcementLine = buildAbilityAnnouncementLine(match, abilityRoll);
    if (announcementLine) {
      await interaction.editReply(await buildBattlePayload(match, announcementLine, []));
      await new Promise((r) => setTimeout(r, 1500)); 
      
      
      
      
      persistentAnnouncement = announcementLine;
    }
  }

  const activePlayer = match.players[match.activePlayerIndex];
  const message = await interaction.editReply(await buildBattlePayload(match, persistentAnnouncement, [buildActionRow(match)]));

  let click;
  try {
    click = await message.awaitMessageComponent({
      filter: (i) => i.user.id === activePlayer.userId,
      time: PVP_TURN_TIMEOUT_MS,
    });
  } catch {
    
    
    
    match.status = 'finished';
    match.winnerIndex = match.activePlayerIndex === 0 ? 1 : 0;
    await interaction.editReply(await buildBattlePayload(match, `⏱️ ${activePlayer.displayName} ran out of time — forfeit!`, []));
    return match;
  }

  await click.deferUpdate();
  match = resolveAction(match, click.customId);
  await interaction.editReply(await buildBattlePayload(match, buildTurnResultLine(match), []));

  if (match.status === 'active') {
    await new Promise((r) => setTimeout(r, 1200)); 
    return runMatch(interaction, match);
  }
  return match;
}

export default {
  data: new SlashCommandBuilder()
    .setName('beastpits')
    .setDescription('Beast Pits')
    .addSubcommand((sub) =>
      sub
        .setName('challenge')
        .setDescription('Challenge another player to a Beast Pits PvP fight')
        .addUserOption((opt) => opt.setName('opponent').setDescription('Who to challenge').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('wager').setDescription('Optional — wager an amount (e.g. 500, 1.5k, half, all). Leave blank to fight for skill only').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('currency').setDescription('Which currency to wager (default: arena coins)').setRequired(false).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('pet')
            .setDescription('Beast Pits only — which pet to send (defaults to your equipped one). Ignored for player challenges.')
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'pet') {
      const typed = focused.value.toLowerCase();
      const pets = getPetsForUser(interaction.guildId, interaction.user.id).map(describePet);
      const matches = pets.filter((p) => p.displayName.toLowerCase().includes(typed) || p.speciesName.toLowerCase().includes(typed)).slice(0, 25);
      return interaction.respond(matches.map((p) => ({ name: `${p.isShiny ? '✨ ' : ''}${p.displayName} — ${p.speciesName}`, value: p.instance_id })));
    }
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = [
      { name: 'Arena Coins', value: 'arena' },
      { name: 'Gambling Currency', value: 'gambling' },
    ].filter((c) => c.name.toLowerCase().includes(typed));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('opponent', true);

    if (opponent.id === challenger.id) {
      return interaction.reply({ content: "You can't challenge yourself.", ephemeral: true });
    }
    
    
    
    
    const isBotFight = opponent.id === interaction.client.user.id;
    if (opponent.bot && !isBotFight) {
      return interaction.reply({ content: "You can't challenge a bot.", ephemeral: true });
    }

    const equippedPetRaw = getActivePet(guildId, challenger.id);

    const challengerActive = getActiveLabel(guildId, challenger.id);
    if (challengerActive) {
      return interaction.reply({ content: `You already have **${challengerActive}** in progress.`, ephemeral: true });
    }
    
    
    
    
    
    
    
    
    
    
    
    
    
    if (!isBotFight && isGladiatorAdventuring(guildId, challenger.id)) {
      return interaction.reply({ content: 'Your Gladiator is currently out on an Adventure or Boss Challenge.', ephemeral: true });
    }

    
    
    
    
    
    
    
    let challengerPetRaw;
    if (isBotFight) {
      const petOptionId = interaction.options.getString('pet');
      if (petOptionId) {
        challengerPetRaw = getPetsForUser(guildId, challenger.id).find((p) => p.instance_id === petOptionId);
        if (!challengerPetRaw) {
          return interaction.reply({ content: "You don't own that pet.", ephemeral: true });
        }
      } else {
        challengerPetRaw = equippedPetRaw;
      }
      if (!challengerPetRaw) {
        return interaction.reply({ content: "You don't have a pet to send — equip one with `/pet equip`, or pick one with `pet:`.", ephemeral: true });
      }
      if (equippedPetRaw && challengerPetRaw.instance_id === equippedPetRaw.instance_id && isGladiatorAdventuring(guildId, challenger.id)) {
        return interaction.reply({
          content: "Your equipped pet is out on an Adventure/Boss Challenge with your Gladiator — send a different pet instead, or wait for it to return.",
          ephemeral: true,
        });
      }
    } else {
      challengerPetRaw = equippedPetRaw;
      if (!challengerPetRaw) {
        return interaction.reply({ content: "You don't have a pet equipped — use `/pet equip` first.", ephemeral: true });
      }
      
      
      
      
      if (isPetInTotalRest(challengerPetRaw)) {
        const readyAt = Math.ceil((challengerPetRaw.total_rest_until - Date.now()) / (24 * 60 * 60 * 1000));
        return interaction.reply({
          content: `**${describePet(challengerPetRaw).displayName}** lost too many Beast Pits fights in a row and needs a real rest — ready again in about ${readyAt} day${readyAt === 1 ? '' : 's'}. It can't fight anyone until then.`,
          ephemeral: true,
        });
      }
    }

    if (!isBotFight) {
      const opponentPetRaw = getActivePet(guildId, opponent.id);
      if (!opponentPetRaw) {
        return interaction.reply({ content: `<@${opponent.id}> doesn't have a pet equipped.`, ephemeral: true });
      }
      if (isPetInTotalRest(opponentPetRaw)) {
        return interaction.reply({ content: `<@${opponent.id}>'s pet is resting after too many Beast Pits losses and can't fight right now.`, ephemeral: true });
      }
      const opponentActive = getActiveLabel(guildId, opponent.id);
      if (opponentActive) {
        return interaction.reply({ content: `<@${opponent.id}> already has **${opponentActive}** in progress.`, ephemeral: true });
      }
    }

    
    
    let wagerAmount = 0;
    let wagerCurrency = 'arena';
    const wagerRaw = interaction.options.getString('wager');
    if (isBotFight && !wagerRaw) {
      return interaction.reply({ content: 'The Beast Pits require a wager — add `wager:` to challenge the automatch.', ephemeral: true });
    }
    if (wagerRaw) {
      const currencyRaw = interaction.options.getString('currency');
      if (currencyRaw) {
        if (!BEAST_PITS_WAGER_CURRENCIES.includes(currencyRaw)) {
          return interaction.reply({ content: `**${currencyRaw}** isn't a valid currency. Try \`arena\` or \`gambling\`.`, ephemeral: true });
        }
        wagerCurrency = currencyRaw;
      }
      const trimmed = wagerRaw.trim().toLowerCase();
      if (trimmed === 'all' || trimmed === 'half' || trimmed === 'quarter') {
        const numericBalance = wagerCurrency === 'arena' ? getArenaBalance(guildId, challenger.id) : ensureUser(guildId, challenger.id).cash;
        if (numericBalance <= 0) {
          return interaction.reply({ content: "You don't have anything to wager in that currency.", ephemeral: true });
        }
        wagerAmount = resolveWagerAmount(trimmed, numericBalance);
      } else {
        wagerAmount = parseAmount(trimmed);
      }
      if (wagerAmount === null || wagerAmount < 1) {
        return interaction.reply({
          content: `**${wagerRaw}** isn't a valid wager. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`half\`, or \`all\`.`,
          ephemeral: true,
        });
      }
      try {
        createBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
      } catch (err) {
        if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
        throw err;
      }
    }

    if (isBotFight) {
      return runBotFight(interaction, challenger, describePet(challengerPetRaw), wagerAmount, wagerCurrency);
    }

    const opponentPetRaw = getActivePet(guildId, opponent.id);
    const challengerPet = describePet(challengerPetRaw);
    const opponentPet = describePet(opponentPetRaw);

    const acceptId = 'bp-accept';
    const declineId = 'bp-decline';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    const wagerLine = wagerAmount > 0 ? `\n\n💰 Wagering **${wagerCurrency === 'arena' ? formatArena(wagerAmount) : formatMoney(wagerAmount, ensureGuild(guildId))}** each.` : '';
    const challengeEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🥊 Beast Pits Challenge')
      .setDescription(
        `<@${challenger.id}>'s **${challengerPet.displayName}** (${challengerPet.speciesName}) challenges <@${opponent.id}>'s **${opponentPet.displayName}** (${opponentPet.speciesName})!\n\n` +
          `${TOTAL_ROUNDS} rounds. <@${opponent.id}>, do you accept?${wagerLine}`
      );

    const challengeMessage = await interaction.reply({ content: `<@${opponent.id}>`, embeds: [challengeEmbed], components: [row], fetchReply: true });

    let click;
    try {
      click = await challengeMessage.awaitMessageComponent({
        filter: (i) => i.user.id === opponent.id,
        time: CHALLENGE_ACCEPT_TIMEOUT_MS,
      });
    } catch {
      if (wagerAmount > 0) refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
      return interaction.editReply({ content: '', embeds: [challengeEmbed.setFooter({ text: 'Challenge timed out.' + (wagerAmount > 0 ? ' Wager refunded.' : '') })], components: [] });
    }

    if (click.customId === declineId) {
      if (wagerAmount > 0) refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
      return click.update({ content: '', embeds: [challengeEmbed.setFooter({ text: `${opponent.username} declined.` + (wagerAmount > 0 ? ' Wager refunded.' : '') })], components: [] });
    }

    if (isGladiatorAdventuring(guildId, opponent.id)) {
      if (wagerAmount > 0) refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
      await click.update({
        content: '',
        embeds: [challengeEmbed.setFooter({ text: `${opponent.username}'s Gladiator is out on an Adventure or Boss Challenge right now.` + (wagerAmount > 0 ? ' Wager refunded.' : '') })],
        components: [],
      });
      return;
    }

    if (wagerAmount > 0) {
      try {
        matchBeastPitsWager(guildId, opponent.id, wagerAmount, wagerCurrency);
      } catch (err) {
        refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
        if (err instanceof EconomyError) {
          return click.update({ content: '', embeds: [challengeEmbed.setFooter({ text: `${err.message} Challenge cancelled, wager refunded.` })], components: [] });
        }
        throw err;
      }
    }

    await click.deferUpdate();

    startSession(guildId, challenger.id, 'a Beast Pits fight');
    startSession(guildId, opponent.id, 'a Beast Pits fight');

    let match = createMatch(
      {
        userId: challenger.id,
        instanceId: challengerPet.instance_id,
        displayName: challengerPet.displayName,
        speciesName: challengerPet.speciesName,
        imagePath: getPetImagePath({ image: challengerPet.image }),
        attack: challengerPet.attack,
        defense: challengerPet.defense,
        vitality: challengerPet.vitality,
        speed: challengerPet.speed,

        shinyAbilityType: challengerPet.shinyAbilityType,
        shiny_ability_percent: challengerPet.shiny_ability_percent,
      },
      {
        userId: opponent.id,
        instanceId: opponentPet.instance_id,
        displayName: opponentPet.displayName,
        speciesName: opponentPet.speciesName,
        imagePath: getPetImagePath({ image: opponentPet.image }),
        attack: opponentPet.attack,
        defense: opponentPet.defense,
        vitality: opponentPet.vitality,
        speed: opponentPet.speed,
        shinyAbilityType: opponentPet.shinyAbilityType,
        shiny_ability_percent: opponentPet.shiny_ability_percent,
      }
    );

    try {
      match = await runMatch(interaction, match);

      if (wagerAmount > 0) {
        if (match.isDraw) {
          refundBeastPitsWager(guildId, challenger.id, wagerAmount, wagerCurrency);
          refundBeastPitsWager(guildId, opponent.id, wagerAmount, wagerCurrency);
        } else {
          const winnerId = match.players[match.winnerIndex].userId;
          payoutBeastPitsWager(guildId, winnerId, wagerAmount, wagerCurrency);
        }
      }

      if (!match.isDraw) {
        const winnerId = match.players[match.winnerIndex].userId;
        const loserId = match.players[match.winnerIndex === 0 ? 1 : 0].userId;
        recordGameResult(guildId, winnerId, 'beastpits_pvp', { outcome: 'win', net: 0 });
        recordGameResult(guildId, loserId, 'beastpits_pvp', { outcome: 'loss', net: 0 });
      }

      const winnerPlayer = match.isDraw ? null : match.players[match.winnerIndex];
      const winnerOwnerName = winnerPlayer ? (winnerPlayer.userId === challenger.id ? challenger.username : opponent.username) : null;
      const resultBuffer = await renderBeastPitsResultImage(match, winnerPlayer?.imagePath ?? null, winnerOwnerName, wagerAmount, wagerCurrency);
      const resultAttachment = new AttachmentBuilder(resultBuffer, { name: 'beastpits-result.png' });
      const pingLine = match.isDraw ? `<@${challenger.id}> <@${opponent.id}>` : `<@${winnerPlayer.userId}>`;
      await interaction.editReply({
        content: pingLine,
        embeds: [new EmbedBuilder().setColor(match.isDraw ? 0x888888 : 0xd4af37).setImage('attachment://beastpits-result.png')],
        files: [resultAttachment],
        components: [],
      });
    } finally {
      endSession(guildId, challenger.id);
      endSession(guildId, opponent.id);
    }
  },
};
