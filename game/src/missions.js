// One job: the five-job story of Kai Reyes and Marisol Vega. Holds mission
// data and advances stages by reading the live world state.

import { makeVehicle } from './entities.js';
import { raiseWanted } from './police.js';
import { spawnEffect } from './combat.js';

export const MISSIONS = [
  {
    title: 'HOMECOMING', subtitle: 'Job 1 / 5', pay: 400,
    stages: [
      { kind:'goto', x:44, z:44, radius:11, text:'Walk to Solar Cafe on Plaza Street. Marisol is waiting.' },
      { kind:'goto', x:132, z:-132, radius:13, text:'Get to Mars\'s garage on the east side. Take any car.' },
    ],
    outro: 'Marisol: Good to have you back, Kai. The city missed you.',
  },
  {
    title: 'SET OF WHEELS', subtitle: 'Job 2 / 5', pay: 700,
    stages: [
      { kind:'goto', x:-220, z:300, radius:16, text:'The red Veltro is parked down by the marina.' },
      { kind:'enter', text:'Steal the Veltro and take the wheel.' },
      { kind:'goto', x:132, z:-132, radius:14, text:'Bring the Veltro back to the garage.' },
    ],
    outro: 'Marisol: Sweet ride. Our first real job is on.',
  },
  {
    title: 'HOT CARGO', subtitle: 'Job 3 / 5', pay: 1100,
    stages: [
      { kind:'goto', x:0, z:338, radius:14, text:'Pick up the crate at the harbour docks.' },
      { kind:'goto', x:-220, z:-220, radius:16, wanted:2, text:'Heat is on! Lose the cops and reach the safehouse.' },
    ],
    outro: 'Marisol: Clean. You\'re a natural behind the wheel.',
  },
  {
    title: 'RUSH HOUR', subtitle: 'Job 4 / 5', pay: 1400,
    stages: [
      { kind:'route', time:100, points:[[-264,176],[220,-176],[44,44]], radius:17, text:'Three drops across Mirador before the clock runs out.' },
    ],
    outro: 'Marisol: Nobody drives this city like you do.',
  },
  {
    title: 'THE BIG SCORE', subtitle: 'Job 5 / 5', pay: 3000,
    stages: [
      { kind:'goto', x:220, z:220, radius:13, text:'Brant\'s holdings on the north hill. Crack the vault.' },
      { kind:'hold', x:220, z:220, radius:13, duration:3, text:'Hold E to empty the vault.' },
      { kind:'goto', x:0, z:444, radius:15, wanted:4, text:'Grab the cash and get to the getaway boat at the pier!' },
    ],
    outro: 'Marisol: That\'s for the city, Kai. See you on the other side.',
  },
];

export function setRadio(world, text, ttl = 6) {
  world.story.radio = { text, ttl };
}

// Start a mission from its first stage, wiring up mission-specific props.
export function beginMission(world, index) {
  const mission = MISSIONS[index];
  if (!mission) return;
  world.story = {
    index, stage: 0, active: true, done: false,
    title: mission.title, objective: mission.stages[0].text,
    marker: null, timer: 0, hold: 0, cp: 0, nextTimer: 0,
    radio: null, targetVehicle: null,
  };
  if (index === 1) {
    // Park a distinctive red Veltro by the marina for the theft job.
    const car = makeVehicle(world.rng, 'veltro', {
      role: 'mission', color: 0xd6272f,
      lane: { x: -206, z: 300, yaw: 0, axis: 'z' },
    });
    car.speed = 0;
    world.allVehicles.push(car);
    world.story.targetVehicle = car;
  }
  if (index === 4) {
    spawnEffect(world, 'spark', 220, 2, 220, 0xffd76a, 10);
  }
  applyStage(world);
}

function applyStage(world) {
  const s = world.story;
  const mission = MISSIONS[s.index];
  const stage = mission.stages[s.stage];
  if (!stage) return;
  s.objective = stage.text;
  s.hold = 0;
  s.cp = 0;
  if (stage.kind === 'route') s.timer = stage.time;
  if (stage.wanted) raiseWanted(world, stage.wanted);
  let marker = null;
  if (stage.kind === 'goto' || stage.kind === 'hold') marker = { x: stage.x, z: stage.z, label: stage.kind === 'hold' ? 'VAULT' : 'DROP' };
  if (stage.kind === 'enter' && s.targetVehicle) marker = { x: s.targetVehicle.x, z: s.targetVehicle.z, label: 'CAR' };
  if (stage.kind === 'route') marker = { x: stage.points[0][0], z: stage.points[0][1], label: 'RUN' };
  s.marker = marker;
}

function advance(world) {
  const s = world.story;
  const mission = MISSIONS[s.index];
  s.stage++;
  if (s.stage >= mission.stages.length) {
    s.active = false;
    s.done = true;
    s.marker = null;
    s.objective = mission.outro;
    world.player.money += mission.pay;
    world.progress = Math.max(world.progress, s.index + 1);
    world.sfx.push('cash');
    setRadio(world, mission.outro, 9);
  } else {
    applyStage(world);
    world.sfx.push('beep');
  }
}

function near(world, x, z, radius) {
  return Math.hypot(world.player.x - x, world.player.z - z) <= radius;
}

// Called once per simulation step with the current interact input.
export function updateMissions(world, dt, interact, interactHeld) {
  const s = world.story;
  if (s.radio) { s.radio.ttl -= dt; if (s.radio.ttl <= 0) s.radio = null; }
  if (!s.active) return;

  const mission = MISSIONS[s.index];
  const stage = mission.stages[s.stage];
  if (!stage) return;

  if (stage.kind === 'goto') {
    if (near(world, stage.x, stage.z, stage.radius)) advance(world);
  } else if (stage.kind === 'enter') {
    if (s.targetVehicle && world.player.car === s.targetVehicle) advance(world);
    if (s.targetVehicle && s.targetVehicle.dead && s.targetVehicle !== world.player.car) {
      s.objective = 'The Veltro is wrecked. Find another ride.';
    }
  } else if (stage.kind === 'hold') {
    if (near(world, stage.x, stage.z, stage.radius) && interactHeld) {
      s.hold += dt;
      if (s.hold >= stage.duration) {
        spawnEffect(world, 'cash', 220, 2, 220, 0xffd76a, 26);
        raiseWanted(world, 4);
        advance(world);
      }
    }
  } else if (stage.kind === 'route') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.timer = stage.time;
      s.cp = 0;
      setRadio(world, 'Marisol: Too slow. Run it again.', 5);
      world.sfx.push('fail');
    }
    const point = stage.points[s.cp];
    s.marker = { x: point[0], z: point[1], label: `RUN ${s.cp + 1}/${stage.points.length}` };
    s.objective = `Checkpoint ${s.cp + 1}/${stage.points.length} — ${Math.ceil(s.timer)}s left.`;
    if (point && near(world, point[0], point[1], stage.radius)) {
      s.cp++;
      world.sfx.push('beep');
      if (s.cp >= stage.points.length) advance(world);
    }
  }
  if (s.marker && stage.kind === 'enter' && s.targetVehicle) {
    s.marker.x = s.targetVehicle.x; s.marker.z = s.targetVehicle.z;
  }
}
