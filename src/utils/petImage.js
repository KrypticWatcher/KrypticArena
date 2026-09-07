import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import { roundRect } from './gearImage.js';
import { getPetImagePath } from '../data/pets.js';
import { formatDuration } from './format.js';

const WIDTH = 760;
const HEIGHT = 518; 
const RENDER_SCALE = 1.8;

const PORTRAIT_X = 24;
const PORTRAIT_Y = 24;
const PORTRAIT_W = 340;
const PORTRAIT_H = 340;

const INFO_X = PORTRAIT_X + PORTRAIT_W + 32;
const INFO_W = WIDTH - INFO_X - 24;

const STAT_COLOR = {
  attack: '#e74c3c',
  defense: '#3498db',
  vitality: '#2ecc71',
  speed: '#f0a020',
};
const XP_COLOR = '#9b59b6';
const NORMAL_BORDER = '#a83232'; 
const GODLY_GREEN = '#39ff6a'; 
const SHINY_GOLD = '#ffd700'; 
const NETHERCHARGED_PURPLE = '#a855f7'; 

function fillBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const clamped = Math.max(0, Math.min(1, frac));
  if (clamped > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(h, w * clamped), h, h / 2);
    ctx.fill();
  }
}

function drawImageContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

function drawStar(ctx, cx, cy, outerR, innerR, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawLightningBolt(ctx, cx, cy, scale, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + 3 * scale, cy - 10 * scale);
  ctx.lineTo(cx - 5 * scale, cy + 1 * scale);
  ctx.lineTo(cx, cy + 1 * scale);
  ctx.lineTo(cx - 3 * scale, cy + 10 * scale);
  ctx.lineTo(cx + 6 * scale, cy - 2 * scale);
  ctx.lineTo(cx + 1 * scale, cy - 2 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawStatIcon(ctx, stat, cx, cy, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  if (stat === 'attack') {
    
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 2);
    ctx.lineTo(cx + 6, cy + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx - 3, cy - 5);
    ctx.lineTo(cx + 3, cy - 5);
    ctx.closePath();
    ctx.fill();
  } else if (stat === 'defense') {
    
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 8);
    ctx.quadraticCurveTo(cx, cy - 12, cx + 8, cy - 8);
    ctx.lineTo(cx + 8, cy);
    ctx.quadraticCurveTo(cx + 8, cy + 6, cx, cy + 10);
    ctx.quadraticCurveTo(cx - 8, cy + 6, cx - 8, cy);
    ctx.closePath();
    ctx.fill();
  } else if (stat === 'vitality') {
    
    ctx.beginPath();
    ctx.arc(cx - 4.5, cy - 3, 5, Math.PI, 0);
    ctx.arc(cx + 4.5, cy - 3, 5, Math.PI, 0);
    ctx.lineTo(cx, cy + 9);
    ctx.closePath();
    ctx.fill();
  } else if (stat === 'speed') {
    
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 10);
    ctx.lineTo(cx - 5, cy + 1);
    ctx.lineTo(cx, cy + 1);
    ctx.lineTo(cx - 3, cy + 10);
    ctx.lineTo(cx + 6, cy - 2);
    ctx.lineTo(cx + 1, cy - 2);
    ctx.closePath();
    ctx.fill();
  }
}

