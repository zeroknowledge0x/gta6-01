// One job: own the live game state and advance it one tick. Rendering reads
// this state; it never writes it. No three.js is imported here.

import { CITY, HERO_NAME } from './config.js';
import { makeRandom } from './random.js';
import { buildCity, resolveCollision } from './city.js';
import { spawnTraffic, spawnPedestrians, stepVehicle, updateTrafficDrivers, updatePedestrians } from './entities.js';
import { updateWanted, raiseWanted } from './police.js';
import { fireWeapon, reloadWeapon, updateBullets, updateEffects, handleCollisions } from './combat.js';
import { MISSIONS, beginMission, updateMissions, setRadio } from './missions.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function freshStory(world) {
  const index = clamp(world.progress, 0, MISSIONS.length - 1);
  world.story = {
    index, stage: 0, active: true, done: false,
    title: MISSIONS[index].title, objective: MISSIONS[index].stages[0].text,
    marker: null, timer: 0, hold: 0, cp: 0, nextTimer: 0,
    radio: null, targetVehicle: null,
  };
  beginMission(world, index);
}

export function createWorld(seed, progress = 0) {
  const rng = makeRandom(seed);
  const city = buildCity(seed);
  const player = {
    name: HERO_NAME, x: 44, z: 62, y: 0, yaw: 0,
    vx: 0, vz: 0, vy: 0, onGround: true,
    health: 100, armour: 25, money: 250,
    weapon: 1, lastShot: 0,
    mag: [0, 12, 30, 8, 20],
    reserve: [0, 48, 90, 24, 60],
    car: null, dead: false, needsRespawn: false,
  };
  const world = {
    seed, rng, city, time: 0, player, progress,
    allVehicles: [], traffic: [], police: [], pedestrians: [],
    bullets: [], effects: [], sfx: [],
    wanted: 0, wantedTimer: 0, lastCrime: 0, combatNoise: 0,
    invuln: 0, hitFlash: 0, shotsFired: 0,
    story: null, state: 'playing',
  };
  world.traffic = spawnTraffic(rng, 26);
  world.allVehicles.push(...world.traffic);
  world.pedestrians = spawnPedestrians(rng, 34);

  // A starter car parked outside the plaza so job one can be driven.
  const starter = spawnTraffic(rng, 1)[0];
  starter.x = 78; starter.z = 62; starter.yaw = Math.PI / 2; starter.speed = 0;
  starter.axis = 'z'; starter.line = 78;
  world.allVehicles.push(starter);

  freshStory(world);
  setRadio(world, 'Marisol: Kai? Plaza Street. Five minutes. Don\'t keep me waiting.', 8);
  return world;
}

function enterOrExitCar(world) {
  const p = world.player;
  if (p.car) {
    const sideX = Math.cos(p.car.yaw) * 3.2;
    const sideZ = -Math.sin(p.car.yaw) * 3.2;
    const spot = resolveCollision(world.city, p.x + sideX, p.z + sideZ, 0.6);
    p.x = spot.x; p.z = spot.z; p.y = 0;
    p.car.ctrl.throttle = 0;
    p.car.role = 'traffic';
    p.car = null;
    world.sfx.push('enter');
    return;
  }
  let best = null, bestD = 4.6;
  for (const car of world.allVehicles) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (best) {
    p.car = best;
    best.role = 'player';
    p.x = best.x; p.z = best.z; p.y = 0;
    world.sfx.push('enter');
  }
}

function updatePlayer(world, dt, input) {
  const p = world.player;
  if (p.dead) return;

  if (input.interact) enterOrExitCar(world);
  if (input.fire) fireWeapon(world);
  if (input.reload) reloadWeapon(world);

  const car = p.car;
  if (car && !car.dead) {
    car.ctrl.throttle = (input.forward > 0 ? 1 : 0) - (input.forward < 0 ? 1 : 0);
    car.ctrl.brake = input.brake ? 1 : 0;
    car.ctrl.steer = clamp(input.strafe, -1, 1);
    if (input.jump) car.ctrl.brake = 1; // handbrake
    p.x = car.x; p.z = car.z; p.yaw = car.yaw;
    p.vx = Math.sin(car.yaw) * car.speed;
    p.vz = Math.cos(car.yaw) * car.speed;
  } else {
    if (car && car.dead) p.car = null;
    const fwd = input.forward, strafe = input.strafe;
    const cy = input.camYaw;
    let dx = Math.sin(cy) * fwd + Math.cos(cy) * strafe;
    let dz = Math.cos(cy) * fwd - Math.sin(cy) * strafe;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const speed = input.run ? 10.5 : 5.8;
    p.vx = dx * speed; p.vz = dz * speed;
    const fixed = resolveCollision(world.city, p.x + p.vx * dt, p.z + p.vz * dt, 0.55);
    p.x = fixed.x; p.z = fixed.z;
    if (len > 0.01) p.yaw = Math.atan2(dx, dz);
    if (input.jump && p.onGround) {
      p.vy = 8.6; p.onGround = false; world.sfx.push('jump');
    }
  }

  p.vy -= 23 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
}

function respawn(world) {
  const p = world.player;
  p.dead = false; p.needsRespawn = false;
  p.health = 100; p.armour = 25;
  p.x = 44; p.z = 62; p.y = 0; p.vy = 0;
  p.car = null;
  world.wanted = 0; world.wantedTimer = 0;
  p.money = Math.max(0, p.money - 400);
  for (const car of world.police) car.dead = true;
  world.police.length = 0;
  setRadio(world, 'Marisol: The hospital called. sit down before you hurt the city.', 7);
}

// Advance the whole simulation one fixed tick.
export function stepWorld(world, dt, input) {
  world.time += dt;
  world.combatNoise = Math.max(0, world.combatNoise - dt);
  world.invuln = Math.max(0, world.invuln - dt);
  world.hitFlash = Math.max(0, world.hitFlash - dt);

  const p = world.player;
  if (p.needsRespawn) respawn(world);
  updatePlayer(world, dt, input);
  updateTrafficDrivers(world, dt);
  updateWanted(world, dt);

  const hardHits = [];
  for (const car of world.allVehicles) {
    if (stepVehicle(car, dt, world.city) && car.role === 'player') hardHits.push(car);
    if (car.hp <= 0 && !car.dead) car.dead = true;
  }
  handleCollisions(world, hardHits);

  updatePedestrians(world, dt);
  updateBullets(world, dt);
  updateEffects(world, dt);
  updateMissions(world, dt, input.interact, input.interactHeld);
  world.allVehicles = world.allVehicles.filter(v => !v.dead || v.role === 'mission' || v === p.car);
}

// Save just what a resume needs.
export function snapshot(world) {
  const p = world.player;
  return {
    x: p.x, z: p.z, money: p.money, health: p.health, armour: p.armour,
    progress: world.progress, mission: world.story.index, stage: world.story.stage,
    wanted: world.wanted,
  };
}

export function restore(world, data) {
  if (!data || typeof data !== 'object') return;
  const p = world.player;
  if (Number.isFinite(data.x)) p.x = data.x;
  if (Number.isFinite(data.z)) p.z = data.z;
  if (Number.isFinite(data.money)) p.money = data.money;
  if (Number.isFinite(data.health)) p.health = Math.max(1, data.health);
  if (Number.isFinite(data.armour)) p.armour = data.armour;
  if (Number.isFinite(data.progress)) {
    world.progress = clamp(data.progress | 0, 0, 5);
    beginMission(world, clamp(world.progress, 0, MISSIONS.length - 1));
  }
  if (Number.isFinite(data.wanted) && data.wanted > 0) raiseWanted(world, data.wanted);
}
