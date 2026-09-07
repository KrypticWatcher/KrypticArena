import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIER_6_BG_PATH = path.join(__dirname, '../assets/tier6-gold-bg.png');
import { EFFECT_TYPES, EFFECT_LABEL, EFFECT_IS_PERCENT, getEquipmentEffectTotals, formatDurabilityPercent, getDurabilityWarningTier, SLOTS } from '../data/items.js';
import { ADVENTURE_MAX_FASTER_TRIPS_PERCENT, doesSetQualifyForContext, ARMOR_SLOTS, getGladiatorXpWeaponMaxSource } from './effects.js';
import { RESOURCE_ICONS, NAMED_ICONS } from './resourceIcons.js';

const HADES_BOW_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_bow.png');
let hadesBowImg = null;
try {
  hadesBowImg = await loadImage(HADES_BOW_ICON_PATH);
} catch (err) {
  
  
  console.error('Failed to load Hades bow icon asset:', err);
}

const HADES_BOW_ART = {
  size: 1024,
  contentCenterX: 476,
  contentCenterY: 511,
  tipToTipPx: 1163, 
};

const HADES_SCYTHE_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_scythe.png');
let hadesScytheImg = null;
try {
  hadesScytheImg = await loadImage(HADES_SCYTHE_ICON_PATH);
} catch (err) {
  
  
  console.error('Failed to load Hades scythe icon asset:', err);
}
const HADES_SCYTHE_ART = {
  size: 606,
  contentCenterX: 262,
  contentCenterY: 319,
  tipToTipPx: 751, 
};

const HADES_CROWN_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_crown.png');
let hadesCrownImg = null;
try {
  hadesCrownImg = await loadImage(HADES_CROWN_ICON_PATH);
} catch (err) {
  console.error('Failed to load Hades crown icon asset:', err);
}
const HADES_CROWN_ART = {
  size: 606,
  contentCenterX: 278,
  contentCenterY: 343,
  diagPx: 540, 
};

const HADES_CUIRASS_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_cuirass.png');
let hadesCuirassImg = null;
try {
  hadesCuirassImg = await loadImage(HADES_CUIRASS_ICON_PATH);
} catch (err) {
  console.error('Failed to load Hades cuirass icon asset:', err);
}
const HADES_CUIRASS_ART = { size: 606, contentCenterX: 282, contentCenterY: 344, diagPx: 583 }; 

const HADES_GREAVES_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_greaves_styx.png');
let hadesGreavesImg = null;
try {
  hadesGreavesImg = await loadImage(HADES_GREAVES_ICON_PATH);
} catch (err) {
  console.error('Failed to load Hades greaves icon asset:', err);
}
const HADES_GREAVES_ART = { size: 606, contentCenterX: 290, contentCenterY: 350, diagPx: 546 }; 

const HADES_CERBERUS_GRIP_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_cerberus_grip.png');
let hadesCerberusGripImg = null;
try {
  hadesCerberusGripImg = await loadImage(HADES_CERBERUS_GRIP_ICON_PATH);
} catch (err) {
  console.error('Failed to load Hades cerberus_grip icon asset:', err);
}
const HADES_CERBERUS_GRIP_ART = { size: 606, contentCenterX: 281, contentCenterY: 342, diagPx: 457 }; 

const HADES_CHARONS_TREAD_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'gear-icons', 'hades_charons_tread.png');
let hadesCharonsTreadImg = null;
try {
  hadesCharonsTreadImg = await loadImage(HADES_CHARONS_TREAD_ICON_PATH);
} catch (err) {
  console.error('Failed to load Hades charons_tread icon asset:', err);
}
const HADES_CHARONS_TREAD_ART = { size: 606, contentCenterX: 288, contentCenterY: 385, diagPx: 427 }; 

const WIDTH = 620;
const HEIGHT = 1240; 

const RENDER_SCALE = 1.8;

export const DEFAULT_THEME = {
  bgOuter: '#141414',
  borderOuter: '#0a0a0a',
  borderInner: '#5c5c5c',
  gold: '#c7c7c7', 
  text: '#d9d9d9',
  dim: '#8a8a8a',
  durabilityText: '#8a8a8a', 
  slotEmptyBorder: '#4a4a4a',
  slotEmptyFill: '#1e1e1e',
  slotFilledFill: '#272727',
  divider: '#4a4a4a',
  durGood: '#5fce6b',
  durMed: '#d9b23c',
  durLow: '#e15b4f',
  quantityText: '#ffff00', 
  headerPlate: null,
  headerPlateText: null,
  panelImage: null, 
  
  panelGradientDirection: 'vertical',
  panelGradientStops: [
    [0, '#2b2b2b'],
    [1, '#191919'],
  ],
};

export const TIER_6_THEME = {
  bgOuter: '#141414',
  borderOuter: '#0a0a0a',
  borderInner: '#5c5c5c',
  gold: '#c7c7c7',
  text: '#d9d9d9',
  dim: '#8a8a8a',
  durabilityText: '#8a8a8a',
  slotEmptyBorder: '#4a4a4a',
  slotEmptyFill: '#1e1e1e',
  slotFilledFill: '#272727',
  divider: '#4a4a4a',
  durGood: '#5fce6b',
  durMed: '#d9b23c',
  durLow: '#e15b4f',
  quantityText: '#ffff00',
  headerPlate: null,
  headerPlateText: null,
  panelImage: null,
  panelGradientDirection: 'vertical',
  panelGradientStops: [
    [0, '#2b2b2b'],
    [1, '#191919'],
  ],
};

export const BOX = 135; 
const GAP = 165; 

const DOMAIN_COLOR = {
  hades: 0x2de8a0,
};

const TIER_COLOR = {
  1: 0x95a5a6,
  10: 0x2ecc71,
  20: 0x3498db,
  45: 0x9b59b6,
  65: 0xf39c12,
  92: 0xe74c3c,
};

function rarityHex(item) {
  const domainColorNum = item?.domain ? DOMAIN_COLOR[item.domain] : null;
  const num = domainColorNum ?? TIER_COLOR[item?.tier] ?? 0x4a443a;
  return `#${num.toString(16).padStart(6, '0')}`;
}

function durabilityColor(colors, pct) {
  if (pct >= 66) return colors.durGood;
  if (pct >= 33) return colors.durMed;
  return colors.durLow;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + '…';
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? '…' : text.slice(0, lo) + '…';
}

const CANDY_STAT_COLOR = { attack: '#e74c3c', defense: '#3498db', vitality: '#2ecc71', speed: '#f0a020' };

