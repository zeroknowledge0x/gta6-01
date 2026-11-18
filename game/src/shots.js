// One job: pose the world for the four deterministic screenshots. Every pose
// is written from a fixed seed, so a name always produces the same frame.

import { makeVehicle } from './entities.js';
import { raiseWanted } from './police.js';

function camera(tx, ty, tz, px, py, pz) {
  return { pos: [px, py, pz], target: [tx, ty, tz] };
}

function putPolice(world, x, z, yaw, flash) {
  const car = makeVehicle(world.rng, 'lark', {
    role: 'police', color: 0xf1f2ee,
    lane: { x, z, yaw, axis: 'z' },
  });
  car.speed = 17;
  car.flash = flash;
  car.hp = 500; car.maxHp = 500;
  world.allVehicles.push(car);
  world.police.push(car);
  return car;
}

function armPlayer(world, weapon, mag, reserve) {
  const p = world.player;
  p.weapon = weapon;
  p.mag[weapon] = mag;
  p.reserve[weapon] = reserve;
}

function setObjective(world, title, objective, marker, progress, done = false) {
  world.story.title = title;
  world.story.objective = objective;
  world.story.marker = marker;
  world.story.active = !done;
  world.story.done = done;
  world.progress = progress;
}

function trafficAround(world, spots) {
  world.traffic.forEach((car, i) => {
    if (i >= spots.length) {
      // Park the rest of the fleet well outside every fixed camera.
      car.x = -1200 - i * 9; car.z = -1200; car.dead = false;
      return;
    }
    const s = spots[i];
    car.x = s[0]; car.z = s[1]; car.yaw = s[2];
    car.axis = s[3] || 'x';
    car.speed = s[4] || 9;
    car.dead = false; car.hp = car.maxHp;
  });
}

function peopleAround(world, spots) {
  world.pedestrians.slice(0, spots.length).forEach((ped, i) => {
    ped.x = spots[i][0]; ped.z = spots[i][1];
    ped.yaw = spots[i][2]; ped.dead = false; ped.hp = 40;
  });
}

// The cover: a four-star getaway chase at the central crossroads.
function poseCover(world) {
  const p = world.player;
  const getaway = makeVehicle(world.rng, 'veltro', {
    role: 'player', color: 0xd6272f,
    lane: { x: 0, z: 0, yaw: Math.PI, axis: 'z' },
  });
  getaway.speed = 34;
  world.allVehicles.push(getaway);
  p.car = getaway; p.x = 0; p.z = 0; p.y = 0; p.yaw = Math.PI;
  p.health = 86; p.armour = 42; p.money = 12450;
  armPlayer(world, 2, 22, 78);

  raiseWanted(world, 4);
  world.wantedTimer = 19;
  world.time = 37;
  putPolice(world, -7, 1, Math.PI, 1);
  putPolice(world, 8, 3, Math.PI + 0.1, 0);
  putPolice(world, -11, 9, Math.PI - 0.2, 0);
  putPolice(world, 10, 12, Math.PI + 0.2, 1);

  trafficAround(world, [
    [-70, 60, Math.PI / 2, 'x', 12], [70, 60, -Math.PI / 2, 'x', 9],
    [0, 132, 0, 'z', 11], [0, -120, Math.PI, 'z', 14],
    [88, -60, 0, 'z', 8], [-88, -60, Math.PI, 'z', 10],
  ]);
  peopleAround(world, [[-12, 8, 1.2], [13, 7, -0.8], [-11, -9, 2.2], [12, -11, 0.4], [-40, 10, 1.5]]);

  world.bullets.push({ x: -6, y: 1.4, z: 15, vx: 4, vy: 0.5, vz: -72, life: 0.5, damage: 7, team: 'police', targetSpeed: 0 });
  world.bullets.push({ x: 4, y: 1.3, z: 22, vx: -3, vy: 0.2, vz: -78, life: 0.5, damage: 7, team: 'police', targetSpeed: 0 });
  world.effects.push({ kind: 'spark', x: -3, y: 0.7, z: 2, vx: 3, vy: 5, vz: -4, life: 0.6, maxLife: 1.6, color: 0xffc857, size: 0.8 });
  world.effects.push({ kind: 'smoke', x: 2, y: 0.6, z: 4, vx: 1, vy: 3, vz: 2, life: 1.1, maxLife: 1.6, color: 0x60666d, size: 1.3 });
  world.effects.push({ kind: 'smoke', x: -1, y: 0.5, z: 7, vx: -1, vy: 3, vz: 2, life: 1.2, maxLife: 1.6, color: 0x737a80, size: 1.1 });

  setObjective(world, 'THE BIG SCORE', 'Grab the cash and get to the getaway boat at the pier!', { x: 0, z: 444, label: 'BOAT' }, 4);
  world.story.radio = { text: 'Marisol: The whole city is onto you. Get to the pier!', ttl: 9 };
  return { state: 'playing', elapsed: 4, menuItems: [], menuIndex: 0,
    fixedCamera: camera(0, 1.5, 3, 6, 3.4, -13) };
}

