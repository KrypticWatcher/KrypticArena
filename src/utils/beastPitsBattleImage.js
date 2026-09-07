import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import { roundRect, drawCoin } from './gearImage.js';
import { TOTAL_ROUNDS } from './beastPitsMatch.js';

const RENDER_SCALE = 1.8;
const WIDTH = 900;
const HEIGHT = 520;

const PORTRAIT_W = 300;
const PORTRAIT_H = 300;

const PORTRAIT_Y = 90;
const LEFT_PORTRAIT_X = 24;
const RIGHT_PORTRAIT_X = WIDTH - 24 - PORTRAIT_W;

const HP_BAR_Y = PORTRAIT_Y + PORTRAIT_H + 14;
const HP_BAR_H = 26;

function drawImageContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

async function drawPortrait(ctx, imagePath, x, y, w, h, side, borderColor) {
  ctx.fillStyle = '#151515';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  let drawn = false;
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const img = await loadImage(imagePath);
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.clip();
      if (side === 'left') {
        ctx.translate(x + w, 0);
        ctx.scale(-1, 1);
        drawImageContain(ctx, img, 0, y, w, h);
      } else {
        drawImageContain(ctx, img, x, y, w, h);
      }
      ctx.restore();
      drawn = true;
    } catch {
      
    }
  }
  if (!drawn) {
    ctx.fillStyle = '#666';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Art Coming Soon', x + w / 2, y + h / 2);
  }

  roundRect(ctx, x, y, w, h, 12);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawHpBar(ctx, x, y, w, player) {
  const frac = player.maxHp > 0 ? Math.max(0, Math.min(1, player.currentHp / player.maxHp)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x, y, w, HP_BAR_H, HP_BAR_H / 2);
  ctx.fill();
  if (frac > 0) {
    const barColor = frac > 0.5 ? '#5fce6b' : frac > 0.2 ? '#d9b23c' : '#e15b4f';
    ctx.fillStyle = barColor;
    roundRect(ctx, x, y, Math.max(HP_BAR_H, w * frac), HP_BAR_H, HP_BAR_H / 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, HP_BAR_H, HP_BAR_H / 2);
  ctx.stroke();

  const label = `${player.currentHp}/${player.maxHp}`;
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(label, x + w / 2, y + HP_BAR_H / 2 + 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + w / 2, y + HP_BAR_H / 2 + 5);
}

function drawShield(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r * 0.8);
  ctx.quadraticCurveTo(cx, cy - r * 1.2, cx + r, cy - r * 0.8);
  ctx.lineTo(cx + r, cy);
  ctx.quadraticCurveTo(cx + r, cy + r * 0.6, cx, cy + r);
  ctx.quadraticCurveTo(cx - r, cy + r * 0.6, cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

function drawFlame(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.2, cx + r * 0.4, cy + r * 0.5);
  ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.1, cx, cy + r * 0.9);
  ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.1, cx - r * 0.4, cy + r * 0.5);
  ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.2, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

function drawRestingMark(ctx, cx, cy, color) {
  ctx.fillStyle = color;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Zzz', cx, cy + 4);
}

function drawStatusIcons(ctx, cx, y, player) {
  const active = [];
  if (player.isGuarding) active.push('guard');
  if (player.frenzyTurnsRemaining > 0) active.push('frenzy');
  if (player.isResting) active.push('resting');
  if (active.length === 0) return;

  const spacing = 26;
  const startX = cx - ((active.length - 1) * spacing) / 2;
  active.forEach((type, i) => {
    const x = startX + i * spacing;
    if (type === 'guard') drawShield(ctx, x, y, 8, '#3498db');
    else if (type === 'frenzy') drawFlame(ctx, x, y, 9, '#e74c3c');
    else drawRestingMark(ctx, x, y, '#999');
  });
}

function drawTrophy(ctx, cx, cy, scale, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * scale;
  
  ctx.beginPath();
  ctx.moveTo(cx - 22 * scale, cy - 24 * scale);
  ctx.lineTo(cx + 22 * scale, cy - 24 * scale);
  ctx.lineTo(cx + 14 * scale, cy + 6 * scale);
  ctx.lineTo(cx - 14 * scale, cy + 6 * scale);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(cx - 28 * scale, cy - 14 * scale, 9 * scale, Math.PI * 0.3, Math.PI * 1.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 28 * scale, cy - 14 * scale, 9 * scale, Math.PI * 1.3, Math.PI * 2.7);
  ctx.stroke();
  
  ctx.fillRect(cx - 4 * scale, cy + 6 * scale, 8 * scale, 14 * scale);
  ctx.fillRect(cx - 18 * scale, cy + 20 * scale, 36 * scale, 8 * scale);
}

const RESULT_WIDTH = 700;
const RESULT_HEIGHT = 540;

