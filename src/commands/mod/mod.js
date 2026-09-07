import { SlashCommandBuilder } from 'discord.js';
import { isMod } from '../../utils/permissions.js';
import {
  parseButtonCustomId,
  parseSelectCustomId,
  parseModalCustomId,
  buildValueModal,
} from '../../utils/panel.js';
import {
  buildModTopPanel,
  buildModNameLockPanel,
  buildModNameLockPickerPanel,
  buildModNameLockResultPanel,
  isNameLocked,
  buildModNameFilterPanel,
} from '../../utils/modPanelScreens.js';
import { adminLockGladiatorName, adminUnlockGladiatorName } from '../../utils/gladiator.js';
import { addBannedWord, removeBannedWord } from '../../utils/nameFilter.js';
import { logAdminAction, ADMIN_ACTIONS } from '../../utils/auditLog.js';

async function denyIfNotMod(interaction) {
  if (isMod(interaction.user.id)) return false;
  await interaction.reply({
    content: "You need the MOD bitfield flag to use this command — ask the bot owner to grant it via `/owner` → Bitfield.",
    ephemeral: true,
  });
  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Limited moderator controls — Gladiator name locks and the name filter list'),

  async execute(interaction) {
    if (await denyIfNotMod(interaction)) return;
    const { embeds, components } = buildModTopPanel(interaction.user.id);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotMod(interaction)) return true;

    const { targetUserId: modId, screen, action } = parsed;
    const guildId = interaction.guildId;

    
    if (screen === 'mod-top') {
      await interaction.update(buildModTopPanel(modId));
      return true;
    }

    
    if (screen === 'mod-namelock') {
      if (action === '' || action === 'back') {
        await interaction.update(buildModNameLockPanel(modId));
        return true;
      }
      if (action === 'lock') {
        await interaction.update(
          buildModNameLockPickerPanel(modId, {
            selectAction: 'lock-user',
            title: '🔒 Lock a Player\u2019s Name',
            description: 'Pick who to lock. Their name is immediately reset to the placeholder.',
            placeholder: 'Select a user',
          })
        );
        return true;
      }
      if (action === 'unlock') {
        await interaction.update(
          buildModNameLockPickerPanel(modId, {
            selectAction: 'unlock-user',
            title: '🔓 Unlock a Player\u2019s Name',
            description: 'Pick who to unlock so they can rename themselves again.',
            placeholder: 'Select a user',
          })
        );
        return true;
      }
    }

    
    if (screen === 'mod-namefilter') {
      if (action === '' || action === 'back') {
        await interaction.update(buildModNameFilterPanel(modId, guildId));
        return true;
      }
      const addMatch = /^add-(wildcard|exact)$/.exec(action);
      if (addMatch) {
        const type = addMatch[1];
        await interaction.showModal(
          buildValueModal({
            targetUserId: modId,
            screen: 'mod-namefilter',
            action: `add-word:${type}`,
            title: `Block a word (${type})`,
            label: 'Word to block',
          })
        );
        return true;
      }
      const removeMatch = /^remove-(wildcard|exact)$/.exec(action);
      if (removeMatch) {
        const type = removeMatch[1];
        await interaction.showModal(
          buildValueModal({
            targetUserId: modId,
            screen: 'mod-namefilter',
            action: `remove-word:${type}`,
            title: `Un-block a word (${type})`,
            label: 'Word to remove',
          })
        );
        return true;
      }
    }

    await interaction.update(buildModTopPanel(modId));
    return true;
  },

  async handleSelect(interaction) {
    const parsed = parseSelectCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotMod(interaction)) return true;

    const { targetUserId: modId, screen, action } = parsed;
    const guildId = interaction.guildId;

    if (screen === 'mod-namelock' && action === 'lock-user') {
      const target = interaction.users.first();
      adminLockGladiatorName(guildId, target.id);
      logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.GLADIATOR_RENAME, target.id, "Locked Gladiator name to \"Zoot's plaything\"", 'mod');
      await interaction.update(buildModNameLockResultPanel(modId, `🔒 **${target.username}**\u2019s Gladiator name is now locked.`));
      return true;
    }

    if (screen === 'mod-namelock' && action === 'unlock-user') {
      const target = interaction.users.first();
      if (!isNameLocked(guildId, target.id)) {
        await interaction.update(buildModNameLockResultPanel(modId, `**${target.username}**\u2019s Gladiator name isn\u2019t locked.`));
        return true;
      }
      adminUnlockGladiatorName(guildId, target.id);
      logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.GLADIATOR_RENAME, target.id, 'Unlocked Gladiator name', 'mod');
      await interaction.update(buildModNameLockResultPanel(modId, `🔓 **${target.username}**\u2019s Gladiator name is unlocked \u2014 they can rename themselves again.`));
      return true;
    }

    return false;
  },

  async handleModal(interaction) {
    const parsed = parseModalCustomId(interaction.customId);
    if (!parsed) return false;
    if (await denyIfNotMod(interaction)) return true;

    const { targetUserId: modId, screen, action } = parsed;
    const guildId = interaction.guildId;

    if (screen === 'mod-namefilter') {
      const addMatch = /^add-word:(wildcard|exact)$/.exec(action);
      if (addMatch) {
        const type = addMatch[1];
        const word = interaction.fields.getTextInputValue('value').trim();
        addBannedWord(guildId, word, type, interaction.user.id);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.NAMEFILTER_ADD, null, `Added "${word}" (${type}) to the name filter`, 'mod');
        await interaction.update(buildModNameFilterPanel(modId, guildId));
        return true;
      }

      const removeMatch = /^remove-word:(wildcard|exact)$/.exec(action);
      if (removeMatch) {
        const type = removeMatch[1];
        const word = interaction.fields.getTextInputValue('value').trim();
        removeBannedWord(guildId, word, type);
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.NAMEFILTER_REMOVE, null, `Removed "${word}" (${type}) from the name filter`, 'mod');
        await interaction.update(buildModNameFilterPanel(modId, guildId));
        return true;
      }
    }

    return false;
  },
};
