import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const guildId = process.argv[2];
if (!guildId) {
  console.error('Usage: node scripts/clear-guild-commands.js <guildId>');
  process.exit(1);
}

const clientId = process.env.CLIENT_ID;
if (!clientId) throw new Error('CLIENT_ID is missing from your .env file.');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

console.log(`Clearing guild-specific commands for server ${guildId}...`);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
console.log('Done — that server now only has the global commands (one of each).');
