import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUNDS_DIR = path.join(__dirname, '../assets/inventory-backgrounds');

export const INVENTORY_BACKGROUNDS = [
  
];

export function getInventoryBackgroundsFor(userId) {
  return INVENTORY_BACKGROUNDS.filter((bg) => bg.allowedUserIds.includes(userId));
}

export function getInventoryBackgroundById(id) {
  return INVENTORY_BACKGROUNDS.find((bg) => bg.id === id) ?? null;
}

export function resolveInventoryBackgroundPath(id) {
  const bg = getInventoryBackgroundById(id);
  return bg ? path.join(BACKGROUNDS_DIR, bg.imagePath) : null;
}
