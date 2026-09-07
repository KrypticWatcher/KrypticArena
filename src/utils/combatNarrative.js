const CHAMPION_FIRST_NAMES = [
  'Grukthar', 'Vorn', 'Kaelan', 'Dravos', 'Thessaly', 'Uldric', 'Mireth',
  'Skarn', 'Baelor', 'Ragnal', 'Corvin', 'Xanthe', 'Morvane', 'Threnn',
  'Gorrim', 'Vaelen', 'Ashira', 'Bruk', 'Sedryn', 'Malkor',
];
const CHAMPION_EPITHETS = [
  'the Merciless', 'the Unbroken', 'the Bloodied', 'Ashblade', 'Ironjaw',
  'the Relentless', 'Stormbringer', 'the Undefeated', 'Doomhammer',
  'the Silent', 'Grimscar', 'the Butcher', 'Nightfall', 'the Ruthless',
  'Bonecrusher', 'the Hollow', 'Wolfsbane', 'the Unyielding', 'Graveborn',
  'the Cruel',
];

function chunkEvenly(items, groupCount) {
  const groups = [];
  const base = Math.floor(items.length / groupCount);
  let remainder = items.length % groupCount;
  let start = 0;
  for (let i = 0; i < groupCount; i++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups.push(items.slice(start, start + size));
    start += size;
  }
  return groups;
}

const CHAMPION_BRACKET_COUNT = 6;
const CHAMPION_FIRST_NAMES_BY_BRACKET = chunkEvenly(CHAMPION_FIRST_NAMES, CHAMPION_BRACKET_COUNT);
const CHAMPION_EPITHETS_BY_BRACKET = chunkEvenly(CHAMPION_EPITHETS, CHAMPION_BRACKET_COUNT);

export function generateChampionName(bracketOrder) {
  const idx = bracketOrder - 1;
  const names = CHAMPION_FIRST_NAMES_BY_BRACKET[idx];
  const epithets = CHAMPION_EPITHETS_BY_BRACKET[idx];
  if (!names || !epithets) {
    throw new Error(`generateChampionName: no name pool for bracket order ${bracketOrder}`);
  }
  return `${pick(names)} ${pick(epithets)}`;
}

export function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeReadDelay(text) {
  const wordCount = text.trim().split(/\s+/).length;
  const base = 1950;
  const perWord = 62;
  const jitter = Math.floor(Math.random() * 300) - 150;
  const raw = base + perWord * wordCount + jitter;
  return Math.min(4200, Math.max(2500, raw));
}

