import { fileURLToPath } from 'url';
import path from 'path';
import { loadImage } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ITEM_ICON_DIR = path.join(__dirname, '..', '..', 'assets', 'item-icons');

const IMAGE_ICON_FILES = {
  elixir: 'Elixir.png',
  focus_attack: 'AttackCandy.png',
  focus_defense: 'DefenseCandy.png',
  focus_vitality: 'VitalityCandy.png',
  focus_speed: 'SpeedCandy.png',
  29001: 'Feather.png',
  30001: 'Needle.png',
  30002: 'Thread.png',
  42001: 'Knife.png',
  42002: 'Hammer.png',
  42003: 'SkinningKnife.png',
  42004: 'Saw.png',
  42005: 'CompostBag.png',
  42006: 'VialOfWater.png',
};

const imageIconCache = {};
await Promise.all(
  Object.entries(IMAGE_ICON_FILES).map(async ([key, filename]) => {
    try {
      imageIconCache[key] = await loadImage(path.join(ITEM_ICON_DIR, filename));
    } catch (err) {
      console.error(`Failed to load item icon asset ${filename}:`, err);
    }
  })
);

function drawImageIcon(key) {
  return (ctx, cx, cy, s) => {
    const img = imageIconCache[key];
    if (!img) return;
    const size = s * 2;
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  };
}

export const IMAGE_NAMED_ICON_KEYS = Object.keys(IMAGE_ICON_FILES);

const TIER_BREAKPOINTS = [1, 5, 10, 20, 35, 45, 55, 65, 75, 85, 92];
const TIER_PALETTE = [
  '#9aa1a6', 
  '#d7dbe0', 
  '#c97a3d', 
  '#8a9a6b', 
  '#cfd9e0', 
  '#e2622f', 
  '#3d3247', 
  '#4fa8d8', 
  '#6a4c93', 
  '#f0c419', 
  '#f7f1e0', 
];

function tierIndex(tier) {
  const i = TIER_BREAKPOINTS.indexOf(tier);
  return i === -1 ? 0 : i;
}

function tierColor(item) {
  return TIER_PALETTE[tierIndex(item?.tier)];
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + amount)));
  g = Math.max(0, Math.min(255, Math.round(g + amount)));
  b = Math.max(0, Math.min(255, Math.round(b + amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawOre(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  ctx.fillStyle = '#5c554c';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.1);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.42);
  ctx.lineTo(cx + s * 0.08, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.48, cy - s * 0.12);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
  ctx.lineTo(cx - s * 0.1, cy + s * 0.5);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.08);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.28);
  ctx.lineTo(cx + s * 0.34, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.06, cy + s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 40);
  ctx.beginPath();
  ctx.arc(cx - s * 0.18, cy + s * 0.2, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawBar(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.48, cy + s * 0.28);
  ctx.lineTo(cx - s * 0.34, cy - s * 0.16);
  ctx.lineTo(cx + s * 0.34, cy - s * 0.16);
  ctx.lineTo(cx + s * 0.48, cy + s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -60);
  ctx.lineWidth = s * 0.05;
  ctx.stroke();
  ctx.fillStyle = shade(color, 55);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy - s * 0.08);
  ctx.lineTo(cx - s * 0.18, cy - s * 0.12);
  ctx.lineTo(cx - s * 0.02, cy + s * 0.18);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.2);
  ctx.closePath();
  ctx.fill();
}

