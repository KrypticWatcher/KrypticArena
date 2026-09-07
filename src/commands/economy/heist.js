import { SlashCommandBuilder } from 'discord.js';
import { getOwnedQuantity, addItemToInventory } from '../../utils/inventory.js';
import { getBalance } from '../../utils/economy.js';
import { getItem } from '../../data/items.js';
import { computeStealAmount } from '../../utils/heists.js';
import { isHeistOnCooldown, getHeistCooldownRemainingMs, isRepeatTarget, recordHeistAttempt } from '../../utils/heistAttempts.js';
import { getPendingHeistForAttacker, getPendingHeistsForTarget, scheduleHeist, MAX_HEIST_GROUP_SIZE } from '../../utils/heistScheduler.js';
import { getProtectionScoutReport } from '../../utils/heistResolution.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { formatDuration } from '../../utils/format.js';

const CHOOSABLE_TOOL_IDS = ['heist_lockpick_set', 'heist_crowbar', 'heist_grappling_hook', 'heist_thermal_drill', 'heist_master_key'];

const HEIST_JOIN_WINDOW_MS = 15 * 60 * 1000;

async function resolveTargetOption(interaction) {
  const targetOption = interaction.options.getUser('target');
  const targetIdOption = interaction.options.getString('target_id');

  if (targetOption && targetIdOption) {
    return { errorReply: { content: 'Use either `target` or `target_id`, not both.', ephemeral: true } };
  }
  if (!targetOption && !targetIdOption) {
    return { errorReply: { content: 'Pick a `target`, or provide `target_id` for someone outside this server.', ephemeral: true } };
  }

  if (targetIdOption) {
    const cleanId = targetIdOption.trim();
    if (!/^\d{17,20}$/.test(cleanId)) {
      return { errorReply: { content: "That doesn't look like a valid Discord user ID.", ephemeral: true } };
    }
    try {
      const target = await interaction.client.users.fetch(cleanId);
      return { target };
    } catch {
      return { errorReply: { content: "Couldn't find a Discord user with that ID.", ephemeral: true } };
    }
  }
  return { target: targetOption };
}

async function executeScout(interaction) {
  const guildId = interaction.guildId;
  const scouter = interaction.user;

  const resolved = await resolveTargetOption(interaction);
  if (resolved.errorReply) return interaction.reply(resolved.errorReply);
  const target = resolved.target;

  if (target.id === scouter.id) {
    return interaction.reply({ content: "You don't need Insider Info on yourself.", ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: "You can't scout a bot.", ephemeral: true });
  }
  if (getOwnedQuantity(guildId, scouter.id, 'heist_insider_info') < 1) {
    return interaction.reply({ content: "You don't have any Insider Info.", ephemeral: true });
  }

  addItemToInventory(guildId, scouter.id, 'heist_insider_info', -1);
  const report = getProtectionScoutReport(guildId, target.id);

  const lines = [];
  if (report.ownedBoxTiers.length > 0) {
    lines.push(...report.ownedBoxTiers.map((tierId) => `📦 ${getItem(tierId)?.name ?? tierId}`));
  }
  if (report.ownsVaultItem) {
    lines.push(report.vaultActive ? '🔐 Vault — active' : '🔐 Vault — **lapsed** (fee unpaid, provides no protection right now)');
  }
  if (report.hasDecoyStash) lines.push('🎭 Decoy Stash');
  if (report.hasSilentAlarm) lines.push('🚨 Silent Alarm');
  if (report.ownsCameraItem) lines.push(report.cameraActive ? '📹 Security Camera — active' : '📹 Security Camera — **inactive**');

  const displayName = target.displayName ?? target.username;
  if (lines.length === 0) {
    return interaction.reply({ content: `🕵️ Your contact comes back with word: **${displayName}** has no protections up at all right now.`, ephemeral: true });
  }
  return interaction.reply({ content: `🕵️ Your contact's report on **${displayName}**:\n${lines.join('\n')}`, ephemeral: true });
}