const OPENING_LINES = [
  "The arena gates grind open. {gladiator} steps onto the sand as {opponent} waits across the arena, weapon already drawn.",
  "The crowd erupts as {gladiator} enters the arena. Across the blood-stained sand, {opponent} watches in silence.",
  "The gates slam shut behind {gladiator}. Across the arena stands {opponent}. Only one of them is walking back out.",
  "{gladiator} tightens their grip and steps forward. {opponent} does the same. The crowd knows what's coming.",
  "A horn echoes through the arena. {gladiator} and {opponent} draw their weapons and begin closing the distance.",
  "{opponent} drags their weapon through the sand as {gladiator} approaches. Neither fighter takes their eyes off the other.",
  "{gladiator} steps over the bloodstains of the fights before them and takes their place opposite {opponent}.",
  "The roar of the crowd fades beneath the sound of steel leaving its sheath. {gladiator} and {opponent} are ready.",
  "{opponent} raises their weapon toward {gladiator} in challenge. {gladiator} answers by drawing their own.",
  "Dust hangs over the arena as {gladiator} walks toward the center. {opponent} is already there waiting.",
  "The crowd chants for blood as {gladiator} and {opponent} take their places. The horn sounds, and the arena belongs to them.",
  "{gladiator} rolls their shoulders and exhales slowly. Across from them, {opponent} looks far too comfortable.",
  "{opponent} greets {gladiator} with a grin and a raised weapon. Whether it's confidence or arrogance is about to be decided.",
  "The arena falls strangely quiet as {gladiator} and {opponent} stare each other down. Then the horn sounds.",
  "{gladiator} enters beneath a wall of cheers and jeers. {opponent} doesn't seem interested in either — their attention never leaves {gladiator}.",
  "Fresh blood still stains the sand when {gladiator} enters. {opponent} steps forward to make sure there will be more.",
  "{gladiator} plants their feet in the sand and raises their weapon. {opponent} mirrors them from across the arena.",
  "The gates close. The crowd rises. Weapons are drawn. {gladiator} and {opponent} have nowhere left to go but through each other.",
  "{opponent} paces like a caged animal while {gladiator} approaches the center of the arena. The horn finally sets them loose.",
  "{gladiator} walks into the arena without looking at the crowd. Their eyes are fixed entirely on {opponent}.",
  "Thousands of voices thunder from the stands as {gladiator} and {opponent} step onto the sand. In moments, only one name will matter.",
  "{opponent} gives {gladiator} a final look from across the arena and lowers into a fighting stance. No words are needed.",
  "The sun beats down on the arena as {gladiator} and {opponent} face one another over scarred, bloodstained sand.",
  "{gladiator} tests the weight of their weapon one final time. Across from them, {opponent} is doing exactly the same.",
  "The horn hasn't even sounded yet, and {opponent} already looks eager to kill. {gladiator} raises their weapon and waits.",
  "A deafening roar rolls through the stands as the gates shut. {gladiator}. {opponent}. One arena. No surrender.",
  "{gladiator} and {opponent} meet at the center of the arena, weapons ready and neither willing to give the other a single step.",
  "The last fighter's blood hasn't dried yet. {gladiator} steps onto the same sand and finds {opponent} waiting.",
  "{opponent} points their weapon toward {gladiator}. The crowd answers with a roar. {gladiator} simply steps forward.",
  "For a moment, neither {gladiator} nor {opponent} moves. Then the horn sounds, and all hesitation disappears.",
];

const EXCHANGE_LINES = [
  "{opponent} lunges first — {gladiator} slips aside and answers with a shallow slash. {opponent} barely seems to notice.",
  "Steel crashes against steel as {gladiator} and {opponent} trade a furious series of blows, neither willing to give an inch.",
  "{gladiator} feints high and strikes low, but {opponent} catches on just in time. The blade glances away harmlessly.",
  "{opponent} tests {gladiator}'s guard with three quick strikes. Each one is turned aside, though the last comes dangerously close.",
  "{gladiator} and {opponent} circle through the blood-speckled sand, weapons raised, each waiting for the other to make the first mistake.",
  "A vicious exchange leaves both fighters with fresh cuts and neither with a clear advantage. They separate, catch their breath, and close in again.",
  "{opponent} presses forward with a relentless assault. {gladiator} gives ground, then suddenly surges forward and forces them right back.",
  "{gladiator} catches {opponent}'s weapon against their own. For a moment they're locked together before both shove free and reset.",
  "{gladiator} swings for the head. {opponent} ducks beneath it and answers immediately, but their counter misses by inches.",
  "{opponent}'s blade catches {gladiator} with a shallow cut. {gladiator} answers moments later with one of their own.",
  "The two collide in the center of the arena, trading strikes at close range before breaking apart with fresh blood on both of them.",
  "{gladiator} drives {opponent} backward two steps. {opponent} plants their feet, retaliates, and forces {gladiator} those same two steps back.",
  "A swing from {opponent} whistles past {gladiator}'s face. The answering strike comes just as close. Neither fighter seems interested in slowing down.",
  "{gladiator} catches an incoming strike on their weapon and immediately counters. {opponent} blocks that too. The crowd grows louder with every clash.",
  "Neither fighter bothers waiting anymore. {gladiator} and {opponent} charge simultaneously, their weapons meeting violently in the middle.",
  "{opponent} slips past {gladiator}'s guard and draws blood. Before they can capitalize, {gladiator} retaliates and leaves a matching wound.",
  "{gladiator} nearly catches {opponent} off guard with a sudden thrust. {opponent} twists away at the last second and answers with an attack of their own.",
  "Weapons clash, boots tear through the sand, and blood begins to flow. Still, neither {gladiator} nor {opponent} has managed to take control.",
  "{opponent} rushes forward and nearly overwhelms {gladiator}. A well-timed shove creates enough space for both fighters to reset.",
  "{gladiator} ducks one strike, blocks the next, and narrowly avoids a third. Their counterattack forces {opponent} through much the same.",
  "A heavy clash sends both weapons aside. For a split second, {gladiator} and {opponent} simply stare each other down before attacking again.",
  "{opponent} catches {gladiator} across the side with a glancing strike. {gladiator} responds immediately, opening a shallow cut across {opponent}'s arm.",
  "Both fighters commit at once. Both attacks connect, and both stagger away bloodied but very much still in the fight.",
  "{gladiator} forces an opening and swings for it. {opponent} closes their guard just in time, turning what could have ended badly into another clash of steel.",
  "{opponent} changes their stance and comes forward again. {gladiator} adjusts immediately. Neither seems willing to reveal what they have planned next.",
  "The fight descends into a frantic exchange at close range — blocks, counters, glancing strikes, and near misses coming faster than the crowd can follow.",
  "{gladiator} and {opponent} lock weapons and struggle for control. Neither gives way, and eventually both break apart before the stalemate can become a mistake.",
  "{opponent} lands a hard blow against {gladiator}'s guard. {gladiator} absorbs it, steps forward, and returns one with equal force.",
  "A quick exchange leaves a streak of blood across {gladiator}'s arm and another across {opponent}'s. Neither fighter acknowledges it.",
  "{gladiator} narrowly avoids a strike that could have ended the fight. Seconds later, {opponent} is forced to do exactly the same.",
];

