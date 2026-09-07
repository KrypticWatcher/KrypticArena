function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const SEND_OFF_LINES = [
  '{name} sets out on a quest, the details of it already fading into rumor.',
  '{name} heads off before first light, chasing word of some task worth doing.',
  '{name} disappears down the road on an errand nobody quite remembers assigning.',
  "{name} leaves the ludus with a nod, off to see what today's quest turns up.",
  '{name} slips away on a quest whose full shape only becomes clear along the way.',
];

const RETURN_SUCCESS_LINES = [
  '{name} returns from the quest, a little worn but clearly satisfied.',
  '{name} comes back with a story already forming about how the quest went.',
  '{name} makes it back, quest done, already looking for the next one.',
  "{name} returns, the quest's details already blurring into the next rumor.",
  '{name} steps back through the gate, quest behind them.',
];

export function buildQuestSendOffText({ name, timestamp }) {
  return `${pick(SEND_OFF_LINES).replace('{name}', `**${name}**`)} Back ${timestamp}.`;
}

export function buildQuestReturnText({ name }) {
  return pick(RETURN_SUCCESS_LINES).replace('{name}', `**${name}**`);
}
