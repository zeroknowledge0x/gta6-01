// One job: shooting, damage and transient effects. Bullets are simple moving
// points with team filters; effects are pooled particles the renderer draws.

import { WEAPONS } from './config.js';
import { between } from './random.js';
import { raiseWanted } from './police.js';

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function spawnEffect(world, kind, x, y, z, color, count) {
  for (let i = 0; i < count; i++) {
    if (world.effects.length >= 320) break;
    const a = world.rng() * Math.PI * 2;
    const up = between(world.rng, kind === 'smoke' ? 1 : 2, kind === 'smoke' ? 5 : 12);
    const out = between(world.rng, 0, kind === 'fire' ? 6 : 9);
    world.effects.push({
      kind, x, y, z,
      vx: Math.sin(a) * out, vy: up, vz: Math.cos(a) * out,
      life: between(world.rng, 0.35, kind === 'smoke' ? 1.6 : 0.9),
      maxLife: 1.6, color, size: between(world.rng, 0.3, 1.1),
    });
  }
}

export function updateEffects(world, dt) {
  for (let i = world.effects.length - 1; i >= 0; i--) {
    const e = world.effects[i];
    e.life -= dt;
    if (e.life <= 0) { world.effects.splice(i, 1); continue; }
    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
    e.vy -= (e.kind === 'smoke' ? 1.5 : 18) * dt;
    e.vx *= 1 - dt * 1.2; e.vz *= 1 - dt * 1.2;
    if (e.y < 0.2) { e.y = 0.2; e.vy *= -0.25; }
  }
}

// Fire a projectile from an origin toward a point, with a little spread.
export function spawnBullet(world, ox, oy, oz, tx, ty, tz, speed, damage, team, targetSpeed = 0) {
  if (world.bullets.length >= 180) return;
  const dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  const spread = team === 'police' ? 0.055 : 0.022;
  const vx = dx / len * speed + between(world.rng, -spread, spread) * speed;
  const vy = dy / len * speed + between(world.rng, -spread, spread) * speed * 0.4;
  const vz = dz / len * speed + between(world.rng, -spread, spread) * speed;
  const range = team === 'police' ? 48 : 70;
  world.bullets.push({
    x: ox, y: oy, z: oz, vx, vy, vz,
    life: range / speed, damage, team, targetSpeed,
  });
}

export function damageVehicle(world, v, amount) {
  if (v.dead) return;
  v.hp -= amount;
  if (v.hp <= 0) {
    v.dead = true;
    v.speed = 0;
    spawnEffect(world, 'fire', v.x, 1.2, v.z, 0xff9a3c, 26);
    spawnEffect(world, 'smoke', v.x, 1.8, v.z, 0x555a60, 16);
    world.sfx.push('explosion');
    if (v.role === 'police') world.sfx.push('sirenOff');
  }
}

export function damagePed(world, p, amount) {
  if (p.dead) return;
  p.hp -= amount;
  if (p.hp <= 0) {
    p.dead = true;
    p.downTimer = 20;
    spawnEffect(world, 'spark', p.x, 1, p.z, 0xcc4455, 6);
  }
}

export function damagePlayer(world, amount) {
  const p = world.player;
  if (p.dead || world.invuln > 0) return;
  let left = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, left * 0.65);
    p.armour -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  world.invuln = 0.12;
  world.hitFlash = 0.35;
  world.sfx.push('hurt');
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    p.needsRespawn = true;
  }
}

function nearestTarget(world) {
  let best = null, bestD = 42;
  for (const car of world.allVehicles) {
    if (car.dead || car === world.player.car) continue;
    const d = Math.hypot(car.x - world.player.x, car.z - world.player.z);
    if (d < bestD && (car.role === 'police' || world.wanted > 0)) { best = car; bestD = d; }
  }
  return best;
}