const TURN_WIN_LINES = [
  "{opponent} commits to a heavy swing. {gladiator} slips aside and answers with a sharp counter that sends them stumbling.",
  "{gladiator} catches {opponent} across the arm, drawing blood and forcing them to rethink their approach.",
  "{opponent}'s footing gives way in the loose sand. {gladiator} wastes no time, driving them backward before they can recover.",
  "{gladiator} catches {opponent}'s weapon on their own and knocks it aside, following with a hard strike that leaves them staggered.",
  "A clean hit from {gladiator} sends {opponent} reeling. For the first time, uncertainty creeps into their expression.",
  "{opponent} tries the same attack twice. {gladiator} was waiting for it — the counter lands hard and turns the momentum of the fight.",
  "{gladiator} drives forward relentlessly, forcing {opponent} to give ground with every exchange.",
  "{opponent} raises their guard high. {gladiator} immediately changes levels and lands a punishing blow to the body.",
  "{gladiator} finds a gap in {opponent}'s defense and opens a bloody cut before disappearing back out of reach.",
  "{opponent} swings wide and finds nothing but air. {gladiator}'s counter connects before they can bring their guard back.",
  "Steel clashes again and again until {gladiator} finally breaks through, sending {opponent} staggering across the blood-speckled sand.",
  "{gladiator} has found the rhythm of the fight. Every attack from {opponent} is being answered with something worse.",
  "{opponent} tries to create some breathing room, but {gladiator} stays on them and refuses to surrender the advantage.",
  "A brutal exchange leaves both fighters bloodied, but it's {opponent} who comes away stumbling.",
  "{gladiator} feints an attack and {opponent} bites hard. The real strike follows immediately and lands clean.",
  "{opponent} charges forward recklessly. {gladiator} redirects the attack and sends them crashing into the sand.",
  "{gladiator} lands another clean strike. Blood runs down {opponent}'s arm as the crowd senses the fight beginning to turn.",
  "{opponent}'s breathing grows heavier with every exchange. {gladiator} notices — and starts pushing the pace.",
];

