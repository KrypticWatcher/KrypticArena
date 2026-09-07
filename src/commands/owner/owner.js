import { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { isOwnerId } from '../../utils/owner.js';
import { isMainServer } from '../../utils/botConfig.js';
import {
  parseButtonCustomId,
  parseSelectCustomId,
  parseModalCustomId,
  modalCustomId,
  buildConfirmationPanel,
  buildValueModal,
  buildButtonRows,
  backButton,
} from '../../utils/panel.js';
import {
  buildOwnerTopPanel,
  buildOwnerResetTopPanel,
  buildOwnerResetPreviewPanel,
  buildOwnerHadesPanel,
  buildOwnerHadesResultPanel,
  buildOwnerBlacklistPanel,
  buildOwnerBlacklistAddPickerPanel,
  buildOwnerBlacklistRemovePickerPanel,
  buildOwnerBlacklistListPanel,
  buildOwnerBlacklistResultPanel,
  buildOwnerBitfieldPanel,
  buildOwnerBitfieldUserPickerPanel,
  buildOwnerBitfieldRolePickerPanel,
  buildOwnerBitfieldFlagPickerPanel,
  buildOwnerBitfieldResultPanel,
  buildOwnerInvBgTopPanel,
  buildOwnerInvBgManagePanel,
  buildInvBgAddModal,
} from '../../utils/ownerPanelScreens.js';
import { resetGuildEconomy } from '../../utils/economyReset.js';
import {
  downloadAndSaveBackground,
  deleteBackground,
  grantBackgroundAccess,
  revokeBackgroundAccess,
  getInventoryBackgroundById,
  setBackgroundPublic,
  isBackgroundPublic,
} from '../../utils/inventoryBackgrounds.js';
import { grantOwnerProgressiveSet } from '../../utils/ownerProgressiveGear.js';
import { getGladiatorProfile } from '../../utils/gladiator.js';
import { addToBlacklist, removeFromBlacklist, isBlacklisted } from '../../utils/blacklist.js';
import { grantFlag, revokeFlag, listFlags } from '../../utils/permissions.js';
import { syncAllTierRoles, syncAllTierRolesForMany } from '../../utils/tierRoles.js';
import { EconomyError } from '../../utils/economy.js';
import { logAdminAction, ADMIN_ACTIONS } from '../../utils/auditLog.js';

function renderScreen(ownerId, screen, guildId, guildName, displayName) {
  switch (screen) {
    case 'owner-top':
      return buildOwnerTopPanel(ownerId);
    case 'owner-reset':
      return buildOwnerResetTopPanel(ownerId, guildId, guildName);
    case 'owner-hades':
      return buildOwnerHadesPanel(guildId, ownerId, displayName);
    case 'owner-blacklist':
      return buildOwnerBlacklistPanel(ownerId);
    case 'owner-bitfield':
      return buildOwnerBitfieldPanel(ownerId);
    case 'owner-inv-bg':
      return buildOwnerInvBgTopPanel(ownerId);
    default:
      return buildOwnerTopPanel(ownerId);
  }
}

async function denyIfNotOwner(interaction) {
  if (!isOwnerId(interaction.user.id)) {
    await interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    return true;
  }
  if (!isMainServer(interaction.guildId)) {
    await interaction.reply({ content: 'Owner tools only work in the main server.', ephemeral: true });
    return true;
  }
  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Every owner-only control in one place — bot owner only'),

  async execute(interaction) {
    if (await denyIfNotOwner(interaction)) return;
    const { embeds, components } = buildOwnerTopPanel(interaction.user.id);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotOwner(interaction)) return true;

    const { targetUserId: ownerId, screen, action } = parsed;
    const guildId = interaction.guildId;
    const guildName = interaction.guild?.name ?? 'this server';

    
    if (
      screen === 'owner-top' ||
      (action === '' && screen !== 'owner-reset' && screen !== 'owner-hades' && screen !== 'owner-blacklist' && screen !== 'owner-bitfield')
    ) {
      await interaction.update(renderScreen(ownerId, screen, guildId, guildName, interaction.user.displayName));
      return true;
    }

    
    if (screen === 'owner-reset') {
      if (action === '' || action === 'back') {
        await interaction.update(buildOwnerResetTopPanel(ownerId, guildId, guildName));
        return true;
      }
      if (action === 'preview') {
        await interaction.update(buildOwnerResetPreviewPanel(ownerId, guildId, guildName));
        return true;
      }
      if (action === 'ask') {
        const payload = buildConfirmationPanel({
          targetUserId: ownerId,
          screen,
          confirmAction: 'confirm',
          cancelAction: 'cancel',
          title: 'Confirm Full Economy Reset',
          description:
            `⚠️ **This cannot be undone.** Every player's progress in **${guildName}** — cash, Gladiators, gear, everything ` +
            `previewed a moment ago — will be permanently deleted. Boss kills, the collection log, per-tier Adventure ` +
            `completions, and user display flags will ALSO be cleared, and those are bot-wide — for every server the bot ` +
            `is in, not just ${guildName}. The ADMIN bitfield flag will also be cleared globally, for ` +
            `anyone holding it in ANY server this bot is in — that part is not scoped to ${guildName} either. T1-7 perk ` +
            `flags, and custom inventory/gear backgrounds + access, are untouched by this and stay exactly as they are.`,
        });
        await interaction.update(payload);
        return true;
      }
      if (action === 'cancel') {
        await interaction.update(buildOwnerResetTopPanel(ownerId, guildId, guildName));
        return true;
      }
      if (action === 'confirm') {
        await interaction.update({ content: '☢️ Resetting...', embeds: [], components: [] });
        const result = resetGuildEconomy(guildId);
        const total = Object.values(result).reduce((sum, n) => sum + n, 0);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.OWNER_RESET_ECONOMY, null, `Full economy reset — ${total.toLocaleString('en-US')} row(s) deleted`, 'owner');
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('☢️ Economy Reset Complete')
          .setDescription(
            `Deleted **${total.toLocaleString('en-US')}** total row(s): ${guildName}'s player data, plus **${result.user_bitfields.toLocaleString('en-US')}** ` +
              `ADMIN flag(s) cleared globally across every server, plus boss kills/collection log/tier completions/user flags cleared globally too. ` +
              `Server config, the name filter, the blacklist, custom backgrounds + access, and everyone's T1-7 perk flags were untouched.`
          );
        await interaction.followUp({ embeds: [embed], ephemeral: true });
        return true;
      }
    }

    
    if (screen === 'owner-hades') {
      if (action === '' || action === 'back') {
        await interaction.update(buildOwnerHadesPanel(guildId, ownerId, interaction.user.displayName));
        return true;
      }
      if (action === 'spawn') {
        const profile = getGladiatorProfile(guildId, ownerId, interaction.user.displayName);
        const result = grantOwnerProgressiveSet(guildId, ownerId, profile.level);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.HADES_GRANT, ownerId, `Granted the Hades progressive set at level ${profile.level}`, 'owner');
        await interaction.update(buildOwnerHadesResultPanel(ownerId, result, profile.level));
        return true;
      }
    }

    
    if (screen === 'owner-blacklist') {
      if (action === '' || action === 'back') {
        await interaction.update(buildOwnerBlacklistPanel(ownerId));
        return true;
      }
      if (action === 'add') {
        await interaction.update(buildOwnerBlacklistAddPickerPanel(ownerId));
        return true;
      }
      if (action === 'remove') {
        await interaction.update(buildOwnerBlacklistRemovePickerPanel(ownerId));
        return true;
      }
      if (action === 'list') {
        await interaction.update(buildOwnerBlacklistListPanel(ownerId));
        return true;
      }
      
      
      
      
      if (action === 'add-by-id') {
        
        
        
        
        
        
        
        
        
        const idInput = new TextInputBuilder()
          .setCustomId('id')
          .setLabel('Discord User ID')
          .setPlaceholder('e.g. 123456789012345678')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (optional, only visible to you)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        const modal = new ModalBuilder()
          .setCustomId(modalCustomId(ownerId, 'owner-blacklist', 'add-by-id'))
          .setTitle('Blacklist by Discord ID')
          .addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'remove-by-id') {
        const modal = buildValueModal({
          targetUserId: ownerId,
          screen: 'owner-blacklist',
          action: 'remove-by-id',
          title: 'Remove Blacklist by Discord ID',
          label: 'Discord User ID',
          placeholder: 'e.g. 123456789012345678',
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    
    if (screen === 'owner-bitfield') {
      if (action === '' || action === 'back') {
        await interaction.update(buildOwnerBitfieldPanel(ownerId));
        return true;
      }
      if (action === 'grant') {
        await interaction.update(
          buildOwnerBitfieldUserPickerPanel(ownerId, {
            selectAction: 'grant-user',
            title: '➕ Grant Flag — Pick a User',
            description: 'Who should get the flag?',
            placeholder: 'Select a user',
          })
        );
        return true;
      }
      if (action === 'revoke') {
        await interaction.update(
          buildOwnerBitfieldUserPickerPanel(ownerId, {
            selectAction: 'revoke-user',
            title: '➖ Revoke Flag — Pick a User',
            description: 'Who should lose the flag?',
            placeholder: 'Select a user',
          })
        );
        return true;
      }
      if (action === 'list') {
        await interaction.update(
          buildOwnerBitfieldUserPickerPanel(ownerId, {
            selectAction: 'list-user',
            title: '📋 List Flags — Pick a User',
            description: "Whose flags do you want to see?",
            placeholder: 'Select a user',
          })
        );
        return true;
      }
      if (action === 'grant-role') {
        await interaction.update(
          buildOwnerBitfieldRolePickerPanel(ownerId, {
            selectAction: 'grant-role-role',
            title: '➕ Grant to Role — Pick a Role',
            description: 'Everyone currently holding this role gets the flag.',
            placeholder: 'Select a role',
          })
        );
        return true;
      }
      if (action === 'revoke-role') {
        await interaction.update(
          buildOwnerBitfieldRolePickerPanel(ownerId, {
            selectAction: 'revoke-role-role',
            title: '➖ Revoke from Role — Pick a Role',
            description: 'Everyone currently holding this role loses the flag.',
            placeholder: 'Select a role',
          })
        );
        return true;
      }
    }

    
    if (screen === 'owner-inv-bg') {
      if (action === 'back') {
        await interaction.update(buildOwnerInvBgTopPanel(ownerId));
        return true;
      }
      if (action === 'add') {
        const modal = buildInvBgAddModal(ownerId);
        await interaction.showModal(modal);
        return true;
      }
      const togglePublicMatch = /^toggle-public:(.+)$/.exec(action);
      if (togglePublicMatch) {
        const backgroundId = togglePublicMatch[1];
        const bg = getInventoryBackgroundById(backgroundId);
        const makingPublic = !(bg && isBackgroundPublic(backgroundId));
        try {
          setBackgroundPublic(backgroundId, makingPublic);
        } catch (err) {
          if (err instanceof EconomyError) {
            await interaction.reply({ content: err.message, ephemeral: true });
            return true;
          }
          throw err;
        }
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.SETTINGS_CHANGE,
          null,
          `Made inventory background "${bg?.name}" ${makingPublic ? 'public' : 'private'}`,
          'owner'
        );
        await interaction.update(buildOwnerInvBgManagePanel(ownerId, backgroundId));
        return true;
      }
      const deleteAskMatch = /^delete-ask:(.+)$/.exec(action);
      if (deleteAskMatch) {
        const backgroundId = deleteAskMatch[1];
        const bg = getInventoryBackgroundById(backgroundId);
        const payload = buildConfirmationPanel({
          targetUserId: ownerId,
          screen,
          confirmAction: `delete-confirm:${backgroundId}`,
          cancelAction: `manage-back:${backgroundId}`,
          title: `Delete "${bg?.name ?? 'this background'}"?`,
          description: 'Removes the file, revokes everyone\'s access, and reverts anyone currently using it back to the default. Cannot be undone.',
        });
        await interaction.update(payload);
        return true;
      }
      const deleteConfirmMatch = /^delete-confirm:(.+)$/.exec(action);
      if (deleteConfirmMatch) {
        const backgroundId = deleteConfirmMatch[1];
        await deleteBackground(backgroundId);
        await interaction.update(buildOwnerInvBgTopPanel(ownerId));
        return true;
      }
      const manageBackMatch = /^manage-back:(.+)$/.exec(action);
      if (manageBackMatch) {
        await interaction.update(buildOwnerInvBgManagePanel(ownerId, manageBackMatch[1]));
        return true;
      }
    }

    await interaction.update(buildOwnerTopPanel(ownerId));
    return true;
  },

  async handleSelect(interaction) {
    const parsed = parseSelectCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotOwner(interaction)) return true;

    const { targetUserId: ownerId, screen, action } = parsed;

    
    if (screen === 'owner-blacklist' && action === 'add-user') {
      const target = interaction.users.first();

      if (isOwnerId(target.id)) {
        await interaction.update(buildOwnerBlacklistResultPanel(ownerId, "Can't blacklist a bot owner — that would lock them out of undoing it."));
        return true;
      }
      if (target.id === interaction.client.user.id) {
        await interaction.update(buildOwnerBlacklistResultPanel(ownerId, "Can't blacklist the bot itself."));
        return true;
      }

      
      
      
      
      
      const modal = buildValueModal({
        targetUserId: ownerId,
        screen: 'owner-blacklist',
        action: `add-reason:${target.id}`,
        title: `Blacklist ${target.username}`,
        label: 'Reason (optional, only visible to you)',
        required: false,
      });
      await interaction.showModal(modal);
      return true;
    }

    if (screen === 'owner-blacklist' && action === 'remove-user') {
      const target = interaction.users.first();
      const removed = removeFromBlacklist(target.id);
      const message = removed
        ? `✅ **${target.tag ?? target.username}** has been removed from the blacklist.`
        : `**${target.tag ?? target.username}** wasn't blacklisted.`;
      if (removed) {
        logAdminAction(interaction.guildId, interaction.user.id, ADMIN_ACTIONS.BLACKLIST_REMOVE, target.id, `Removed ${target.tag ?? target.username} from the blacklist`, 'owner');
      }
      await interaction.update(buildOwnerBlacklistResultPanel(ownerId, message));
      return true;
    }

    
    
    if (screen === 'owner-bitfield' && action === 'grant-user') {
      const target = interaction.users.first();
      await interaction.update(
        buildOwnerBitfieldFlagPickerPanel(ownerId, {
          selectAction: `grant-flag:${target.id}`,
          title: `➕ Grant Flag to ${target.username}`,
          description: 'Which flag?',
          placeholder: 'Select a flag',
        })
      );
      return true;
    }
    if (screen === 'owner-bitfield' && action === 'revoke-user') {
      const target = interaction.users.first();
      await interaction.update(
        buildOwnerBitfieldFlagPickerPanel(ownerId, {
          selectAction: `revoke-flag:${target.id}`,
          title: `➖ Revoke Flag from ${target.username}`,
          description: 'Which flag?',
          placeholder: 'Select a flag',
        })
      );
      return true;
    }
    if (screen === 'owner-bitfield' && action === 'list-user') {
      const target = interaction.users.first();
      const flags = listFlags(target.id);
      const message = flags.length ? `**${target.tag ?? target.username}**'s flags: **${flags.join(', ')}**` : `**${target.tag ?? target.username}** has no flags set.`;
      await interaction.update(buildOwnerBitfieldResultPanel(ownerId, message));
      return true;
    }

    
    if (screen === 'owner-bitfield' && action === 'grant-role-role') {
      const role = interaction.roles.first();
      await interaction.update(
        buildOwnerBitfieldFlagPickerPanel(ownerId, {
          selectAction: `grant-roleflag:${role.id}`,
          title: `➕ Grant to Everyone in ${role.name}`,
          description: 'Which flag?',
          placeholder: 'Select a flag',
        })
      );
      return true;
    }
    if (screen === 'owner-bitfield' && action === 'revoke-role-role') {
      const role = interaction.roles.first();
      await interaction.update(
        buildOwnerBitfieldFlagPickerPanel(ownerId, {
          selectAction: `revoke-roleflag:${role.id}`,
          title: `➖ Revoke from Everyone in ${role.name}`,
          description: 'Which flag?',
          placeholder: 'Select a flag',
        })
      );
      return true;
    }

    
    if (screen === 'owner-bitfield') {
      const singleMatch = /^(grant|revoke)-flag:(\d+)$/.exec(action);
      if (singleMatch) {
        const [, verb, targetId] = singleMatch;
        const flag = interaction.values[0];
        try {
          const apply = verb === 'grant' ? grantFlag : revokeFlag;
          apply(targetId, flag);
        } catch (err) {
          if (err instanceof EconomyError) {
            await interaction.update(buildOwnerBitfieldResultPanel(ownerId, err.message));
            return true;
          }
          throw err;
        }
        
        
        
        if (/^T[1-7]$/.test(flag)) await syncAllTierRoles(interaction.client, targetId);
        const verbed = verb === 'grant' ? 'Granted' : 'Revoked';
        const prep = verb === 'grant' ? 'to' : 'from';
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          verb === 'grant' ? ADMIN_ACTIONS.BITFIELD_GRANT : ADMIN_ACTIONS.BITFIELD_REVOKE,
          targetId,
          `${verbed} ${flag} ${prep} <@${targetId}>`,
          'owner'
        );
        await interaction.update(buildOwnerBitfieldResultPanel(ownerId, `✅ ${verbed} **${flag}** ${prep} <@${targetId}>.`));
        return true;
      }

      
      const roleMatch = /^(grant|revoke)-roleflag:(\d+)$/.exec(action);
      if (roleMatch) {
        const [, verb, roleId] = roleMatch;
        const flag = interaction.values[0];

        
        
        
        
        await interaction.deferUpdate();

        const role = await interaction.guild.roles.fetch(roleId);
        if (!role) {
          await interaction.editReply(buildOwnerBitfieldResultPanel(ownerId, "That role doesn't exist anymore."));
          return true;
        }

        await interaction.guild.members.fetch();
        const members = [...role.members.values()];

        if (members.length === 0) {
          await interaction.editReply(buildOwnerBitfieldResultPanel(ownerId, `No one currently has the **${role.name}** role.`));
          return true;
        }

        const apply = verb === 'grant' ? grantFlag : revokeFlag;
        let succeeded = 0;
        for (const member of members) {
          try {
            apply(member.id, flag);
            succeeded++;
          } catch (err) {
            
            
            if (err instanceof EconomyError) {
              await interaction.editReply(buildOwnerBitfieldResultPanel(ownerId, err.message));
              return true;
            }
            throw err;
          }
        }

        
        
        if (/^T[1-7]$/.test(flag)) await syncAllTierRolesForMany(interaction.client, members.map((m) => m.id));
        const verbed = verb === 'grant' ? 'Granted' : 'Revoked';
        const prep = verb === 'grant' ? 'to' : 'from';
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          verb === 'grant' ? ADMIN_ACTIONS.BITFIELD_GRANT : ADMIN_ACTIONS.BITFIELD_REVOKE,
          null,
          `${verbed} ${flag} ${prep} ${succeeded} member(s) with the ${role.name} role`,
          'owner'
        );
        await interaction.editReply(
          buildOwnerBitfieldResultPanel(ownerId, `✅ ${verbed} **${flag}** ${prep} **${succeeded}** member(s) with the **${role.name}** role.`)
        );
        return true;
      }
    }

    
    if (screen === 'owner-inv-bg') {
      if (action === 'manage') {
        const backgroundId = interaction.values[0];
        await interaction.update(buildOwnerInvBgManagePanel(ownerId, backgroundId));
        return true;
      }
      const grantMatch = /^grant:(.+)$/.exec(action);
      if (grantMatch) {
        const backgroundId = grantMatch[1];
        const target = interaction.users.first();
        try {
          grantBackgroundAccess(backgroundId, target.id, ownerId);
        } catch (err) {
          if (err instanceof EconomyError) {
            await interaction.reply({ content: err.message, ephemeral: true });
            return true;
          }
          throw err;
        }
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.SETTINGS_CHANGE,
          target.id,
          `Granted <@${target.id}> access to background "${getInventoryBackgroundById(backgroundId)?.name}"`,
          'owner'
        );
        await interaction.update(buildOwnerInvBgManagePanel(ownerId, backgroundId));
        return true;
      }
      
      
      
      
      
      
      
      const grantRoleMatch = /^grant-role:(.+)$/.exec(action);
      if (grantRoleMatch) {
        const backgroundId = grantRoleMatch[1];
        const role = interaction.roles.first();

        
        
        
        await interaction.deferUpdate();

        await interaction.guild.members.fetch();
        const members = [...role.members.values()];

        if (members.length === 0) {
          await interaction.editReply(buildOwnerInvBgManagePanel(ownerId, backgroundId));
          return true;
        }

        let succeeded = 0;
        for (const member of members) {
          try {
            grantBackgroundAccess(backgroundId, member.id, ownerId);
            succeeded++;
          } catch (err) {
            
            
            
            if (err instanceof EconomyError) {
              await interaction.editReply({ content: err.message, embeds: [], components: buildButtonRows([backButton(ownerId, 'owner-inv-bg')]) });
              return true;
            }
            throw err;
          }
        }
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.SETTINGS_CHANGE,
          null,
          `Granted ${succeeded} member(s) of role "${role.name}" access to background "${getInventoryBackgroundById(backgroundId)?.name}"`,
          'owner'
        );
        await interaction.editReply(buildOwnerInvBgManagePanel(ownerId, backgroundId));
        return true;
      }
      const revokeMatch = /^revoke:(.+)$/.exec(action);
      if (revokeMatch) {
        const backgroundId = revokeMatch[1];
        const target = interaction.users.first();
        try {
          revokeBackgroundAccess(backgroundId, target.id);
        } catch (err) {
          if (err instanceof EconomyError) {
            await interaction.reply({ content: err.message, ephemeral: true });
            return true;
          }
          throw err;
        }
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.SETTINGS_CHANGE,
          target.id,
          `Revoked <@${target.id}>'s access to inventory background "${getInventoryBackgroundById(backgroundId)?.name}"`,
          'owner'
        );
        await interaction.update(buildOwnerInvBgManagePanel(ownerId, backgroundId));
        return true;
      }
    }

    return false;
  },

  async handleModal(interaction) {
    const parsed = parseModalCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotOwner(interaction)) return true;

    const { targetUserId: ownerId, screen, action } = parsed;

    if (screen === 'owner-blacklist') {
      const match = /^add-reason:(\d+)$/.exec(action);
      if (match) {
        const targetId = match[1];
        const reason = interaction.fields.getTextInputValue('value').trim();
        const alreadyBlacklisted = isBlacklisted(targetId);
        addToBlacklist(targetId, reason || null, ownerId);
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.BLACKLIST_ADD,
          targetId,
          reason ? `Blacklisted <@${targetId}> — reason: ${reason}` : `Blacklisted <@${targetId}>`,
          'owner'
        );
        const message = alreadyBlacklisted
          ? `Updated <@${targetId}>'s blacklist reason.`
          : `🚫 <@${targetId}> is now blacklisted — blocked from every command, button, and interaction in every server this bot is in.`;
        await interaction.update(buildOwnerBlacklistResultPanel(ownerId, message));
        return true;
      }

      
      
      
      
      if (action === 'add-by-id') {
        const targetId = interaction.fields.getTextInputValue('id').trim();
        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!/^\d{17,20}$/.test(targetId)) {
          await interaction.update(buildOwnerBlacklistResultPanel(ownerId, `**${targetId}** doesn't look like a valid Discord user ID.`));
          return true;
        }
        if (isOwnerId(targetId)) {
          await interaction.update(buildOwnerBlacklistResultPanel(ownerId, "Can't blacklist a bot owner — that would lock them out of undoing it."));
          return true;
        }
        if (targetId === interaction.client.user.id) {
          await interaction.update(buildOwnerBlacklistResultPanel(ownerId, "Can't blacklist the bot itself."));
          return true;
        }
        const alreadyBlacklisted = isBlacklisted(targetId);
        addToBlacklist(targetId, reason || null, ownerId);
        logAdminAction(
          interaction.guildId,
          interaction.user.id,
          ADMIN_ACTIONS.BLACKLIST_ADD,
          targetId,
          reason ? `Blacklisted <@${targetId}> — reason: ${reason}` : `Blacklisted <@${targetId}>`,
          'owner'
        );
        const message = alreadyBlacklisted
          ? `Updated <@${targetId}>'s blacklist reason.`
          : `🚫 <@${targetId}> is now blacklisted — blocked from every command, button, and interaction in every server this bot is in.`;
        await interaction.update(buildOwnerBlacklistResultPanel(ownerId, message));
        return true;
      }

      if (action === 'remove-by-id') {
        const targetId = interaction.fields.getTextInputValue('value').trim();
        if (!/^\d{17,20}$/.test(targetId)) {
          await interaction.update(buildOwnerBlacklistResultPanel(ownerId, `**${targetId}** doesn't look like a valid Discord user ID.`));
          return true;
        }
        const removed = removeFromBlacklist(targetId);
        const message = removed ? `✅ **${targetId}** has been removed from the blacklist.` : `**${targetId}** wasn't blacklisted.`;
        if (removed) {
          logAdminAction(interaction.guildId, interaction.user.id, ADMIN_ACTIONS.BLACKLIST_REMOVE, targetId, `Removed ${targetId} from the blacklist`, 'owner');
        }
        await interaction.update(buildOwnerBlacklistResultPanel(ownerId, message));
        return true;
      }
    }

    if (screen === 'owner-inv-bg' && action === 'add') {
      const url = interaction.fields.getTextInputValue('url').trim();
      const name = interaction.fields.getTextInputValue('name').trim();

      
      
      
      await interaction.deferUpdate();
      let created;
      try {
        created = await downloadAndSaveBackground(url, name, ownerId);
      } catch (err) {
        if (err instanceof EconomyError) {
          await interaction.editReply({
            content: err.message,
            embeds: [],
            components: buildButtonRows([backButton(ownerId, 'owner-inv-bg')]),
          });
          return true;
        }
        throw err;
      }
      logAdminAction(interaction.guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Added inventory background "${name}"`, 'owner');
      
      
      
      
      
      await interaction.editReply(buildOwnerInvBgManagePanel(ownerId, created.id));
      return true;
    }

    return false;
  },
};