function drawCandyIcon(ctx, cx, cy, s, stats) {
  const bodyR = s * 0.36;
  const wrapLen = s * 0.3;
  const wrapWidth = s * 0.24;
  const n = stats.length;
  const firstColor = CANDY_STAT_COLOR[stats[0]] ?? '#999';
  
  
  
  
  
  
  const lastColor = CANDY_STAT_COLOR[stats[stats.length - 1]] ?? '#999';

  const leftInnerTopX = cx - bodyR * 0.6;
  const leftInnerTopY = cy - wrapWidth * 0.3;
  const leftInnerBotY = cy + wrapWidth * 0.3;
  const leftOuterX = cx - bodyR - wrapLen;
  const rightInnerTopX = cx + bodyR * 0.6;
  const rightOuterX = cx + bodyR + wrapLen;

  
  
  
  
  
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = firstColor;
  ctx.beginPath();
  ctx.moveTo(leftInnerTopX, leftInnerTopY);
  ctx.lineTo(leftOuterX, cy - wrapWidth);
  ctx.lineTo(leftOuterX, cy + wrapWidth);
  ctx.lineTo(leftInnerTopX, leftInnerBotY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lastColor;
  ctx.beginPath();
  ctx.moveTo(rightInnerTopX, leftInnerTopY);
  ctx.lineTo(rightOuterX, cy - wrapWidth);
  ctx.lineTo(rightOuterX, cy + wrapWidth);
  ctx.lineTo(rightInnerTopX, leftInnerBotY);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  
  
  
  
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.clip();
  if (n <= 1) {
    ctx.fillStyle = firstColor;
    ctx.fillRect(cx - bodyR, cy - bodyR, bodyR * 2, bodyR * 2);
  } else {
    const stripeWidth = (bodyR * 2) / n;
    stats.forEach((stat, i) => {
      ctx.fillStyle = CANDY_STAT_COLOR[stat] ?? '#999';
      ctx.fillRect(cx - bodyR + i * stripeWidth, cy - bodyR, stripeWidth, bodyR * 2);
    });
  }
  ctx.restore();

  
  
  
  
  
  
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(leftInnerTopX, leftInnerTopY);
  ctx.lineTo(leftOuterX, cy - wrapWidth);
  ctx.lineTo(leftOuterX, cy + wrapWidth);
  ctx.lineTo(leftInnerTopX, leftInnerBotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightInnerTopX, leftInnerTopY);
  ctx.lineTo(rightOuterX, cy - wrapWidth);
  ctx.lineTo(rightOuterX, cy + wrapWidth);
  ctx.lineTo(rightInnerTopX, leftInnerBotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.stroke();

  
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx - bodyR * 0.35, cy - bodyR * 0.35, bodyR * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

const ICONS = {
  
  
  
  
  helmet(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.1, s * 0.55, Math.PI, 0, false);
    ctx.lineTo(cx + s * 0.55, cy + s * 0.05);
    ctx.lineTo(cx - s * 0.55, cy + s * 0.05);
    ctx.closePath();
    ctx.fill();
    
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy - s * 0.42);
    ctx.quadraticCurveTo(cx, cy - s * 1.05, cx + s * 0.3, cy - s * 0.42);
    ctx.quadraticCurveTo(cx, cy - s * 0.62, cx - s * 0.3, cy - s * 0.42);
    ctx.closePath();
    ctx.fill();
    
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.18, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.14, cy + s * 0.56);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.55, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.18, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.14, cy + s * 0.56);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
    ctx.closePath();
    ctx.fill();
  },
  
  
  
  
  main_hand(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = color;
    
    
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.95); 
    ctx.lineTo(s * 0.1, -s * 0.72); 
    ctx.lineTo(s * 0.08, s * 0.05); 
    ctx.lineTo(-s * 0.08, s * 0.05); 
    ctx.lineTo(-s * 0.1, -s * 0.72); 
    ctx.closePath();
    ctx.fill();
    
    
    
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, s * 0.05);
    ctx.lineTo(-s * 0.4, s * 0.12);
    ctx.lineTo(-s * 0.32, s * 0.19);
    ctx.lineTo(s * 0.32, s * 0.19);
    ctx.lineTo(s * 0.4, s * 0.12);
    ctx.lineTo(s * 0.32, s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-s * 0.07, s * 0.19, s * 0.14, s * 0.38); 
    ctx.beginPath();
    ctx.arc(0, s * 0.63, s * 0.11, 0, Math.PI * 2); 
    ctx.fill();
    ctx.restore();
  },
  
  
  
  
  
  
  
  
  
  
  
  
  dagger(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((3 * Math.PI) / 4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, s * 0.1); 
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.18, -s * 0.02, -s * 0.62); 
    ctx.lineTo(s * 0.09, s * 0.1); 
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-s * 0.22, s * 0.08, s * 0.44, s * 0.12); 
    ctx.fillRect(-s * 0.07, s * 0.19, s * 0.14, s * 0.3); 
    ctx.beginPath();
    ctx.arc(0, s * 0.49, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  
  
  
  
  
  spear(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.06, cy - s * 0.75, s * 0.12, s * 1.5); 
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.6);
    ctx.lineTo(cx, cy - s * 0.45);
    ctx.lineTo(cx - s * 0.2, cy - s * 0.6);
    ctx.closePath();
    ctx.fill();
  },
  
  
  
  
  
  
  
  bow(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-30 * Math.PI) / 180); 
    const topY = -s * 0.85;
    const botY = s * 0.85;
    const stringX = s * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.moveTo(stringX, topY);
    ctx.quadraticCurveTo(-s * 0.62, 0, stringX, botY);
    ctx.stroke();
    
    
    ctx.lineWidth = s * 0.055;
    ctx.beginPath();
    ctx.moveTo(stringX, topY);
    ctx.lineTo(stringX, botY);
    ctx.stroke();
    ctx.restore();
  },
  
  
  
  
  club(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.09, cy - s * 0.15, s * 0.18, s * 0.95); 
    roundRect(ctx, cx - s * 0.32, cy - s * 0.75, s * 0.64, s * 0.6, s * 0.22); 
    ctx.fill();
    
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx - s * 0.12, cy - s * 0.48, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + s * 0.12, cy - s * 0.48, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  
  
  scythe(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((25 * Math.PI) / 180); 
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, s * 0.85);
    ctx.lineTo(s * 0.12, -s * 0.7);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.95, -s * 0.55, s * 0.55, s * 0.15);
    ctx.quadraticCurveTo(s * 0.55, -s * 0.35, -s * 0.02, -s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  
  
  
  
  staff(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.06, cy - s * 0.85, s * 0.12, s * 1.55); 
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.85, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.88);
    ctx.lineTo(cx - s * 0.62, cy - s * 1.05);
    ctx.lineTo(cx - s * 0.5, cy - s * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.2, cy - s * 0.88);
    ctx.lineTo(cx + s * 0.62, cy - s * 1.05);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.72);
    ctx.closePath();
    ctx.fill();
  },
  
  
  
  
  wheel(ctx, cx, cy, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.08;
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 4) * i;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * s * 0.55, cy - Math.sin(angle) * s * 0.55);
      ctx.lineTo(cx + Math.cos(angle) * s * 0.55, cy + Math.sin(angle) * s * 0.55);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  },
  
  
  
  
  
  
  tome(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    roundRect(ctx, cx - s * 0.42, cy - s * 0.58, s * 0.84, s * 1.08, s * 0.07);
    ctx.fill();
    
    
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy - s * 0.58);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.5);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(cx - s * 0.02, cy - s * 0.06, s * 0.44, s * 0.12);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
  },
  chest(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy - s * 0.6);
    ctx.lineTo(cx + s * 0.55, cy - s * 0.6);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.6);
    ctx.lineTo(cx - s * 0.4, cy + s * 0.6);
    ctx.closePath();
    ctx.fill();
    
    ctx.clearRect(cx - s * 0.55, cy - s * 0.6, s * 0.18, s * 0.22);
    ctx.clearRect(cx + s * 0.37, cy - s * 0.6, s * 0.18, s * 0.22);
  },
  off_hand(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.5, cy);
    ctx.lineTo(cx, cy + s * 0.65);
    ctx.lineTo(cx - s * 0.5, cy);
    ctx.closePath();
    ctx.fill();
  },
  legs(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.5, cy - s * 0.55, s * 1.0, s * 0.28); 
    ctx.fillRect(cx - s * 0.5, cy - s * 0.3, s * 0.4, s * 0.85); 
    ctx.fillRect(cx + s * 0.1, cy - s * 0.3, s * 0.4, s * 0.85); 
  },
  
  
  
  gloves(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    
    roundRect(ctx, cx - s * 0.38, cy - s * 0.05, s * 0.76, s * 0.65, s * 0.18);
    ctx.fill();
    
    
    const fingerW = s * 0.16;
    const fingerGap = s * 0.02;
    const startX = cx - s * 0.34;
    const lengths = [s * 0.42, s * 0.5, s * 0.48, s * 0.38];
    lengths.forEach((len, i) => {
      const fx = startX + i * (fingerW + fingerGap);
      roundRect(ctx, fx, cy - s * 0.05 - len, fingerW, len + s * 0.12, fingerW * 0.5);
      ctx.fill();
    });
    
    ctx.save();
    ctx.translate(cx - s * 0.42, cy + s * 0.2);
    ctx.rotate(-Math.PI / 5);
    roundRect(ctx, -s * 0.09, -s * 0.32, s * 0.18, s * 0.4, s * 0.09);
    ctx.fill();
    ctx.restore();
  },
  boots(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.28, cy - s * 0.6, s * 0.42, s * 0.85); 
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.28, cy + s * 0.1);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.25);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.28, cy + s * 0.45);
    ctx.closePath();
    ctx.fill();
  },
  
  
  
  
  
  
  
  
  
  
  arrows(ctx, cx, cy, s, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = s * 0.08;
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.35);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.45, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.15);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy + s * 0.35);
    ctx.lineTo(cx - s * 0.15, cy + s * 0.15);
    ctx.moveTo(cx - s * 0.35, cy + s * 0.35);
    ctx.lineTo(cx - s * 0.15, cy + s * 0.45);
    ctx.stroke();
  },

  
  
  collectable(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.58, 0, Math.PI * 2);
    ctx.fill();
    
    
    
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  },

  
  
  
  
  hades_dart(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((3 * Math.PI) / 4);
    ctx.fillStyle = color;
    
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.62);
    ctx.lineTo(s * 0.11, -s * 0.28);
    ctx.lineTo(-s * 0.11, -s * 0.28);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillRect(-s * 0.06, -s * 0.3, s * 0.12, s * 0.6);
    
    ctx.beginPath();
    ctx.moveTo(0, s * 0.22);
    ctx.lineTo(-s * 0.32, s * 0.55);
    ctx.lineTo(-s * 0.02, s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, s * 0.22);
    ctx.lineTo(s * 0.32, s * 0.55);
    ctx.lineTo(s * 0.02, s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  
  
  
  
  
  
  elixir(ctx, cx, cy, s, color) {
    const neckW = s * 0.16;
    const neckH = s * 0.16;
    const bulbR = s * 0.34;
    const bulbCy = cy + s * 0.12;

    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = s * 0.055;
    ctx.lineJoin = 'round';

    
    ctx.strokeRect(cx - neckW * 0.7, cy - s * 0.58, neckW * 1.4, s * 0.12);
    
    ctx.strokeRect(cx - neckW / 2, cy - s * 0.46, neckW, neckH);
    
    ctx.beginPath();
    ctx.arc(cx, bulbCy, bulbR, 0, Math.PI * 2);
    ctx.stroke();

    
    
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, bulbCy, bulbR - s * 0.03, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cx - bulbR, bulbCy - bulbR * 0.15, bulbR * 2, bulbR * 2);
    ctx.restore();

    
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.arc(cx - bulbR * 0.4, bulbCy - bulbR * 0.35, bulbR * 0.35, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
  },
};

