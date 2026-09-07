import 'dotenv/config';
import '../src/database.js';
import { addBannedWord } from '../src/utils/nameFilter.js';

const guildId = process.argv[2];
if (!guildId) {
  console.error('Usage: node scripts/seed-namefilter.js <guildId>');
  process.exit(1);
}

const WILDCARD_WORDS = [
  'nigger', 'heil h', 'fagg', 'fag', 'faggot', 'fagget', 'feg',
  'Nickg', 'nlg', 'n1g', 'nigg', 'ngger', 'fgt', 'faggit', 'faqq',
  'pedo', 'pedoph', 'peado', 'chomo', 'kys', 'chink', 'n1gg', 'n!gg',
  'ni99', 'f@g', 'phagg', 'coon', 'wetback', 'f4g',
];

const EXACT_WORDS = ['Rape', 'Rapist', 'Grapist'];

const seededBy = 'seed-script';
let added = 0;
let skipped = 0;

for (const word of WILDCARD_WORDS) {
  if (addBannedWord(guildId, word, 'wildcard', seededBy)) added++;
  else skipped++;
}
for (const word of EXACT_WORDS) {
  if (addBannedWord(guildId, word, 'exact', seededBy)) added++;
  else skipped++;
}

console.log(`Done. Added ${added} word(s), skipped ${skipped} already present.`);
console.log(`Open /mod → Name Filter in that server to confirm.`);
