import { createCanvas } from '@napi-rs/canvas';
import { DEFAULT_THEME, roundRect, drawSlot, drawPanelChrome, drawCoin } from './gearImage.js';

const RENDER_SCALE = 1.8; 

export const SLOTS_PER_PAGE = 8; 
const COLUMNS = 4;
const ROWS = 2;

const SLOT_BOX_SIZE = 84;
const SLOT_W = 190;
const SLOT_H = 230;
const GRID_LEFT = 24;
const GRID_TOP = 60;
const HEADER_H = 40;

const WIDTH = GRID_LEFT * 2 + COLUMNS * SLOT_W;
const HEIGHT = GRID_TOP + ROWS * SLOT_H + 24;

const PROGRESS_BAR_COLOR_ACTIVE = '#e8952e';
const PROGRESS_BAR_COLOR_FULFILLED = '#3ddc5c';

function progressFraction(listing) {
  const filled = listing.quantity_total - listing.quantity_remaining;
  return listing.quantity_total > 0 ? filled / listing.quantity_total : 0;
}

function drawTradingPostSlot(ctx, colors, slotX, slotY, slotNumber, listing, item, sellerName, showProgressBar) {
  const headerY = slotY + 16;
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = colors.gold;
  const sideLabel = listing.side === 'sell' ? 'Sell' : 'Buy';
  ctx.fillText(`Slot ${slotNumber} — ${sideLabel}`, slotX + SLOT_W / 2, headerY);

  const cx = slotX + SLOT_W / 2;
  const cy = slotY + HEADER_H + SLOT_BOX_SIZE / 2 + 4;
  
  
  
  
  
  
  
  
  drawSlot(ctx, item.slot ?? 'collectable', cx, cy, { ...item, durability: null }, colors, {
    boxSize: SLOT_BOX_SIZE,
    quantity: listing.quantity_remaining,
    showName: true,
    showBorder: false,
    showFill: false,
    nameFontSize: 14,
    nameOffsetY: 10,
  });

  
  
  
  
  
  
  
  
  const barY = slotY + HEADER_H + SLOT_BOX_SIZE + 26;
  const barW = SLOT_W - 32;
  const barX = slotX + 16;
  
  
  
  
  
  
  if (showProgressBar) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(barX, barY, barW, 8);
    const frac = Math.max(0, Math.min(1, progressFraction(listing)));
    if (frac > 0) {
      ctx.fillStyle = listing.status === 'fulfilled' ? PROGRESS_BAR_COLOR_FULFILLED : PROGRESS_BAR_COLOR_ACTIVE;
      ctx.fillRect(barX, barY, barW * frac, 8);
    }
  }

  
  
  
  
  
  
  
  
  
  ctx.font = '14px sans-serif';
  ctx.fillStyle = colors.text;
  const priceText = `${listing.price_per_unit.toLocaleString('en-US')} each`;
  const priceMetrics = ctx.measureText(priceText);
  const priceTextWidth = priceMetrics.width;
  const textVerticalCenter = barY + 26 - (priceMetrics.actualBoundingBoxAscent - priceMetrics.actualBoundingBoxDescent) / 2;
  const coinGap = 18;
  const priceStartX = cx - (priceTextWidth + coinGap) / 2;
  drawCoin(ctx, priceStartX + 6, textVerticalCenter, 7);
  ctx.textAlign = 'left';
  ctx.fillText(priceText, priceStartX + coinGap, barY + 26);
  ctx.textAlign = 'center';

  
  
  if (sellerName) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.fillText(`by ${sellerName}`, cx, barY + 44);
  }
}

export async function renderTradingPostGrid(title, entries, { page = 1, totalPages = 1, showProgressBar = true } = {}) {
  const colors = DEFAULT_THEME;
  const canvas = createCanvas(WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, WIDTH, HEIGHT);

  ctx.textAlign = 'left';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(title, GRID_LEFT, 34);

  ctx.textAlign = 'right';
  ctx.font = '15px sans-serif';
  ctx.fillStyle = colors.dim;
  ctx.fillText(`Page ${page} of ${totalPages}`, WIDTH - GRID_LEFT, 34);

  for (let i = 0; i < SLOTS_PER_PAGE; i++) {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const slotX = GRID_LEFT + col * SLOT_W;
    const slotY = GRID_TOP + row * SLOT_H;

    ctx.strokeStyle = colors.divider;
    ctx.lineWidth = 1;
    roundRect(ctx, slotX + 4, slotY, SLOT_W - 8, SLOT_H - 12, 8);
    ctx.stroke();

    const entry = entries[i];
    if (!entry) {
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      ctx.fillStyle = colors.dim;
      ctx.fillText(`Slot ${i + 1}`, slotX + SLOT_W / 2, slotY + 16);
      continue;
    }
    drawTradingPostSlot(ctx, colors, slotX, slotY, i + 1, entry.listing, entry.item, entry.sellerName, showProgressBar);
  }

  return canvas.encode('png');
}
