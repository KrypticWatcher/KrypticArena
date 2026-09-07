import { LEVEL_REQUIREMENT_BY_RARITY } from '../data/items.js';

const LEGACY_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const LOCATIONS = [
  
  "the wanderer's trail",
  'the windswept causeway',
  'the racing cliffs',
  'the skyward pass',
  "the herald's crossing",
  'the cloudspire threshold',
  
  "the thicket's edge",
  'the stalking grounds',
  'the bramblefang wilds',
  'the moonlit hunting vale',
  "the wolfmother's den",
  "diana's sacred grove",
  
  "the debtor's hollow",
  "the oathbreaker's reach",
  'the hollow crown',
  'the weighing stones',
  'the broken throne',
  'the court of retribution',
];

const LOCATION_LINE = {
  "the wanderer's trail": 'open',
  'the windswept causeway': 'open',
  'the racing cliffs': 'open',
  'the skyward pass': 'open',
  "the herald's crossing": 'open',
  'the cloudspire threshold': 'open',
  "the thicket's edge": 'wild',
  'the stalking grounds': 'wild',
  'the bramblefang wilds': 'wild',
  'the moonlit hunting vale': 'wild',
  "the wolfmother's den": 'wild',
  "diana's sacred grove": 'wild',
  "the debtor's hollow": 'ruins',
  "the oathbreaker's reach": 'ruins',
  'the hollow crown': 'ruins',
  'the weighing stones': 'ruins',
  'the broken throne': 'ruins',
  'the court of retribution': 'ruins',
};

export const LOCATION_TIER = {
  "the wanderer's trail": 'common',
  "the thicket's edge": 'common',
  "the debtor's hollow": 'common',
  'the windswept causeway': 'uncommon',
  'the stalking grounds': 'uncommon',
  "the oathbreaker's reach": 'uncommon',
  'the racing cliffs': 'rare',
  'the bramblefang wilds': 'rare',
  'the hollow crown': 'rare',
  'the skyward pass': 'epic',
  'the moonlit hunting vale': 'epic',
  'the weighing stones': 'epic',
  "the herald's crossing": 'legendary',
  "the wolfmother's den": 'legendary',
  'the broken throne': 'legendary',
  'the cloudspire threshold': 'mythical',
  "diana's sacred grove": 'mythical',
  'the court of retribution': 'mythical',
};

export function getCurrentLocationTier(level) {
  let current = LEGACY_RARITIES[0];
  for (const rarity of LEGACY_RARITIES) {
    if (level >= LEVEL_REQUIREMENT_BY_RARITY[rarity]) current = rarity;
  }
  return current;
}

export function getUnlockedLocationTiers(level) {
  return LEGACY_RARITIES.filter((rarity) => level >= LEVEL_REQUIREMENT_BY_RARITY[rarity]);
}

function getLocationByTierAndLine(tier, line) {
  return Object.keys(LOCATION_TIER).find((loc) => LOCATION_TIER[loc] === tier && LOCATION_LINE[loc] === line) ?? null;
}

export function rollAdventureLocation(level, { preferredTier = null, preferredLine = null } = {}) {
  if (preferredTier && preferredLine) {
    const specific = getLocationByTierAndLine(preferredTier, preferredLine);
    if (specific) return specific;
  }

  const currentTier = getCurrentLocationTier(level);
  const tierLocations = LOCATIONS.filter((loc) => LOCATION_TIER[loc] === currentTier);
  if (preferredLine) {
    const matching = tierLocations.filter((loc) => LOCATION_LINE[loc] === preferredLine);
    if (matching.length > 0) return pick(matching);
  }
  return pick(tierLocations);
}

export function getLocationFavoredLine(location) {
  return LOCATION_LINE[location] ?? null;
}

function rollEnemyGroups({ succeeded }) {
  return succeeded ? 1 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 6);
}