ICONS.sword = ICONS.main_hand;

function hadesBowIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  if (!hadesBowImg) {
    ICONS.bow(ctx, cx, cy, s, color); 
    return;
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const BOW_ICON_SIZE_BOOST = 1.35;
  const scale = (s * 1.7 * BOW_ICON_SIZE_BOOST * extraBoost) / HADES_BOW_ART.tipToTipPx;
  const drawSize = HADES_BOW_ART.size * scale;
  const drawX = cx - HADES_BOW_ART.contentCenterX * scale;
  const drawY = cy - HADES_BOW_ART.contentCenterY * scale;
  ctx.drawImage(hadesBowImg, drawX, drawY, drawSize, drawSize);
}

function hadesScytheIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  if (!hadesScytheImg) {
    ICONS.scythe(ctx, cx, cy, s, color); 
    return;
  }
  
  
  
  
  
  
  const SCYTHE_ICON_SIZE_BOOST = 1.35;
  const scale = (s * 1.55 * SCYTHE_ICON_SIZE_BOOST * extraBoost) / HADES_SCYTHE_ART.tipToTipPx;
  const drawSize = HADES_SCYTHE_ART.size * scale;
  const drawX = cx - HADES_SCYTHE_ART.contentCenterX * scale;
  const drawY = cy - HADES_SCYTHE_ART.contentCenterY * scale;
  ctx.drawImage(hadesScytheImg, drawX, drawY, drawSize, drawSize);
}

function drawHadesArmorArt(ctx, img, art, cx, cy, s, extraBoost, fallbackIcon, color) {
  if (!img) {
    fallbackIcon(ctx, cx, cy, s, color); 
    return;
  }
  const ART_SIZE_BOOST = 1.3;
  const scale = (s * 1.95 * ART_SIZE_BOOST * extraBoost) / art.diagPx;
  const drawSize = art.size * scale;
  const drawX = cx - art.contentCenterX * scale;
  const drawY = cy - art.contentCenterY * scale;
  ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
}

function hadesCrownIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  drawHadesArmorArt(ctx, hadesCrownImg, HADES_CROWN_ART, cx, cy, s, extraBoost, ICONS.helmet, color);
}
function hadesCuirassIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  drawHadesArmorArt(ctx, hadesCuirassImg, HADES_CUIRASS_ART, cx, cy, s, extraBoost, ICONS.chest, color);
}
function hadesGreavesIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  drawHadesArmorArt(ctx, hadesGreavesImg, HADES_GREAVES_ART, cx, cy, s, extraBoost, ICONS.legs, color);
}
function hadesCerberusGripIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  drawHadesArmorArt(ctx, hadesCerberusGripImg, HADES_CERBERUS_GRIP_ART, cx, cy, s, extraBoost, ICONS.gloves, color);
}
function hadesCharonsTreadIcon(ctx, cx, cy, s, color, extraBoost = 1) {
  drawHadesArmorArt(ctx, hadesCharonsTreadImg, HADES_CHARONS_TREAD_ART, cx, cy, s, extraBoost, ICONS.boots, color);
}

