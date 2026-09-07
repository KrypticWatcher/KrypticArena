import db from '../database.js';
import { GLOBAL_ID } from './globalId.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { AttachmentBuilder } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEIST_IMAGES_DIR = path.join(__dirname, '../assets/heist');

const CAMERA_FEED_IMAGE_BY_GROUP_SIZE = {
  1: 'CameraFeed1Person.png',
  2: 'CameraFeed2Ppl.png',
  3: 'CameraFeed3Ppl.png',
  4: 'CameraFeed4Ppl.png',
};
import { getBalance, addCash, addBank, ensureGuild } from './economy.js';
import { recordLoss } from './gainLog.js';
import { getItem } from '../data/items.js';
import { resolveMergedHeistAttempt, isSecurityCameraActive } from './heistResolution.js';
import { resolveHeistPayout, computeFailedHeistFine, computeFineDeduction, rollAdvancedToolDrop, VAULT_CRACKER_DROP_QUANTITY_RANGE } from './heists.js';
import { getOwnedQuantity, addItemToInventory } from './inventory.js';
import { formatMoney } from './format.js';

export const MAX_HEIST_GROUP_SIZE = 4;

const HEIST_DURATION_MIN_MS = 30 * 60 * 1000;
const HEIST_DURATION_MAX_MS = 45 * 60 * 1000;

