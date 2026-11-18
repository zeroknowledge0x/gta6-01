// One job: paint the entire interface — health, wanted stars, minimap, weapon,
// objective, radio, title and pause — into one 1280x720 canvas. That canvas is
// used as a texture in the WebGL overlay, so the HUD appears in screenshots too.

import { WEAPONS, WANTED_STARS, CITY, HERO_NAME } from './config.js';

const W = 1280, H = 720;

function rect(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
}
function label(ctx, text, x, y, size = 18, color = '#fff', align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function panel(ctx, x, y, w, h, alpha = 0.62) {
  ctx.fillStyle = `rgba(10,18,26,${alpha})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function bar(ctx, x, y, w, h, fraction, color) {
  rect(ctx, x, y, w, h, 'rgba(0,0,0,0.55)');
  rect(ctx, x, y, w * Math.max(0, Math.min(1, fraction)), h, color);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.44;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd34e' : 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
}

export class HudPainter {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
  }

  paint(world, view) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (view.state === 'title') { this.drawTitle(ctx, world, view); return; }
    this.drawStatus(ctx, world);
    this.drawWanted(ctx, world);
    this.drawMinimap(ctx, world);
    this.drawWeapon(ctx, world);
    this.drawObjective(ctx, world);
    this.drawRadio(ctx, world);
    if (!world.player.car) this.drawCrosshair(ctx, world);
    if (world.hitFlash > 0) this.drawHitFlash(ctx, world);
    if (view.state === 'paused') this.drawPause(ctx, view);
    if (view.state === 'dead') this.drawDead(ctx);
  }

  drawStatus(ctx, world) {
    const p = world.player;
    panel(ctx, 18, 16, 296, 106);
    label(ctx, HERO_NAME.toUpperCase(), 30, 40, 15, '#ffe6a8');
    label(ctx, 'HEALTH', 30, 62, 12, '#ffffffcc');
    bar(ctx, 92, 52, 150, 12, p.health / 100, '#e2534d');
    label(ctx, 'ARMOUR', 30, 84, 12, '#ffffffcc');
    bar(ctx, 92, 74, 150, 12, p.armour / 100, '#4ea8de');
    label(ctx, `$${p.money.toLocaleString('en-US')}`, 30, 110, 22, '#8ce6a0');
    if (p.car) {
      panel(ctx, 18, 130, 232, 30, 0.5);
      label(ctx, `${p.car.spec.name} · ${Math.round(Math.abs(p.car.speed) * 3.6)} km/h`, 30, 151, 14, '#dff0ff');
    }
  }

  drawWanted(ctx, world) {
    const n = world.wanted;
    if (n <= 0) return;
    panel(ctx, W - 252, 16, 234, 52);
    label(ctx, n >= 4 ? 'WANTED · FUGITIVE' : 'WANTED', W - 32, 37, 13, '#ffb9a0', 'right');
    for (let i = 0; i < WANTED_STARS; i++) star(ctx, W - 220 + i * 38, 52, 13, i < n);
    const frac = Math.max(0, Math.min(1, world.wantedTimer / 24));
    bar(ctx, W - 220, 60, 182, 4, frac, '#ffcf5a');
  }

  drawMinimap(ctx, world) {
    const size = 196, x0 = 22, y0 = H - size - 22;
    const cx = x0 + size / 2, cy = y0 + size / 2;
    const scale = 0.44, px = world.player.x, pz = world.player.z;
    const toX = wx => cx + (wx - px) * scale;
    const toY = wz => cy + (wz - pz) * scale;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, 6.2832); ctx.clip();
    ctx.fillStyle = '#25333a'; ctx.fillRect(x0, y0, size, size);

    // Water, then city blocks, then the street grid.
    ctx.fillStyle = '#2e6f93';
    ctx.fillRect(toX(-500), toY(CITY.waterStart), 1000 * scale, 300 * scale);
    for (const b of world.city.blocks) {
      ctx.fillStyle = b.park ? '#3f6b3a' : '#42505a';
      ctx.fillRect(toX(b.cx - b.half), toY(b.cz - b.half), b.half * 2 * scale, b.half * 2 * scale);
    }
    ctx.strokeStyle = '#9aa6ad'; ctx.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of world.city.streets) {
      ctx.beginPath(); ctx.moveTo(toX(line), y0); ctx.lineTo(toX(line), y0 + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, toY(line)); ctx.lineTo(x0 + size, toY(line)); ctx.stroke();
    }

    for (const car of world.allVehicles) {
      if (car.dead || car === world.player.car) continue;
      ctx.fillStyle = car.role === 'police' ? '#ff5a52' : '#dfe6ea';
      ctx.fillRect(toX(car.x) - 2, toY(car.z) - 2, 4, 4);
    }
    const m = world.story.marker;
    if (m) {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.moveTo(toX(m.x), toY(m.z) - 7); ctx.lineTo(toX(m.x) + 7, toY(m.z));
      ctx.lineTo(toX(m.x), toY(m.z) + 7); ctx.lineTo(toX(m.x) - 7, toY(m.z)); ctx.closePath(); ctx.fill();
    }
    // Player chevron.
    const yaw = world.player.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    ctx.fillStyle = '#5cf08a'; ctx.strokeStyle = '#08240f'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + fx * 9, cy + fz * 9);
    ctx.lineTo(cx - fz * 6 - fx * 5, cy + fx * 6 - fz * 5);
    ctx.lineTo(cx + fz * 6 - fx * 5, cy - fx * 6 - fz * 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.stroke();
    label(ctx, CITY.name, x0 + 4, y0 - 8, 13, '#ffffffdd');
  }

  drawWeapon(ctx, world) {
    const p = world.player;
    const w = WEAPONS[p.weapon];
    panel(ctx, W - 250, H - 116, 232, 96);
    label(ctx, `${p.weapon + 1} · ${w.name.toUpperCase()}`, W - 238, H - 88, 18, '#ffe6a8');
    const ammo = w.mag === 0 ? '∞' : `${p.mag[p.weapon]} / ${p.reserve[p.weapon]}`;
    label(ctx, ammo, W - 238, H - 48, 32, '#ffffff');
    label(ctx, '1 FIST  2 PISTOL  3 SMG  4 SHOTGUN  5 RIFLE', W - 238, H - 27, 11, '#ffffff99', 'left', 'normal');
  }

  drawObjective(ctx, world) {
    const s = world.story;
    if (!s || (!s.active && !s.done)) return;
    const width = 520, x = (W - width) / 2;
    panel(ctx, x, 16, width, s.done ? 44 : 68, 0.72);
    label(ctx, `${s.title}  ·  ${world.progress}/5 JOBS DONE`, x + 16, 40, 14, '#ffd24a');
    if (!s.done) {
      ctx.font = 'bold 17px sans-serif';
      ctx.fillStyle = '#ffffff';
      const words = s.objective.split(' ');
      let line = '', ly = 64;
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width > width - 32 && line) { ctx.fillText(line, x + 16, ly); line = word; ly += 20; }
        else line = next;
      }
      if (line) ctx.fillText(line, x + 16, ly);
    }
  }

  drawRadio(ctx, world) {
    const r = world.story && world.story.radio;
    if (!r) return;
    ctx.font = 'italic 20px sans-serif';
    const width = Math.min(900, ctx.measureText(r.text).width + 72);
    const x = (W - width) / 2, y = H - 74;
    panel(ctx, x, y, width, 46, 0.72);
    label(ctx, r.text, W / 2, y + 30, 20, '#ffe9b0', 'center', 'italic');
  }

  drawCrosshair(ctx, world) {
    const x = W / 2, y = H / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12);
    ctx.stroke();
  }

  drawHitFlash(ctx, world) {
    const a = Math.min(0.45, world.hitFlash * 0.9);
    const grad = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 720);
    grad.addColorStop(0, 'rgba(200,20,20,0)');
    grad.addColorStop(1, `rgba(200,20,20,${a})`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }

  drawTitle(ctx, world, view) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(8,20,32,0.15)');
    grad.addColorStop(0.6, 'rgba(8,20,32,0.55)');
    grad.addColorStop(1, 'rgba(8,20,32,0.92)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    label(ctx, 'AN ORIGINAL OPEN-WORLD HEIST', W / 2, 120, 20, '#ffd98a', 'center');
    label(ctx, 'MIRADOR BAY', W / 2, 214, 92, '#ffffff', 'center');
    label(ctx, 'S U N S E T   H E I S T', W / 2, 262, 30, '#ffcf6b', 'center');
    panel(ctx, W / 2 - 320, 312, 640, 104, 0.55);
    label(ctx, 'Kai Reyes is home. Five jobs, one city, no turning back.', W / 2, 350, 20, '#ffffff', 'center');
    label(ctx, 'Marisol Vega has the work. You have the wheels.', W / 2, 382, 18, '#cfdfec', 'center', 'normal');
    const pulse = 0.6 + 0.4 * Math.sin((view.elapsed || 0) * 3);
    label(ctx, 'PRESS ENTER TO DRIVE', W / 2, 500, 30, `rgba(255,235,150,${pulse.toFixed(2)})`, 'center');
    label(ctx, 'WASD move / drive   SHIFT run   SPACE jump or handbrake   E enter / exit', W / 2, 566, 16, '#dce8f0', 'center', 'normal');
    label(ctx, 'MOUSE aim   LEFT click fire   1-5 weapons   R reload   ESC pause', W / 2, 592, 16, '#dce8f0', 'center', 'normal');
    label(ctx, 'MIRADOR BAY  ·  KEYBOARD + MOUSE  ·  OFFLINE', W / 2, 666, 13, '#9fb3c4', 'center', 'normal');
  }

  drawPause(ctx, view) {
    rect(ctx, 0, 0, W, H, 'rgba(6,14,24,0.72)');
    label(ctx, 'PAUSED', W / 2, 220, 70, '#ffffff', 'center');
    const items = view.menuItems || ['RESUME', 'RESTART JOB', 'TOGGLE SOUND'];
    items.forEach((item, i) => {
      const selected = i === (view.menuIndex || 0);
      label(ctx, (selected ? '▶ ' : '   ') + item, W / 2, 320 + i * 54, selected ? 30 : 26, selected ? '#ffd766' : '#cfdae2', 'center');
    });
    label(ctx, 'ENTER select   ESC resume', W / 2, 560, 16, '#9fb3c4', 'center', 'normal');
  }

  drawDead(ctx) {
    rect(ctx, 0, 0, W, H, 'rgba(60,8,8,0.62)');
    label(ctx, 'BUSTED', W / 2, 330, 84, '#ffffff', 'center');
    label(ctx, 'The city keeps score. Respawning at the hospital…', W / 2, 380, 20, '#ffd6d6', 'center', 'normal');
  }
}
