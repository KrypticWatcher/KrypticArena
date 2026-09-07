const WEALTH_NUDGE_MAX_PCT = 10;
const SUCCESS_FLOOR_PCT = 10;
const SUCCESS_CEILING_PCT = 85;
const BASE_SUCCESS_PCT = 50;

export function computeWealthNudge(attackerTotal, targetTotal) {
  const sum = attackerTotal + targetTotal;
  if (sum <= 0) return 0;
  const raw = ((targetTotal - attackerTotal) / sum) * WEALTH_NUDGE_MAX_PCT * 2;
  return Math.max(-WEALTH_NUDGE_MAX_PCT, Math.min(WEALTH_NUDGE_MAX_PCT, raw));
}

export function computeHeistSuccessChance({ attackerTotal, targetTotal, toolBonusPct = 0, protectionPenaltyPct = 0 }) {
  const wealthNudge = computeWealthNudge(attackerTotal, targetTotal);
  const raw = BASE_SUCCESS_PCT + wealthNudge + toolBonusPct - protectionPenaltyPct;
  return Math.max(SUCCESS_FLOOR_PCT, Math.min(SUCCESS_CEILING_PCT, raw));
}

export function rollHeistSuccess(successChancePct) {
  return Math.random() * 100 < successChancePct;
}

const STEAL_MIN_PCT = 8;
const STEAL_MAX_PCT = 15;
const STEAL_FLOOR = 2000;

export function computeStealAmount(snapshotTotal) {
  const pct = STEAL_MIN_PCT + Math.random() * (STEAL_MAX_PCT - STEAL_MIN_PCT);
  return Math.max(STEAL_FLOOR, Math.round(snapshotTotal * (pct / 100)));
}

export const FAILED_HEIST_FINE_PCT = 8;

export function computeFailedHeistFine(attackerTotal) {
  return Math.min(attackerTotal, Math.round(attackerTotal * (FAILED_HEIST_FINE_PCT / 100)));
}

export function computeFineDeduction(fineAmount, currentCash, currentBank) {
  const fromCash = Math.min(currentCash, fineAmount);
  const fromBank = fineAmount - fromCash;
  return { cashDelta: -fromCash, bankDelta: -fromBank };
}

export function resolveHeistPayout(stealAmount, currentCash, currentBank) {
  const currentTotal = currentCash + currentBank;
  if (currentTotal >= stealAmount) {
    
    
    const fromCash = Math.min(currentCash, stealAmount);
    const fromBank = stealAmount - fromCash;
    return { cashDelta: -fromCash, bankDelta: -fromBank, attackerReceives: stealAmount };
  }
  
  
  
  const shortfall = stealAmount - currentTotal;
  return { cashDelta: -currentCash, bankDelta: -currentBank - shortfall, attackerReceives: stealAmount };
}

export const HEIST_ITEM_SCALING_PCT = {
  heist_deposit_box: 1.5,
  heist_reinforced_box: 3,
  heist_fortified_box: 5,
  heist_vault: 12,
  
  
  
  
  heist_decoy_stash: 2.5,
  heist_silent_alarm: 2.5,
  
  
  heist_security_camera: 2.5,
  heist_lockpick_set: 1,
  heist_crowbar: 1,
  heist_grappling_hook: 0.5,
};

export function isHeistItemUnlocked(item, playerTotal) {
  return playerTotal >= item.price;
}

export function computeHeistItemPrice(item, playerTotal) {
  if (playerTotal <= item.price) return item.price;
  const scalingPct = HEIST_ITEM_SCALING_PCT[item.id] ?? 0;
  const overage = playerTotal - item.price;
  return Math.round(item.price + overage * (scalingPct / 100));
}

export const DEPOSIT_BOX_TIERS = ['heist_deposit_box', 'heist_reinforced_box', 'heist_fortified_box'];

export const DEPOSIT_BOX_MAX_CHARGES = {
  heist_deposit_box: 1,
  heist_reinforced_box: 2,
  heist_fortified_box: 3,
};

export const BOX_BYPASS_CHANCE = {
  heist_lockpick_set: { heist_deposit_box: 0.1, heist_reinforced_box: 0, heist_fortified_box: 0 },
  heist_thermal_drill: { heist_deposit_box: 1, heist_reinforced_box: 0.25, heist_fortified_box: 0 },
  heist_master_key: { heist_deposit_box: 1, heist_reinforced_box: 1, heist_fortified_box: 0.2 },
};