export async function renderPetCard(pet, progress) {
  const canvas = createCanvas(WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.textBaseline = 'alphabetic';

  
  
  
  
  
  
  
  
  const isNethercharged = pet.rarity === 'nethercharged';
  const borderColor = isNethercharged ? NETHERCHARGED_PURPLE : pet.isShiny ? SHINY_GOLD : pet.isBossTier ? GODLY_GREEN : NORMAL_BORDER;

  
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 6, WIDTH - 12, HEIGHT - 12, 14);
  ctx.stroke();

  
  ctx.fillStyle = '#151515';
  roundRect(ctx, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 12);
  ctx.fill();
  const imagePath = getPetImagePath({ image: pet.image });
  let portraitDrawn = false;
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const img = await loadImage(imagePath);
      ctx.save();
      roundRect(ctx, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 12);
      ctx.clip();
      drawImageContain(ctx, img, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H);
      ctx.restore();
      portraitDrawn = true;
    } catch {
      
      
    }
  }
  if (!portraitDrawn) {
    ctx.strokeStyle = 'rgba(212,175,55,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 12);
    ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Art', PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y + PORTRAIT_H / 2 - 14);
    ctx.fillText('Coming Soon', PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y + PORTRAIT_H / 2 + 14);
  }
  roundRect(ctx, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 12);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  
  
  
  
  
  
  
  const accentColor = isNethercharged ? NETHERCHARGED_PURPLE : SHINY_GOLD;
  if (pet.shinyAbilityName) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '15px sans-serif';
    ctx.fillText('Ability:', PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y + PORTRAIT_H + 28);
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(pet.shinyAbilityName, PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y + PORTRAIT_H + 50);
    ctx.fillStyle = '#ccc';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${pet.shiny_ability_percent}%`, PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y + PORTRAIT_H + 70);
    ctx.textAlign = 'left';
  }

  
  ctx.textAlign = 'left';
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(pet.displayName.toUpperCase(), INFO_X, 64);
  
  
  
  
  
  
  
  
  
  
  
  if (isNethercharged) {
    drawLightningBolt(ctx, INFO_X + INFO_W - 8, 58, 1.1, NETHERCHARGED_PURPLE);
  } else if (pet.isShiny) {
    ctx.fillStyle = SHINY_GOLD;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('SHINY', INFO_X + INFO_W - 14, 64);
    drawStar(ctx, INFO_X + INFO_W - 4, 58, 9, 4, SHINY_GOLD);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = 'rgba(212,175,55,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(INFO_X, 80);
  ctx.lineTo(INFO_X + INFO_W, 80);
  ctx.stroke();

  
  let rowY = 116;
  ctx.fillStyle = '#888';
  ctx.font = '18px sans-serif';
  ctx.fillText('Type:', INFO_X, rowY);
  ctx.fillStyle = pet.isBossTier ? GODLY_GREEN : '#a855f7';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(pet.speciesName, INFO_X + 58, rowY);

  rowY += 28;
  ctx.fillStyle = '#888';
  ctx.font = '16px sans-serif';
  ctx.fillText('Rarity:', INFO_X, rowY);
  ctx.fillStyle = pet.isBossTier ? GODLY_GREEN : '#ccc';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(pet.rarityLabel, INFO_X + 62, rowY);

  
  rowY += 40;
  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 15px sans-serif';
  const xpLabel = progress.maxed ? `Level ${progress.level} (MAX)` : `Level ${progress.level}`;
  ctx.fillText(xpLabel, INFO_X, rowY);
  rowY += 10;
  const xpFrac = progress.maxed ? 1 : progress.xpForNextLevel > 0 ? progress.xpIntoLevel / progress.xpForNextLevel : 0;
  fillBar(ctx, INFO_X, rowY, INFO_W, 12, xpFrac, XP_COLOR);
  if (!progress.maxed) {
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${progress.xpIntoLevel}/${progress.xpForNextLevel} XP`, INFO_X + INFO_W, rowY + 24);
    ctx.textAlign = 'left';
  }

  
  rowY += 48;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ddd';
  ctx.fillText('STATS', INFO_X, rowY);
  rowY += 16;

  const STAT_LABEL = { attack: 'Attack', defense: 'Defense', vitality: 'Vitality', speed: 'Speed' };
  for (const stat of ['attack', 'defense', 'vitality', 'speed']) {
    rowY += 40;
    const color = STAT_COLOR[stat];
    drawStatIcon(ctx, stat, INFO_X + 12, rowY - 16, color);
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(STAT_LABEL[stat], INFO_X + 30, rowY - 10);
    ctx.fillStyle = '#999';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pet[stat]}/${pet.statCap}`, INFO_X + INFO_W, rowY - 10);
    ctx.textAlign = 'left';
    fillBar(ctx, INFO_X, rowY, INFO_W, 10, pet[stat] / pet.statCap, color);
  }

  
  
  
  
  
  const footerY = HEIGHT - 40;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  if (pet.onCooldown) {
    ctx.fillStyle = '#e74c3c';
    const cooldownText = formatDuration(Math.max(0, pet.cooldown_until - Date.now()));
    ctx.fillText(`On cooldown — ready in ${cooldownText}`, INFO_X, footerY);
  } else {
    ctx.fillStyle = '#999';
    const winPct = Math.round(pet.win_rate * 100);
    const capPct = Math.round(pet.winRateCap * 100);
    ctx.fillText(`Beast Pits win rate: ${winPct}% (cap ${capPct}%)`, INFO_X, footerY);
  }

  return canvas.toBuffer('image/png');
}
