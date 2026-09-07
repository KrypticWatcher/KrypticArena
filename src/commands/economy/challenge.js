import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getAllDomains, getDomain, getBoss, getBossChallengeCost, getBossImagePath } from '../../data/bossDomains.js';
import { checkBossUnlocked, checkBossGearRequirement, getBossProgress, getBossKillExperienceDurationMinutes, getBossKcBoostPercent } from '../../utils/bossChallenges.js';
import { getAllEquipmentSets } from '../../utils/inventory.js';
import { ensureGladiator, isGladiatorAdventuring, getGladiatorProfile, startGladiatorAdventure, hasInstantTrips } from '../../utils/gladiator.js';
import { buildBossChallengeStatusLine } from '../../utils/bossChallenges.js';
import { getBalance, addCash, ensureUser, ensureGuild, EconomyError } from '../../utils/economy.js';
import { getArenaBalance, addArenaCoins } from '../../utils/arena.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { pickBossFlavor } from '../../data/bossFlavor.js';
import { PET_BOSS_FLAVOR, getPetFlavorLine } from '../../data/petFlavor.js';
import { getShinyBossCostReductionPercent, getActivePet } from '../../utils/pets.js';
import { getBossElixirCost, requireAndConsumeElixirs } from '../../utils/elixir.js';
import { requireTrainingGear } from '../../utils/trainingStyle.js';
import { recordLoss } from '../../utils/gainLog.js';

const NO_BOSSES_UNLOCKED_VALUE = '__none_unlocked__';