const LOCATION_FLAVOR = {
  
  "the wanderer's trail": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** sets off down the Wanderer's Trail, still finding their pace. Expected back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** takes their first steps onto the Wanderer's Trail, chasing a wind no one else seems to notice. Back ${timestamp}.`,
    ],
    success: [
      ({ name, rewardsLine }) => `**${name}** returns from the Wanderer's Trail, already moving a little faster than before:\n${rewardsLine}`,
      ({ name, enemyGroups, rewardsLine }) => `The Wanderer's Trail didn't slow **${name}** down for long — ${enemyGroups} group(s) of trouble behind them. They bring back:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** lost the trail somewhere along the Wanderer's Trail and had to turn back. Nothing to show for it.`,
      ({ name }) => `The wind shifted on **${name}** halfway down the Wanderer's Trail. No spoils this time.`,
    ],
  },
  'the windswept causeway': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** strides onto the Windswept Causeway, the wind already pulling at their heels. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** heads out across the Windswept Causeway, chasing a pace they haven't found yet. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** comes back off the Windswept Causeway faster than they left — ${enemyGroups} group(s) of enemies never caught up. Brought back:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Causeway tried to slow them down; **${name}** outran it anyway. Returned with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The wind turned against **${name}** on the Windswept Causeway, and they had to give up the pace.`,
      ({ name }) => `**${name}** misjudged the Causeway's currents and came back with nothing.`,
    ],
  },
  'the racing cliffs': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** takes off along the Racing Cliffs, where even the wind seems to be competing. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** pushes onto the Racing Cliffs at a dead sprint — this is where speed starts to matter. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** outran the Racing Cliffs themselves, ${enemyGroups} group(s) of enemies left in the dust. They bring back:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Nothing on the Racing Cliffs could keep pace with **${name}** today. Spoils:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** lost their footing on the Racing Cliffs and the wind did the rest — no prize this time.`,
      ({ name }) => `The Cliffs demanded a pace **${name}** couldn't hold, and they turned back empty-handed.`,
    ],
  },
  'the skyward pass': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** climbs into the Skyward Pass, air thinning, the ground falling away below. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** enters the Skyward Pass — from here, the world looks like it's rushing past. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** descends from the Skyward Pass moving like the wind carried them, ${enemyGroups} group(s) of enemies unable to keep up. They return with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The thin air of the Skyward Pass didn't stop **${name}** — they're back, faster than they left, carrying:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Skyward Pass's winds turned violent, and **${name}** was forced back down empty-handed.`,
      ({ name }) => `**${name}** couldn't find solid ground in the Skyward Pass and had to retreat.`,
    ],
  },
  "the herald's crossing": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** reaches the Herald's Crossing, where Mercury's own messengers are said to pass. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps onto the Herald's Crossing — the air itself feels like it's watching. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** crosses back from the Herald's Crossing having outpaced ${enemyGroups} group(s) of Mercury's own scouts. They bring:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Even the Herald's Crossing couldn't slow **${name}** down today. Returned with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `Something on the Herald's Crossing outran **${name}** for once, and they had to fall back.`,
      ({ name }) => `**${name}** was turned away at the Herald's Crossing — not yet fast enough, it seems.`,
    ],
  },
  'the cloudspire threshold': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** steps onto the Cloudspire Threshold, the very edge of Mercury's domain, to challenge Talarus, his Herald. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** enters the Cloudspire Threshold — beyond this point lies Mercury's own realm, and Talarus stands guard. Expected ${timestamp}.`,
      ({ name, timestamp }) => `The winds go silent as **${name}** crosses into the Cloudspire Threshold, closing in on Talarus, Herald of Mercury. Back ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** outran Talarus himself atop the Cloudspire Threshold — ${enemyGroups} group(s) of his honor guard couldn't keep pace either. They return victorious with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Talarus, Herald of Mercury, yields — **${name}** proved faster, and returns from the Cloudspire Threshold with the god's own favor:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Cloudspire Threshold falls silent as Talarus concedes the race. **${name}** returns, having outrun a god's own herald, carrying:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `Talarus proved too fast — **${name}** was turned back at the Cloudspire Threshold, Mercury's domain still out of reach.`,
      ({ name }) => `**${name}** challenged Talarus atop the Cloudspire Threshold and lost the race. They return empty-handed, but alive.`,
      ({ name }) => `Not even **${name}** could keep pace with Mercury's own Herald. The Cloudspire Threshold remains unconquered — for now.`,
    ],
  },

  
  "the thicket's edge": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** pushes into the Thicket's Edge, where the wild first starts to close in. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps past the tree line into the Thicket's Edge, alert for whatever's watching back. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** emerges from the Thicket's Edge having tracked down ${enemyGroups} group(s) of prey worth the trouble. Brought back:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Thicket's Edge gave up its secrets easily enough — **${name}** returns with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** found nothing worth hunting in the Thicket's Edge — a quiet, wasted trip.`,
      ({ name }) => `Whatever was watching **${name}** in the Thicket's Edge never showed itself. Nothing to bring back.`,
    ],
  },
  'the stalking grounds': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters the Stalking Grounds, unsure at first who's hunting whom. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** moves carefully into the Stalking Grounds — something out there is already watching. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** turned the hunt around on the Stalking Grounds, tracking down ${enemyGroups} group(s) of what was stalking them. Returned with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `**${name}** proved the better hunter on the Stalking Grounds today, bringing back:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** became the prey on the Stalking Grounds, and had to retreat before it was too late.`,
      ({ name }) => `Something got the better of **${name}** on the Stalking Grounds — they return with nothing.`,
    ],
  },
  'the bramblefang wilds': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** pushes into the Bramblefang Wilds, where the game gets genuinely dangerous. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** enters the Bramblefang Wilds, blade ready — nothing out here is harmless. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** came out of the Bramblefang Wilds having brought down ${enemyGroups} group(s) of its fiercest hunters. They carry:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Bramblefang Wilds tested **${name}**, and lost. Spoils:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Bramblefang Wilds proved too much this time — **${name}** pulled back, empty-handed.`,
      ({ name }) => `**${name}** was outmatched in the Bramblefang Wilds and had to retreat before things got worse.`,
    ],
  },
  'the moonlit hunting vale': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters the Moonlit Hunting Vale, sacred ground where Diana herself is said to hunt. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps into the Moonlit Hunting Vale under a silver light that feels like it's being watched. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** hunted well in the Moonlit Hunting Vale, besting ${enemyGroups} group(s) worthy of the goddess's own ground. They return with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Moonlit Hunting Vale favored **${name}** tonight — a hunter's pride intact, carrying:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** was outhunted on the Moonlit Hunting Vale and had to withdraw before dawn.`,
      ({ name }) => `The Vale's moonlight hid more than it revealed, and **${name}** came back with nothing.`,
    ],
  },
  "the wolfmother's den": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** approaches the Wolfmother's Den, deep in Diana's own territory. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps into the Wolfmother's Den — this close to her domain, every sound could be Diana's own pack. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** proved themselves against the Wolfmother's own pack, ${enemyGroups} group(s) down, and returns from her Den intact, carrying:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Even the Wolfmother's Den couldn't turn **${name}** away today. Returned with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Wolfmother's pack proved too much, and **${name}** was driven back from her Den.`,
      ({ name }) => `**${name}** came close to Diana's own territory at the Wolfmother's Den, but had to retreat.`,
    ],
  },
  "diana's sacred grove": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters Diana's Sacred Grove itself, to challenge Sylvana, her Huntmaster. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps past the last tree line into Diana's Sacred Grove — Sylvana is already watching. Expected ${timestamp}.`,
      ({ name, timestamp }) => `The Grove goes still as **${name}** crosses into Diana's own sacred ground, seeking out Sylvana. Back ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** bested Sylvana, Diana's own Huntmaster, in her Sacred Grove — ${enemyGroups} group(s) of her hunting pack couldn't stop them either. They bring back:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Sylvana kneels. **${name}** has proven themselves the superior hunter, right in Diana's Sacred Grove, returning with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The hunt ends in **${name}**'s favor — Sylvana, Huntmaster to a goddess, yields at last. They carry:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `Sylvana proved the better hunter — **${name}** was driven from Diana's Sacred Grove, empty-handed.`,
      ({ name }) => `**${name}** challenged Sylvana in Diana's own domain and lost the hunt. They return, but the Grove remains hers.`,
      ({ name }) => `Not even **${name}** could out-hunt Diana's chosen Huntmaster today. The Sacred Grove holds firm.`,
    ],
  },

  
  "the debtor's hollow": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** descends into the Debtor's Hollow, where the first small debts were ever settled. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** enters the Debtor's Hollow, careful of ground that's already seen its share of reckonings. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** came back from the Debtor's Hollow having settled ${enemyGroups} group(s) of trouble along the way. They bring:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Debtor's Hollow gave up its due easily enough — **${name}** returns with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** found nothing owed to them in the Debtor's Hollow — a quiet, empty trip.`,
      ({ name }) => `The Hollow kept its secrets today, and **${name}** came back with nothing.`,
    ],
  },
  "the oathbreaker's reach": {
    sendOff: [
      ({ name, timestamp }) => `**${name}** steps into the Oathbreaker's Reach, ground soaked in broken promises. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** enters the Oathbreaker's Reach, wary of what still lingers where vows were broken. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** returned from the Oathbreaker's Reach, having settled ${enemyGroups} group(s) of old debts along the way. They carry:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Reach couldn't hold **${name}** back — they return with what was owed:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `**${name}** was turned back in the Oathbreaker's Reach, the ground refusing to give anything up.`,
      ({ name }) => `Whatever justice waited in the Oathbreaker's Reach wasn't ready for **${name}** — nothing to bring home.`,
    ],
  },
  'the hollow crown': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters the Hollow Crown, once a king's seat, now just a lesson in pride. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps carefully through the Hollow Crown — even ruins remember arrogance. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** left the Hollow Crown having earned what ${enemyGroups} group(s) of its guardians tried to deny them. They bring:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Hollow Crown yielded to **${name}** — pride doesn't protect much anymore. Returned with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Hollow Crown's guardians proved too much, and **${name}** withdrew empty-handed.`,
      ({ name }) => `**${name}** found only ruin in the Hollow Crown this time — nothing worth the trip.`,
    ],
  },
  'the weighing stones': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** approaches the Weighing Stones, where an empire's deeds were once measured against its arrogance. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps onto the Weighing Stones, aware that judgment here spares no one. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** was weighed and found worthy — the Weighing Stones gave up their reward after ${enemyGroups} group(s) of trials. They return with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Stones judged **${name}** favorably today, and they return with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Weighing Stones found **${name}** wanting this time — they return with nothing to show.`,
      ({ name }) => `**${name}** was turned away by the Weighing Stones, judgment unkind today.`,
    ],
  },
  'the broken throne': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters the Broken Throne, the last seat of the last tyrant Nemesis ever cast down. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps into the Broken Throne room, close now to the goddess's own reach. Expected ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** claimed what the Broken Throne still guarded, having overcome ${enemyGroups} group(s) along the way. They carry:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Even the Broken Throne couldn't deny **${name}** their due today. Returned with:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `The Broken Throne's last guardians proved too much, and **${name}** was forced to retreat.`,
      ({ name }) => `**${name}** came close to Nemesis's own reach at the Broken Throne, but had to turn back empty-handed.`,
    ],
  },
  'the court of retribution': {
    sendOff: [
      ({ name, timestamp }) => `**${name}** enters the Court of Retribution itself, to face Adrastos, the Inescapable. Back ${timestamp}.`,
      ({ name, timestamp }) => `**${name}** steps into Nemesis's own seat of judgment — Adrastos is already waiting. Expected ${timestamp}.`,
      ({ name, timestamp }) => `The Court goes silent as **${name}** crosses into the Court of Retribution, seeking out Adrastos himself. Back ${timestamp}.`,
    ],
    success: [
      ({ name, enemyGroups, rewardsLine }) => `**${name}** did what none thought possible — Adrastos, the Inescapable, judged and found wanting. ${enemyGroups} group(s) of his court fell as well. They bring back:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `Adrastos yields. **${name}** has done what his name promised no one could — escaped his judgment, and turned it back on him. They return with:\n${rewardsLine}`,
      ({ name, rewardsLine }) => `The Court of Retribution falls silent as **${name}** walks free, Adrastos defeated at last, carrying:\n${rewardsLine}`,
    ],
    fail: [
      ({ name }) => `Adrastos proved exactly as inescapable as his name promised — **${name}** was turned back from the Court of Retribution.`,
      ({ name }) => `**${name}** challenged Adrastos in Nemesis's own Court and lost. Not every debt can be collected — some collect you instead.`,
      ({ name }) => `Not even **${name}** could escape Adrastos's judgment today. The Court of Retribution remains his.`,
    ],
  },
};