// The city on foot: plaza, traffic, people and towers in the sun.
function poseStreets(world) {
  const p = world.player;
  p.car = null; p.x = 44; p.z = 48; p.y = 0; p.yaw = -0.3;
  p.health = 100; p.armour = 25; p.money = 850;
  armPlayer(world, 1, 12, 48);
  world.wanted = 0; world.police.length = 0; world.wantedTimer = 0;
  world.time = 22;
  trafficAround(world, [
    [0, 20, Math.PI / 2, 'x', 13], [0, -24, -Math.PI / 2, 'x', 11],
    [88, 60, Math.PI, 'z', 12], [88, 20, 0, 'z', 14],
    [-20, 88, -Math.PI / 2, 'x', 10], [40, 88, Math.PI / 2, 'x', 12],
  ]);
  peopleAround(world, [
    [50, 46, 0.6], [58, 54, 2.1], [36, 60, 1.2], [30, 40, -1.0],
    [62, 36, 2.8], [48, 70, 0.2], [22, 52, 1.6],
  ]);
  setObjective(world, 'HOMECOMING', 'Walk to Solar Cafe on Plaza Street. Marisol is waiting.', { x: 44, z: 44, label: 'CAFE' }, 0);
  return { state: 'playing', elapsed: 2, menuItems: [], menuIndex: 0,
    fixedCamera: camera(44, 1.7, 48, 26, 3.2, 64) };
}

// A mission moment: the harbour heist, gunfire and a wanted level.
function poseMission(world) {
  const p = world.player;
  p.car = null; p.x = 12; p.z = 336; p.y = 0; p.yaw = 0.15;
  p.health = 74; p.armour = 58; p.money = 5420;
  armPlayer(world, 3, 5, 21);
  raiseWanted(world, 4);
  world.wantedTimer = 16;
  world.time = 58;
  putPolice(world, 16, 346, 0, 1);
  putPolice(world, -18, 350, 0.4, 0);
  putPolice(world, 6, 356, 0.1, 1);
  trafficAround(world, [
    [0, 300, Math.PI / 2, 'x', 10], [40, 320, -Math.PI / 2, 'x', 12],
    [-40, 300, Math.PI / 2, 'x', 9], [0, 264, Math.PI, 'z', 11],
  ]);
  peopleAround(world, [[22, 332, 1.1], [-18, 330, -0.6], [4, 320, 2.4]]);
  world.bullets.push({ x: 14, y: 1.4, z: 344, vx: 2, vy: 0, vz: 84, life: 0.5, damage: 13, team: 'player', targetSpeed: 0 });
  world.effects.push({ kind: 'spark', x: 18, y: 1.5, z: 352, vx: 4, vy: 6, vz: 2, life: 0.5, maxLife: 1.6, color: 0xffd27a, size: 0.7 });
  world.effects.push({ kind: 'cash', x: 10, y: 2, z: 340, vx: 1, vy: 5, vz: 1, life: 0.9, maxLife: 1.6, color: 0xffd76a, size: 0.9 });
  setObjective(world, 'THE BIG SCORE', 'Hold E to empty the vault — then reach the getaway boat.', { x: 220, z: 220, label: 'VAULT' }, 4);
  world.story.radio = { text: 'Marisol: Move it, Kai! The harbour is crawling.', ttl: 8 };
  return { state: 'playing', elapsed: 6, menuItems: [], menuIndex: 0,
    fixedCamera: camera(12, 1.5, 338, 2, 3.4, 320) };
}

// The title screen floats over a wide skyline shot of the whole city.
function poseTitle(world) {
  const p = world.player;
  p.car = null; p.x = 44; p.z = 62; p.y = 0; p.yaw = 0;
  world.wanted = 0; world.police.length = 0;
  world.time = 12;
  trafficAround(world, [
    [0, 88, Math.PI / 2, 'x', 13], [88, 0, 0, 'z', 12],
    [-88, -44, Math.PI, 'z', 10], [176, 88, -Math.PI / 2, 'x', 11],
  ]);
  setObjective(world, 'HOMECOMING', 'Walk to Solar Cafe on Plaza Street.', { x: 44, z: 44, label: 'CAFE' }, 0);
  return { state: 'title', elapsed: 1.2, menuItems: [], menuIndex: 0,
    fixedCamera: camera(10, 6, 40, -170, 92, 250) };
}

const POSES = { cover: poseCover, streets: poseStreets, mission: poseMission, title: poseTitle };

export function poseShot(world, name) {
  const pose = POSES[name] || POSES.streets;
  return pose(world);
}