export const DECOY_STASH_ACTIVATION_CHANCE = 0.45;
export const DECOY_STASH_PAYOUT_FRACTION = 0.25;

export function resolveDepositBoxAttempt(ownedBoxTiers, toolId) {
  const weakestOwned = DEPOSIT_BOX_TIERS.find((tier) => ownedBoxTiers.includes(tier));
  if (!weakestOwned) return { applicable: false, blocked: false, bypassed: false, tierConsumed: null };

  const bypassChance = BOX_BYPASS_CHANCE[toolId]?.[weakestOwned] ?? 0;
  const bypassed = Math.random() < bypassChance;
  return {
    applicable: true,
    blocked: !bypassed,
    bypassed,
    tierConsumed: bypassed ? null : weakestOwned,
  };
}

export function resolveDecoyStashAttempt(hasDecoyStash) {
  if (!hasDecoyStash) return { applicable: false, triggered: false };
  return { applicable: true, triggered: Math.random() < DECOY_STASH_ACTIVATION_CHANCE };
}

export const ADVANCED_TOOL_DROP_CHANCE = 0.12;
export const ADVANCED_TOOL_DROP_WEIGHTS = {
  heist_forged_documents: 40,
  heist_vault_cracker: 30,
  heist_thermal_drill: 20,
  heist_master_key: 10,
  
  
  
  
  
  heist_insider_info: 8,
};

export const VAULT_CRACKER_DROP_QUANTITY_RANGE = [2, 3];

export function rollAdvancedToolDrop() {
  if (Math.random() >= ADVANCED_TOOL_DROP_CHANCE) return null;
  const entries = Object.entries(ADVANCED_TOOL_DROP_WEIGHTS);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  for (const [itemId, weight] of entries) {
    if (roll < weight) return itemId;
    roll -= weight;
  }
  return entries[entries.length - 1][0]; 
}

export const HEIST_TOOL_SUCCESS_BONUS_PCT = {
  heist_lockpick_set: 12,
  heist_crowbar: 8,
  heist_grappling_hook: 0, 
  heist_thermal_drill: 20,
  heist_master_key: 0, 
  heist_vault_cracker: 0, 
  heist_forged_documents: 0, 
  heist_insider_info: 0, 
};

export const VAULT_PROTECTION_PENALTY_PCT = 35;

export const VAULT_CRACKER_OFFSET_PCT = 12;

export function getToolSuccessBonus(toolId) {
  return HEIST_TOOL_SUCCESS_BONUS_PCT[toolId] ?? 0;
}

export function getVaultProtectionPenalty(ownsVault, hasVaultCracker) {
  if (!ownsVault) return 0;
  return hasVaultCracker ? Math.max(0, VAULT_PROTECTION_PENALTY_PCT - VAULT_CRACKER_OFFSET_PCT) : VAULT_PROTECTION_PENALTY_PCT;
}

export const VAULT_FEE_BASE_AMOUNT = 85000;
export const VAULT_FEE_SCALING_PCT = HEIST_ITEM_SCALING_PCT.heist_vault;
export const VAULT_FEE_INTERVAL_MS = 1 * 24 * 60 * 60 * 1000;

export function computeVaultFeeAmount(playerTotal) {
  if (playerTotal <= VAULT_FEE_BASE_AMOUNT) return VAULT_FEE_BASE_AMOUNT;
  const overage = playerTotal - VAULT_FEE_BASE_AMOUNT;
  return Math.round(VAULT_FEE_BASE_AMOUNT + overage * (VAULT_FEE_SCALING_PCT / 100));
}

export function isVaultFeeCurrent(vaultPaidUntil) {
  return vaultPaidUntil > Date.now();
}

export function computeVaultFeeExtension(currentPaidUntil) {
  return Math.max(Date.now(), currentPaidUntil) + VAULT_FEE_INTERVAL_MS;
}

export const SECURITY_CAMERA_FEE_BASE_AMOUNT = 5000;
export const SECURITY_CAMERA_FEE_SCALING_PCT = HEIST_ITEM_SCALING_PCT.heist_security_camera;
export const SECURITY_CAMERA_FEE_INTERVAL_MS = 1 * 24 * 60 * 60 * 1000;

