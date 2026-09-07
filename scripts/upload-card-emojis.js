import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REST } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.join(__dirname, '..', 'assets', 'cards');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'cardEmojis.json');

const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const clientId = process.env.CLIENT_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!clientId || !token) {
    console.error('CLIENT_ID and DISCORD_TOKEN must both be set in your .env file before running this.');
    process.exit(1);
  }

  if (!fs.existsSync(CARDS_DIR)) {
    console.error(
      `Expected card images at ${CARDS_DIR} — create that folder and drop all 53 PNGs from your zip into it ` +
        `(bj_as.png, bj_2c.png, ..., bj_back.png — same filenames you already have, nothing to rename).`
    );
    process.exit(1);
  }

  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.toLowerCase().endsWith('.png'));
  if (files.length === 0) {
    console.error(`No .png files found in ${CARDS_DIR}.`);
    process.exit(1);
  }

  const rest = new REST().setToken(token);

  console.log(`Found ${files.length} card image(s). Checking what's already uploaded...`);
  let existing = [];
  try {
    const res = await rest.get(`/applications/${clientId}/emojis`);
    existing = res.items ?? [];
  } catch (err) {
    console.error('Could not list existing application emojis:', err.message);
    process.exit(1);
  }
  const existingByName = new Map(existing.map((e) => [e.name, e]));

  const results = {};
  let created = 0;
  let reused = 0;
  let failed = 0;

  for (const file of files) {
    const name = path.basename(file, '.png');
    const already = existingByName.get(name);

    if (already) {
      results[name] = already.id;
      reused++;
      console.log(`- ${name}: already uploaded, reusing id ${already.id}`);
      continue;
    }

    const imagePath = path.join(CARDS_DIR, file);
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const imageDataUri = `data:image/png;base64,${base64}`;

    try {
      const emoji = await rest.post(`/applications/${clientId}/emojis`, {
        body: { name, image: imageDataUri },
      });
      results[name] = emoji.id;
      created++;
      console.log(`+ ${name}: created, id ${emoji.id}`);
    } catch (err) {
      failed++;
      console.error(`! ${name}: FAILED - ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2) + '\n');

  console.log('');
  console.log(`Done. Created: ${created}, reused: ${reused}, failed: ${failed}.`);
  console.log(`Lookup table written to ${OUTPUT_PATH}`);
  if (failed > 0) {
    console.log('Run this script again to retry the ones that failed — everything already uploaded will be skipped, not duplicated.');
  } else {
    console.log('All done — restart the bot and the card emojis will be live.');
  }
}

main();
