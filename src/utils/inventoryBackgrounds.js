import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadImage } from '@napi-rs/canvas';
import db from '../database.js';
import { EconomyError } from './economy.js';
import { MANUAL_INVENTORY_BACKGROUNDS } from '../data/manualInventoryBackgrounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUNDS_DIR = path.join(__dirname, '../assets/inventory-backgrounds');

const manualBackgroundsById = new Map(
  MANUAL_INVENTORY_BACKGROUNDS.map((bg) => [
    bg.id,
    {
      id: bg.id,
      name: bg.name,
      file_name: bg.imagePath,
      created_by: 'manual',
      created_at: 0,
      _manualAllowedUserIds: bg.allowedUserIds,
      
      
      
      
      
      
      _manualSurface: bg.surface ?? 'both',
      
      
      
      
      _manualIsPublic: bg.isPublic ?? false,
    },
  ])
);

const stmtInsertBackground = db.prepare(
  'INSERT INTO inventory_backgrounds (id, name, file_name, created_by) VALUES (?, ?, ?, ?)'
);
const stmtGetBackground = db.prepare('SELECT * FROM inventory_backgrounds WHERE id = ?');
const stmtGetAllBackgrounds = db.prepare('SELECT * FROM inventory_backgrounds ORDER BY created_at ASC');
const stmtDeleteBackground = db.prepare('DELETE FROM inventory_backgrounds WHERE id = ?');
const stmtDeleteAllGrantsForBackground = db.prepare('DELETE FROM inventory_background_access WHERE background_id = ?');
const stmtClearInventoryBgForBackground = db.prepare('UPDATE gladiators SET inventory_bg_id = NULL WHERE inventory_bg_id = ?');
const stmtClearGearBgForBackground = db.prepare('UPDATE gladiators SET gear_bg_id = NULL WHERE gear_bg_id = ?');
const stmtClearBeastpetsBgForBackground = db.prepare('UPDATE gladiators SET beastpets_bg_id = NULL WHERE beastpets_bg_id = ?');
const stmtClearInventoryBgForUser = db.prepare('UPDATE gladiators SET inventory_bg_id = NULL WHERE inventory_bg_id = ? AND user_id = ?');
const stmtClearGearBgForUser = db.prepare('UPDATE gladiators SET gear_bg_id = NULL WHERE gear_bg_id = ? AND user_id = ?');
const stmtClearBeastpetsBgForUser = db.prepare('UPDATE gladiators SET beastpets_bg_id = NULL WHERE beastpets_bg_id = ? AND user_id = ?');

const stmtGrantAccess = db.prepare(
  `INSERT INTO inventory_background_access (background_id, user_id, granted_by, surface) VALUES (?, ?, ?, ?)
   ON CONFLICT (background_id, user_id) DO UPDATE SET surface = excluded.surface, granted_by = excluded.granted_by, granted_at = strftime('%s','now')`
);
const stmtGetGrantRow = db.prepare('SELECT * FROM inventory_background_access WHERE background_id = ? AND user_id = ?');
const stmtRevokeAccess = db.prepare('DELETE FROM inventory_background_access WHERE background_id = ? AND user_id = ?');
const stmtGetGrantsForUser = db.prepare(
  `SELECT b.*, a.surface FROM inventory_backgrounds b
   JOIN inventory_background_access a ON a.background_id = b.id
   WHERE a.user_id = ? ORDER BY b.created_at ASC`
);
const stmtGetGrantsForBackground = db.prepare('SELECT user_id, surface FROM inventory_background_access WHERE background_id = ?');
const stmtGetPublicBackgrounds = db.prepare('SELECT * FROM inventory_backgrounds WHERE is_public = 1 ORDER BY created_at ASC');
const stmtSetPublic = db.prepare('UPDATE inventory_backgrounds SET is_public = ? WHERE id = ?');

export function grantBackgroundAccess(backgroundId, userId, grantedBy) {
  if (manualBackgroundsById.has(backgroundId)) {
    throw new EconomyError('That background is manually registered in code — edit its allowedUserIds in data/manualInventoryBackgrounds.js directly instead.');
  }
  if (!stmtGetBackground.get(backgroundId)) throw new EconomyError("That background doesn't exist.");
  stmtGrantAccess.run(backgroundId, userId, grantedBy, 'both');
}

export function revokeBackgroundAccess(backgroundId, userId) {
  if (manualBackgroundsById.has(backgroundId)) {
    throw new EconomyError('That background is manually registered in code — edit its allowedUserIds in data/manualInventoryBackgrounds.js directly instead.');
  }
  const existing = stmtGetGrantRow.get(backgroundId, userId);
  if (!existing) return;
  stmtRevokeAccess.run(backgroundId, userId);
  stmtClearInventoryBgForUser.run(backgroundId, userId);
  stmtClearGearBgForUser.run(backgroundId, userId);
  stmtClearBeastpetsBgForUser.run(backgroundId, userId);
}