export default {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Heists')
    .addSubcommand((sub) =>
      sub
        .setName('challenge')
        .setDescription('Attempt a heist against another player — resolves in 30-45 minutes')
        .addUserOption((opt) => opt.setName('target').setDescription('Who to heist (must share a server with the bot)').setRequired(false))
        .addStringOption((opt) =>
          opt.setName('target_id').setDescription("Target's Discord user ID — use this instead of `target` to hit someone outside this server").setRequired(false)
        )
        .addStringOption((opt) => opt.setName('tool').setDescription('Which tool to bring (optional)').setRequired(false).setAutocomplete(true))
        .addBooleanOption((opt) => opt.setName('use_vault_cracker').setDescription('Use a Vault Cracker charge, if you own one (optional)').setRequired(false))
        .addBooleanOption((opt) => opt.setName('use_forged_documents').setDescription('Use Forged Documents, if you own one — hides your identity from the victim on a success (optional)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('scout')
        .setDescription("Use an Insider Info to see a target's heist protections before committing")
        .addUserOption((opt) => opt.setName('target').setDescription('Who to scout (must share a server with the bot)').setRequired(false))
        .addStringOption((opt) =>
          opt.setName('target_id').setDescription("Target's Discord user ID — use this instead of `target` to scout someone outside this server").setRequired(false)
        )
    ),

  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    const owned = CHOOSABLE_TOOL_IDS.map((id) => ({ id, item: getItem(id), quantity: getOwnedQuantity(interaction.guildId, interaction.user.id, id) }))
      .filter((t) => t.quantity > 0 && normalizeQuotes(t.item.name.toLowerCase()).includes(typed))
      .slice(0, 25);
    await interaction.respond(owned.map((t) => ({ name: `${t.item.name} (x${t.quantity})`, value: t.id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'scout') {
      return executeScout(interaction);
    }

    
    const attacker = interaction.user;
    const toolId = interaction.options.getString('tool');
    const wantsVaultCracker = interaction.options.getBoolean('use_vault_cracker') ?? false;
    const wantsForgedDocuments = interaction.options.getBoolean('use_forged_documents') ?? false;

    const resolved = await resolveTargetOption(interaction);
    if (resolved.errorReply) return interaction.reply(resolved.errorReply);
    const target = resolved.target;

    if (target.id === attacker.id) {
      return interaction.reply({ content: "You can't heist yourself.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't heist a bot.", ephemeral: true });
    }

    if (getPendingHeistForAttacker(guildId, attacker.id)) {
      return interaction.reply({ content: 'You already have a heist in progress — wait for it to resolve first.', ephemeral: true });
    }

    if (isHeistOnCooldown(guildId, attacker.id)) {
      const remaining = getHeistCooldownRemainingMs(guildId, attacker.id);
      return interaction.reply({ content: `You're still cooling down from your last heist — try again in **${formatDuration(remaining)}**.`, ephemeral: true });
    }

    if (isRepeatTarget(guildId, attacker.id, target.id)) {
      return interaction.reply({ content: "You can't hit the same person twice in a row — pick someone else this time.", ephemeral: true });
    }

    if (toolId && !CHOOSABLE_TOOL_IDS.includes(toolId)) {
      return interaction.reply({ content: "That's not a valid heist tool.", ephemeral: true });
    }
    if (toolId && getOwnedQuantity(guildId, attacker.id, toolId) < 1) {
      return interaction.reply({ content: `You don't own a **${getItem(toolId)?.name ?? toolId}**.`, ephemeral: true });
    }
    if (wantsVaultCracker && getOwnedQuantity(guildId, attacker.id, 'heist_vault_cracker') < 1) {
      return interaction.reply({ content: "You don't have any Vault Cracker charges left.", ephemeral: true });
    }
    if (wantsForgedDocuments && getOwnedQuantity(guildId, attacker.id, 'heist_forged_documents') < 1) {
      return interaction.reply({ content: "You don't have any Forged Documents.", ephemeral: true });
    }

    
    
    
    
    
    
    const existingGroup = getPendingHeistsForTarget(guildId, target.id);
    if (existingGroup.length >= MAX_HEIST_GROUP_SIZE) {
      return interaction.reply({
        content: `🕶️ Too many people are already in on a heist against **${target.displayName ?? target.username}** right now (max ${MAX_HEIST_GROUP_SIZE}) — try a different target or wait for it to resolve.`,
        ephemeral: true,
      });
    }
    
    
    
    if (existingGroup.length > 0 && Date.now() - existingGroup[0].started_at >= HEIST_JOIN_WINDOW_MS) {
      return interaction.reply({
        content: `🕶️ There's already a heist too far in progress against **${target.displayName ?? target.username}** — too late to join this one.`,
        ephemeral: true,
      });
    }
    const isJoining = existingGroup.length > 0;

    const attackerBalance = getBalance(guildId, attacker.id);
    const targetBalance = getBalance(guildId, target.id);
    
    
    
    const snapshotAmount = isJoining ? existingGroup[0].snapshot_amount : computeStealAmount(targetBalance.total);

    
    
    
    if (toolId) addItemToInventory(guildId, attacker.id, toolId, -1);
    if (wantsVaultCracker) addItemToInventory(guildId, attacker.id, 'heist_vault_cracker', -1);
    if (wantsForgedDocuments) addItemToInventory(guildId, attacker.id, 'heist_forged_documents', -1);

    const { resolvesAt } = scheduleHeist({
      guildId,
      attackerUserId: attacker.id,
      targetUserId: target.id,
      channelId: interaction.channelId,
      toolId,
      hasVaultCracker: wantsVaultCracker,
      hasForgedDocuments: wantsForgedDocuments,
      snapshotAmount,
      attackerTotal: attackerBalance.total,
      targetTotal: targetBalance.total,
      
      
      resolvesAt: isJoining ? existingGroup[0].resolves_at : undefined,
    });

    
    
    
    recordHeistAttempt(guildId, attacker.id, target.id);

    
    
    
    const targetDisplayName = target.displayName ?? target.username;
    await interaction.reply({
      content: isJoining
        ? `🕶️ You've joined in on the heist against **${targetDisplayName}** — teamed up with ${existingGroup.length} other${existingGroup.length > 1 ? 's' : ''}. If it succeeds, the payout splits evenly between all of you.`
        : `🕶️ Heist started against **${targetDisplayName}**.`,
      ephemeral: true,
    });

    
    
    
    const timestamp = `<t:${Math.floor(resolvesAt / 1000)}:R>`;
    const displayName = attacker.displayName ?? attacker.username;
    await interaction.channel.send({
      content: isJoining
        ? `🕶️ **${displayName}** has joined a heist already in motion — will return ${timestamp}.`
        : `🕶️ **${displayName}** has started a heist — will return ${timestamp}.`,
    });
  },
};
