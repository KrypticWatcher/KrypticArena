const SUFFIX_MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  t: 1_000_000_000_000,
};

export function parseAmount(raw) {
  if (typeof raw !== 'string') return null;

  const cleaned = raw.trim().toLowerCase().replace(/,/g, '');
  if (cleaned === '') return null;

  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
  if (!match) return null;

  const [, numberPart, suffix] = match;
  const multiplier = suffix ? SUFFIX_MULTIPLIERS[suffix] : 1;
  const value = Number(numberPart) * multiplier;

  if (!Number.isFinite(value) || value < 0) return null;

  return Math.floor(value);
}

export function resolveWagerAmount(raw, balance) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'all') return Math.max(0, balance);
  if (cleaned === 'half') return Math.floor(Math.max(0, balance) / 2);
  if (cleaned === 'quarter') return Math.floor(Math.max(0, balance) / 4);
  return parseAmount(raw);
}