function drawLog(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.15);
  ctx.fillStyle = shade(color, -30);
  ctx.fillRect(-s * 0.5, -s * 0.22, s, s * 0.44);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(s * 0.4, 0, s * 0.14, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(color, -70);
  ctx.lineWidth = s * 0.025;
  ctx.beginPath();
  ctx.ellipse(s * 0.4, 0, s * 0.08, s * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.4, 0, s * 0.03, s * 0.05, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = shade(color, -55);
  ctx.lineWidth = s * 0.02;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, i * s * 0.14);
    ctx.lineTo(s * 0.28, i * s * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowItem(ctx, cx, cy, s, item) {
  const shaftColor = tierColor(item);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = shaftColor;
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(s * 0.32, 0);
  ctx.stroke();
  ctx.fillStyle = '#c7ccd1';
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0);
  ctx.lineTo(s * 0.26, -s * 0.13);
  ctx.lineTo(s * 0.26, s * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(shaftColor, -20);
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(-s * 0.22, -s * 0.16);
  ctx.lineTo(-s * 0.16, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(-s * 0.22, s * 0.16);
  ctx.lineTo(-s * 0.16, s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrowhead(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0);
  ctx.lineTo(-s * 0.28, -s * 0.26);
  ctx.lineTo(-s * 0.12, 0);
  ctx.lineTo(-s * 0.28, s * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -60);
  ctx.lineWidth = s * 0.035;
  ctx.stroke();
  ctx.restore();
}

function drawHerb(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  ctx.strokeStyle = shade(color, -30);
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.5);
  ctx.lineTo(cx, cy - s * 0.1);
  ctx.stroke();
  const leaf = (dx, dy, rot, sc) => {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.22 * sc, s * 0.11 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  leaf(-s * 0.02, s * 0.18, Math.PI / 5, 1);
  leaf(s * 0.02, -s * 0.02, -Math.PI / 5, 1);
  leaf(-s * 0.04, -s * 0.22, Math.PI / 4, 0.85);
  leaf(s * 0.04, -s * 0.38, -Math.PI / 6, 0.7);
}

function seedFamilyColor(item) {
  const desc = item?.description ?? '';
  if (desc.includes('fruit patch')) return tierColor({ tier: item.tier });
  return tierColor(item); 
}

function drawSeed(ctx, cx, cy, s, item) {
  const color = seedFamilyColor(item);
  ctx.fillStyle = '#c9b98a';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy - s * 0.4);
  ctx.lineTo(cx + s * 0.34, cy - s * 0.4);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
  ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a7a52';
  ctx.lineWidth = s * 0.035;
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy - s * 0.4);
  ctx.lineTo(cx, cy - s * 0.14);
  ctx.lineTo(cx + s * 0.34, cy - s * 0.4);
  ctx.stroke();
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.05, s * 0.12, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

const FEATHER_COLOR = '#e8e2d0';
function drawFeather(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 8);
  ctx.fillStyle = FEATHER_COLOR;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.quadraticCurveTo(s * 0.32, -s * 0.1, 0, s * 0.55);
  ctx.quadraticCurveTo(-s * 0.05, s * 0.1, 0, -s * 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.quadraticCurveTo(-s * 0.32, -s * 0.1, 0, s * 0.55);
  ctx.quadraticCurveTo(s * 0.05, s * 0.1, 0, -s * 0.55);
  ctx.fill();
  ctx.strokeStyle = shade(FEATHER_COLOR, -60);
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.5);
  ctx.lineTo(0, s * 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawPotion(ctx, cx, cy, s, item) {
  const color = tierColor(item);
  const neckW = s * 0.16;
  const bulbR = s * 0.34;
  const bulbCy = cy + s * 0.12;
  ctx.strokeStyle = '#9a9a9a';
  ctx.lineWidth = s * 0.055;
  ctx.lineJoin = 'round';
  ctx.strokeRect(cx - neckW * 0.7, cy - s * 0.58, neckW * 1.4, s * 0.12);
  ctx.strokeRect(cx - neckW / 2, cy - s * 0.46, neckW, s * 0.16);
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
}

function drawHide(ctx, cx, cy, s, item) {
  const base = tierColor(item);
  const quality = item?.hideQuality ?? 'fine';
  const color = quality === 'poor' ? shade(base, -35) : quality === 'perfect' ? shade(base, 25) : base;

  ctx.fillStyle = color;
  if (quality === 'poor') {
    
    const pts = 14;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const jag = i % 2 === 0 ? 0.46 : 0.3 + ((i * 37) % 7) * 0.015;
      const px = cx + Math.cos(ang) * s * jag;
      const py = cy + Math.sin(ang) * s * jag * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.1, cy + s * 0.08, s * 0.06, s * 0.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.14, cy - s * 0.1, s * 0.04, s * 0.07, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(color, -50);
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
  } else {
    
    
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.42, cy - s * 0.1);
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.4, cx - s * 0.18, cy - s * 0.46);
    ctx.quadraticCurveTo(cx, cy - s * 0.54, cx + s * 0.18, cy - s * 0.46);
    ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.4, cx + s * 0.42, cy - s * 0.1);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.24, cx + s * 0.2, cy + s * 0.34);
    ctx.lineTo(cx + s * 0.14, cy + s * 0.52);
    ctx.lineTo(cx + s * 0.02, cy + s * 0.36);
    ctx.lineTo(cx - s * 0.06, cy + s * 0.52);
    ctx.lineTo(cx - s * 0.16, cy + s * 0.34);
    ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.24, cx - s * 0.42, cy - s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -40);
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
    if (quality === 'perfect') {
      
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s * 0.045;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, cy - s * 0.28);
      ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.38, cx + s * 0.14, cy - s * 0.3);
      ctx.stroke();
    }
  }
}