const TURN_LOSS_LINES = [
  "{opponent} drives a hard strike into {gladiator}'s body, knocking the air from them and forcing them backward.",
  "{gladiator} commits too heavily to an attack. {opponent} sees it coming and punishes the mistake with a vicious counter.",
  "{opponent}'s blade slips through {gladiator}'s guard and leaves a bloody cut behind. That one got through clean.",
  "{gladiator} barely gets their weapon up in time. The impact still sends them stumbling several steps backward.",
  "{opponent} sweeps {gladiator}'s footing out from beneath them and sends them hard into the sand.",
  "{gladiator} tries to create distance, but {opponent} refuses to allow it. Another attack forces them immediately back onto the defensive.",
  "A moment of hesitation costs {gladiator}. {opponent} closes the distance and lands before they can react.",
  "{opponent} catches {gladiator} with a brutal body shot. They stay standing, but their breathing suddenly isn't so steady.",
  "{gladiator}'s attack is parried cleanly. Before they can reset, {opponent}'s counter is already on its way.",
  "Steel crashes against steel until {gladiator}'s guard finally gives. {opponent} breaks through and sends them staggering.",
  "{opponent} opens a cut across {gladiator}'s arm. Blood begins running down their weapon hand as the fight continues.",
  "{gladiator} takes another hard hit and drops briefly to one knee. {opponent} is already closing in before they can recover.",
  "{opponent} has figured out {gladiator}'s timing. Suddenly every attack seems to meet a block, dodge, or counter.",
  "{gladiator} swings and misses badly. {opponent} answers immediately, sending them stumbling across the sand.",
  "A vicious exchange leaves {gladiator} bloodied and breathing hard. {opponent} looks ready for another.",
  "{opponent} drives {gladiator} backward under a relentless series of attacks, giving them barely enough time to defend themselves.",
  "{gladiator} catches a heavy strike against their guard, but the force nearly knocks the weapon from their hands.",
  "{opponent} lands clean and {gladiator}'s legs buckle for a moment. The crowd erupts as they struggle to stay upright.",
];

const FINISH_WIN_LINES_SAFE = [
  "{gladiator} catches {opponent}'s blade against their own, forces it aside, and drives a fatal strike through the opening. {opponent} falls dead at their feet.",
  "{opponent} barely has time to raise their guard. {gladiator} breaks through it with a decisive strike and sends them crashing lifeless into the sand.",
  "{gladiator} controls the final exchange from start to finish. One opening is all they need, and {opponent} never gets the chance to recover.",
  "{gladiator} knocks the weapon from {opponent}'s hands and wastes no time finishing the job. Moments later, only {gladiator} remains standing.",
  "{opponent} makes one last desperate attack. {gladiator} calmly steps aside and answers with the killing blow.",
  "{gladiator} feints high, and {opponent} takes the bait. Their guard opens for only a second — more than enough time for {gladiator} to end the fight.",
  "{opponent} retreats beneath a relentless assault, but {gladiator} gives them nowhere to go. A final strike puts them down for good.",
  "{gladiator} catches {opponent} off balance and immediately capitalizes. Before {opponent} can recover their footing, the fight — and their life — is over.",
  "{opponent} swings with everything they have left. {gladiator} blocks it cleanly, counters without hesitation, and leaves {opponent} dead in the sand.",
  "{gladiator} patiently dismantles {opponent}'s defense until the opening finally appears. The finishing strike lands exactly where intended.",
  "{opponent} tries to create distance, but {gladiator} refuses to let them escape. One final attack brings the fight to a permanent end.",
  "The final exchange is brutally one-sided. {gladiator} overwhelms {opponent}, delivers the killing blow, and stands victorious over the fallen fighter.",
];

const FINISH_WIN_LINES_RISKY = [
  "Bloodied and barely able to stand, {gladiator} finds one last opening. They take it without hesitation, and {opponent} falls dead into the sand.",
  "{opponent} moves in expecting to finish the fight. Instead, {gladiator} throws everything into one desperate counter — and somehow, it lands.",
  "{gladiator} is running on nothing but instinct when {opponent} leaves their guard open. One desperate strike later, the impossible victory belongs to {gladiator}.",
  "It was reckless. It was desperate. It should never have worked. But {opponent} is lying dead in the sand, and {gladiator} is somehow still standing.",
  "{opponent} pushes {gladiator} to the absolute limit, but one mistake changes everything. {gladiator} capitalizes immediately and ends the fight before they can recover.",
  "{gladiator} stumbles beneath another attack and nearly goes down. Somehow they stay upright long enough to answer with a fatal counter.",
  "{opponent} smells blood and rushes in for the kill. {gladiator} gambles everything on a single counterattack — and {opponent} pays for the mistake with their life.",
  "Neither fighter has much left when {gladiator} commits to one final attack. {opponent} is the first to fall, and this time they aren't getting back up.",
  "{gladiator} has been fighting from behind almost the entire match. One perfectly timed opening changes that. Seconds later, {opponent} lies motionless in the arena.",
  "The crowd expects {gladiator} to fall at any moment. Instead, one desperate burst of violence puts {opponent} down first.",
  "{opponent} had every reason to believe this fight was theirs. Then {gladiator} finds one final opening and turns near-certain defeat into a lethal victory.",
  "{gladiator} can barely keep their weapon raised. It doesn't matter. They only need it raised once more — and {opponent} never sees the finishing strike coming.",
];

