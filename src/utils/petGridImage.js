import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DEFAULT_THEME, roundRect, drawPanelChrome } from './gearImage.js';
import { getPetIconPath, getPetSpecies, getBossGlowColor } from '../data/pets.js';

const RENDER_SCALE = 1.8;
const COLUMNS = 8;
const ROWS_PER_PAGE = 7;
export const PETS_PER_PAGE = COLUMNS * ROWS_PER_PAGE;

const CELL_BOX_SIZE = 64;
const CELL_W = 76;
const CELL_H = 72;
const GRID_LEFT = 28;
const GRID_TOP = 68;
const WIDTH = GRID_LEFT * 2 + COLUMNS * CELL_W;

function getLevelBadgeColor(level) {
  if (level >= 20) return '#e74c3c'; 
  if (level >= 15) return '#f0a020'; 
  if (level >= 10) return '#ffff00'; 
  if (level >= 5) return '#5fce6b'; 
  return '#e0e0e0'; 
}

async function drawPetSlot(ctx, colors, x, y, pet) {
  const boxSize = CELL_BOX_SIZE;
  const cx = x + CELL_W / 2;
  const cy = y + boxSize / 2 + 4;

  
  
  
  
  
  
  
  
  
  const petSpecies = pet.isBossTier ? getPetSpecies(pet.species_id) : null;
  const glowColor = pet.isBossTier ? getBossGlowColor(petSpecies, pet.isShiny) ?? '#39ff6a' : null;
  if (pet.isBossTier) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;
  }

  const iconPath = getPetIconPath({ icon: pet.icon });
  let iconDrawn = false;
  if (iconPath) {
    try {
      const img = await loadImage(iconPath);
      const size = boxSize * 0.82;
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
      iconDrawn = true;
    } catch {
      
      
    }
  }
  if (!iconDrawn) {
    ctx.fillStyle = colors.slotEmptyFill;
    roundRect(ctx, cx - boxSize * 0.35, cy - boxSize * 0.35, boxSize * 0.7, boxSize * 0.7, 8);
    ctx.fill();
    ctx.fillStyle = colors.dim;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('no art', cx, cy + 3);
  }

  if (pet.isBossTier) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  
  
  
  
  
  
  
  ctx.fillStyle = getLevelBadgeColor(pet.level);
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Lv${pet.level}`, x + 4, y + 14);

  
  ctx.fillStyle = colors.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  const label = pet.displayName.length > 12 ? `${pet.displayName.slice(0, 11)}…` : pet.displayName;
  ctx.fillText(label, cx, cy + boxSize * 0.34 + 16);
}

export async function renderPetGridImage(username, pets, { page, totalPages, customBackgroundPath = null } = {}) {
  const baseColors = DEFAULT_THEME;
  
  
  
  const colors = customBackgroundPath ? { ...baseColors, panelImage: customBackgroundPath, panelImageFit: 'stretch' } : baseColors;
  const rows = Math.max(1, Math.ceil(pets.length / COLUMNS));
  const height = GRID_TOP + rows * CELL_H + 40;

  const canvas = createCanvas(WIDTH * RENDER_SCALE, height * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, WIDTH, height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Pets`, 34, 54);

  if (totalPages > 1) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${page}/${totalPages}`, WIDTH - 30, 54);
    ctx.textAlign = 'left';
  }

  if (pets.length === 0) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.textAlign = 'center';
    ctx.fillText("You don't own any pets yet.", WIDTH / 2, GRID_TOP + 40);
    return canvas.toBuffer('image/png');
  }

  for (let i = 0; i < pets.length; i++) {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = GRID_LEFT + col * CELL_W;
    const y = GRID_TOP + row * CELL_H;
    await drawPetSlot(ctx, colors, x, y, pets[i]);
  }

  return canvas.toBuffer('image/png');
}