const HADES_ART_BY_PIECE = {
  bow: { get img() { return hadesBowImg; }, draw: hadesBowIcon },
  scythe: { get img() { return hadesScytheImg; }, draw: hadesScytheIcon },
  crown: { get img() { return hadesCrownImg; }, draw: hadesCrownIcon },
  cuirass: { get img() { return hadesCuirassImg; }, draw: hadesCuirassIcon },
  greaves_styx: { get img() { return hadesGreavesImg; }, draw: hadesGreavesIcon },
  cerberus_grip: { get img() { return hadesCerberusGripImg; }, draw: hadesCerberusGripIcon },
  charons_tread: { get img() { return hadesCharonsTreadImg; }, draw: hadesCharonsTreadIcon },
};
function getHadesArt(item) {
  if (item?.set !== 'hades_unseen_king') return null;
  const entry = HADES_ART_BY_PIECE[item?.progressivePiece];
  return entry?.img ? entry : null;
}

const QUANTITY_TIER_COLOR = {
  base: '#ffff00', 
  k: '#ffffff',
  m: '#4ade80',
  b: '#a855f7',
  t: '#22d3ee',
};

function formatScaledAmount(n, divisor, suffix) {
  const fixed = (n / divisor).toFixed(1);
  const text = fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  return `${text}${suffix}`;
}

export function formatQuantityBadge(n) {
  if (!Number.isFinite(n)) return { text: String(n), color: QUANTITY_TIER_COLOR.base };
  if (n < 100_000) return { text: Math.trunc(n).toLocaleString('en-US'), color: QUANTITY_TIER_COLOR.base };
  
  
  if (n < 1_000_000) return { text: `${Math.trunc(n / 1000)}k`, color: QUANTITY_TIER_COLOR.k };
  if (n < 1_000_000_000) return { text: formatScaledAmount(n, 1_000_000, 'm'), color: QUANTITY_TIER_COLOR.m };
  if (n < 1_000_000_000_000) return { text: formatScaledAmount(n, 1_000_000_000, 'b'), color: QUANTITY_TIER_COLOR.b };
  return { text: formatScaledAmount(n, 1_000_000_000_000, 't'), color: QUANTITY_TIER_COLOR.t };
}

export function drawCoin(ctx, cx, cy, r, color = '#e6b325') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCoinStack(ctx, cx, baseY, r, height, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r, baseY);
  ctx.lineTo(cx - r, baseY - height);
  ctx.quadraticCurveTo(cx - r, baseY - height - r * 0.5, cx, baseY - height - r * 0.5);
  ctx.quadraticCurveTo(cx + r, baseY - height - r * 0.5, cx + r, baseY - height);
  ctx.lineTo(cx + r, baseY);
  ctx.quadraticCurveTo(cx, baseY + r * 0.4, cx - r, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, baseY - height - r * 0.5, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
}