export function buildSendOffText({ name, location, timestamp }) {
  const pool = LOCATION_FLAVOR[location]?.sendOff;
  if (!pool) return `**${name}** sets out into ${location} on an adventure. Expected back ${timestamp}.`;
  return pick(pool)({ name, location, timestamp });
}

export function buildStatusLine({ location, timestamp }) {
  return `⏳ Exploring ${location} — will return ${timestamp}`;
}

export function buildSuccessText({ name, location, rewardsLine }) {
  const enemyGroups = rollEnemyGroups({ succeeded: true });
  const pool = LOCATION_FLAVOR[location]?.success;
  if (!pool) return `**${name}** has returned from ${location}! They fought off ${enemyGroups} group(s) of enemies along the way, and came back with:\n${rewardsLine}`;
  return pick(pool)({ name, location, enemyGroups, rewardsLine });
}

export function buildFailText({ name, location }) {
  const enemyGroups = rollEnemyGroups({ succeeded: false });
  const pool = LOCATION_FLAVOR[location]?.fail;
  if (!pool) return `**${name}** limps back from ${location} empty-handed — ${enemyGroups} group(s) of enemies were too much this time.`;
  return pick(pool)({ name, location, enemyGroups });
}

const RARE_EVENT_TEMPLATES = [
  ({ name, location, collectible }) =>
    `✨ Then, half-buried in the wreckage of ${location}, something catches **${name}**'s eye — **${collectible}**. They almost didn't see it.`,
  ({ name, collectible }) =>
    `✨ The last enemy falls, and something glints beneath them. **${name}** kneels down and lifts **${collectible}** from the dirt, hardly believing it.`,
  ({ name, location, collectible }) =>
    `✨ A story people will tell for a while: **${name}** walked out of ${location} carrying **${collectible}**, of all things.`,
  ({ name, collectible }) =>
    `✨ **${name}** freezes mid-step. There, untouched by time, sits **${collectible}**. This wasn't supposed to be here.`,
  ({ name, location, collectible }) =>
    `✨ Deep in ${location}, past everything else, **${name}** finds it — **${collectible}**. Even they seem stunned.`,
  ({ name, collectible }) =>
    `✨ **${name}** almost walks right past it. Almost. **${collectible}** now belongs to them.`,
  ({ name, location, collectible }) =>
    `✨ Word will spread fast about this one: **${name}** found **${collectible}** in ${location}, something almost no one has ever seen.`,
  ({ name, collectible }) =>
    `✨ For a long moment **${name}** just stares at what's in their hands — **${collectible}**. Then they start laughing.`,
  ({ name, location, collectible }) =>
    `✨ Whatever else happened in ${location} stops mattering the second **${name}** lays eyes on **${collectible}**.`,
];

