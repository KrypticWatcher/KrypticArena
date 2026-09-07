import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'tier-badge-emojis.json');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

let cache = null;
function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

export function getBadgeTag(key) {
  return load()[key]?.tag ?? null;
}

export function getRoleIconPath(key) {
  const relPath = load()[key]?.roleIconPath;
  return relPath ? path.join(PROJECT_ROOT, relPath) : null;
}
