// One job: wanted level and police behaviour. Stars rise on crime, decay when
// the player slips away, and dispatch cars that chase, block and shoot.

import { makeVehicle } from './entities.js';
import { randomLanePoint } from './city.js';
import { spawnBullet } from './combat.js';

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Raise the wanted level to at least `stars`, restarting the escape clock.
export function raiseWanted(world, stars) {
  const before = world.wanted;
  world.wanted = clamp(Math.max(world.wanted, Math.round(stars)), 0, 5);
  if (world.wanted > before) world.wantedTimer = 24;
  world.lastCrime = world.time;
}

// One more star for a fresh crime.
export function commitCrime(world) {
  raiseWanted(world, world.wanted + 1);
}

function spawnPoliceCar(world) {
  const lane = randomLanePoint(world.rng);
  // Place the unit a little way off so it arrives rather than appearing on top of the player.
  lane.x = clamp(lane.x + (lane.x > world.player.x ? 90 : -90), -330, 330);
  lane.z = clamp(lane.z + (lane.z > world.player.z ? 90 : -90), -330, 330);
  const car = makeVehicle(world.rng, 'lark', { role: 'police', lane, color: 0xf1f2ee });
  car.speed = 14;
  car.lastShot = 0;
  world.allVehicles.push(car);
  world.police.push(car);
  return car;
}

// A target ahead of a moving player, so units can try to cut the player off.
function pursueTarget(world, v) {
  const px = world.player.x, pz = world.player.z;
  const host = world.player.car;
  const vx = host ? Math.sin(host.yaw) * host.speed : 0;
  const vz = host ? Math.cos(host.yaw) * host.speed : 0;
  const lead = clamp(Math.abs(v.speed) * 0.6, 0, 10);
  const heavy = v.id % 2 === 0 && world.wanted >= 3;
  return {
    x: px + vx * (heavy ? 0.9 : 0.15) + Math.sin(v.yaw) * lead,
    z: pz + vz * (heavy ? 0.9 : 0.15) + Math.cos(v.yaw) * lead,
  };
}

function drivePolice(world, v, dt) {
  const target = pursueTarget(world, v);
  const dx = target.x - v.x, dz = target.z - v.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  v.ctrl.steer = clamp(angleDiff(desired, v.yaw) * 1.9, -1, 1);
  v.ctrl.throttle = dist > 13 ? 1 : 0.25;
  v.ctrl.brake = dist < 8 && v.speed > 12 ? 1 : 0;
  v.flash = Math.floor(world.time * 6 + v.id * 3) % 2;

  // Keen units shoot from the window once the chase is serious.
  if (world.wanted >= 2 && dist < 34 && world.time - v.lastShot > 0.55 && !v.dead) {
    v.lastShot = world.time;
    const speedTrg = world.player.car ? 16 : 0;
    spawnBullet(world,
      v.x + Math.sin(v.yaw) * 1.4, 1.35, v.z + Math.cos(v.yaw) * 1.4,
      world.player.x, 1.2, world.player.z,
      62, 7, 'police', speedTrg);
  }
}

export function updateWanted(world, dt) {
  if (world.wanted <= 0) {
    if (world.police.length) {
      for (const car of world.police) car.dead = true;
      world.police.length = 0;
    }
    return;
  }

  // Stars fade only while no unit has eyes on the player.
  let nearest = 999;
  for (const car of world.police) {
    if (car.dead) continue;
    nearest = Math.min(nearest, Math.hypot(car.x - world.player.x, car.z - world.player.z));
  }
  const seen = nearest < 58;
  world.wantedTimer -= dt * (seen ? 0.32 : 1);
  if (world.time - world.lastCrime > 4 && world.wantedTimer <= 0) {
    world.wanted--;
    world.wantedTimer = world.wanted > 0 ? 20 : 0;
    world.lastCrime = world.time;
  }

  const target = Math.min(world.wanted, 5);
  world.police = world.police.filter(c => !c.dead);
  while (world.police.length < target) spawnPoliceCar(world);
  while (world.police.length > target) {
    const extra = world.police.pop();
    if (extra) extra.dead = true;
  }
  for (const car of world.police) drivePolice(world, car, dt);
}