const FINISH_COMEBACK_LINES = [
  "{opponent} moves in for the kill, but {gladiator} finds one last opening. A desperate counter lands first, and {opponent} falls dead at their feet.",
  "Everyone in the arena thought {gladiator} was finished. Somehow, they find enough strength for one final attack — and {opponent} never gets back up.",
  "{gladiator} is barely standing when {opponent} charges in to finish the job. At the last second, {gladiator} turns the attack against them and leaves {opponent} lifeless in the sand.",
  "From one knee, bloodied and exhausted, {gladiator} waits for {opponent} to come within reach. One perfectly timed strike turns certain death into victory.",
  "{opponent} sees a wounded gladiator and rushes in for an easy kill. {gladiator} sees an opening. Only one of them walks away.",
  "{gladiator} drops their guard and {opponent} takes the bait. The moment they commit, {gladiator} counters with everything they have left and ends the fight.",
  "{opponent} already has {gladiator} on the ground when the impossible happens. {gladiator} fights their way free, turns the tables, and delivers the killing blow.",
  "{gladiator}'s weapon slips from their grasp, and {opponent} closes in for the finish. With nothing left but instinct, {gladiator} turns the struggle around and puts {opponent} down instead.",
  "Certain the fight is won, {opponent} lowers their guard for just a moment. That's all {gladiator} needs. One last strike leaves {opponent} dead in the sand.",
  "{gladiator} staggers backward with nowhere left to go. {opponent} lunges for the finish — and walks straight into the counter that ends their life.",
  "The crowd is already roaring for {opponent} when {gladiator} suddenly surges forward. The celebration dies quickly. So does {opponent}.",
  "{gladiator} looks finished. {opponent} thinks so too. That mistake costs them the fight — and their life.",
  "{opponent} raises their weapon for the final blow. {gladiator} catches the attack at the last possible moment, reverses it, and sends {opponent} crashing lifeless into the sand.",
  "Barely conscious and running on instinct, {gladiator} makes one final stand. {opponent} expects desperation; what they get is a killing blow.",
  "{opponent} had every advantage and only needed one more strike. They never get the chance. {gladiator} explodes forward with one last attack and ends it first.",
];

const FINISH_DART_COMEBACK_LINES = [
  "{gladiator} was moments from defeat — until Hades answered. Protected by the power of the Underworld, {gladiator} turns the fight and brings {opponent} down.",
  "{opponent} moves in to finish it — but the Underworld's protection holds. {gladiator} answers with a finishing blow of their own.",
  "{gladiator} was on death's door — until Hades answered. Protected by the power of the Underworld, {gladiator} sends the soul of {opponent} to the Underworld.",
  "{opponent} thought the fight was over. Hades had other plans — {gladiator} rises with the power of the Underworld and finishes the fight.",
  "{opponent} had this fight won — until Hades' protection took hold. {gladiator} seizes the opening and brings the fight to a sudden end.",
];