const stmtInsertPending = db.prepare(`
  INSERT INTO heist_pending
    (guild_id, attacker_user_id, target_user_id, channel_id, tool_id, has_vault_cracker, has_forged_documents, snapshot_amount, attacker_total, target_total, started_at, resolves_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetPendingForAttacker = db.prepare('SELECT * FROM heist_pending WHERE guild_id = ? AND attacker_user_id = ?');
const stmtGetPendingForTarget = db.prepare('SELECT * FROM heist_pending WHERE guild_id = ? AND target_user_id = ? ORDER BY started_at ASC');
const stmtDeletePending = db.prepare('DELETE FROM heist_pending WHERE guild_id = ? AND attacker_user_id = ?');
const stmtAllDue = db.prepare('SELECT * FROM heist_pending WHERE resolves_at <= ?');

export function getPendingHeistForAttacker(guildId, attackerUserId) {
  guildId = GLOBAL_ID;
  return stmtGetPendingForAttacker.get(guildId, attackerUserId) ?? null;
}

export function getPendingHeistsForTarget(guildId, targetUserId) {
  guildId = GLOBAL_ID;
  return stmtGetPendingForTarget.all(guildId, targetUserId);
}

export function scheduleHeist({ guildId, attackerUserId, targetUserId, channelId, toolId, hasVaultCracker, hasForgedDocuments, snapshotAmount, attackerTotal, targetTotal, resolvesAt }) {
  guildId = GLOBAL_ID;
  const now = Date.now();
  const finalResolvesAt = resolvesAt ?? now + HEIST_DURATION_MIN_MS + Math.random() * (HEIST_DURATION_MAX_MS - HEIST_DURATION_MIN_MS);
  stmtInsertPending.run(
    guildId,
    attackerUserId,
    targetUserId,
    channelId,
    toolId,
    hasVaultCracker ? 1 : 0,
    hasForgedDocuments ? 1 : 0,
    snapshotAmount,
    attackerTotal,
    targetTotal,
    now,
    Math.round(finalResolvesAt)
  );
  return { resolvesAt: Math.round(finalResolvesAt) };
}

export function getAllDueHeists() {
  return stmtAllDue.all(Date.now());
}

export function resolveDueHeistGroup(rows) {
  const guildId = rows[0].guild_id;
  const targetId = rows[0].target_user_id;
  const target = getBalance(guildId, targetId);

  const participants = rows.map((r) => ({
    attackerId: r.attacker_user_id,
    toolId: r.tool_id,
    hasVaultCracker: Boolean(r.has_vault_cracker),
    attackerTotal: r.attacker_total,
    targetTotal: r.target_total,
  }));

  const outcome = resolveMergedHeistAttempt({
    guildId,
    targetId,
    participants,
    snapshotAmount: rows[0].snapshot_amount,
  });

  let payout = null;
  const shares = new Map(); 
  if (outcome.stealAmount != null) {
    payout = resolveHeistPayout(outcome.stealAmount, target.cash, target.bank);
    if (payout.cashDelta !== 0) addCash(guildId, targetId, payout.cashDelta);
    if (payout.bankDelta !== 0) addBank(guildId, targetId, payout.bankDelta);
    
    
    
    
    recordLoss(guildId, targetId, 'cash', -(payout.cashDelta + payout.bankDelta), 'heist');

    const base = Math.floor(payout.attackerReceives / rows.length);
    let remainder = payout.attackerReceives - base * rows.length;
    for (const row of rows) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      shares.set(row.attacker_user_id, share);
      addCash(guildId, row.attacker_user_id, share, 'heist');
    }
  }

  
  
  
  
  
  
  
  const drops = new Map(); 
  if (outcome.outcome === 'success') {
    for (const row of rows) {
      const droppedItemId = rollAdvancedToolDrop();
      if (!droppedItemId) continue;
      const quantity =
        droppedItemId === 'heist_vault_cracker'
          ? VAULT_CRACKER_DROP_QUANTITY_RANGE[0] + Math.floor(Math.random() * (VAULT_CRACKER_DROP_QUANTITY_RANGE[1] - VAULT_CRACKER_DROP_QUANTITY_RANGE[0] + 1))
          : 1;
      addItemToInventory(guildId, row.attacker_user_id, droppedItemId, quantity, 'heist');
      drops.set(row.attacker_user_id, { itemId: droppedItemId, quantity });
    }
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  const fines = new Map(); 
  const isFineableOutcome = outcome.outcome === 'failed' || outcome.outcome === 'box_blocked';
  const groupHasGrapplingHook = rows.some((r) => r.tool_id === 'heist_grappling_hook');
  if (isFineableOutcome && !groupHasGrapplingHook) {
    for (const row of rows) {
      const attacker = getBalance(guildId, row.attacker_user_id);
      const fineAmount = computeFailedHeistFine(attacker.cash + attacker.bank);
      if (fineAmount <= 0) continue;
      const deduction = computeFineDeduction(fineAmount, attacker.cash, attacker.bank);
      if (deduction.cashDelta !== 0) addCash(guildId, row.attacker_user_id, deduction.cashDelta);
      if (deduction.bankDelta !== 0) addBank(guildId, row.attacker_user_id, deduction.bankDelta);
      recordLoss(guildId, row.attacker_user_id, 'cash', fineAmount, 'heist_fine');
      fines.set(row.attacker_user_id, fineAmount);
    }
  }

  for (const row of rows) {
    stmtDeletePending.run(guildId, row.attacker_user_id);
  }

  
  
  
  
  const groupHasForgedDocuments = rows.some((r) => r.has_forged_documents);

  return {
    rows,
    outcome,
    payout,
    shares,
    fines,
    drops,
    groupHasGrapplingHook,
    hasForgedDocumentsByAttacker: new Map(rows.map((r) => [r.attacker_user_id, groupHasForgedDocuments])),
  };
}

function buildPublicResultLine(resolved, settings) {
  const amountText = (amt) => formatMoney(amt, settings);
  const groupSize = resolved.rows.length;
  const totalStolen = resolved.outcome.stealAmount;
  const perPerson = totalStolen != null ? resolved.shares.values().next().value : null;
  
  
  
  
  
  
  
  
  const fineNote = resolved.groupHasGrapplingHook
    ? ' Your Grappling Hook got you out clean — no fine this time.'
    : groupSize > 1
      ? ` Fines: ${resolved.rows
          .map((r) => `<@${r.attacker_user_id}> **${amountText(resolved.fines.get(r.attacker_user_id) ?? 0)}**`)
          .join(', ')}.`
      : ` You got hit with a **${amountText(resolved.fines.get(resolved.rows[0].attacker_user_id) ?? 0)}** fine for the trouble.`;

  switch (resolved.outcome.outcome) {
    case 'failed':
      return (
        (groupSize > 1
          ? `🕶️ Your combined heist didn't go as planned — everyone got away clean, but empty-handed.`
          : `🕶️ Your heist didn't go as planned — you got away clean, but empty-handed.`) + fineNote
      );
    case 'box_blocked': {
      const tierName = getItem(resolved.outcome.tierConsumed)?.name ?? 'a deposit box';
      return (
        (groupSize > 1
          ? `🕶️ Your combined heist was caught trying to crack a **${tierName}** — the attempt failed and no one got anything.`
          : `🕶️ You were caught trying to crack a **${tierName}** — the attempt failed and you got nothing.`) + fineNote
      );
    }
    case 'decoy_triggered':
      return groupSize > 1
        ? `🕶️ Your combined heist succeeded, but it looks like you only got away with a fraction of what you thought — **${amountText(totalStolen)}** total, split **${amountText(perPerson)}** each between the **${groupSize}** of you.`
        : `🕶️ Your heist succeeded, but it looks like you only got away with a fraction of what you thought — **${amountText(totalStolen)}**.`;
    case 'success': {
      const base =
        groupSize > 1
          ? `🕶️ Your combined heist paid off — you got away with **${amountText(totalStolen)}** total, split **${amountText(perPerson)}** each between the **${groupSize}** of you!`
          : `🕶️ Your heist paid off — you got away with **${amountText(totalStolen)}**!`;
      
      
      
      
      
      
      if (resolved.drops.size === 0) return base;
      const dropLines = [...resolved.drops.entries()].map(([attackerId, drop]) => {
        const itemName = getItem(drop.itemId)?.name ?? drop.itemId;
        const qtyTag = drop.quantity > 1 ? ` x${drop.quantity}` : '';
        return groupSize > 1 ? `<@${attackerId}> picked up a **${itemName}${qtyTag}**` : `you also picked up a **${itemName}${qtyTag}**`;
      });
      return `${base}\n🧰 Bonus: ${dropLines.join(', ')}!`;
    }
    default:
      return `🕶️ Your heist has resolved.`;
  }
}