const TAN_PALETTE = [
  '#d8b58a', 
  '#cca677', 
  '#c0976a', 
  '#b3875d', 
  '#a67750', 
  '#996945', 
  '#8a5c3b', 
  '#7a4e32', 
  '#6b422a', 
  '#5c3722', 
  '#4d2c1b', 
];

function tanColor(item) {
  return TAN_PALETTE[tierIndex(item?.tier)];
}

function drawTannedHide(ctx, cx, cy, s, item) {
  const color = tanColor(item);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.4, cx - s * 0.18, cy - s * 0.46);
  ctx.quadraticCurveTo(cx, cy - s * 0.54, cx + s * 0.18, cy - s * 0.46);
  ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.4, cx + s * 0.42, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.24, cx + s * 0.2, cy + s * 0.34);
  ctx.lineTo(cx + s * 0.14, cy + s * 0.52);
  ctx.lineTo(cx + s * 0.02, cy + s * 0.36);
  ctx.lineTo(cx - s * 0.06, cy + s * 0.52);
  ctx.lineTo(cx - s * 0.16, cy + s * 0.34);
  ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.24, cx - s * 0.42, cy - s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -40);
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  
  
  ctx.strokeStyle = shade(color, -55);
  ctx.lineWidth = s * 0.02;
  ctx.setLineDash([s * 0.035, s * 0.035]);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy - s * 0.02);
  ctx.quadraticCurveTo(cx, cy + s * 0.08, cx + s * 0.28, cy - s * 0.02);
  ctx.stroke();
  ctx.setLineDash([]);
}

const FISH_PROFILES = [
  { aspect: 1.0, tail: 'round', fins: 1 }, 
  { aspect: 0.85, tail: 'forked', fins: 1 }, 
  { aspect: 1.15, tail: 'forked', fins: 2 }, 
  { aspect: 0.7, tail: 'pointed', fins: 2 }, 
  { aspect: 1.3, tail: 'round', fins: 2 }, 
  { aspect: 1.0, tail: 'forked', fins: 2, spikes: true }, 
  { aspect: 0.9, tail: 'forked', fins: 3 }, 
  { aspect: 0.75, tail: 'pointed', fins: 2, spikes: true }, 
  { aspect: 1.05, tail: 'forked', fins: 3 }, 
  { aspect: 1.2, tail: 'round', fins: 3, spikes: true }, 
  { aspect: 1.5, tail: 'forked', fins: 3, spikes: true }, 
];

function fishBodyPath(ctx, cx, cy, s, profile) {
  const w = s * 0.5 * profile.aspect;
  const h = s * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.quadraticCurveTo(cx - w * 0.5, cy - h, cx + w * 0.35, cy - h * 0.7);
  ctx.quadraticCurveTo(cx + w * 0.9, cy - h * 0.3, cx + w * 1.05, cy);
  ctx.quadraticCurveTo(cx + w * 0.9, cy + h * 0.3, cx + w * 0.35, cy + h * 0.7);
  ctx.quadraticCurveTo(cx - w * 0.5, cy + h, cx - w, cy);
  ctx.closePath();
}