const FINISH_LOSS_LINES = [
  "{gladiator} lunges for one last attack, but {opponent} is faster. A blade to the chest stops them cold, and they collapse into the bloodied sand.",
  "{gladiator} turns a moment too late. {opponent}'s blade strikes from behind, bringing their final stand to a sudden end.",
  "With {gladiator} already staggering, {opponent} swings for the neck. The strike lands, and the arena erupts as {gladiator} falls dead.",
  "{gladiator}'s weapon is knocked from their hands, but {opponent} isn't interested in surrender. A merciless finishing strike ends their life where they stand.",
  "{opponent} drives {gladiator} to the ground and abandons their weapon entirely. A savage barrage of bare-handed blows leaves {gladiator} motionless in the sand.",
  "{gladiator} charges through their wounds for one desperate final attack. {opponent} sidesteps them and delivers a killing strike before they can turn around.",
  "{opponent} forces {gladiator} to their knees before delivering the execution. Their body falls forward as blood darkens the sand beneath them.",
  "{gladiator} manages to block the first strike. The second breaks through. The third ends it. When {opponent} steps away, {gladiator} doesn't move again.",
  "Backed against the arena wall with nowhere left to run, {gladiator} makes their final stand. {opponent} closes in and ends it with a fatal thrust.",
  "{gladiator} loses their weapon in the struggle. {opponent} seizes the opening, delivers the killing blow, and leaves another body for the arena attendants.",
  "{gladiator} believes they've created enough distance to recover. {opponent} proves them wrong, landing a fatal strike before they can raise their guard.",
  "Bloodied but refusing to yield, {gladiator} charges one final time. {opponent} meets them with a perfectly timed strike, and their lifeless body crashes into the sand.",
  "{opponent} batters through {gladiator}'s defenses until nothing remains between them and the finishing blow. Moments later, only {opponent} is left standing.",
  "{gladiator} falls to their knees and reaches desperately for their weapon. {opponent} reaches them first. One final strike ensures the fight ends there.",
  "The crowd demands an ending, and {opponent} gives them one. {gladiator} is struck down in the center of the arena, their blood left staining the sands behind them.",
];

function fillTemplate(line, opponentName, gladiatorName) {
  return line.replaceAll('{opponent}', opponentName).replaceAll('{gladiator}', gladiatorName);
}

export function buildSoloCombatSequence({ won, riskyWin = false, comebackWin = false, dartUsed = false, opponentName, gladiatorName }) {
  const opening = pick(OPENING_LINES);
  const exchange = pick(EXCHANGE_LINES);
  const turn = dartUsed ? pick(TURN_LOSS_LINES) : won && !comebackWin ? pick(TURN_WIN_LINES) : pick(TURN_LOSS_LINES);
  const finish = dartUsed
    ? pick(FINISH_DART_COMEBACK_LINES)
    : comebackWin
      ? pick(FINISH_COMEBACK_LINES)
      : won
        ? pick(riskyWin ? FINISH_WIN_LINES_RISKY : FINISH_WIN_LINES_SAFE)
        : pick(FINISH_LOSS_LINES);
  return [opening, exchange, turn, finish].map((line) => fillTemplate(line, opponentName, gladiatorName));
}

const DUEL_OPENING_LINES = [
  '{winner} and {loser} step onto the sand as the crowd settles into an uneasy silence.',
  'The gates rise. {winner} and {loser} enter from opposite ends of the arena and lock eyes across the sand.',
  'Two names are called: {winner} and {loser}. The roar from the stands follows them into the arena.',
  '{winner} rolls their shoulders while {loser} adjusts their grip. The horn sounds.',
  'The distance between {winner} and {loser} disappears quickly once the gates close.',
  '{winner} and {loser} meet near the center of the arena, neither willing to give the other the first step.',
  'The crowd erupts as {winner} and {loser} take their places. Neither looks interested in backing down.',
  '{loser} raises their weapon toward {winner}. {winner} answers by stepping forward.',
];

const DUEL_EXCHANGE_LINES = [
  "{winner} and {loser} trade the first flurry of blows, both testing the other's guard.",
  'Steel rings through the arena as {loser} presses forward and {winner} answers strike for strike.',
  'Neither {winner} nor {loser} finds a clean opening yet. Every attack meets a block, dodge, or counter.',
  '{winner} feints high, {loser} reacts, and the exchange that follows leaves both fighters breathing harder.',
  '{loser} opens aggressively, but {winner} absorbs the pressure and begins reading the pattern.',
  '{winner} slips a strike past {loser}\'s guard, but {loser} answers with one of their own moments later.',
  'A vicious exchange leaves both {winner} and {loser} marked up, but neither gives ground.',
  '{winner} forces {loser} back a step. {loser} retaliates immediately and takes that step right back.',
];

