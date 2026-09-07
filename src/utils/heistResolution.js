import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import {
  computeHeistSuccessChance,
  rollHeistSuccess,
  getToolSuccessBonus,
  getVaultProtectionPenalty,
  resolveDecoyStashAttempt,
  resolveDepositBoxAttempt,
  DEPOSIT_BOX_TIERS,
  DEPOSIT_BOX_MAX_CHARGES,
  DECOY_STASH_PAYOUT_FRACTION,
  isVaultFeeCurrent,
  isSecurityCameraFeeCurrent,
} from './heists.js';

const stmtGetVaultPaidUntil = db.prepare('SELECT vault_paid_until FROM users WHERE guild_id = ? AND user_id = ?');
const stmtGetBoxCharges = db.prepare('SELECT charges_remaining FROM heist_box_charges WHERE guild_id = ? AND user_id = ? AND tier_id = ?');
const stmtSetBoxCharges = db.prepare(`
  INSERT INTO heist_box_charges (guild_id, user_id, tier_id, charges_remaining)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id, tier_id) DO UPDATE SET charges_remaining = excluded.charges_remaining
`);
const stmtDeleteBoxCharges = db.prepare('DELETE FROM heist_box_charges WHERE guild_id = ? AND user_id = ? AND tier_id = ?');

function consumeBoxCharge(guildId, targetId, tierId) {
  guildId = GLOBAL_ID;
  const maxCharges = DEPOSIT_BOX_MAX_CHARGES[tierId] ?? 1;
  const row = stmtGetBoxCharges.get(guildId, targetId, tierId);
  const currentCharges = row?.charges_remaining ?? maxCharges;
  const remaining = currentCharges - 1;

  if (remaining > 0) {
    stmtSetBoxCharges.run(guildId, targetId, tierId, remaining);
    return { broke: false, chargesRemaining: remaining, hasSpare: false };
  }

  
  addItemToInventory(guildId, targetId, tierId, -1);
  const stillOwnsAnother = getOwnedQuantity(guildId, targetId, tierId) >= 1;
  if (stillOwnsAnother) {
    stmtSetBoxCharges.run(guildId, targetId, tierId, maxCharges);
  } else {
    stmtDeleteBoxCharges.run(guildId, targetId, tierId);
  }
  return { broke: true, chargesRemaining: 0, hasSpare: stillOwnsAnother };
}

export function getBoxChargesRemaining(guildId, userId, tierId) {
  guildId = GLOBAL_ID;
  const maxCharges = DEPOSIT_BOX_MAX_CHARGES[tierId] ?? 1;
  const row = stmtGetBoxCharges.get(guildId, userId, tierId);
  return row?.charges_remaining ?? maxCharges;
}

export function hasActiveVault(guildId, targetId) {
  guildId = GLOBAL_ID;
  const ownsVault = getOwnedQuantity(guildId, targetId, 'heist_vault') >= 1;
  if (!ownsVault) return false;
  const row = stmtGetVaultPaidUntil.get(guildId, targetId);
  return isVaultFeeCurrent(row?.vault_paid_until ?? 0);
}

const stmtGetSecurityCameraPaidUntil = db.prepare('SELECT security_camera_paid_until FROM users WHERE guild_id = ? AND user_id = ?');

export function isSecurityCameraActive(guildId, targetId) {
  guildId = GLOBAL_ID;
  const ownsCamera = getOwnedQuantity(guildId, targetId, 'heist_security_camera') >= 1;
  if (!ownsCamera) return false;
  const row = stmtGetSecurityCameraPaidUntil.get(guildId, targetId);
  const cameraFeePaid = isSecurityCameraFeeCurrent(row?.security_camera_paid_until ?? 0);
  return cameraFeePaid && hasActiveVault(guildId, targetId);
}