const FAKE_IDENTITY_ALIASES = [
  'The Guy From The Bar', 'The Other Guy', 'The Accountant', 'The Consultant',
  'The Tall One', 'The Understudy', 'The Backup Plan', 'The Silhouette',
  'No Relation', 'Sunglasses Indoors', 'Steve (not his real name)', 'A Friend Of A Friend',
  'The New Guy', 'Someone\'s Cousin', 'The Guy In The Van', 'A Concerned Citizen',
  'The Substitute Teacher', 'A Guy I Know', 'The Middleman', 'Whoever That Was',
  'The Guy Who Knows A Guy', 'Definitely Not A Getaway Driver',
];

function pickFakeIdentityAliases(count) {
  const pool = [...FAKE_IDENTITY_ALIASES];
  const picked = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...FAKE_IDENTITY_ALIASES);
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function buildVictimDm(resolved, attackerDisplayNames, settings, guildId, targetId) {
  const amountText = (amt) => formatMoney(amt, settings);
  const outcome = resolved.outcome.outcome;
  const groupSize = resolved.rows.length;

  if (outcome === 'success' || outcome === 'decoy_triggered') {
    
    
    
    
    
    const attemptedConcealment = resolved.rows.some((r) => resolved.hasForgedDocumentsByAttacker.get(r.attacker_user_id));
    const cameraActive = isSecurityCameraActive(guildId, targetId);
    const cameraCaughtThem = attemptedConcealment && cameraActive;
    const concealed = attemptedConcealment && !cameraCaughtThem;
    const aliases = concealed ? pickFakeIdentityAliases(resolved.rows.length) : null;
    const names = resolved.rows.map((r, i) => (concealed ? `**${aliases[i]}**` : `**${attackerDisplayNames.get(r.attacker_user_id)}**`));
    const whoLine = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const verb = groupSize > 1 ? 'organized a combined heist' : 'organized a heist';
    const cameraNote = cameraCaughtThem ? ' (your Security Camera caught them trying to hide who they were)' : '';

    const decoyNote = outcome === 'decoy_triggered' ? ' Your Decoy Stash triggered and is now used up — time to replace it if you want that protection again.' : '';
    const text = `🚨 ${whoLine} just successfully ${verb} against you${cameraNote} — they got away with **${amountText(resolved.outcome.stealAmount)}**.${decoyNote}`;
    const imagePath = cameraActive ? path.join(HEIST_IMAGES_DIR, CAMERA_FEED_IMAGE_BY_GROUP_SIZE[groupSize] ?? CAMERA_FEED_IMAGE_BY_GROUP_SIZE[4]) : null;
    return { text, imagePath };
  }
  if (outcome === 'failed') {
    return { text: groupSize > 1 ? `🔔 A group attempted a heist against you and failed.` : `🔔 Someone attempted a heist against you and failed.`, imagePath: null };
  }
  if (outcome === 'box_blocked') {
    const tierName = getItem(resolved.outcome.tierConsumed)?.name ?? 'one of your protections';
    
    
    
    
    
    
    const statusNote = resolved.outcome.boxBroke
      ? " — it's now broken. Time to replace it."
      : ` — it held, ${resolved.outcome.boxChargesRemaining} more block${resolved.outcome.boxChargesRemaining === 1 ? '' : 's'} left before it breaks.`;
    return { text: `🔔 Someone attempted a heist against you — your **${tierName}** stopped them${statusNote}`, imagePath: null };
  }
  return null;
}