function fishTailPath(ctx, cx, cy, s, profile) {
  const w = s * 0.5 * profile.aspect;
  const tx = cx - w;
  if (profile.tail === 'round') {
    ctx.beginPath();
    ctx.ellipse(tx - s * 0.1, cy, s * 0.14, s * 0.22, 0, 0, Math.PI * 2);
  } else if (profile.tail === 'forked') {
    ctx.beginPath();
    ctx.moveTo(tx + s * 0.02, cy);
    ctx.lineTo(tx - s * 0.22, cy - s * 0.24);
    ctx.lineTo(tx - s * 0.06, cy);
    ctx.lineTo(tx - s * 0.22, cy + s * 0.24);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(tx + s * 0.02, cy - s * 0.18);
    ctx.lineTo(tx - s * 0.24, cy);
    ctx.lineTo(tx + s * 0.02, cy + s * 0.18);
    ctx.closePath();
  }
}

function drawRawFish(ctx, cx, cy, s, item) {
  const idx = tierIndex(item?.tier);
  const profile = FISH_PROFILES[idx];
  const color = tierColor(item);
  ctx.fillStyle = shade(color, -25);
  fishTailPath(ctx, cx, cy, s, profile);
  ctx.fill();
  ctx.fillStyle = color;
  fishBodyPath(ctx, cx, cy, s, profile);
  ctx.fill();
  ctx.strokeStyle = shade(color, -55);
  ctx.lineWidth = s * 0.03;
  fishBodyPath(ctx, cx, cy, s, profile);
  ctx.stroke();
  
  const w = s * 0.5 * profile.aspect;
  ctx.fillStyle = shade(color, -25);
  for (let i = 0; i < profile.fins; i++) {
    const fx = cx - w * 0.3 + i * s * 0.28;
    ctx.beginPath();
    ctx.moveTo(fx, cy - s * 0.24);
    ctx.lineTo(fx + s * 0.1, cy - s * 0.42);
    ctx.lineTo(fx + s * 0.18, cy - s * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.strokeStyle = shade(color, 30);
  ctx.lineWidth = s * 0.018;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * s * 0.14, cy, s * 0.09, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx + w * 0.72, cy - s * 0.04, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  if (profile.spikes) {
    ctx.strokeStyle = shade(color, -40);
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.05, cy - s * 0.26);
    ctx.lineTo(cx - s * 0.02, cy - s * 0.4);
    ctx.moveTo(cx + s * 0.1, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.14, cy - s * 0.4);
    ctx.stroke();
  }
}

function drawCookedFish(ctx, cx, cy, s, item) {
  const idx = tierIndex(item?.tier);
  const profile = FISH_PROFILES[idx];
  const roasted = shade(tierColor(item), -55); 
  ctx.save();
  
  
  ctx.fillStyle = shade(roasted, -15);
  fishTailPath(ctx, cx, cy, s, profile);
  ctx.fill();
  ctx.fillStyle = roasted;
  fishBodyPath(ctx, cx, cy, s, profile);
  ctx.fill();
  ctx.strokeStyle = shade(roasted, -35);
  ctx.lineWidth = s * 0.03;
  fishBodyPath(ctx, cx, cy, s, profile);
  ctx.stroke();
  
  ctx.strokeStyle = 'rgba(20,10,5,0.55)';
  ctx.lineWidth = s * 0.035;
  const w = s * 0.5 * profile.aspect;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * s * 0.14 - s * 0.05, cy - s * 0.18);
    ctx.lineTo(cx + i * s * 0.14 + s * 0.05, cy + s * 0.18);
    ctx.stroke();
  }
  
  ctx.strokeStyle = '#a9793f';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.moveTo(cx - w * 1.15, cy);
  ctx.lineTo(cx + w * 1.25, cy);
  ctx.stroke();
  
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.32);
  ctx.quadraticCurveTo(cx + s * 0.08, cy - s * 0.44, cx, cy - s * 0.56);
  ctx.stroke();
  ctx.restore();
}

