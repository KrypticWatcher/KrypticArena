import 'dotenv/config';
import { deployCommands } from '../src/utils/deploy.js';

process.on('exit', (code) => {
  console.log(`\n[diagnostic] process exiting with code ${code}`);
});
process.on('uncaughtException', (err) => {
  console.error('[diagnostic] uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[diagnostic] unhandledRejection:', err);
});

const guildId = process.argv[2];

async function main() {
  console.log('[diagnostic] Node version:', process.version);
  console.log('[diagnostic] CLIENT_ID present:', Boolean(process.env.CLIENT_ID));
  console.log('[diagnostic] DISCORD_TOKEN present:', Boolean(process.env.DISCORD_TOKEN));

  if (guildId) {
    console.log(`Deploying commands to server ${guildId} only (instant)...`);
  } else {
    console.log('Deploying commands globally (can take up to ~1hr to show up everywhere)...');
  }

  console.log('[diagnostic] Reading command files from disk...');
  const result = await deployCommands({ guildId, verbose: true });
  console.log(`Done — ${result.count} command(s) registered${guildId ? ' to that server' : ' globally'}.`);
}

main()
  .then(() => {
    console.log('[diagnostic] main() resolved successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[diagnostic] main() threw an error:');
    console.error(err);
    process.exit(1);
  });