export function buildArenaCoinIcon(amount) {
  
  
  
  
  
  const color = '#e6b325';
  return (ctx, cx, cy, s) => {
    if (amount < 100_000) {
      
      drawCoin(ctx, cx - s * 0.22, cy + s * 0.2, s * 0.22, color);
      drawCoin(ctx, cx + s * 0.16, cy + s * 0.24, s * 0.24, color);
      drawCoin(ctx, cx, cy - s * 0.02, s * 0.26, color);
    } else if (amount < 1_000_000) {
      
      const coins = [
        [-0.36, 0.28, 0.2], [-0.06, 0.32, 0.22], [0.24, 0.26, 0.2],
        [-0.22, 0.02, 0.24], [0.1, -0.02, 0.24], [-0.02, -0.3, 0.22],
      ];
      for (const [dx, dy, r] of coins) drawCoin(ctx, cx + s * dx, cy + s * dy, s * r, color);
    } else if (amount < 1_000_000_000) {
      
      const coins = [
        [-0.44, 0.36, 0.19], [-0.18, 0.4, 0.21], [0.1, 0.38, 0.21], [0.38, 0.32, 0.19],
        [-0.32, 0.14, 0.22], [-0.02, 0.16, 0.23], [0.28, 0.1, 0.21],
        [-0.16, -0.1, 0.22], [0.14, -0.12, 0.21],
        [-0.02, -0.34, 0.2], [0.24, -0.28, 0.18],
      ];
      for (const [dx, dy, r] of coins) drawCoin(ctx, cx + s * dx, cy + s * dy, s * r, color);
    } else {
      
      
      
      
      const moundCoins = [
        [-0.5, 0.4, 0.17], [-0.28, 0.42, 0.18], [0.02, 0.42, 0.18], [0.3, 0.4, 0.17], [0.52, 0.32, 0.16],
        [-0.4, 0.2, 0.18], [0.42, 0.18, 0.17],
      ];
      for (const [dx, dy, r] of moundCoins) drawCoin(ctx, cx + s * dx, cy + s * dy, s * r, color);
      drawCoinStack(ctx, cx - s * 0.3, cy + s * 0.3, s * 0.15, s * 0.5, color);
      drawCoinStack(ctx, cx + s * 0.06, cy + s * 0.32, s * 0.17, s * 0.72, color);
      drawCoinStack(ctx, cx + s * 0.34, cy + s * 0.28, s * 0.14, s * 0.42, color);
      if (amount >= 1_000_000_000_000) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.02, cy - s * 0.72);
        ctx.lineTo(cx + s * 0.08, cy - s * 0.58);
        ctx.lineTo(cx + s * 0.22, cy - s * 0.54);
        ctx.lineTo(cx + s * 0.1, cy - s * 0.46);
        ctx.lineTo(cx + s * 0.14, cy - s * 0.32);
        ctx.lineTo(cx + s * 0.02, cy - s * 0.42);
        ctx.lineTo(cx - s * 0.1, cy - s * 0.34);
        ctx.lineTo(cx - s * 0.04, cy - s * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  };
}

const SLOT_LABEL = {
  helmet: 'Helmet',
  main_hand: 'Weapon',
  chest: 'Chest',
  off_hand: 'Off Hand',
  legs: 'Legs',
  gloves: 'Gloves',
  boots: 'Boots',
  arrows: 'Arrows',
};

export function drawSlot(
  ctx,
  slotKey,
  cx,
  cy,
  item,
  colors,
  {
    twoHandedNote = false,
    quantity = null,
    boxSize = BOX,
    nameWidth = GAP - 6,
    showBorder = true,
    showFill = true,
    nameFontSize = 15,
    nameMaxChars = null,
    nameTextColor = null,
    
    
    
    
    
    showName = true,
    
    
    
    
    
    
    
    weaponIconBoost = 1,
    
    
    
    
    
    
    greyedOut = false,
    
    
    
    
    
    
    newUnlock = false,
    
    
    
    
    
    
    nameOffsetY = 0,
    
    
    
    
    
    
    
    
    petIconImage = null,
  } = {}
) {
  const x = cx - boxSize / 2;
  const y = cy - boxSize / 2;

  if (twoHandedNote) {
    ctx.fillStyle = colors.slotEmptyFill;
    roundRect(ctx, x, y, boxSize, boxSize, 10);
    ctx.fill();
    ctx.strokeStyle = colors.slotEmptyBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, boxSize, boxSize, 10);
    ctx.stroke();
    
    
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2H', cx, cy);
    ctx.font = '13px sans-serif';
    ctx.fillText('two-handed', cx, cy + boxSize / 2 + 18);
    return;
  }

  const borderColor = greyedOut ? '#4a4640' : item ? rarityHex(item) : colors.slotEmptyBorder;
  
  
  
  
  
  
  
  
  
  
  
  
  
  const hadesArt = getHadesArt(item);
  if (showFill && !hadesArt) {
    ctx.fillStyle = item ? colors.slotFilledFill : colors.slotEmptyFill;
    roundRect(ctx, x, y, boxSize, boxSize, 10);
    ctx.fill();
  }
  if (showBorder && !hadesArt) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = item ? 2.5 : 2;
    roundRect(ctx, x, y, boxSize, boxSize, 10);
    ctx.stroke();
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const specialCollectableIcon = item?.id === 'hades_dart' || item?.id === 'elixir' ? item.id : null;
  const isCandy = Array.isArray(item?.stats) && String(item?.id ?? '').startsWith('focus_');
  
  
  
  
  
  
  
  const candyIconAdapter = isCandy
    ? (ctx, cx, cy, s) =>
        item?.id != null && NAMED_ICONS[item.id]
          ? NAMED_ICONS[item.id](ctx, cx, cy, s, item)
          : drawCandyIcon(ctx, cx, cy, s, item.stats)
    : null;
  
  
  
  
  
  
  
  
  
  const namedResourceIcon = item?.id != null && NAMED_ICONS[item.id] ? (ctx, cx, cy, s) => NAMED_ICONS[item.id](ctx, cx, cy, s, item) : null;
  const categoryResourceIcon = !namedResourceIcon && item?.category && RESOURCE_ICONS[item.category] ? (ctx, cx, cy, s) => RESOURCE_ICONS[item.category](ctx, cx, cy, s, item) : null;
  
  
  
  
  
  
  
  
  
  
  
  const iconKey =
    specialCollectableIcon ??
    (item?.weaponType && ICONS[item.weaponType]
      ? item.weaponType
      : item?.weaponSubtype && ICONS[item.weaponSubtype]
      ? item.weaponSubtype
      : slotKey);
  
  
  
  
  
  
  const icon = item?.iconOverride ?? (isCandy ? candyIconAdapter : hadesArt ? hadesArt.draw : namedResourceIcon ?? categoryResourceIcon ?? ICONS[iconKey]);
  
  
  
  
  
  
  
  
  
  
  
  
  const isResourceStyleIcon = Boolean(!item?.iconOverride && !isCandy && !hadesArt && (namedResourceIcon || categoryResourceIcon));
  
  
  
  
  
  
  
  
  
  
  
  const iconReach = boxSize * 0.34;
  
  
  
  
  
  
  
  
  
  
  const drawReach = hadesArt ? boxSize * 0.48 : iconReach;
  
  
  
  
  
  if (newUnlock && icon) {
    ctx.shadowColor = '#c026f5';
    ctx.shadowBlur = 18;
    icon(ctx, cx, cy - 4, drawReach, item ? borderColor : '#5c5548', weaponIconBoost);
    icon(ctx, cx, cy - 4, drawReach, item ? borderColor : '#5c5548', weaponIconBoost);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  
  
  
  
  
  
  
  if (item?.isPet) {
    if (petIconImage) {
      ctx.save();
      ctx.globalAlpha = greyedOut ? 0.28 : 1;
      const size = iconReach * 2;
      const scale = Math.min(size / petIconImage.width, size / petIconImage.height);
      const drawW = petIconImage.width * scale;
      const drawH = petIconImage.height * scale;
      ctx.drawImage(petIconImage, cx - drawW / 2, cy - 4 - drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = greyedOut ? '#2a2a2a' : colors.slotEmptyFill;
      roundRect(ctx, cx - iconReach * 0.7, cy - 4 - iconReach * 0.7, iconReach * 1.4, iconReach * 1.4, 6);
      ctx.fill();
    }
  } else if (icon) {
    if (isResourceStyleIcon && greyedOut) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      icon(ctx, cx, cy - 4, drawReach, item ? borderColor : '#5c5548', weaponIconBoost);
      ctx.restore();
    } else {
      icon(ctx, cx, cy - 4, drawReach, item ? borderColor : '#5c5548', weaponIconBoost);
    }
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  if (quantity !== null) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 13px sans-serif';
    const badge = formatQuantityBadge(quantity);
    ctx.fillStyle = badge.color;
    ctx.fillText(badge.text, cx - iconReach, cy - 4 - iconReach + 10);
  }

  
  
  
  
  
  
  
  
  
  
  const labelTop = cy - 4 + iconReach + 6 + nameOffsetY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (item) {
    
    
    
    
    
    if (showName) {
      ctx.font = `bold ${nameFontSize}px sans-serif`;
      ctx.fillStyle = nameTextColor ?? colors.text;
      
      
      
      
      
      
      
      const displayName =
        nameMaxChars !== null ? (item.name.length > nameMaxChars ? item.name.slice(0, nameMaxChars) : item.name) : fitText(ctx, item.name, nameWidth);
      ctx.fillText(displayName, cx, labelTop);
    }
    
    
    
    
    
    
    
    
    
    if (item.durability && !item.isWearExempt && showName) {
      ctx.font = '13px sans-serif';
      
      
      
      
      ctx.fillStyle = '#ffffff';
      
      ctx.fillText(`${formatDurabilityPercent(item.durability.current)}%`, cx, labelTop + 16);
    }
  } else {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.fillText(SLOT_LABEL[slotKey], cx, labelTop);
  }

  
  
  
  
  
  
  
  
  
  
  
  if (item?.durability && !item.isWearExempt) {
    const pct = Math.max(0, Math.min(100, item.durability.current));
    const barW = boxSize - 16;
    const barX = cx - barW / 2;
    const barY = showName ? labelTop + 16 + 18 : y + boxSize - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = durabilityColor(colors, pct);
    ctx.fillRect(barX, barY, (barW * pct) / 100, 6);
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const warningTier = item?.durability ? getDurabilityWarningTier(item.durability.current) : null;
  if (warningTier === 'broken') {
    const bx = x + boxSize - 7;
    const by = y + 7;
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = colors.durLow;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.bgOuter;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by + 1);
  } else if (warningTier === 'low') {
    const bx = x + boxSize - 7;
    const by = y + 8;
    ctx.beginPath();
    ctx.moveTo(bx, by - 11);
    ctx.lineTo(bx + 10, by + 8);
    ctx.lineTo(bx - 10, by + 8);
    ctx.closePath();
    ctx.fillStyle = colors.durMed;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.bgOuter;
    ctx.stroke();
    ctx.fillStyle = '#1a1400'; 
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by + 3);
  }
}