export function getProtectionScoutReport(guildId, targetId) {
  guildId = GLOBAL_ID;
  const ownedBoxTiers = DEPOSIT_BOX_TIERS.filter((tier) => getOwnedQuantity(guildId, targetId, tier) >= 1);
  const ownsVaultItem = getOwnedQuantity(guildId, targetId, 'heist_vault') >= 1;
  const vaultActive = hasActiveVault(guildId, targetId);
  const hasDecoyStash = getOwnedQuantity(guildId, targetId, 'heist_decoy_stash') >= 1;
  const hasSilentAlarm = getOwnedQuantity(guildId, targetId, 'heist_silent_alarm') >= 1;
  
  
  
  
  
  const ownsCameraItem = getOwnedQuantity(guildId, targetId, 'heist_security_camera') >= 1;
  const cameraActive = isSecurityCameraActive(guildId, targetId);
  return { ownedBoxTiers, ownsVaultItem, vaultActive, hasDecoyStash, hasSilentAlarm, ownsCameraItem, cameraActive };
}

export function resolveHeistAttempt({ guildId, attackerId, targetId, toolId, hasVaultCracker, attackerTotal, targetTotal, snapshotAmount }) {
  const result = resolveMergedHeistAttempt({
    guildId,
    targetId,
    snapshotAmount,
    participants: [{ attackerId, toolId, hasVaultCracker, attackerTotal, targetTotal }],
  });
  return result.outcome;
}

export function resolveMergedHeistAttempt({ guildId, targetId, participants, snapshotAmount }) {
  const ownsVault = hasActiveVault(guildId, targetId);

  
  
  
  
  
  
  
  
  
  
  
  const groupHasVaultCracker = participants.some((p) => p.hasVaultCracker);
  const vaultPenalty = getVaultProtectionPenalty(ownsVault, groupHasVaultCracker);

  
  
  
  let best = null;
  for (const p of participants) {
    const toolBonus = getToolSuccessBonus(p.toolId);
    const successChance = computeHeistSuccessChance({
      attackerTotal: p.attackerTotal,
      targetTotal: p.targetTotal,
      toolBonusPct: toolBonus,
      protectionPenaltyPct: vaultPenalty,
    });
    if (!best || successChance > best.successChance) {
      best = { ...p, successChance };
    }
  }

  if (!rollHeistSuccess(best.successChance)) {
    return { outcome: 'failed', successChance: best.successChance, bestParticipant: best };
  }

  
  
  
  
  
  const hasDecoyStash = getOwnedQuantity(guildId, targetId, 'heist_decoy_stash') >= 1;
  const decoyResult = resolveDecoyStashAttempt(hasDecoyStash);
  if (decoyResult.applicable && decoyResult.triggered) {
    addItemToInventory(guildId, targetId, 'heist_decoy_stash', -1);
    return {
      outcome: 'decoy_triggered',
      successChance: best.successChance,
      bestParticipant: best,
      stealAmount: Math.round(snapshotAmount * DECOY_STASH_PAYOUT_FRACTION),
    };
  }

  
  
  
  const ownedBoxTiers = DEPOSIT_BOX_TIERS.filter((tier) => getOwnedQuantity(guildId, targetId, tier) >= 1);
  const boxResult = resolveDepositBoxAttempt(ownedBoxTiers, best.toolId);
  if (boxResult.applicable && boxResult.blocked) {
    const chargeResult = consumeBoxCharge(guildId, targetId, boxResult.tierConsumed);
    return {
      outcome: 'box_blocked',
      successChance: best.successChance,
      bestParticipant: best,
      tierConsumed: boxResult.tierConsumed,
      boxBroke: chargeResult.broke,
      boxChargesRemaining: chargeResult.chargesRemaining,
    };
  }

  
  
  
  return {
    outcome: 'success',
    successChance: best.successChance,
    bestParticipant: best,
    stealAmount: snapshotAmount,
    boxBypassed: boxResult.applicable && boxResult.bypassed,
  };
}