// Player pull of the trigger: rate-limited by the selected weapon.
export function fireWeapon(world) {
  const p = world.player;
  if (p.dead || world.time - p.lastShot < 1 / WEAPONS[p.weapon].rate) return;
  const w = WEAPONS[p.weapon];

  if (w.id === 'fists') {
    p.lastShot = world.time;
    world.sfx.push('swing');
    for (const ped of world.pedestrians) {
      if (ped.dead) continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < w.range && (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) > d * 0.4) damagePed(world, ped, w.damage);
    }
    return;
  }
  if (p.mag[p.weapon] <= 0) { world.sfx.push('dry'); return; }
  p.lastShot = world.time;
  p.mag[p.weapon]--;
  world.shotsFired++;
  world.combatNoise = 3.2;
  world.sfx.push(w.id === 'shotgun' ? 'boom' : 'shot');

  const originY = p.car ? 1.7 : 1.35;
  const ox = p.x + Math.sin(p.yaw) * (p.car ? 2.2 : 0.7);
  const oz = p.z + Math.cos(p.yaw) * (p.car ? 2.2 : 0.7);
  let tx, ty, tz;
  const target = nearestTarget(world);
  if (target) { tx = target.x; ty = 1.2; tz = target.z; }
  else {
    tx = ox + Math.sin(p.yaw) * w.range;
    ty = originY + 0.5;
    tz = oz + Math.cos(p.yaw) * w.range;
  }
  for (let i = 0; i < w.pellets; i++) {
    spawnBullet(world, ox, originY, oz, tx, ty, tz, w.speed, w.damage, 'player');
  }
  spawnEffect(world, 'spark', ox, originY, oz, 0xffd27a, 3);

  if (world.wanted === 0 || world.shotsFired % 7 === 0) raiseWanted(world, world.wanted + 1);
}

export function reloadWeapon(world) {
  const p = world.player;
  const w = WEAPONS[p.weapon];
  if (w.mag === 0 || p.mag[p.weapon] >= w.mag || p.reserve[p.weapon] <= 0) return;
  const need = w.mag - p.mag[p.weapon];
  const take = Math.min(need, p.reserve[p.weapon]);
  p.mag[p.weapon] += take;
  p.reserve[p.weapon] -= take;
  world.sfx.push('reload');
}

// Move every bullet, apply the first hit it finds, retire it.
export function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    b.vy -= 9 * dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
    let hit = false;

    if (b.team === 'police') {
      const p = world.player;
      if (!p.dead && Math.hypot(nx - p.x, nz - p.z) < (p.car ? 2.1 : 0.95) && ny < 2.6 && ny > 0.1) {
        damagePlayer(world, b.damage);
        hit = true;
      }
    } else {
      for (const car of world.allVehicles) {
        if (car.dead || car === world.player.car) continue;
        if (Math.hypot(nx - car.x, nz - car.z) < 2.0 && ny < car.spec.h + car.spec.cab + 0.5) {
          damageVehicle(world, car, b.damage);
          spawnEffect(world, 'spark', nx, ny, nz, 0xffc857, 4);
          hit = true;
          break;
        }
      }
      if (!hit) for (const ped of world.pedestrians) {
        if (ped.dead) continue;
        if (Math.hypot(nx - ped.x, nz - ped.z) < 0.8 && ny < 2.1) {
          damagePed(world, ped, b.damage);
          spawnEffect(world, 'spark', nx, ny, nz, 0xcc4455, 5);
          hit = true;
          break;
        }
      }
    }
    if (hit || b.life <= 0 || ny < 0 || ny > 60 || Math.abs(nx) > 500 || Math.abs(nz) > 500) {
      world.bullets.splice(i, 1);
    } else { b.x = nx; b.y = ny; b.z = nz; }
  }
}

// Ramming a car at speed hurts it and alerts the police.
export function handleCollisions(world, hardHits) {
  for (const car of hardHits) {
    if (car !== world.player.car) continue;
    damageVehicle(world, car, 4);
    const peds = world.pedestrians;
    for (const ped of peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.4) damagePed(world, ped, 90);
    }
    raiseWanted(world, Math.max(world.wanted, 1));
    world.sfx.push('crash');
  }
}