const FRUIT_DRAWERS = [
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.05, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3d21';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.37);
    ctx.lineTo(cx + s * 0.04, cy - s * 0.52);
    ctx.stroke();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.quadraticCurveTo(cx + s * 0.22, cy - s * 0.2, cx + s * 0.36, cy + s * 0.12);
    ctx.quadraticCurveTo(cx + s * 0.34, cy + s * 0.5, cx, cy + s * 0.5);
    ctx.quadraticCurveTo(cx - s * 0.34, cy + s * 0.5, cx - s * 0.36, cy + s * 0.12);
    ctx.quadraticCurveTo(cx - s * 0.22, cy - s * 0.2, cx, cy - s * 0.5);
    ctx.fill();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(c, -40);
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.3);
    ctx.quadraticCurveTo(cx + s * 0.06, cy, cx, cy + s * 0.3);
    ctx.stroke();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx - s * 0.02, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(c, -35);
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.02, cy - s * 0.4);
    ctx.quadraticCurveTo(cx, cy, cx - s * 0.02, cy + s * 0.4);
    ctx.stroke();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.48);
    ctx.quadraticCurveTo(cx + s * 0.34, cy - s * 0.1, cx + s * 0.26, cy + s * 0.34);
    ctx.quadraticCurveTo(cx, cy + s * 0.52, cx - s * 0.26, cy + s * 0.34);
    ctx.quadraticCurveTo(cx - s * 0.34, cy - s * 0.1, cx, cy - s * 0.48);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (const [dx, dy] of [[-0.08, 0.1], [0.1, 0.02], [-0.02, 0.28]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, s * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.08, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c, 30);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.1, cy - s * 0.2);
    ctx.lineTo(cx - s * 0.1, cy - s * 0.2);
    ctx.closePath();
    ctx.fill();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(ang) * s * 0.42;
      const py = cy + Math.sin(ang) * s * 0.42;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(c, -50);
    ctx.lineWidth = s * 0.04;
    ctx.stroke();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    for (const [dx, dy] of [[-0.18, 0.14], [0.18, 0.14], [0, -0.14]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? s * 0.44 : s * 0.22;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = s * 0.035;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * s * 0.34, cy + Math.sin(ang) * s * 0.34);
      ctx.lineTo(cx + Math.cos(ang) * s * 0.52, cy + Math.sin(ang) * s * 0.52);
      ctx.stroke();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  
  (ctx, cx, cy, s, c) => {
    ctx.strokeStyle = 'rgba(247,241,224,0.5)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const [dx, dy] of [[0.3, -0.3], [-0.34, -0.1], [0.1, 0.36]]) {
      ctx.save();
      ctx.translate(cx + dx * s, cy + dy * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s * 0.02, -s * 0.06, s * 0.04, s * 0.12);
      ctx.fillRect(-s * 0.06, -s * 0.02, s * 0.12, s * 0.04);
      ctx.restore();
    }
  },
];

function drawFruit(ctx, cx, cy, s, item) {
  const idx = tierIndex(item?.tier);
  const drawer = FRUIT_DRAWERS[idx] ?? FRUIT_DRAWERS[0];
  drawer(ctx, cx, cy, s, tierColor(item));
}

export const RESOURCE_ICONS = {
  ore: drawOre,
  bar: drawBar,
  log: drawLog,
  arrow: drawArrowItem,
  arrowhead: drawArrowhead,
  herb: drawHerb,
  seed: drawSeed,
  feather: (ctx, cx, cy, s) => drawFeather(ctx, cx, cy, s),
  potion: drawPotion,
  hide: drawHide,
  tanned_hide: drawTannedHide,
  silk: drawImbuedSilk,
  raw_fish: drawRawFish,
  cooked_fish: drawCookedFish,
  fruit: drawFruit,
};

function drawNeedle(ctx, cx, cy, s, color = '#c7ccd1') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.055;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, 0);
  ctx.lineTo(s * 0.38, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.42, -s * 0.08, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * 0.38, 0);
  ctx.lineTo(s * 0.5, -s * 0.05);
  ctx.lineTo(s * 0.5, s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawThread(ctx, cx, cy, s) {
  ctx.strokeStyle = '#d7dbe0';
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(i * 0.9) * s * 0.4, cy - Math.sin(i * 0.9) * s * 0.4);
    ctx.lineTo(cx + Math.cos(i * 0.9) * s * 0.4, cy + Math.sin(i * 0.9) * s * 0.4);
    ctx.stroke();
  }
}