export async function checkDueHeists(client) {
  const due = getAllDueHeists();

  const groups = new Map(); 
  for (const row of due) {
    const key = `${row.guild_id}:${row.target_user_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  for (const rows of groups.values()) {
    const guildId = rows[0].guild_id;
    const targetId = rows[0].target_user_id;
    try {
      const resolved = resolveDueHeistGroup(rows);
      const settings = ensureGuild(guildId);

      try {
        const channel = await client.channels.fetch(rows[0].channel_id);
        const pings = rows.map((r) => `<@${r.attacker_user_id}>`).join(' ');
        await channel.send({ content: `${pings} ${buildPublicResultLine(resolved, settings)}` });
      } catch (postErr) {
        console.error(`Couldn't post heist result for target ${targetId} in ${guildId}:`, postErr.message);
      }

      const outcome = resolved.outcome.outcome;
      const targetOwnsSilentAlarm = getOwnedQuantity(guildId, targetId, 'heist_silent_alarm') >= 1;
      const shouldDm = outcome === 'success' || outcome === 'decoy_triggered' || (targetOwnsSilentAlarm && (outcome === 'failed' || outcome === 'box_blocked'));

      if (shouldDm) {
        try {
          const attackerDisplayNames = new Map();
          for (const row of rows) {
            const attackerUser = await client.users.fetch(row.attacker_user_id);
            attackerDisplayNames.set(row.attacker_user_id, attackerUser.displayName ?? attackerUser.username);
          }
          const dm = buildVictimDm(resolved, attackerDisplayNames, settings, guildId, targetId);
          if (dm) {
            const targetUser = await client.users.fetch(targetId);
            const files = dm.imagePath ? [new AttachmentBuilder(dm.imagePath, { name: 'camera-feed.png' })] : [];
            await targetUser.send({ content: dm.text, files });
          }
        } catch (dmErr) {
          
          
          
          
          console.error(`Couldn't DM heist result to ${targetId} in ${guildId}:`, dmErr.message);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve heist group for target ${targetId} in ${guildId}:`, err);
    }
  }
}