const DUEL_TURN_LINES = [
  '{loser} overextends on a heavy swing, and {winner} sees the mistake instantly.',
  "{winner} reads {loser}'s next move before it develops and punishes it hard.",
  'A clean strike from {winner} staggers {loser}, and the momentum finally begins to shift.',
  '{loser} is starting to slow. {winner} notices and immediately raises the pace.',
  "{winner} finds the rhythm of {loser}'s attacks and starts controlling every exchange.",
  '{winner} breaks through {loser}\'s guard and forces them onto the defensive.',
  '{loser} misses badly, and {winner} turns the mistake into a punishing counter.',
  'For the first time in the fight, {loser} looks uncertain. {winner} does not.',
];

const DUEL_TURN_FAKEOUT_LINES = [
  '{loser} lands a brutal shot that sends {winner} stumbling. For a moment, the fight looks all but decided.',
  "{winner}'s guard slips at exactly the wrong time, and {loser} surges forward to capitalize.",
  'A punishing exchange leaves {winner} down on one knee while {loser} closes in.',
  "{winner} is breathing hard now. {loser} sees it and starts pressing even harder.",
  '{loser} reads {winner} perfectly and lands a strike that nearly ends the fight on the spot.',
  '{winner} gets caught clean and barely stays upright. {loser} smells the finish.',
  '{loser} drives {winner} backward under a relentless assault, leaving almost no room to recover.',
  'The crowd starts reacting like the fight is already over. {loser} seems to believe it too.',
];

const DUEL_FINISH_LINES_CLEAN = [
  '{winner} sees the final opening and takes it without hesitation. {loser} hits the sand, and the duel is over.',
  '{loser} raises their guard a fraction too late. {winner} breaks through and finishes the fight cleanly.',
  '{winner} knocks {loser}\'s weapon aside and ends the duel before they can recover.',
  'One final exchange decides everything. {winner} remains standing while {loser} goes down.',
  '{loser} commits to one last attack. {winner} reads it perfectly and answers with the finishing blow.',
  '{winner} controls the closing moments completely, giving {loser} no chance to turn the fight around.',
];

const DUEL_FINISH_LINES_UPSET = [
  'Against every expectation, {winner} finds the opening they needed and takes it. {loser} goes down.',
  "Nobody expected {winner} to walk away from this one. {loser} certainly didn't.",
  'It was reckless, desperate, and somehow exactly enough. {winner} lands the finishing blow.',
  '{winner} had no business winning on paper. The arena does not care about paper.',
  '{loser} had every advantage coming into this duel. One mistake was enough for {winner} to erase all of it.',
  'The crowd came expecting one result. {winner} gives them another.',
];

const DUEL_FINISH_LINES_COMEBACK = [
  '{winner} looked finished seconds ago. Then the fight turns completely, and {loser} is the one who hits the sand.',
  "{loser} moves in expecting the finish. {winner} answers with a reversal they never see coming.",
  'From one knee, {winner} finds one last opening and turns certain defeat into victory.',
  "It should have been {loser}'s fight to end. Somehow, {winner} gets the final word.",
  '{loser} had {winner} exactly where they wanted them. A moment later, everything is reversed.',
  'The crowd is already reacting to {winner}\'s defeat when they surge back into the fight and put {loser} down instead.',
];

function fillDuelTemplate(line, winnerName, loserName) {
  return line.replaceAll('{winner}', winnerName).replaceAll('{loser}', loserName);
}

export function buildDuelCombatSequence({ winnerName, loserName, riskyWin = false, comebackFakeout = false }) {
  const opening = pick(DUEL_OPENING_LINES);
  const exchange = pick(DUEL_EXCHANGE_LINES);
  const turn = comebackFakeout ? pick(DUEL_TURN_FAKEOUT_LINES) : pick(DUEL_TURN_LINES);
  const finish = comebackFakeout ? pick(DUEL_FINISH_LINES_COMEBACK) : pick(riskyWin ? DUEL_FINISH_LINES_UPSET : DUEL_FINISH_LINES_CLEAN);
  return [opening, exchange, turn, finish].map((line) => fillDuelTemplate(line, winnerName, loserName));
}
