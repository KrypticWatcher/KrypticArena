import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import { DEFAULT_THEME, TIER_6_THEME, roundRect, drawSlot, drawPanelChrome } from './gearImage.js';
import { getGladiatorRow } from './gladiator.js';
import { resolveInventoryBackgroundPath } from './inventoryBackgrounds.js';
import { getPetIconPath } from '../data/pets.js';

async function preloadPetIcons(items) {
  const petItems = items.filter((item) => item.isPet);
  const map = new Map();
  await Promise.all(
    petItems.map(async (item) => {
      const iconPath = getPetIconPath(item.petSpecies);
      if (!iconPath || !fs.existsSync(iconPath)) return;
      try {
        map.set(item.id, await loadImage(iconPath));
      } catch {
        
      }
    })
  );
  return map;
}

const RENDER_SCALE = 1.8; 

const COLUMNS = 8; 
const ROWS_PER_PAGE = 7; 
export const ITEMS_PER_PAGE = COLUMNS * ROWS_PER_PAGE;

const CELL_BOX_SIZE = 84;
const CELL_W = 98; 

const CELL_H = 84;

const CELL_H_DURABILITY = 116; 
const GRID_LEFT = 28;
const GRID_TOP = 68;

export async function renderInventoryImage(
  username,
  cells,
  { page, totalPages, themed = false, showDurability = false, showNames = false, showId = false, customBackgroundPath = null, fullSize = false, petIcons = null } = {}
) {
  const baseColors = themed ? TIER_6_THEME : DEFAULT_THEME;
  
  
  
  
  
  const colors = customBackgroundPath ? { ...baseColors, panelImage: customBackgroundPath, panelImageFit: 'stretch' } : baseColors;
  
  
  
  
  
  const cellH = showDurability ? CELL_H_DURABILITY : CELL_H;
  const cellW = CELL_W;
  const width = GRID_LEFT * 2 + COLUMNS * cellW;
  
  
  
  
  
  
  
  
  const rows = fullSize ? ROWS_PER_PAGE : Math.max(1, Math.ceil(cells.length / COLUMNS));
  const height = GRID_TOP + rows * cellH + 40;

  const canvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, width, height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Inventory`, 34, 54);

  ctx.textAlign = 'right';
  ctx.font = '15px sans-serif';
  ctx.fillStyle = colors.dim;
  ctx.fillText(`Page ${page} of ${totalPages}`, width - 34, 54);

  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 68);
  ctx.lineTo(width - 34, 68);
  ctx.stroke();

  cells.forEach((cell, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const cx = GRID_LEFT + col * cellW + cellW / 2;
    const cy = GRID_TOP + row * cellH + CELL_BOX_SIZE / 2;

    
    
    
    
    
    
    
    
    
    const itemForSlot = {
      ...cell.item,
      name: showId ? String(cell.item.id) : cell.item.name,
      durability: showDurability && cell.durability !== null ? { current: cell.durability, broken: cell.durability <= 0 } : null,
    };

    
    
    
    
    
    const iconKey = cell.item.slot ?? 'collectable';

    drawSlot(ctx, iconKey, cx, cy, itemForSlot, colors, {
      quantity: cell.quantity,
      boxSize: CELL_BOX_SIZE,
      showName: showId || showNames, 
      nameWidth: cellW - 10, 
      nameFontSize: 18, 
      nameMaxChars: 8, 
      nameOffsetY: -8, 
      nameTextColor: '#ffffff', 
      showBorder: false,
      showFill: false, 
      newUnlock: cell.newUnlock ?? false,
      
      
      
      
      
      petIconImage: petIcons?.get(cell.item.id) ?? null,
    });
  });

  if (cells.length === 0) {
    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.fillText('Nothing here.', width / 2, GRID_TOP + 40);
  }

  return canvas.encode('png');
}

export async function renderLootPreviewImage(guildId, userId, username, grantedItems, newUnlockIds = new Set(), foundPet = null) {
  if ((!grantedItems || grantedItems.length === 0) && !foundPet) return null;

  
  
  
  const countById = new Map();
  const itemById = new Map();
  for (const item of grantedItems ?? []) {
    countById.set(item.id, (countById.get(item.id) ?? 0) + 1);
    itemById.set(item.id, item);
  }
  const cells = [...countById.entries()].map(([id, quantity]) => ({
    item: itemById.get(id),
    quantity,
    durability: null,
    newUnlock: newUnlockIds.has(id),
  }));

  if (foundPet) {
    const isShiny = Boolean(foundPet.pet.is_shiny);
    const petSpecies = isShiny ? { ...foundPet.species, icon: foundPet.species.shinyIcon } : foundPet.species;
    cells.push({
      item: { id: `loot_pet_${foundPet.pet.instance_id}`, name: foundPet.pet.given_name, rarity: foundPet.species.rarity, isPet: true, petSpecies },
      quantity: 1,
      durability: null,
      newUnlock: true,
    });
  }

  const petIcons = await preloadPetIcons(cells.filter((c) => c.item.isPet).map((c) => c.item));

  const bgRow = getGladiatorRow(guildId, userId);
  const customBackgroundPath = bgRow?.inventory_bg_id ? resolveInventoryBackgroundPath(bgRow.inventory_bg_id) : null;

  return renderInventoryImage(username, cells, { page: 1, totalPages: 1, customBackgroundPath, fullSize: false, petIcons });
}

const CL_COLUMNS = 10;
const CL_CELL = 62;
const CL_BOX = 54; 
const CL_GRID_WIDTH = 34 * 2 + CL_COLUMNS * CL_CELL;

const SIDEBAR_WIDTH = 160;

const SIDEBAR_COLOR = { empty: '#6b6b6b', partial: '#e8c84a', complete: '#2de8a0' };

export async function renderCollectionLogImage(username, categoryLabel, items, obtainedMap, extraLine = null, sidebarEntries = null) {
  const colors = DEFAULT_THEME;
  const rows = Math.max(1, Math.ceil(items.length / CL_COLUMNS));
  const headerHeight = extraLine ? 108 : 86;
  const gridHeight = headerHeight + rows * CL_CELL + 30;
  
  
  
  const sidebarContentHeight = sidebarEntries ? 40 + sidebarEntries.length * 26 + 20 : 0;
  const height = Math.max(gridHeight, sidebarContentHeight);
  const width = CL_GRID_WIDTH + (sidebarEntries ? SIDEBAR_WIDTH : 0);
  const gridOffsetX = sidebarEntries ? SIDEBAR_WIDTH : 0;

  const canvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, width, height);

  if (sidebarEntries) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 14px sans-serif';
    sidebarEntries.forEach((entry, i) => {
      const rowY = 34 + i * 26;
      if (entry.isCurrent) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, 12, rowY - 16, SIDEBAR_WIDTH - 20, 24, 6);
        ctx.fill();
      }
      ctx.fillStyle = SIDEBAR_COLOR[entry.state];
      ctx.fillText(entry.label, 20, rowY);
    });
    ctx.strokeStyle = colors.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gridOffsetX, 16);
    ctx.lineTo(gridOffsetX, height - 16);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Collection Log`, gridOffsetX + 34, 40);

  const obtainedCount = items.filter((item) => obtainedMap.has(String(item.id))).length;
  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${categoryLabel} — Obtained: ${obtainedCount}/${items.length}`, gridOffsetX + 34, 66);

  if (extraLine) {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = colors.dim;
    ctx.fillText(extraLine, gridOffsetX + 34, 88);
  }

  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gridOffsetX + 34, headerHeight - 14);
  ctx.lineTo(width - 34, headerHeight - 14);
  ctx.stroke();

  
  
  
  const petIcons = await preloadPetIcons(items);

  items.forEach((item, i) => {
    const col = i % CL_COLUMNS;
    const row = Math.floor(i / CL_COLUMNS);
    const cx = gridOffsetX + 34 + col * CL_CELL + CL_CELL / 2;
    const cy = headerHeight + row * CL_CELL + CL_CELL / 2;

    const quantity = obtainedMap.get(String(item.id)) ?? null;
    const obtained = quantity !== null;

    
    
    
    
    
    drawSlot(ctx, item.slot ?? 'collectable', cx, cy, item, colors, {
      boxSize: CL_BOX,
      quantity: obtained ? quantity : null,
      greyedOut: !obtained,
      showName: false,
      showBorder: false,
      showFill: false,
      petIconImage: item.isPet ? petIcons.get(item.id) ?? null : null,
    });
  });

  return canvas.encode('png');
}

const OVERALL_COLUMNS = 10;
const OVERALL_CELL = 46;
const OVERALL_BOX = 42; 

export async function renderOverallCollectionLogImage(username, allItems, obtainedMap) {
  const colors = DEFAULT_THEME;
  const rows = Math.max(1, Math.ceil(allItems.length / OVERALL_COLUMNS));
  const width = 34 * 2 + OVERALL_COLUMNS * OVERALL_CELL;
  const headerHeight = 68;
  const height = headerHeight + rows * OVERALL_CELL + 24;

  const canvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  await drawPanelChrome(ctx, colors, width, height);

  const obtainedCount = allItems.filter((item) => obtainedMap.has(String(item.id))).length;
  
  
  
  
  
  
  const percent = allItems.length > 0 ? ((obtainedCount / allItems.length) * 100).toFixed(2) : '0.00';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = colors.gold;
  ctx.fillText(`${username}'s Collection Log — Overall`, 24, 36);

  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Obtained: ${obtainedCount}/${allItems.length}   ·   Missing: ${allItems.length - obtainedCount}   ·   ${percent}%`, 24, 56);

  const petIcons = await preloadPetIcons(allItems);

  allItems.forEach((item, i) => {
    const col = i % OVERALL_COLUMNS;
    const row = Math.floor(i / OVERALL_COLUMNS);
    const cx = 34 + col * OVERALL_CELL + OVERALL_CELL / 2;
    const cy = headerHeight + row * OVERALL_CELL + OVERALL_CELL / 2;

    const obtained = obtainedMap.has(String(item.id));
    drawSlot(ctx, item.slot ?? 'collectable', cx, cy, item, colors, {
      boxSize: OVERALL_BOX,
      greyedOut: !obtained,
      showName: false,
      showBorder: false,
      showFill: false, 
      petIconImage: item.isPet ? petIcons.get(item.id) ?? null : null,
    });
  });

  return canvas.encode('png');
}