export async function downloadAndSaveBackground(url, name, createdBy) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new EconomyError("Couldn't reach that URL — double check it's a direct link to an image.");
  }
  if (!response.ok) {
    throw new EconomyError(`That URL returned an error (${response.status}) — make sure it's a direct image link.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) {
    throw new EconomyError("That image is too large (over 8MB) — try a smaller one.");
  }

  try {
    await loadImage(buffer); 
  } catch {
    throw new EconomyError("That URL doesn't point to a valid image — make sure it's a direct link (right-click the image in Discord -> Copy Link).");
  }

  const id = crypto.randomBytes(8).toString('hex');
  const fileName = `${id}.png`;
  const fs = await import('fs/promises');
  await fs.mkdir(BACKGROUNDS_DIR, { recursive: true });
  await fs.writeFile(path.join(BACKGROUNDS_DIR, fileName), buffer);

  stmtInsertBackground.run(id, name, fileName, createdBy);
  return { id, name, fileName, createdBy };
}

export async function deleteBackground(id) {
  if (manualBackgroundsById.has(id)) {
    throw new EconomyError('That background is manually registered in code, not managed here — remove its entry from data/manualInventoryBackgrounds.js directly instead.');
  }
  const bg = stmtGetBackground.get(id);
  if (!bg) throw new EconomyError("That background doesn't exist.");

  const fs = await import('fs/promises');
  await fs.unlink(path.join(BACKGROUNDS_DIR, bg.file_name)).catch(() => {});

  stmtClearInventoryBgForBackground.run(id);
  stmtClearGearBgForBackground.run(id);
  stmtClearBeastpetsBgForBackground.run(id);
  stmtDeleteAllGrantsForBackground.run(id);
  stmtDeleteBackground.run(id);
}

export function getAllBackgrounds() {
  return [...stmtGetAllBackgrounds.all(), ...manualBackgroundsById.values()];
}

export function getUsersWithAccess(backgroundId) {
  const manual = manualBackgroundsById.get(backgroundId);
  if (manual) return manual._manualAllowedUserIds.map((userId) => ({ userId, surface: manual._manualSurface }));
  return stmtGetGrantsForBackground.all(backgroundId).map((r) => ({ userId: r.user_id, surface: r.surface }));
}

export function setBackgroundPublic(backgroundId, isPublic) {
  if (manualBackgroundsById.has(backgroundId)) {
    throw new EconomyError('That background is manually registered in code — edit isPublic in data/manualInventoryBackgrounds.js directly instead.');
  }
  if (!stmtGetBackground.get(backgroundId)) throw new EconomyError("That background doesn't exist.");
  stmtSetPublic.run(isPublic ? 1 : 0, backgroundId);
}

export function isBackgroundPublic(backgroundId) {
  const manual = manualBackgroundsById.get(backgroundId);
  if (manual) return manual._manualIsPublic;
  return !!stmtGetBackground.get(backgroundId)?.is_public;
}

export function getBackgroundsFor(userId) {
  const manualMatches = [...manualBackgroundsById.values()].filter((bg) => bg._manualIsPublic || bg._manualAllowedUserIds.includes(userId));
  const dbGrantMatches = stmtGetGrantsForUser.all(userId);
  const dbPublicMatches = stmtGetPublicBackgrounds.all();
  return dedupeById([...dbGrantMatches, ...dbPublicMatches, ...manualMatches]);
}
export const getInventoryBackgroundsFor = getBackgroundsFor;
export const getGearBackgroundsFor = getBackgroundsFor;
export const getBeastpetsBackgroundsFor = getBackgroundsFor;

function dedupeById(backgrounds) {
  const seen = new Set();
  const result = [];
  for (const bg of backgrounds) {
    if (seen.has(bg.id)) continue;
    seen.add(bg.id);
    result.push(bg);
  }
  return result;
}

export function getInventoryBackgroundById(id) {
  return manualBackgroundsById.get(id) ?? stmtGetBackground.get(id) ?? null;
}

export function resolveInventoryBackgroundPath(id) {
  const manual = manualBackgroundsById.get(id);
  if (manual) return path.join(BACKGROUNDS_DIR, manual.file_name);
  const bg = stmtGetBackground.get(id);
  return bg ? path.join(BACKGROUNDS_DIR, bg.file_name) : null;
}
