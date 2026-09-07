import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsPath = path.join(__dirname, '..', 'commands');

export async function collectCommandData({ verbose = false } = {}) {
  const categories = fs.readdirSync(commandsPath, { withFileTypes: true }).filter((d) => d.isDirectory());

  const commands = [];
  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category.name);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      if (verbose) console.log(`[diagnostic]   importing ${category.name}/${file}...`);
      let command;
      try {
        ({ default: command } = await import(`${pathToFileURL(filePath).href}?update=${Date.now()}`));
      } catch (err) {
        
        
        
        
        console.error(`[diagnostic] FAILED importing ${category.name}/${file}:`);
        throw err;
      }
      if (!command?.data) continue;
      const json = command.data.toJSON();
      if (category.name === 'owner' || category.name === 'admin' || category.name === 'mod') {
        json.default_member_permissions = '0';
      }
      commands.push(json);
    }
  }
  return commands;
}

export async function deployCommands({ guildId, verbose = false } = {}) {
  const clientId = process.env.CLIENT_ID;
  if (!clientId) throw new Error('CLIENT_ID is missing from your .env file.');

  const commands = await collectCommandData({ verbose });
  if (verbose) console.log(`[diagnostic] Collected ${commands.length} command(s) from disk. Sending to Discord...`);
  
  
  
  
  
  
  
  
  
  const rest = new REST({ timeout: 20_000 }).setToken(process.env.DISCORD_TOKEN);
  if (verbose) {
    
    
    
    
    
    
    rest.on('rateLimited', (info) => {
      console.log('[diagnostic] RATE LIMITED — Discord says wait, full details:', JSON.stringify(info));
    });
    const heartbeat = setInterval(() => console.log('[diagnostic] ...still waiting on Discord...'), 10_000);
    heartbeat.unref();
  }

  
  
  
  
  
  const putPromise = guildId ? rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands }) : rest.put(Routes.applicationCommands(clientId), { body: commands });
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Manual 25s safety-net timeout — the request never resolved OR rejected on its own.')), 25_000));
  await Promise.race([putPromise, timeoutPromise]);
  if (verbose) console.log('[diagnostic] Discord PUT request completed.');

  return { count: commands.length, guildId: guildId ?? null };
}
