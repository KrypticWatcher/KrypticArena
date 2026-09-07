import { SlashCommandBuilder } from 'discord.js';
import { ensureUser, addCash, getEffectiveWealth } from '../../utils/economy.js';
import { recordLoss } from '../../utils/gainLog.js';
import { getOwnedQuantity } from '../../utils/inventory.js';
import { isVaultFeeCurrent, computeVaultFeeExtension, computeVaultFeeAmount, VAULT_FEE_BASE_AMOUNT } from '../../utils/heists.js';
import { GLOBAL_ID } from '../../utils/globalId.js';
import db from '../../database.js';

const stmtGetVaultPaidUntil = db.prepare('SELECT vault_paid_until FROM users WHERE guild_id = ? AND user_id = ?');
const stmtSetVaultPaidUntil = db.prepare('UPDATE users SET vault_paid_until = ? WHERE guild_id = ? AND user_id = ?');

export default {
  data: new SlashCommandBuilder()
    .setName('vault')
    .setDescription("Check or pay your Vault's upkeep fee")
    .addSubcommand((sub) => sub.setName('fee').setDescription("Preview your Vault's current upkeep fee — doesn't charge anything"))
    .addSubcommand((sub) =>
      sub.setName('pay').setDescription(`Pay your Vault's upkeep fee (from ${VAULT_FEE_BASE_AMOUNT.toLocaleString('en-US')} cash, scales with your balance)`)
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (getOwnedQuantity(guildId, userId, 'heist_vault') < 1) {
      return interaction.reply({ content: "You don't own a Vault, so there's no fee to check or pay.", ephemeral: true });
    }

    
    
    
    
    const vaultFeeAmount = computeVaultFeeAmount(getEffectiveWealth(GLOBAL_ID, userId));
    const row = stmtGetVaultPaidUntil.get(GLOBAL_ID, userId);
    const paidUntil = row?.vault_paid_until ?? 0;

    if (sub === 'fee') {
      const statusText = isVaultFeeCurrent(paidUntil)
        ? `Currently active until <t:${Math.floor(paidUntil / 1000)}:R>.`
        : '**Currently lapsed** — your Vault is providing no protection.';
      return interaction.reply({
        content: `🔐 Your Vault's upkeep fee right now: **${vaultFeeAmount.toLocaleString('en-US')}** cash.\n${statusText}`,
        ephemeral: false,
      });
    }

    
    const user = ensureUser(GLOBAL_ID, userId);
    if (user.cash < vaultFeeAmount) {
      return interaction.reply({
        content: `The Vault upkeep fee is **${vaultFeeAmount.toLocaleString('en-US')}** cash — you only have **${user.cash.toLocaleString('en-US')}**. Check \`/vault fee\` any time to see the current cost.`,
        ephemeral: false,
      });
    }
    const newPaidUntil = computeVaultFeeExtension(paidUntil);
    addCash(GLOBAL_ID, userId, -vaultFeeAmount);
    if (vaultFeeAmount > 0) recordLoss(GLOBAL_ID, userId, 'cash', vaultFeeAmount, 'vault_fee');
    stmtSetVaultPaidUntil.run(newPaidUntil, GLOBAL_ID, userId);
    const timestamp = `<t:${Math.floor(newPaidUntil / 1000)}:R>`;
    return interaction.reply({
      content: `🔐 Vault fee paid — **${vaultFeeAmount.toLocaleString('en-US')}** cash. Protection stays active until ${timestamp}.`,
    });
  },
};