function connector(ctx, x1, y1, x2, y2, colors, boxSize = BOX) {
  const halfBox = boxSize / 2;
  let sx = x1, sy = y1, ex = x2, ey = y2;
  if (y1 === y2 && x1 !== x2) {
    
    sx = x1 < x2 ? x1 + halfBox : x1 - halfBox;
    ex = x2 < x1 ? x2 + halfBox : x2 - halfBox;
  } else if (x1 === x2 && y1 !== y2) {
    
    
    sy = y1 < y2 ? y1 + halfBox : y1 - halfBox;
    ey = y2 < y1 ? y2 + halfBox : y2 - halfBox;
  }
  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

const COLUMN_CHAMPION = [EFFECT_TYPES.CHAMPION_FAIL_REDUCTION, EFFECT_TYPES.CHAMPION_WAGER_BOOST];
const SET_DISPLAY_NAME = { arena: 'Arena', adventure: 'Slayer', misc: 'Skilling' };
const COLUMN_ADVENTURE = [EFFECT_TYPES.ADVENTURE_FASTER_TRIPS, EFFECT_TYPES.ADVENTURE_BETTER_ENCOUNTERS, EFFECT_TYPES.ADVENTURE_SAFER_TRIPS];

function drawStatColumn(ctx, types, totals, x, yStart, colWidth, colors) {
  const lineHeight = 56; 
  types.forEach((type, i) => {
    const y = yStart + i * lineHeight;
    const { total: rawTotal } = totals[type] ?? { total: 0 };
    
    
    
    
    
    
    
    
    const total = Math.round(rawTotal * 10) / 10;
    const suffix = EFFECT_IS_PERCENT[type] ? '%' : '';
    const sign = total >= 0 ? '+' : '';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText(`${EFFECT_LABEL[type]}:`, x, y);

    ctx.textAlign = 'right';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = total > 0 ? colors.durGood : total < 0 ? colors.durLow : colors.text;
    ctx.fillText(`${sign}${total}${suffix}`, x + colWidth, y);
  });
}

function drawGladiatorXpBonus(ctx, value, sourceNote, startX, y, colors) {
  const sign = value >= 0 ? '+' : '';
  const label = `${EFFECT_LABEL[EFFECT_TYPES.GLADIATOR_XP_BONUS]}: `;
  const valueText = `${sign}${value}%`;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 22px sans-serif';
  const labelWidth = ctx.measureText(label).width;

  ctx.fillStyle = colors.headerPlateText ?? colors.gold;
  ctx.fillText(label, startX, y);
  ctx.font = 'bold 25px sans-serif';
  ctx.fillStyle = value > 0 ? colors.durGood : value < 0 ? colors.durLow : colors.text;
  ctx.fillText(valueText, startX + labelWidth, y);

  if (sourceNote) {
    
    
    
    
    
    
    ctx.font = '14px sans-serif';
    ctx.fillStyle = colors.durGood;
    ctx.fillText(`(${sourceNote})`, startX, y + 20);
  }
}

const panelImageCache = new Map();
async function loadPanelImageCached(imagePath) {
  if (panelImageCache.has(imagePath)) return panelImageCache.get(imagePath);
  const img = await loadImage(imagePath);
  panelImageCache.set(imagePath, img);
  return img;
}

export async function drawPanelChrome(ctx, colors, width, height) {
  ctx.fillStyle = colors.bgOuter;
  ctx.fillRect(0, 0, width, height);

  const panelX = 8;
  const panelY = 8;
  const panelW = width - 16;
  const panelH = height - 16;

  let imageDrawn = false;
  if (colors.panelImage) {
    try {
      const img = await loadPanelImageCached(colors.panelImage);
      
      
      
      
      
      
      let drawW, drawH, drawX, drawY;
      if (colors.panelImageFit === 'stretch') {
        drawW = panelW;
        drawH = panelH;
        drawX = panelX;
        drawY = panelY;
      } else {
        const scale = Math.max(panelW / img.width, panelH / img.height);
        drawW = img.width * scale;
        drawH = img.height * scale;
        drawX = panelX + (panelW - drawW) / 2;
        drawY = panelY + (panelH - drawH) / 2;
      }

      ctx.save();
      roundRect(ctx, panelX, panelY, panelW, panelH, 14);
      ctx.clip();
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
      imageDrawn = true;
    } catch {
      
      
    }
  }

  if (!imageDrawn) {
    const grad =
      colors.panelGradientDirection === 'horizontal' ? ctx.createLinearGradient(0, 0, width, 0) : ctx.createLinearGradient(0, 0, 0, height);
    for (const [offset, color] of colors.panelGradientStops) {
      grad.addColorStop(offset, color);
    }
    ctx.fillStyle = grad;
    roundRect(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fill();
  }

  ctx.strokeStyle = colors.borderOuter;
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, width - 16, height - 16, 14);
  ctx.stroke();
  ctx.strokeStyle = colors.borderInner;
  ctx.lineWidth = 2;
  roundRect(ctx, 16, 16, width - 32, height - 32, 10);
  ctx.stroke();
}

export async function renderGearImage(username, equipped, { themed = false, setLabel = null, customBackgroundPath = null, allSets = null } = {}) {
  const baseColors = themed ? TIER_6_THEME : DEFAULT_THEME;
  const colors = customBackgroundPath ? { ...baseColors, panelImage: customBackgroundPath, panelImageFit: 'stretch' } : baseColors;
  const canvasHeight = setLabel === 'Arena' ? 1120 : HEIGHT;

const canvas = createCanvas(
  WIDTH * RENDER_SCALE,
  canvasHeight * RENDER_SCALE
);

const ctx = canvas.getContext('2d');
ctx.scale(RENDER_SCALE, RENDER_SCALE);

await drawPanelChrome(ctx, colors, WIDTH, canvasHeight);

  
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Equipment`, 34, 54);

  
  
  
  
  
  let dividerY = 70;
  if (setLabel) {
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.fillText(setLabel, 34, 78);
    dividerY = 92;
  }

  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, dividerY);
  ctx.lineTo(WIDTH - 34, dividerY);
  ctx.stroke();

  
  
  
  
  
  const gridCenterX = WIDTH / 2;
  const colL = gridCenterX - GAP;
  const colC = gridCenterX;
  const colR = gridCenterX + GAP;
  const row1 = 170; 
  const row2 = 325; 
  const row3 = 480; 
  const row4 = 635; 
  const row5 = 660; 

  const mainHand = equipped.main_hand;
  const offHand = equipped.off_hand;
  const isTwoHanded = Boolean(mainHand?.twoHanded && offHand?.id === mainHand.id);

  
  connector(ctx, colC, row1 + BOX / 2, colC, row2 - BOX / 2, colors);
  connector(ctx, colL, row2, colC, row2, colors);
  connector(ctx, colC, row2, colR, row2, colors);
  connector(ctx, colC, row2 + BOX / 2, colC, row3 - BOX / 2, colors);
  connector(ctx, colC, row3 + BOX / 2, colC, row4 - BOX / 2, colors);
  connector(ctx, colL, row4, colC, row4, colors);

  
  
  
  
  
  
  
  drawSlot(ctx, 'helmet', colC, row1, equipped.helmet, colors, { showName: false });
  
  
  
  
  
  
  drawSlot(ctx, 'main_hand', colL, row2, mainHand, colors, { showName: false });
  drawSlot(ctx, 'chest', colC, row2, equipped.chest, colors, { showName: false });
  if (isTwoHanded) {
    drawSlot(ctx, 'off_hand', colR, row2, null, colors, { twoHandedNote: true });
  } else {
    drawSlot(ctx, 'off_hand', colR, row2, offHand, colors, { showName: false });
  }
  drawSlot(ctx, 'legs', colC, row3, equipped.legs, colors, { showName: false });
  drawSlot(ctx, 'gloves', colL, row4, equipped.gloves, colors, { showName: false });
  drawSlot(ctx, 'boots', colC, row4, equipped.boots, colors, { showName: false });

  
  
  
  
  
  if (mainHand?.weaponSubtype === 'bow') {
  connector(ctx, colC, row4, colR, row4, colors);

  const arrowItem = equipped.arrows?.item ?? null;

  drawSlot(ctx, 'arrows', colR, row4, arrowItem, colors, {
    showName: false,
    quantity: equipped.arrows?.quantity ?? null,
  });
  }

  
  
  
  
  
  
  const totals = getEquipmentEffectTotals(equipped);
  
  
  
  
  
  
  
  
  
  if (allSets && setLabel === 'Arena') {
    const adventureAlreadyCovered = doesSetQualifyForContext(allSets.adventure, 'adventure') || doesSetQualifyForContext(allSets.misc, 'adventure');
    if (adventureAlreadyCovered) {
      for (const type of COLUMN_ADVENTURE) totals[type] = { total: 0, parts: [] };
    }
  } else if (allSets && setLabel === 'Slayer') {
    const arenaAlreadyCovered = doesSetQualifyForContext(allSets.arena, 'arena_store') || doesSetQualifyForContext(allSets.misc, 'arena_store');
    if (arenaAlreadyCovered) {
      for (const type of COLUMN_CHAMPION) totals[type] = { total: 0, parts: [] };
    }
  } else if (allSets && setLabel === 'Skilling') {
    
    
    
    
    
    
    
    
    
    if (doesSetQualifyForContext(allSets.arena, 'arena_store')) {
      for (const type of COLUMN_CHAMPION) totals[type] = { total: 0, parts: [] };
    }
    if (doesSetQualifyForContext(allSets.adventure, 'adventure')) {
      for (const type of COLUMN_ADVENTURE) totals[type] = { total: 0, parts: [] };
    }
  }
  
  
  
  
  
  
  
  
  const rawFasterTrips = totals[EFFECT_TYPES.ADVENTURE_FASTER_TRIPS];
  totals[EFFECT_TYPES.ADVENTURE_FASTER_TRIPS] = {
    ...rawFasterTrips,
    total: Math.min(rawFasterTrips.total, ADVENTURE_MAX_FASTER_TRIPS_PERCENT),
  };
  const statsTop = 760; 
  const colAX = 72; 
  const colBX = WIDTH / 2 + 14;
  const colWidth = WIDTH / 2 - 48 - 38;

  
  
  
  
  
  
  
  
  if (colors.panelImage) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRect(ctx, 20, statsTop - 30, WIDTH - 40, canvasHeight - (statsTop - 30) - 20, 10);
    ctx.fill();
  }

  
  
  
  
  
  
  if (setLabel === 'Arena') {
  ctx.strokeStyle = colors.divider;
  ctx.beginPath();
  ctx.moveTo(34, statsTop - 24);
  ctx.lineTo(WIDTH - 34, statsTop - 24);
  ctx.stroke();

  
  
  
  
  
  if (colors.headerPlate) {
    ctx.fillStyle = colors.headerPlate;
    roundRect(ctx, 34, statsTop - 22, WIDTH - 68, 70, 8);
    ctx.fill();
  }

  ctx.textAlign = 'left';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = colors.headerPlateText ?? colors.gold;
  
  
  
  
  
  
  
  
  
  
  
  ctx.fillText('Bonuses', colAX, statsTop - 2);

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  function sumArmorGladiatorXp(setEquipped) {
    return ARMOR_SLOTS.reduce((sum, slot) => {
      const item = setEquipped[slot];
      if (!item || item.durability?.broken) return sum;
      const effect = item.effects.find((e) => e.type === EFFECT_TYPES.GLADIATOR_XP_BONUS);
      return sum + (effect?.value ?? 0);
    }, 0);
  }

  let armorXpPart = 0;
  let weaponXpPart = 0;
  let xpSourceNote = null;
  if (allSets) {
    const weaponMax = getGladiatorXpWeaponMaxSource(allSets);
    const setKeyByLabel = { Arena: 'arena', Slayer: 'adventure', Skilling: 'misc' };
    const viewedSetKey = setKeyByLabel[setLabel];

    if (setLabel === 'Skilling') {
      const adventureCovered = doesSetQualifyForContext(allSets.adventure, 'adventure');
      const arenaCovered = doesSetQualifyForContext(allSets.arena, 'arena_store');
      const miscQualifiesAdventure = doesSetQualifyForContext(allSets.misc, 'adventure');
      const miscQualifiesArena = doesSetQualifyForContext(allSets.misc, 'arena_store');
      const miscIsUsed = (!adventureCovered && miscQualifiesAdventure) || (!arenaCovered && miscQualifiesArena);
      
      
      
      
      
      
      
      if (miscIsUsed) {
        armorXpPart = sumArmorGladiatorXp(allSets.misc);
        weaponXpPart = weaponMax.value;
        if (weaponMax.setName && weaponMax.setName !== 'misc' && weaponMax.value > 0) {
          xpSourceNote = `applied from ${SET_DISPLAY_NAME[weaponMax.setName]}`;
        }
      } else {
        armorXpPart = 0;
        weaponXpPart = 0;
      }
    } else if (viewedSetKey) {
      armorXpPart = sumArmorGladiatorXp(allSets[viewedSetKey]);
      weaponXpPart = weaponMax.value;
      if (weaponMax.setName && weaponMax.setName !== viewedSetKey && weaponMax.value > 0) {
        xpSourceNote = `applied from ${SET_DISPLAY_NAME[weaponMax.setName]}`;
      }
    }
  } else {
    
    
    
    armorXpPart = totals[EFFECT_TYPES.GLADIATOR_XP_BONUS]?.total ?? 0;
  }

  drawGladiatorXpBonus(ctx, armorXpPart + weaponXpPart, xpSourceNote, colBX, statsTop + 16, colors);

  
  
  
  
  ctx.strokeStyle = colors.divider;
  ctx.beginPath();
  ctx.moveTo(34, statsTop + 50);
  ctx.lineTo(WIDTH - 34, statsTop + 50);
  ctx.stroke();

  ctx.font = 'bold 16px sans-serif';
  
  
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CHAMPION', colAX, statsTop + 80);
  ctx.fillText('ADVENTURE', colBX, statsTop + 80);

  drawStatColumn(ctx, COLUMN_CHAMPION, totals, colAX, statsTop + 118, colWidth, colors);
  drawStatColumn(ctx, COLUMN_ADVENTURE, totals, colBX, statsTop + 118, colWidth, colors);
  } 

  
  
  
  
  
  
  
  
  
  
  
  const itemizedTotals = {};

const addStats = (statsObj) => {
  if (!statsObj) return;

  for (const [key, value] of Object.entries(statsObj)) {
    if (typeof value !== 'number') continue;
    itemizedTotals[key] = (itemizedTotals[key] ?? 0) + value;
  }
};

for (const slot of SLOTS) {
  addStats(equipped[slot]?.stats);
}

const arrowItem = equipped.arrows?.item;

if (arrowItem) {
  addStats(arrowItem.stats);

  if (arrowItem.atkRanged) {
    itemizedTotals.rangedAtk =
      (itemizedTotals.rangedAtk ?? 0) + arrowItem.atkRanged;
  }

  if (arrowItem.rangedStr) {
    itemizedTotals.rangedStr =
      (itemizedTotals.rangedStr ?? 0) + arrowItem.rangedStr;
  }
}

if (setLabel !== 'Arena') {
  const itemizedTop = statsTop - 6;

ctx.strokeStyle = colors.divider;
ctx.beginPath();
ctx.moveTo(34, itemizedTop - 14);
ctx.lineTo(WIDTH - 34, itemizedTop - 14);
ctx.stroke();

const attackRows = [
  ['Stab', itemizedTotals.stabAtk ?? 0],
  ['Slash', itemizedTotals.slashAtk ?? 0],
  ['Crush', itemizedTotals.crushAtk ?? 0],
  ['Ranged', itemizedTotals.rangedAtk ?? 0],
  ['Magic', itemizedTotals.magicAtk ?? 0],
];

const defenceRows = [
  ['Stab', itemizedTotals.stabDef ?? 0],
  ['Slash', itemizedTotals.slashDef ?? 0],
  ['Crush', itemizedTotals.crushDef ?? 0],
  ['Ranged', itemizedTotals.rangedDef ?? 0],
  ['Magic', itemizedTotals.magicDef ?? 0],
];

ctx.font = 'bold 34px sans-serif';
ctx.fillStyle = colors.gold;

ctx.textAlign = 'left';
ctx.fillText('Attack Bonus', colAX, itemizedTop + 20);
ctx.fillText('Defence Bonus', colBX, itemizedTop + 20);

ctx.font = 'bold 28px sans-serif';
ctx.fillStyle = '#ffffff';

for (let index = 0; index < attackRows.length; index++) {
  const y = itemizedTop + 72 + index * 38;
  const [attackLabel, attackValue] = attackRows[index];
  const [defenceLabel, defenceValue] = defenceRows[index];

  ctx.fillText(`${attackLabel}: ${attackValue}`, colAX, y);
  ctx.fillText(`${defenceLabel}: ${defenceValue}`, colBX, y);
}

const othersTop = itemizedTop + 285;

ctx.textAlign = 'center';
ctx.font = 'bold 34px sans-serif';
ctx.fillStyle = colors.gold;
ctx.fillText('Others', WIDTH / 2, othersTop);

ctx.textAlign = 'left';
ctx.font = 'bold 28px sans-serif';
ctx.fillStyle = '#ffffff';

ctx.fillText(
  `Melee Str: ${itemizedTotals.meleeStr ?? 0}`,
  colAX,
  othersTop + 45
);

ctx.fillText(
  `Ranged Str: ${itemizedTotals.rangedStr ?? 0}`,
  colAX,
  othersTop + 85
);

ctx.fillText(
  `Magic Dmg: ${itemizedTotals.magicDmgPercent ?? 0}%`,
  colBX,
  othersTop + 45
);
} 
  return await canvas.encode('png');
}

const OVERVIEW_WIDTH = 1500;
const OVERVIEW_HEIGHT = 750;
const OVERVIEW_BOX = 85;
const OVERVIEW_GAP = 108; 
const OVERVIEW_PANEL_WIDTH = OVERVIEW_WIDTH / 3;
const OVERVIEW_SET_ORDER = [
  ['arena', 'Arena'],
  ['adventure', 'Slayer'],
  ['misc', 'Skilling'],
];

export async function renderGearSetsOverview(username, allSets, { themed = false, customBackgroundPath = null } = {}) {
  const baseColors = themed ? TIER_6_THEME : DEFAULT_THEME;
  
  
  
  
  
  const colors = customBackgroundPath ? { ...baseColors, panelImage: customBackgroundPath, panelImageFit: 'stretch' } : baseColors;
  const canvas = createCanvas(OVERVIEW_WIDTH * RENDER_SCALE, OVERVIEW_HEIGHT * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, OVERVIEW_WIDTH, OVERVIEW_HEIGHT);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Gear Sets`, 34, 50);
  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 64);
  ctx.lineTo(OVERVIEW_WIDTH - 34, 64);
  ctx.stroke();

  const headerY = 175;
  const row1 = headerY + 75; 
  const row2 = row1 + 125; 
  const row3 = row2 + 125; 
  const row4 = row3 + 125; 

  for (let idx = 0; idx < OVERVIEW_SET_ORDER.length; idx++) {
    const [setKey, label] = OVERVIEW_SET_ORDER[idx];
    const panelCenterX = OVERVIEW_PANEL_WIDTH * idx + OVERVIEW_PANEL_WIDTH / 2;
    const colL = panelCenterX - OVERVIEW_GAP;
    const colC = panelCenterX;
    const colR = panelCenterX + OVERVIEW_GAP;

    ctx.textAlign = 'center';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = colors.gold;
    ctx.fillText(label, panelCenterX, headerY);

    const equipped = allSets[setKey];
    const mainHand = equipped.main_hand;
    const offHand = equipped.off_hand;
    const isTwoHanded = Boolean(mainHand?.twoHanded && offHand?.instanceId === mainHand.instanceId);

    connector(ctx, colC, row1 + OVERVIEW_BOX / 2, colC, row2 - OVERVIEW_BOX / 2, colors);
    connector(ctx, colL, row2, colC, row2, colors, OVERVIEW_BOX);
    connector(ctx, colC, row2, colR, row2, colors, OVERVIEW_BOX);
    connector(ctx, colC, row2 + OVERVIEW_BOX / 2, colC, row3 - OVERVIEW_BOX / 2, colors);
    connector(ctx, colC, row3 + OVERVIEW_BOX / 2, colC, row4 - OVERVIEW_BOX / 2, colors);
    connector(ctx, colL, row4, colC, row4, colors, OVERVIEW_BOX);

    const opts = { showName: false, boxSize: OVERVIEW_BOX };
    drawSlot(ctx, 'helmet', colC, row1, equipped.helmet, colors, opts);
    
    
    
    drawSlot(ctx, 'main_hand', colL, row2, mainHand, colors, opts);
    drawSlot(ctx, 'chest', colC, row2, equipped.chest, colors, opts);
    if (isTwoHanded) {
      drawSlot(ctx, 'off_hand', colR, row2, null, colors, { ...opts, twoHandedNote: true });
    } else {
      drawSlot(ctx, 'off_hand', colR, row2, offHand, colors, opts);
    }
    drawSlot(ctx, 'legs', colC, row3, equipped.legs, colors, opts);
    drawSlot(ctx, 'gloves', colL, row4, equipped.gloves, colors, opts);
    drawSlot(ctx, 'boots', colC, row4, equipped.boots, colors, opts);
  }

  
  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 1;
  for (const x of [OVERVIEW_PANEL_WIDTH, OVERVIEW_PANEL_WIDTH * 2]) {
    ctx.beginPath();
    ctx.moveTo(x, 125);
    ctx.lineTo(x, OVERVIEW_HEIGHT - 20);
    ctx.stroke();
  }

  return await canvas.encode('png');
}
