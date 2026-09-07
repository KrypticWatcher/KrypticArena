import { SlashCommandBuilder } from 'discord.js';
import { ensureUser, addCash, getEffectiveWealth } from '../../utils/economy.js';
import { recordLoss } from '../../utils/gainLog.js';
import { getOwnedQuantity } from '../../utils/inventory.js';
import { isSecurityCameraFeeCurrent, computeSecurityCameraFeeExtension, computeSecurityCameraFeeAmount, SECURITY_CAMERA_FEE_BASE_AMOUNT } from '../../utils/heists.js';
import { hasActiveVault } from '../../utils/heistResolution.js';
import { GLOBAL_ID } from '../../utils/globalId.js';
import db from '../../database.js';

const stmtGetCameraPaidUntil = db.prepare('SELECT security_camera_paid_until FROM users WHERE guild_id = ? AND user_id = ?');
const stmtSetCameraPaidUntil = db.prepare('UPDATE users SET security_camera_paid_until = ? WHERE guild_id = ? AND user_id = ?');

export default {
  data: new SlashCommandBuilder()
    .setName('camera')
    .setDescription("Check or pay your Security Camera's upkeep fee")
    .addSubcommand((sub) => sub.setName('fee').setDescription("Preview your Security Camera's current upkeep fee — doesn't charge anything"))
    .addSubcommand((sub) =>
      sub.setName('pay').setDescription(`Pay your Security Camera's upkeep fee (from ${SECURITY_CAMERA_FEE_BASE_AMOUNT.toLocaleString('en-US')} cash, scales with your balance)`)
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (getOwnedQuantity(GLOBAL_ID, userId, 'heist_security_camera') < 1) {
      return interaction.reply({ content: "You don't own a Security Camera, so there's no fee to check or pay.", ephemeral: true });
    }

    
    
    
    
    const cameraFeeAmount = computeSecurityCameraFeeAmount(getEffectiveWealth(GLOBAL_ID, userId));
    const row = stmtGetCameraPaidUntil.get(GLOBAL_ID, userId);
    const paidUntil = row?.security_camera_paid_until ?? 0;

    if (sub === 'fee') {
      const cameraFeePaid = isSecurityCameraFeeCurrent(paidUntil);
      const vaultActive = hasActiveVault(GLOBAL_ID, userId);
      
      
      
      
      let statusText;
      if (cameraFeePaid && vaultActive) {
        statusText = `Currently active until <t:${Math.floor(paidUntil / 1000)}:R>.`;
      } else if (!cameraFeePaid) {
        statusText = '**Currently lapsed** — anyone hiding their identity from you right now would get away with it.';
      } else {
        statusText = "**Currently inactive** — your Camera fee is paid, but your Vault isn't active right now. Check `/vault fee`.";
      }
      return interaction.reply({
        content: `📹 Your Security Camera's upkeep fee right now: **${cameraFeeAmount.toLocaleString('en-US')}** cash.\n${statusText}`,
        ephemeral: false,
      });
    }

    
    const user = ensureUser(GLOBAL_ID, userId);
    if (user.cash < cameraFeeAmount) {
      return interaction.reply({
        content: `The Security Camera upkeep fee is **${cameraFeeAmount.toLocaleString('en-US')}** cash — you only have **${user.cash.toLocaleString('en-US')}**. Check \`/camera fee\` any time to see the current cost.`,
        ephemeral: false,
      });
    }
    const newPaidUntil = computeSecurityCameraFeeExtension(paidUntil);
    addCash(GLOBAL_ID, userId, -cameraFeeAmount);
    if (cameraFeeAmount > 0) recordLoss(GLOBAL_ID, userId, 'cash', cameraFeeAmount, 'security_camera_fee');
    stmtSetCameraPaidUntil.run(newPaidUntil, GLOBAL_ID, userId);
    const timestamp = `<t:${Math.floor(newPaidUntil / 1000)}:R>`;
    return interaction.reply({
      content: `📹 Security Camera fee paid — **${cameraFeeAmount.toLocaleString('en-US')}** cash. Stays active until ${timestamp}.`,
    });
  },
};
