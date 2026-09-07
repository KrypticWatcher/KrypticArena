import { formatItemName, formatEquipmentEffectSummary, compareItemsForDisplay, SETS, formatDurabilityPercent } from '../data/items.js';

export function formatMoney(amount, guildSettings) {
  const symbol = guildSettings?.currency_symbol ?? '$';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('en-US');
  return `${sign}${symbol}${abs}`;
}

export function formatArena(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('en-US');
  return `${sign}🏺 ${abs}`;
}

function shorthandDigits(n) {
  if (n < 100_000) return Math.trunc(n).toLocaleString('en-US');
  if (n < 1_000_000) return `${Math.trunc(n / 1000)}k`;
  const scale = (divisor, suffix) => {
    const fixed = (n / divisor).toFixed(1);
    const text = fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
    return `${text}${suffix}`;
  };
  if (n < 1_000_000_000) return scale(1_000_000, 'm');
  if (n < 1_000_000_000_000) return scale(1_000_000_000, 'b');
  return scale(1_000_000_000_000, 't');
}

export function formatMoneyShort(amount, guildSettings) {
  const symbol = guildSettings?.currency_symbol ?? '$';
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${shorthandDigits(Math.abs(amount))}`;
}

export function formatArenaShort(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}🏺 ${shorthandDigits(Math.abs(amount))}`;
}

const SLOT_LABEL = {
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  boots: 'Boots',
  gloves: 'Gloves',
  main_hand: 'Main Hand',
  off_hand: 'Off Hand',
};

export function formatEquipmentLines(equipped) {
  const label = (item) => (item ? formatItemName(item) : '*empty*');
  const lines = [];

  for (const slot of ['helmet', 'chest', 'legs', 'boots', 'gloves']) {
    lines.push(`**${SLOT_LABEL[slot]}:** ${label(equipped[slot])}`);
  }

  const mainHand = equipped.main_hand;
  const offHand = equipped.off_hand;
  const isTwoHanded = Boolean(mainHand?.twoHanded && offHand?.id === mainHand.id);

  if (isTwoHanded) {
    lines.push(`**Weapon (Two-Handed):** ${label(mainHand)}`);
  } else {
    lines.push(`**Main Hand:** ${label(mainHand)}`);
    lines.push(`**Off Hand:** ${label(offHand)}`);
  }

  return lines;
}

export function buildGearDescription(equipped) {
  return [...formatEquipmentLines(equipped), '', '**📊 Totals**', ...formatEquipmentEffectSummary(equipped)].join('\n');
}

const SLOT_ICON = {
  helmet: '🪖',
  chest: '🛡️',
  legs: '👖',
  boots: '👢',
  gloves: '🧤',
  main_hand: '⚔️',
  off_hand: '🔰',
};

const SPACER = { name: '\u200b', value: '\u200b', inline: true };

function gearCell(slotKey, label, item) {
  const icon = SLOT_ICON[slotKey];
  if (!item) return { name: `${icon} ${label}`, value: '*(empty)*', inline: true };
  const durabilityTag = item.durability && !item.isWearExempt
    ? item.durability.broken
      ? ' `[BROKEN]`'
      : ` \`[${formatDurabilityPercent(item.durability.current)}%]\``
    : '';
  return { name: `${icon} ${label}`, value: `${item.name}${durabilityTag}`, inline: true };
}

export function buildGearGridFields(equipped) {
  const mainHand = equipped.main_hand;
  const offHand = equipped.off_hand;
  const isTwoHanded = Boolean(mainHand?.twoHanded && offHand?.id === mainHand.id);

  return [

    SPACER,
    gearCell('helmet', 'Helmet', equipped.helmet),
    SPACER,
    
    
    gearCell('main_hand', 'Weapon', mainHand),
    gearCell('chest', 'Chest', equipped.chest),
    isTwoHanded ? { name: `${SLOT_ICON.off_hand} Off Hand`, value: '*(two-handed)*', inline: true } : gearCell('off_hand', 'Off Hand', offHand),
    
    SPACER,
    gearCell('legs', 'Legs', equipped.legs),
    SPACER,
    
    gearCell('gloves', 'Gloves', equipped.gloves),
    gearCell('boots', 'Boots', equipped.boots),
    SPACER,
  ];
}

export function buildInventoryLines(entries, type) {
  const sorted = [...entries].sort((a, b) => compareItemsForDisplay(a.item, b.item));

  const lines = [];
  let lastTier = null;
  let lastSet;
  for (const { item, quantity, instances } of sorted) {
    if (item.tier !== lastTier) {
      lastTier = item.tier;
      lastSet = undefined;
      if (lines.length > 0) lines.push('');
      lines.push(`**Tier ${item.tier}**`);
    }
    if (item.set !== lastSet) {
      lastSet = item.set;
      if (item.set) lines.push(`*${SETS[item.set].name} Set*`);
    }

    const qty = quantity > 1 ? ` x${quantity}` : '';
    if (type === 'equipment' && instances) {
      const durabilities = instances.map((i) => (i.broken ? 'BROKEN' : `${formatDurabilityPercent(i.durability)}%`)).join(', ');
      lines.push(`${item.set ? '  ' : ''}**${formatItemName(item)}**${qty} (${durabilities})`);
    } else {
      lines.push(`${item.set ? '  ' : ''}**${item.name}**${qty}`);
    }
  }
  return lines;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}