function drawEnchantedThread(ctx, cx, cy, s) {
  ctx.strokeStyle = '#b18aff';
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(i * 0.9) * s * 0.4, cy - Math.sin(i * 0.9) * s * 0.4);
    ctx.lineTo(cx + Math.cos(i * 0.9) * s * 0.4, cy + Math.sin(i * 0.9) * s * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = '#e4d4ff';
  for (const [dx, dy, r] of [
    [0.32, -0.3, 0.06],
    [-0.28, 0.22, 0.045],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawImbuedSilk(ctx, cx, cy, s) {
  ctx.fillStyle = '#9b6fe0';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy - s * 0.12);
  ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.34, cx + s * 0.1, cy - s * 0.14);
  ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.02, cx + s * 0.4, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.2, cx + s * 0.06, cy + s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.14, cy + s * 0.32, cx - s * 0.4, cy + s * 0.16);
  ctx.quadraticCurveTo(cx - s * 0.3, cy, cx - s * 0.38, cy - s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade('#9b6fe0', -35);
  ctx.lineWidth = s * 0.025;
  ctx.stroke();
  ctx.strokeStyle = '#e4d4ff';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.1);
  ctx.quadraticCurveTo(cx, cy + s * 0.02, cx + s * 0.2, cy - s * 0.06);
  ctx.stroke();
}

function drawKnife(ctx, cx, cy, s, color = '#c7ccd1') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.42);
  ctx.lineTo(s * 0.1, -s * 0.42);
  ctx.lineTo(s * 0.08, s * 0.05);
  ctx.lineTo(-s * 0.08, s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a4c33';
  ctx.fillRect(-s * 0.09, s * 0.05, s * 0.18, s * 0.4);
  ctx.restore();
}

function drawSkinningKnife(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#c7ccd1';
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, -s * 0.4);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.36, s * 0.1, s * 0.02);
  ctx.lineTo(-s * 0.06, s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a4c33';
  ctx.fillRect(-s * 0.08, s * 0.02, s * 0.16, s * 0.42);
  ctx.restore();
}

function drawHammer(ctx, cx, cy, s, color = '#9aa1a6') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 5);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-s * 0.06, -s * 0.1, s * 0.12, s * 0.6);
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.3, -s * 0.32, s * 0.6, s * 0.24);
  ctx.restore();
}

function drawSaw(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 8);
  ctx.fillStyle = '#c7ccd1';
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.1);
  ctx.lineTo(s * 0.35, -s * 0.22);
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const x = 0.35 - t * 0.75;
    ctx.lineTo(x * s, (i % 2 === 0 ? 0.02 : 0.1) * s);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a4c33';
  ctx.fillRect(-s * 0.55, -s * 0.14, s * 0.22, s * 0.16);
  ctx.restore();
}

function drawCompostBag(ctx, cx, cy, s, color = '#7a5c3a') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.48);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.48);
  ctx.lineTo(cx + s * 0.34, cy + s * 0.44);
  ctx.lineTo(cx - s * 0.34, cy + s * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -40);
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, cy - s * 0.48);
  ctx.lineTo(cx - s * 0.06, cy - s * 0.34);
  ctx.moveTo(cx + s * 0.14, cy - s * 0.48);
  ctx.lineTo(cx + s * 0.06, cy - s * 0.34);
  ctx.stroke();
}

function drawVialOfWater(ctx, cx, cy, s) {
  drawPotion(ctx, cx, cy, s, { tier: 65 }); 
}

function drawGoldenNeedle(ctx, cx, cy, s) {
  drawNeedle(ctx, cx, cy, s, '#f0c419');
}

function drawArrowsmithTool(ctx, cx, cy, s) {
  drawArrowhead(ctx, cx, cy, s, { tier: 85 });
  ctx.strokeStyle = '#f0c419';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.56, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBlacksmithTool(ctx, cx, cy, s) {
  const color = '#f0c419';
  ctx.fillStyle = '#3d3247';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.3, cy - s * 0.08);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - s * 0.1, cy - s * 0.34, s * 0.2, s * 0.28);
  drawHammer(ctx, cx + s * 0.26, cy - s * 0.3, s * 0.6, color);
}

