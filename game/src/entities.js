// One job: make cars and people, and move them. Traffic follows lanes; people
// wander pavements. Physics for a single car is shared by every role.

import { CITY, VEHICLE_BY_ID, VEHICLE_TYPES } from './config.js';
import { makeRandom, between, choose, chance } from './random.js';
import { randomLanePoint, resolveCollision } from './city.js';

let nextId = 1;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function makeVehicle(rng, typeId, options = {}) {
  const spec = VEHICLE_BY_ID[typeId] || choose(rng, VEHICLE_TYPES);
  const color = options.color !== undefined ? options.color : choose(rng, spec.colors);
  const lane = options.lane || randomLanePoint(rng);
  return {
    id: nextId++, typeId: spec.id, spec, color,
    x: lane.x, z: lane.z, y: 0,
    yaw: lane.yaw, speed: 0,
    axis: lane.axis, line: lane.axis === 'x' ? lane.z : lane.x, dir: lane.yaw === Math.PI / 2 || lane.yaw === 0 ? 1 : -1,
    ctrl: { throttle: 0, steer: 0, brake: 0 },
    role: options.role || 'traffic',
    hp: spec.mass * 100, maxHp: spec.mass * 100,
    dead: false, blink: 0, flash: 0,
    patrolTimer: 0,
  };
}

export function spawnTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const type = choose(rng, VEHICLE_TYPES.slice(0, 6));
    const car = makeVehicle(rng, type.id, { role: 'traffic' });
    car.speed = between(rng, 8, 20);
    cars.push(car);
  }
  return cars;
}

export function makePedestrian(rng, options = {}) {
  const lane = options.lane || randomPavementPoint(rng);
  return {
    id: nextId++, x: lane.x, z: lane.z, yaw: lane.yaw,
    tx: lane.x, tz: lane.z,
    speed: between(rng, 0.9, 1.7),
    shirt: options.shirt !== undefined ? options.shirt : choose(rng, [0xd85b4a, 0x3f7fb0, 0xe0b64e, 0x4f9b7a, 0x8a5fa8, 0xefeee6]),
    skin: choose(rng, [0xe8bd92, 0xc98d61, 0x8d5b3c, 0xf0d2b0, 0x6f4630]),
    hp: 40, dead: false, downTimer: 0, scared: 0,
    bob: rng() * 6.28,
  };
}

function randomPavementPoint(rng) {
  const lines = [];
  for (let k = CITY.gridMin; k <= CITY.gridMax; k++) lines.push(k * CITY.pitch);
  const vertical = chance(rng, 0.5);
  const line = choose(rng, lines);
  const along = between(rng, -320, 300);
  const side = chance(rng, 0.5) ? 1 : -1;
  const off = side * (CITY.roadWidth / 2 + between(rng, 2.5, 5.5));
  return vertical
    ? { x: line + off, z: along, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 }
    : { x: along, z: line + off, yaw: side > 0 ? Math.PI : 0 };
}

export function spawnPedestrians(rng, count) {
  const people = [];
  for (let i = 0; i < count; i++) people.push(makePedestrian(rng));
  return people;
}

// Move one car from its controls. Returns true when it hit something hard.
export function stepVehicle(v, dt, city) {
  if (v.dead) return false;
  const spec = v.spec;
  const damaged = v.hp < v.maxHp * 0.45;
  const power = spec.accel * (damaged ? 0.7 : 1);
  v.speed += v.ctrl.throttle * power * dt;
  if (v.ctrl.brake) v.speed -= power * 2.1 * dt;
  const rolling = v.speed * 0.42 * dt + Math.sign(v.speed) * 0.7 * dt;
  v.speed -= Math.abs(v.speed) < Math.abs(rolling) ? v.speed : rolling;
  const top = spec.top * (damaged ? 0.72 : 1);
  v.speed = clamp(v.speed, -top * 0.4, top);

  const gripScale = clamp(Math.abs(v.speed) / 6, 0, 1);
  v.yaw += v.ctrl.steer * spec.grip * gripScale * Math.sign(v.speed || 1) * dt;

  const nx = v.x + Math.sin(v.yaw) * v.speed * dt;
  const nz = v.z + Math.cos(v.yaw) * v.speed * dt;
  const fixed = resolveCollision(city, nx, nz, Math.max(spec.w, spec.l) * 0.42);
  const moved = Math.hypot(fixed.x - nx, fixed.z - nz);
  v.x = fixed.x; v.z = fixed.z;
  if (moved > 0.02 && Math.abs(v.speed) > 8) {
    v.hp -= Math.abs(v.speed) * 0.6;
    v.speed *= 0.45;
    return true;
  }
  return false;
}

// Keep a traffic car in its lane and moving; wrap it around at the city edge.
export function updateTrafficDrivers(world, dt) {
  for (const v of world.traffic) {
    if (v.dead) continue;
    const along = v.axis === 'x' ? v.x : v.z;
    let throttle = 1, brake = 0, steer = 0;

    // Slow for the car directly ahead in this lane.
    let nearest = 999;
    for (const other of world.allVehicles) {
      if (other === v || other.dead) continue;
      const dx = other.x - v.x, dz = other.z - v.z;
      const forward = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
      const sideways = Math.abs(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw));
      if (forward > 0 && forward < nearest && sideways < 3.2) nearest = forward;
    }
    if (nearest < 13) { throttle = 0; brake = nearest < 7 ? 1 : 0.4; }

    // Lane centring and a lazy target speed.
    const cross = v.axis === 'x' ? v.z - v.line : v.x - v.line;
    steer = clamp(-cross * 0.09, -0.5, 0.5);
    if (v.speed > 22) throttle = 0;

    // If a pedestrian wanders into the road, brake for them.
    for (const p of world.pedestrians) {
      if (p.dead) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      const forward = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
      const sideways = Math.abs(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw));
      if (forward > 0 && forward < 9 && sideways < 2.2) { brake = 1; throttle = 0; break; }
    }

    v.ctrl.throttle = throttle; v.ctrl.brake = brake; v.ctrl.steer = steer;

    if (along > 348 || along < -348) {
      const reset = along > 0 ? -336 : 336;
      if (v.axis === 'x') v.x = reset; else v.z = reset;
      v.speed = Math.abs(v.speed) * 0.7;
    }
  }
}

// People walk toward a target on the pavement, then choose another one.
export function updatePedestrians(world, dt) {
  for (const p of world.pedestrians) {
    if (p.dead) { p.downTimer -= dt; continue; }
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.6) {
      const spot = randomPavementPoint(world.rng);
      p.tx = spot.x; p.tz = spot.z;
      continue;
    }
    let speed = p.speed;
    // Run from a nearby gunfight.
    if (world.combatNoise > 0) {
      const pd = Math.hypot(world.player.x - p.x, world.player.z - p.z);
      if (pd < 22) { speed *= 2.1; p.scared = 2; }
    }
    p.yaw = Math.atan2(dx, dz);
    const nx = p.x + Math.sin(p.yaw) * speed * dt;
    const nz = p.z + Math.cos(p.yaw) * speed * dt;
    const fixed = resolveCollision(world.city, nx, nz, 0.45);
    p.x = fixed.x; p.z = fixed.z;
    p.bob += dt * speed * 3;
    if (p.scared > 0) p.scared -= dt;
  }
}

// A fresh traffic car at a given lane (used by missions and police backup).
export function makeMissionVehicle(rng, typeId, lane) {
  return makeVehicle(rng, typeId, { role: 'mission', lane });
}