function drawBanknote(ctx, cx, cy, w, h, color) {
  ctx.fillStyle = color;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.22, h * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCurrencyAmount(ctx, cx, y, amount, currency, color) {
  const numberText = amount.toLocaleString('en-US');
  const iconGap = 24;
  const textWidth = ctx.measureText(numberText).width;
  const totalWidth = textWidth + iconGap;
  const startX = cx - totalWidth / 2;

  if (currency === 'arena') {
    drawCoin(ctx, startX + 9, y - 6, 9);
  } else {
    drawBanknote(ctx, startX + 10, y - 6, 20, 13, color);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(numberText, startX + iconGap, y);
  ctx.textAlign = 'center';
}

export async function renderBeastPitsResultImage(match, winnerImagePath, ownerName, wagerAmount, wagerCurrency) {
  const canvas = createCanvas(RESULT_WIDTH * RENDER_SCALE, RESULT_HEIGHT * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, RESULT_WIDTH, RESULT_HEIGHT);
  ctx.strokeStyle = match.isDraw ? '#5c5c5c' : '#d4af37';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, RESULT_WIDTH - 8, RESULT_HEIGHT - 8, 14);
  ctx.stroke();

  if (match.isDraw) {
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText("IT'S A DRAW", RESULT_WIDTH / 2, RESULT_HEIGHT / 2 - 10);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#999';
    ctx.fillText(wagerAmount > 0 ? 'Both wagers refunded.' : 'A well-matched fight.', RESULT_WIDTH / 2, RESULT_HEIGHT / 2 + 24);
    return canvas.toBuffer('image/png');
  }

  drawTrophy(ctx, RESULT_WIDTH / 2, 56, 1.3, '#d4af37');

  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`${ownerName} wins!`, RESULT_WIDTH / 2, 118);

  const portraitSize = 320;
  const portraitX = (RESULT_WIDTH - portraitSize) / 2;
  const portraitY = 140;
  ctx.fillStyle = '#151515';
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 14);
  ctx.fill();
  if (winnerImagePath && fs.existsSync(winnerImagePath)) {
    try {
      const img = await loadImage(winnerImagePath);
      ctx.save();
      roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 14);
      ctx.clip();
      drawImageContain(ctx, img, portraitX, portraitY, portraitSize, portraitSize);
      ctx.restore();
    } catch {
      
    }
  }
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 14);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#999';
  if (wagerAmount > 0) {
    ctx.fillText('Won:', RESULT_WIDTH / 2, portraitY + portraitSize + 28);
    ctx.font = 'bold 24px sans-serif';
    drawCurrencyAmount(ctx, RESULT_WIDTH / 2, portraitY + portraitSize + 54, wagerAmount * 2, wagerCurrency, '#eee');
  } else {
    ctx.font = '18px sans-serif';
    ctx.fillText('Victory!', RESULT_WIDTH / 2, portraitY + portraitSize + 40);
  }

  return canvas.toBuffer('image/png');
}

export async function renderBeastPitsBattleImage(match, leftImagePath, rightImagePath, resultLine = null) {
  const canvas = createCanvas(WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, WIDTH - 8, HEIGHT - 8, 14);
  ctx.stroke();

  const [left, right] = match.players;

  
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 24px sans-serif';
  const roundLabel = match.status === 'finished' ? 'FIGHT OVER' : `Round ${Math.min(match.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}`;
  ctx.fillText(roundLabel, WIDTH / 2, 30);

  
  
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#ccc';
  let statusLine;
  if (match.status === 'finished') {
    statusLine = match.isDraw ? "It's a draw!" : `${match.players[match.winnerIndex].displayName} wins!`;
  } else {
    statusLine = `${match.players[match.activePlayerIndex].displayName}'s turn`;
  }
  ctx.fillText(statusLine, WIDTH / 2, 54);

  
  await drawPortrait(ctx, leftImagePath, LEFT_PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 'left', '#a83232');
  await drawPortrait(ctx, rightImagePath, RIGHT_PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 'right', '#a83232');

  
  
  
  
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ccc';
  ctx.textAlign = 'center';
  ctx.fillText(left.displayName, LEFT_PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y - 26);
  ctx.fillText(right.displayName, RIGHT_PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y - 26);
  drawStatusIcons(ctx, LEFT_PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y - 10, left);
  drawStatusIcons(ctx, RIGHT_PORTRAIT_X + PORTRAIT_W / 2, PORTRAIT_Y - 10, right);

  
  drawHpBar(ctx, LEFT_PORTRAIT_X, HP_BAR_Y, PORTRAIT_W, left);
  drawHpBar(ctx, RIGHT_PORTRAIT_X, HP_BAR_Y, PORTRAIT_W, right);

  
  if (resultLine) {
    const bannerY = HP_BAR_Y + HP_BAR_H + 20;
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, 40, bannerY, WIDTH - 80, 60, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, 40, bannerY, WIDTH - 80, 60, 10);
    ctx.stroke();

    ctx.fillStyle = '#eee';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    const plain = resultLine
      .replace(/\*\*/g, '')
      .replace(/\n/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    wrapCenteredText(ctx, plain, WIDTH / 2, bannerY + 26, WIDTH - 120, 22);
  }

  return canvas.toBuffer('image/png');
}

function wrapCenteredText(ctx, text, cx, startY, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 2);
  const totalHeight = (shown.length - 1) * lineHeight;
  const firstY = startY - totalHeight / 2 + lineHeight / 2;
  shown.forEach((line, i) => ctx.fillText(line, cx, firstY + i * lineHeight));
}
