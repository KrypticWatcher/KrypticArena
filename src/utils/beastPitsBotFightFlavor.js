function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

const OPENING_LINES = [
  '{pet} squares up against a {opponent} in the pits, the crowd already roaring.',
  'The gate drops and {pet} charges out to meet a waiting {opponent}.',
  '{pet} circles a {opponent} under the torchlight of the Beast Pits.',
  'A {opponent} snarls across the pit as {pet} takes its stance.',
  'The crowd goes quiet as {pet} and a {opponent} size each other up.',
];

const EXCHANGE_LINES = [
  'The two trade the first real blows, neither backing down yet.',
  'Claws and teeth flash as the fight opens up in earnest.',
  'They circle, feint, and clash again — the crowd is on its feet.',
  "It's a brutal back-and-forth, and it's still anyone's fight.",
  'Dust kicks up as they collide again, both refusing to yield.',
];

const MOMENTUM_WIN_LINES = [
  '{pet} starts finding real openings — the {opponent} is struggling to keep up.',
  'The {opponent} is tiring fast, and {pet} smells the opening.',
  '{pet} presses the advantage, driving the {opponent} back a step.',
  "The {opponent}'s strikes are landing lighter now. {pet} is taking over.",
  '{pet} shrugs off a glancing hit and comes back harder — the {opponent} is on the back foot.',
];

const MOMENTUM_LOSS_LINES = [
  'The {opponent} starts finding real openings — {pet} is struggling to keep up.',
  '{pet} is tiring fast, and the {opponent} smells the opening.',
  'The {opponent} presses the advantage, driving {pet} back a step.',
  "{pet}'s strikes are landing lighter now. The {opponent} is taking over.",
  'The {opponent} shrugs off a glancing hit and comes back harder — {pet} is on the back foot.',
];

const WIN_LINES = [
  '{pet} doesn\'t let up, and the {opponent} finally backs down. Victory!',
  'One last push from {pet} sends the {opponent} scrambling for the gate. Victory!',
  'The {opponent} hits the dirt and doesn\'t get back up. {pet} takes it!',
  '{pet} outlasts the {opponent} completely — the crowd erupts.',
  'The {opponent} taps out before {pet} even breaks a sweat.',
  '{pet} lands the decisive blow, and it\'s over. Victory!',
];

const LOSS_LINES = [
  'The {opponent} gets the better of {pet} this time. Tough fight.',
  '{pet} fights hard but the {opponent} just has the edge today.',
  'A late surge from the {opponent} is enough to take it. {pet} falls short.',
  '{pet} goes down swinging, but the {opponent} takes the win.',
  'The {opponent} outlasts {pet} in a close one.',
  '{pet} can\'t quite close it out — the {opponent} takes the fight.',
];

function fill(line, petName, opponent) {
  return line.replace(/\{pet\}/g, `**${petName}**`).replace(/\{opponent\}/g, opponent);
}

export function buildBotFightFlavorBeats({ won, petName, speciesName }) {
  const opponent = speciesName.toLowerCase();
  return [
    fill(pick(OPENING_LINES), petName, opponent),
    fill(pick(EXCHANGE_LINES), petName, opponent),
    fill(won ? pick(MOMENTUM_WIN_LINES) : pick(MOMENTUM_LOSS_LINES), petName, opponent),
    fill(won ? pick(WIN_LINES) : pick(LOSS_LINES), petName, opponent),
  ];
}