export function buildRareEventText({ name, location, collectible }) {
  return pick(RARE_EVENT_TEMPLATES)({ name, location, collectible });
}

const PET_FOUND_TEMPLATES = [
  ({ name, location, species, petName }) =>
    `🐾 On the way back through ${location}, **${name}** notices a lone ${species} keeping pace at a distance, unwilling to be shaken off. By the time they're home, it's decided — **${petName}** isn't leaving.`,
  ({ name, species, petName }) =>
    `🐾 A ${species} watches **${name}** from the treeline for most of the walk back — cautious, then curious, then close enough to touch. **${name}** names it **${petName}**.`,
  ({ name, location, species, petName }) =>
    `🐾 Something small and stubborn follows **${name}** out of ${location} — a ${species}, half-starved and fully committed. **${name}** can't bring themself to send it away. **${petName}**, they call it.`,
  ({ name, species, petName }) =>
    `🐾 **${name}** almost misses it — a lone ${species}, injured but proud, refusing help until it doesn't anymore. By the campfire that night, it has a name: **${petName}**.`,
  ({ name, location, species, petName }) =>
    `🐾 Deep in ${location}, a ${species} that should have run doesn't. **${name}** crouches, offers a hand, and just like that gains a companion — **${petName}**.`,
  ({ name, species, petName }) =>
    `🐾 It takes **${name}** a while to notice they're being followed — a ${species}, patient and unbothered by the distance. Eventually they just... stop walking away from each other. **${petName}**.`,
];