export function computeSecurityCameraFeeAmount(playerTotal) {
  if (playerTotal <= SECURITY_CAMERA_FEE_BASE_AMOUNT) return SECURITY_CAMERA_FEE_BASE_AMOUNT;
  const overage = playerTotal - SECURITY_CAMERA_FEE_BASE_AMOUNT;
  return Math.round(SECURITY_CAMERA_FEE_BASE_AMOUNT + overage * (SECURITY_CAMERA_FEE_SCALING_PCT / 100));
}

export function isSecurityCameraFeeCurrent(cameraPaidUntil) {
  return cameraPaidUntil > Date.now();
}

export function computeSecurityCameraFeeExtension(currentPaidUntil) {
  return Math.max(Date.now(), currentPaidUntil) + SECURITY_CAMERA_FEE_INTERVAL_MS;
}

const BOX_TIER_LABEL = {
  heist_deposit_box: 'a Safety Deposit Box',
  heist_reinforced_box: 'a Reinforced Deposit Box',
  heist_fortified_box: 'a Fortified Deposit Box',
};

function bypassLineFor(toolId) {
  const chances = BOX_BYPASS_CHANCE[toolId];
  if (!chances) return null;
  const parts = DEPOSIT_BOX_TIERS.filter((tier) => chances[tier] > 0).map((tier) => {
    const pct = chances[tier];
    const label = BOX_TIER_LABEL[tier];
    return pct >= 1 ? `guaranteed through ${label}` : `${Math.round(pct * 100)}% chance through ${label}`;
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

export function getHeistItemEffectSummary(itemId) {
  switch (itemId) {
    case 'heist_deposit_box':
      return `Fully blocks a heist attempt. Higher tiers block more.`;
    case 'heist_reinforced_box':
      return `Fully blocks 2 heist attempts. (Higher tiers block more.)`;
    case 'heist_fortified_box':
      return `Fully blocks 3 heist attempts.`;
    case 'heist_vault':
      return `Reduces an attacker's success chance by ${VAULT_PROTECTION_PENALTY_PCT}%. Needs recurring upkeep (\`/vault pay\`) to stay active.`;
    case 'heist_decoy_stash':
      return `${Math.round(DECOY_STASH_ACTIVATION_CHANCE * 100)}% chance to trigger on a heist that would've otherwise succeeded — if it does, the attacker only gets ${Math.round(DECOY_STASH_PAYOUT_FRACTION * 100)}% of what they would've stolen. Single-use, consumed when it triggers.`;
    case 'heist_silent_alarm':
      return `DMs you immediately if a heist against you fails or gets blocked.`;
    case 'heist_security_camera':
      return `Cancels Forged Documents — an attacker using one against you gets caught on camera, their real name shown anyway. Needs recurring upkeep (\`/camera pay\`) to stay active.`;
    case 'heist_lockpick_set': {
      const bypass = bypassLineFor(itemId);
      return `+${HEIST_TOOL_SUCCESS_BONUS_PCT[itemId]}% heist success chance.${bypass ? ` Also: ${bypass}.` : ''}`;
    }
    case 'heist_crowbar':
      return `+${HEIST_TOOL_SUCCESS_BONUS_PCT[itemId]}% heist success chance.`;
    case 'heist_grappling_hook':
      return `Guarantees a clean escape.`;
    case 'heist_thermal_drill': {
      const bypass = bypassLineFor(itemId);
      return `+${HEIST_TOOL_SUCCESS_BONUS_PCT[itemId]}% heist success chance.${bypass ? ` Also: ${bypass}.` : ''}`;
    }
    case 'heist_master_key': {
      const bypass = bypassLineFor(itemId);
      return `Purely a bypass tool, but the best one: ${bypass}.`;
    }
    case 'heist_vault_cracker':
      return `Offsets a Vault's protection penalty from ${VAULT_PROTECTION_PENALTY_PCT}% down to ${VAULT_PROTECTION_PENALTY_PCT - VAULT_CRACKER_OFFSET_PCT}%.`;
    case 'heist_forged_documents':
      return `Hides your name in the victim's DM if the heist succeeds.`;
    case 'heist_insider_info':
      return `Reveals a target's protections before you commit to a heist (\`/heist scout\`). Consumed on use.`;
    default:
      return null;
  }
}

