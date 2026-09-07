import fs from 'fs';
import path from 'path';
import db from '../database.js';

const BACKUP_INTERVAL_MS = 30 * 60 * 1000; 
const MAX_BACKUPS_KEPT = 96; 

function getBackupDir() {
  const dir = process.env.BACKUP_DIR?.trim();
  return dir || null;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/:/g, '-').split('.')[0];
}

export function pruneOldBackups(dir) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('economy-') && f.endsWith('.sqlite'))
      .map((f) => ({ name: f, mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs); 

    for (const stale of files.slice(MAX_BACKUPS_KEPT)) {
      fs.unlinkSync(path.join(dir, stale.name));
    }
  } catch (err) {
    console.error('Failed to prune old database backups:', err.message);
  }
}

async function runBackup() {
  const dir = getBackupDir();
  if (!dir) {
    console.error('BACKUP_DIR is not set in .env — skipping scheduled database backup. See .env.example.');
    return;
  }

  try {
    fs.mkdirSync(dir, { recursive: true }); 
    const destPath = path.join(dir, `economy-${timestampForFilename()}.sqlite`);
    await db.backup(destPath);
    console.log(`Database backed up to ${destPath}`);
    pruneOldBackups(dir);
  } catch (err) {
    
    
    console.error('Scheduled database backup failed:', err.message);
  }
}

export function startBackupScheduler() {
  runBackup();
  const timer = setInterval(runBackup, BACKUP_INTERVAL_MS);
  timer.unref(); 
}