function drawHunterTool(ctx, cx, cy, s) {
  const color = '#8a9a6b';
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, cy, s * 0.4, -Math.PI / 2.5, Math.PI / 2.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.38);
  ctx.lineTo(cx - s * 0.1, cy + s * 0.38);
  ctx.stroke();
  drawFeather(ctx, cx + s * 0.18, cy, s * 0.5);
}

function drawBuilderTool(ctx, cx, cy, s) {
  const color = '#c97a3d';
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.36, cy + s * 0.36);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.02, cy - s * 0.26);
  ctx.lineTo(cx + s * 0.32, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.44, cy - s * 0.36);
  ctx.lineTo(cx + s * 0.14, cy - s * 0.12);
  ctx.closePath();
  ctx.fill();
}

function drawHerbalFlask(ctx, cx, cy, s) {
  drawPotion(ctx, cx, cy, s, { tier: 10 }); 
}

function drawMasterCompost(ctx, cx, cy, s) {
  drawCompostBag(ctx, cx, cy, s, '#f0c419');
  ctx.fillStyle = 'rgba(240,196,25,0.6)';
  for (const [dx, dy] of [[0.2, -0.1], [-0.2, 0.05], [0, -0.25]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + dy * s, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHerbalistTool(ctx, cx, cy, s) {
  const color = '#8a9a6b';
  ctx.fillStyle = '#7a726a';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy + s * 0.1);
  ctx.quadraticCurveTo(cx, cy + s * 0.5, cx + s * 0.38, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.3, cy + s * 0.04);
  ctx.quadraticCurveTo(cx, cy + s * 0.3, cx - s * 0.3, cy + s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(cx + s * 0.14, cy - s * 0.2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#9a9188';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.08, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - s * 0.06, cy - s * 0.02, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawOldPickaxe(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 6);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-s * 0.05, -s * 0.1, s * 0.1, s * 0.55);
  ctx.strokeStyle = '#8a8378'; 
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.14);
  ctx.quadraticCurveTo(0, -s * 0.4, s * 0.42, -s * 0.14);
  ctx.stroke();
  ctx.restore();
  
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.2, cy - s * 0.3, s * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

function drawRustyAxe(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 5);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-s * 0.05, -s * 0.1, s * 0.1, s * 0.55);
  ctx.fillStyle = '#a15a35'; 
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, -s * 0.4);
  ctx.quadraticCurveTo(-s * 0.42, -s * 0.36, -s * 0.32, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.16, -s * 0.12, -s * 0.06, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(80,30,10,0.35)';
  ctx.beginPath();
  ctx.arc(-s * 0.22, -s * 0.2, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOldRod(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 6);
  ctx.strokeStyle = '#8a7a5c'; 
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, s * 0.3);
  ctx.quadraticCurveTo(s * 0.1, s * 0.1, s * 0.46, -s * 0.4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(154,144,120,0.7)';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.moveTo(s * 0.46, -s * 0.4);
  ctx.quadraticCurveTo(0, s * 0.1, -s * 0.3, s * 0.5);
  ctx.stroke();
  ctx.restore();
}

export const NAMED_ICONS = {
  29001: drawImageIcon(29001),
  30001: drawImageIcon(30001),
  30002: drawImageIcon(30002),
  43102: drawEnchantedThread,
  42001: drawImageIcon(42001),
  42002: drawImageIcon(42002),
  42003: drawImageIcon(42003),
  42004: drawImageIcon(42004),
  42005: drawImageIcon(42005),
  42006: drawImageIcon(42006),
  elixir: drawImageIcon('elixir'),
  focus_attack: drawImageIcon('focus_attack'),
  focus_defense: drawImageIcon('focus_defense'),
  focus_vitality: drawImageIcon('focus_vitality'),
  focus_speed: drawImageIcon('focus_speed'),
  41001: drawGoldenNeedle,
  41002: drawArrowsmithTool,
  41003: drawBlacksmithTool,
  41004: drawHunterTool,
  41005: drawBuilderTool,
  41006: drawHerbalFlask,
  41007: drawMasterCompost,
  41008: drawHerbalistTool,
  40034: drawOldPickaxe,
  40035: drawRustyAxe,
  40036: drawOldRod,
};
