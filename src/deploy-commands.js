import 'dotenv/config';
import { deployCommands } from './utils/deploy.js';

try {
  const { DEV_GUILD_ID } = process.env;
  const result = await deployCommands({ guildId: DEV_GUILD_ID || undefined });

  console.log(
    result.guildId
      ? `Deployed ${result.count} command(s) to guild ${result.guildId} (instant).`
      : `Deployed ${result.count} command(s) globally (can take up to ~1 hour to propagate).`
  );
} catch (err) {
  console.error('Failed to deploy commands:', err);
  process.exit(1);
}
