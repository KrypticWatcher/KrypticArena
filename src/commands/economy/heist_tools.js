import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeistInventoryGrid } from '../../utils/inventory.js';
import { getOwnedQuantity } from '../../utils/inventory.js';
import { isVaultFeeCurrent, getHeistItemEffectSummary, DEPOSIT_BOX_TIERS, DEPOSIT_BOX_MAX_CHARGES, isSecurityCameraFeeCurrent } from '../../utils/heists.js';
import { getBoxChargesRemaining, hasActiveVault } from '../../utils/heistResolution.js';
import { GLOBAL_ID } from '../../utils/globalId.js';
import db from '../../database.js';

const stmtGetVaultPaidUntil = db.prepare('SELECT vault_paid_until FROM users WHERE guild_id = ? AND user_id = ?');
const stmtGetCameraPaidUntil = db.prepare('SELECT security_camera_paid_until FROM users WHERE guild_id = ? AND user_id = ?');

export default {
  data: new SlashCommandBuilder().setName('heist_tools').setDescription('View your owned heist protections and tools'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const cells = getHeistInventoryGrid(guildId, userId);

    if (cells.length === 0) {
      return interaction.reply({
        content: "You don't have any heist protections or tools yet — check `/store` for what's purchasable.",
        ephemeral: true,
      });
    }

    const protections = cells.filter((c) => c.item.heistCategory === 'protection');
    const tools = cells.filter((c) => c.item.heistCategory === 'tool');

    const lines = [];
    if (protections.length > 0) {
      lines.push('**🛡️ Protections**');
      for (const c of protections) {
        
        
        
        if (c.item.id === 'heist_vault') {
          const row = stmtGetVaultPaidUntil.get(GLOBAL_ID, userId);
          const paidUntil = row?.vault_paid_until ?? 0;
          const statusText = isVaultFeeCurrent(paidUntil)
            ? `active until <t:${Math.floor(paidUntil / 1000)}:R>`
            : `**lapsed** — pay with \`/vault pay\``;
          lines.push(`\u200b\u2003**${c.item.name}** x${c.quantity} — ${statusText}`);
        } else if (c.item.id === 'heist_security_camera') {
          const row = stmtGetCameraPaidUntil.get(GLOBAL_ID, userId);
          const paidUntil = row?.security_camera_paid_until ?? 0;
          const cameraFeePaid = isSecurityCameraFeeCurrent(paidUntil);
          const vaultActive = hasActiveVault(GLOBAL_ID, userId);
          let statusText;
          if (cameraFeePaid && vaultActive) {
            statusText = `active until <t:${Math.floor(paidUntil / 1000)}:R>`;
          } else if (!cameraFeePaid) {
            statusText = `**lapsed** — pay with \`/camera pay\``;
          } else {
            statusText = `**inactive** — Vault not active, check \`/vault fee\``;
          }
          lines.push(`\u200b\u2003**${c.item.name}** x${c.quantity} — ${statusText}`);
        } else if (DEPOSIT_BOX_TIERS.includes(c.item.id)) {
          
          
          const maxCharges = DEPOSIT_BOX_MAX_CHARGES[c.item.id];
          const chargesLeft = getBoxChargesRemaining(guildId, userId, c.item.id);
          const chargeText = maxCharges > 1 ? ` (${chargesLeft}/${maxCharges} blocks left)` : '';
          lines.push(`\u200b\u2003**${c.item.name}** x${c.quantity}${chargeText}`);
        } else {
          lines.push(`\u200b\u2003**${c.item.name}** x${c.quantity}`);
        }

        
        const summary = getHeistItemEffectSummary(c.item.id);
        if (summary) lines.push(`\u200b\u2003*${summary}*`);
        
        
        
        lines.push('');
      }
    }
    if (tools.length > 0) {
      if (lines.length > 0) lines.push('**🔧 Tools**');
      for (const c of tools) {
        lines.push(`\u200b\u2003**${c.item.name}** x${c.quantity}`);
        const summary = getHeistItemEffectSummary(c.item.id);
        if (summary) lines.push(`\u200b\u2003*${summary}*`);
        lines.push('');
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`${interaction.user.displayName ?? interaction.user.username}'s Heist Gear`)
      .setDescription(lines.join('\n').trim());

    return interaction.reply({ embeds: [embed] });
  },
};