export async function attemptBossChallenge(guildId, userId, channelId, displayName, domain, boss) {
  ensureUser(guildId, userId);
  ensureGladiator(guildId, userId, displayName);

  if (isGladiatorAdventuring(guildId, userId)) {
    const profile = getGladiatorProfile(guildId, userId, displayName);
    const content = profile.activeBossId
      ? buildBossChallengeStatusLine(profile.name, profile.activeBossId)
      : "Your Gladiator is already out on an Adventure — can't start a Boss Challenge until they're back.";
    return { content, ephemeral: true };
  }

  const unlock = checkBossUnlocked(boss, userId);
  if (!unlock.allowed) {
    return { content: `You're not ready for **${boss.name}** yet. You still need: ${unlock.reason}`, ephemeral: true };
  }

  const allSets = getAllEquipmentSets(guildId, userId);
  const gearCheck = checkBossGearRequirement(allSets, boss);
  if (!gearCheck.allowed) {
    return {
      content: `Your equipment is too weak to challenge **${boss.name}**. You still need:\n${gearCheck.reasons.map((r) => `- ${r}`).join('\n')}`,
      ephemeral: true,
    };
  }

  
  
  
  try {
    requireTrainingGear(guildId, userId, allSets.adventure);
  } catch (err) {
    if (err instanceof EconomyError) return { content: err.message, ephemeral: true };
    throw err;
  }

  
  
  
  
  const currentProgress = getBossProgress(userId, boss.id).progress;
  const isFreshAttempt = currentProgress === 0;
  const baseCost = getBossChallengeCost(boss.order);
  
  
  const shinyCostReductionPercent = getShinyBossCostReductionPercent(guildId, userId);
  const cost = {
    gambling: Math.max(0, Math.round(baseCost.gambling * (1 - shinyCostReductionPercent / 100))),
    arena: Math.max(0, Math.round(baseCost.arena * (1 - shinyCostReductionPercent / 100))),
  };
  const settings = ensureGuild(guildId);
  if (isFreshAttempt) {
    const cashBalance = getBalance(guildId, userId).cash;
    const arenaBalance = getArenaBalance(guildId, userId);
    if (cashBalance < cost.gambling) {
      return {
        content: `Challenging **${boss.name}** costs **${formatMoney(cost.gambling, settings)}** — you only have **${formatMoney(cashBalance, settings)}**.`,
        ephemeral: true,
      };
    }
    if (arenaBalance < cost.arena) {
      return {
        content: `Challenging **${boss.name}** also costs **${formatArena(cost.arena)}** — you only have **${formatArena(arenaBalance)}**.`,
        ephemeral: true,
      };
    }
    addCash(guildId, userId, -cost.gambling);
    addArenaCoins(guildId, userId, -cost.arena);
    if (cost.gambling > 0) recordLoss(guildId, userId, 'cash', cost.gambling, 'boss_challenge');
    if (cost.arena > 0) recordLoss(guildId, userId, 'arena', cost.arena, 'boss_challenge');
  }

  
  
  
  
  const profileForLevel = getGladiatorProfile(guildId, userId, displayName);
  const elixirCost = getBossElixirCost(boss, profileForLevel.level);
  try {
    requireAndConsumeElixirs(guildId, userId, elixirCost, `To challenge **${boss.name}** you require`);
  } catch (err) {
    if (err instanceof EconomyError) return { content: err.message, ephemeral: true };
    throw err;
  }

  
  
  
  
  
  
  
  
  const progress = getBossProgress(userId, boss.id);
  
  
  
  
  
  const durationMinutes = getBossKillExperienceDurationMinutes(progress.kills);
  const hasInstant = hasInstantTrips(guildId, userId);
  const endsAt = hasInstant ? Date.now() + 30_000 : Date.now() + durationMinutes * 60_000;
  startGladiatorAdventure(guildId, userId, endsAt, channelId, null, displayName, durationMinutes, false, boss.id);

  const progressNote =
    boss.sendsRequired > 1 ? `\n*This kill requires ${boss.sendsRequired} successful challenges — you've banked ${progress.progress}/${boss.sendsRequired} so far.*` : '';

  const imagePath = getBossImagePath(boss.id);
  const files = imagePath ? [new AttachmentBuilder(imagePath, { name: `${boss.id}.png` })] : [];

  const profile = getGladiatorProfile(guildId, userId, displayName);

  const sendOffFlavor =
    pickBossFlavor(boss.id, 'sendOff', profile.name) ?? `**${profile.name}** enters ${domain.domainName} to challenge **${boss.name}**, ${boss.title}.`;

  
  
  
  
  
  const equippedPet = getActivePet(guildId, userId);
  const petLine = equippedPet
    ? getPetFlavorLine(PET_BOSS_FLAVOR, equippedPet.species_id, equippedPet.nickname ?? equippedPet.given_name, profile.name)
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x1f6b4a)
    .setTitle(`⚔️ ${boss.name} — ${boss.title}`)
    .setDescription(
      `${sendOffFlavor}${petLine ? `\n🐾 ${petLine}` : ''}\n\n*${boss.lore}*\n\n⏳ **Challenge ends** <t:${Math.floor(endsAt / 1000)}:R>${progressNote}`
    );

  if (imagePath) {
    embed.setImage(`attachment://${boss.id}.png`);
  }

  const kcBoostPercent = getBossKcBoostPercent(progress.kills);
  return { content: `*Consumed ${elixirCost}x Elixir*\nKC Boost: ${kcBoostPercent}%`, embeds: [embed], files };
}

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription("Challenge a god domain's bosses")
    .addStringOption((opt) =>
      opt
        .setName('domain')
        .setDescription("Which god's domain to challenge")
        .setRequired(true)
        .addChoices(...getAllDomains().map((d) => ({ name: d.godName, value: d.id })))
    )
    .addStringOption((opt) =>
      opt.setName('boss').setDescription('Which boss to challenge').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const domainId = interaction.options.getString('domain');
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const domain = getDomain(domainId);
    if (!domain) return interaction.respond([]);

    
    
    
    
    
    
    const choices = [];
    for (const boss of domain.bosses) {
      const { allowed } = checkBossUnlocked(boss, userId);
      if (!allowed) continue;
      if (boss.name.toLowerCase().includes(typed)) choices.push({ name: boss.name, value: boss.id });
    }

    
    
    
    
    
    
    
    if (choices.length === 0) {
      const firstBoss = domain.bosses[0];
      const unlock = checkBossUnlocked(firstBoss, userId);
      return interaction.respond([
        { name: unlock.allowed ? 'Nothing to show' : `Nothing unlocked yet — need: ${unlock.reason}`, value: NO_BOSSES_UNLOCKED_VALUE },
      ]);
    }

    return interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const bossId = interaction.options.getString('boss', true);
    const domainIdOption = interaction.options.getString('domain', true);

    if (bossId === NO_BOSSES_UNLOCKED_VALUE) {
      return interaction.reply({
        content: "You haven't unlocked any boss in this domain yet — check the autocomplete hint on what's needed.",
        ephemeral: true,
      });
    }

    const domain = getDomain(domainIdOption);
    const boss = getBoss(domainIdOption, bossId);
    if (!boss) {
      return interaction.reply({ content: "That's not a valid boss — pick one from the autocomplete list.", ephemeral: true });
    }

    const payload = await attemptBossChallenge(guildId, userId, interaction.channelId, interaction.user.displayName, domain, boss);
    return interaction.reply(payload);
  },
};
