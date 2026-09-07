import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, "..", "assets", "tier-badges");
const RESIZED_DIR = path.join(__dirname, "..", "assets", "tier-badges", "resized");
const OUTPUT_JSON = path.join(__dirname, "..", "data", "tier-badge-emojis.json");

const TIER_BADGE_FILES = {
  T1: { file: "tier1-sword.png", emojiName: "t1badge" },
  T2: { file: "tier2-helmet-dark.png", emojiName: "t2badge" },
  T3: { file: "tier3-helmet-light.png", emojiName: "t3badge" },
  T4: { file: "tier4-owl.png", emojiName: "t4badge" },
  T5: { file: "tier5-chalice.png", emojiName: "t5badge" },
  T6: { file: "tier6-anvil.png", emojiName: "t6badge" },
  T7: { file: "tier7-spears.png", emojiName: "t7badge" },
  MAXED_OUT: { file: "maxed-out-skull.png", emojiName: "maxedout" },
};

async function resizeTo(filePath, size) {
  const img = await loadImage(filePath);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.encode("png");
}

async function main() {
  fs.mkdirSync(RESIZED_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_TOKEN);
  await new Promise((resolve) => client.once("ready", resolve));
  console.log(`Logged in as ${client.user.tag}`);

  const existing = await client.application.emojis.fetch();
  const result = {};

  for (const [key, def] of Object.entries(TIER_BADGE_FILES)) {
    const srcPath = path.join(SOURCE_DIR, def.file);
    if (!fs.existsSync(srcPath)) {
      console.warn(`Skipping ${key} — missing ${srcPath}`);
      continue;
    }

    
    const emojiBuffer = await resizeTo(srcPath, 128);

    
    const roleIconBuffer = await resizeTo(srcPath, 512);
    const roleIconPath = path.join(RESIZED_DIR, `${key.toLowerCase()}-role-icon.png`);
    fs.writeFileSync(roleIconPath, roleIconBuffer);

    
    const dupe = existing.find((e) => e.name === def.emojiName);
    if (dupe) {
      await dupe.delete().catch(() => {});
    }

    const emoji = await client.application.emojis.create({
      name: def.emojiName,
      attachment: emojiBuffer,
    });

    result[key] = {
      emojiId: emoji.id,
      emojiName: emoji.name,
      tag: `<:${emoji.name}:${emoji.id}>`,
      roleIconPath: path.relative(path.join(__dirname, ".."), roleIconPath),
    };

    console.log(`Uploaded ${key} -> ${result[key].tag}`);
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${OUTPUT_JSON}`);
  console.log("Restart the bot for the new badges/role icons to take effect.");

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