export function buildPetFoundText({ name, location, species, petName }) {
  return pick(PET_FOUND_TEMPLATES)({ name, location, species, petName });
}

export function buildCandyFoundText({ petName }) {
  return `🍬 **${petName}** found some strange candies while on the adventure — they seem pretty interested in them.`;
}

const DART_LOCATION_FLAVOR = {
  "the wanderer's trail": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** raises Hades' Dart before the first step — the Wanderer's Trail won't slow them down tonight. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Wanderer's Trail never stood a chance — Hades' Dart carried **${name}** straight through it. Returned with:\n${rewardsLine}`,
  },
  'the windswept causeway': {
    sendOff: ({ name, timestamp }) =>
      `The wind on the Windswept Causeway dies the instant **${name}** draws Hades' Dart. Expected back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `**${name}** crossed the Windswept Causeway before the wind even noticed — Hades' Dart doesn't ask permission. Brought back:\n${rewardsLine}`,
  },
  'the racing cliffs': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** grips Hades' Dart at the cliff's edge — the Racing Cliffs have already lost this race. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Racing Cliffs demand a sprint; Hades' Dart gave **${name}** something faster than that. Returned with:\n${rewardsLine}`,
  },
  'the skyward pass': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** holds Hades' Dart aloft on the Skyward Pass — even the thin air seems to yield. Expected ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Skyward Pass tests everyone who climbs it — everyone except **${name}**, carrying Hades' Dart. Brought back:\n${rewardsLine}`,
  },
  "the herald's crossing": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** doesn't wait for the Herald's Crossing to open — Hades' Dart opens it for them. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `No herald announced **${name}**'s return from the Crossing — Hades' Dart moved too fast for one. Returned with:\n${rewardsLine}`,
  },
  'the cloudspire threshold': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** steps onto the Cloudspire Threshold with Hades' Dart in hand — the clouds part first. Expected back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Cloudspire Threshold marks the edge of Mercury's own domain — Hades' Dart walked **${name}** straight through it anyway. Brought back:\n${rewardsLine}`,
  },
  "the thicket's edge": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** doesn't slip into the Thicket's Edge this time — Hades' Dart cuts a straight line through it. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `Whatever hunts the Thicket's Edge, it isn't hunting **${name}** tonight — not with Hades' Dart drawn. Returned with:\n${rewardsLine}`,
  },
  'the stalking grounds': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** becomes the thing to fear on the Stalking Grounds the moment Hades' Dart is drawn. Expected ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `Nothing stalks **${name}** on the Stalking Grounds — not with Hades' own dart in hand. Brought back:\n${rewardsLine}`,
  },
  'the bramblefang wilds': {
    sendOff: ({ name, timestamp }) =>
      `The Bramblefang Wilds part around **${name}** the instant Hades' Dart catches the light. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Bramblefang Wilds have a bite for everyone — everyone but **${name}**, carrying Hades' Dart. Returned with:\n${rewardsLine}`,
  },
  'the moonlit hunting vale': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** doesn't need the moonlight in the Hunting Vale tonight — Hades' Dart sees well enough on its own. Expected ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `Whatever watched **${name}** from the Hunting Vale's shadows thought better of it — Hades' Dart has a reputation. Brought back:\n${rewardsLine}`,
  },
  "the wolfmother's den": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** walks into the Wolfmother's Den with Hades' Dart drawn — even she knows better than to test it. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Wolfmother's Den has claimed braver Gladiators — none of them carried Hades' Dart. Returned with:\n${rewardsLine}`,
  },
  "diana's sacred grove": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** steps into Diana's own Sacred Grove — Hades' Dart makes even a goddess's ground feel borrowed. Expected back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `Diana's Sacred Grove answers to no one — except, tonight, to **${name}**, carrying Hades' Dart. Brought back:\n${rewardsLine}`,
  },
  "the debtor's hollow": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** enters the Debtor's Hollow already collecting — Hades' Dart settles every debt in advance. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `Nothing owed in the Debtor's Hollow goes uncollected once Hades' Dart is drawn — **${name}** made sure of it. Returned with:\n${rewardsLine}`,
  },
  "the oathbreaker's reach": {
    sendOff: ({ name, timestamp }) =>
      `**${name}** carries Hades' Dart into the Oathbreaker's Reach — no broken promise survives it. Expected ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Oathbreaker's Reach punishes broken vows — Hades' Dart made sure **${name}** wasn't the one paying tonight. Brought back:\n${rewardsLine}`,
  },
  'the hollow crown': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** approaches the Hollow Crown with Hades' Dart raised — thrones fall faster than this one already has. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Hollow Crown has broken stronger Gladiators — Hades' Dart made sure **${name}** wasn't one of them. Returned with:\n${rewardsLine}`,
  },
  'the weighing stones': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** sets Hades' Dart on the Weighing Stones — the scales tip before the journey even starts. Expected back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Weighing Stones judge everyone who crosses them — Hades' Dart made sure the verdict favored **${name}**. Brought back:\n${rewardsLine}`,
  },
  'the broken throne': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** steps past the Broken Throne with Hades' Dart in hand — whatever still guards it won't matter. Back ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Broken Throne has claimed everyone who reached for it — everyone except **${name}**, carrying Hades' Dart. Returned with:\n${rewardsLine}`,
  },
  'the court of retribution': {
    sendOff: ({ name, timestamp }) =>
      `**${name}** walks into the Court of Retribution already sentenced to win — Hades' Dart doesn't lose appeals. Expected ${timestamp}.`,
    success: ({ name, rewardsLine }) =>
      `The Court of Retribution hands down one verdict for everyone who enters — Hades' Dart overturned it for **${name}**. Brought back:\n${rewardsLine}`,
  },
};

export function buildDartSendOffText({ name, location, timestamp }) {
  const builder = DART_LOCATION_FLAVOR[location]?.sendOff;
  if (!builder) return `🗡️ *Hades' Dart pulses with dark energy — the power of the Underworld has been invoked.*`;
  return builder({ name, location, timestamp });
}

export function buildDartSuccessText({ name, location, rewardsLine }) {
  const builder = DART_LOCATION_FLAVOR[location]?.success;
  if (!builder) return `🗡️ *Hades' Dart awakens — the power of the Underworld delivers them from defeat.*`;
  return builder({ name, location, rewardsLine });
}
