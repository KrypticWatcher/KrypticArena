export function normalizeQuotes(str) {
  return str
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
}

export const TIER_LEVELS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];

export function parseTierQuery(typed) {
  const match = /^\s*tier\s*0*(\d{1,2})\s*$/i.exec(typed ?? '');
  if (!match) return null;
  const tierNumber = Number(match[1]);
  const level = TIER_LEVELS[tierNumber - 1];
  return level ?? null;
}

export function filterTieredChoices(choices, typed) {
  const tierLevel = parseTierQuery(typed);
  if (tierLevel != null) {
    return choices.filter((c) => c.tier === tierLevel);
  }
  const query = normalizeQuotes((typed ?? '').toLowerCase());
  return choices.filter((c) => normalizeQuotes(c.name.toLowerCase()).includes(query));
}
