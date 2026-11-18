// One job: boot the game. Owns input, the frame loop, menus and saves, and
// drives the deterministic screenshot capture without animation frames.

import { createWorld, stepWorld, snapshot, restore } from './world.js';
import { GameRenderer } from './render.js';
import { AudioEngine } from './audio.js';
import { poseShot } from './shots.js';
import { beginMission } from './missions.js';

window.addEventListener('error', (event) => {
  document.body.dataset.bootError = `${event.message} @ ${event.filename}:${event.lineno}`;
});
window.addEventListener('unhandledrejection', (event) => {
  document.body.dataset.bootError = String(event.reason);
});

const SAVE_KEY = 'mirador-bay-save-v1';
const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;
const shotMode = !!shotName;

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

const world = createWorld(seed, shotMode ? 0 : ((readSave() || {}).progress || 0));
const renderer = new GameRenderer(canvas, world, shotMode);
const audio = new AudioEngine();

let view = {
  state: 'title', elapsed: 0, camYaw: 0,
  menuItems: ['RESUME', 'RESTART JOB', 'TOGGLE SOUND'], menuIndex: 0,
  fixedCamera: null,
};

const keys = new Set();
let mouseDown = false;
let prevE = false, prevR = false;
let saveTimer = 0, muted = false;

const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

window.addEventListener('keydown', (event) => {
  if (BLOCKED.has(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;

  if (event.code === 'Escape') {
    if (view.state === 'playing') view.state = 'paused';
    else if (view.state === 'paused') view.state = 'playing';
    return;
  }
  if (event.code === 'Enter') { handleEnter(); return; }
  if (view.state === 'paused') {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') view.menuIndex = (view.menuIndex + 2) % 3;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') view.menuIndex = (view.menuIndex + 1) % 3;
    return;
  }
  const slots = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
  const slot = slots.indexOf(event.code);
  if (slot >= 0 && view.state === 'playing') {
    world.player.weapon = slot;
    world.sfx.push('beep');
  }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  mouseDown = true;
  try { canvas.requestPointerLock(); } catch { /* optional */ }
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas && view.state === 'playing') {
    view.camYaw += event.movementX * 0.0032;
  }
});
window.addEventListener('resize', () => {
  if (shotMode) return;
  renderer.resize(Math.max(640, window.innerWidth), Math.max(400, window.innerHeight));
});

function handleEnter() {
  if (view.state === 'title') {
    audio.start();
    view.state = 'playing';
    const saved = readSave();
    if (saved) restore(world, saved);
    return;
  }
  if (view.state === 'paused') {
    const choice = view.menuIndex;
    if (choice === 0) view.state = 'playing';
    if (choice === 1) { beginMission(world, world.story.index); view.state = 'playing'; }
    if (choice === 2) { muted = !muted; audio.setMuted(muted); }
    return;
  }
  if (view.state === 'playing' && world.story.done) {
    if (world.progress >= 5) {
      world.story.done = false;
      world.story.objective = 'Free roam — the city is yours.';
    } else {
      beginMission(world, world.progress);
    }
  }
}

const EMPTY_INPUT = {
  forward: 0, strafe: 0, run: false, jump: false, brake: false,
  fire: false, reload: false, interact: false, interactHeld: false, camYaw: 0,
};

function readInput() {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const eDown = keys.has('KeyE');
  const rDown = keys.has('KeyR');
  const input = {
    forward, strafe,
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
    brake: keys.has('ControlLeft') || keys.has('KeyC'),
    fire: mouseDown || keys.has('KeyF'),
    interact: eDown && !prevE,
    interactHeld: eDown,
    reload: rDown && !prevR,
    camYaw: view.camYaw,
  };
  prevE = eDown; prevR = rDown;
  return input;
}

// ---------- deterministic capture ----------

function shotFrame(frameNumber) {
  try {
    document.body.dataset.shotStage = 'frame' + frameNumber;
    // The pose is final: shot frames only draw it. Stepping here would let a
    // mission trigger or wanted decay change the frame between runs.
    renderer.sync(world, view, 1 / 60);
    renderer.render();
    if (frameNumber >= 5) {
      document.body.dataset.shotStage = 'capture';
      document.body.dataset.shotData = canvas.toDataURL('image/jpeg', 0.88);
      document.body.dataset.shotReady = shotName;
      document.body.dataset.shotW = String(canvas.width);
    }
  } catch (error) {
    document.body.dataset.shotError = String(error && error.stack ? error.stack : error);
    document.body.dataset.shotReady = 'error';
  }
}

function runShot() {
  try {
    view = poseShot(world, shotName);
    document.body.dataset.shotStage = 'posed';
  } catch (error) {
    document.body.dataset.shotError = 'pose: ' + String(error && error.stack ? error.stack : error);
    document.body.dataset.shotReady = 'error';
    return;
  }
  let t = 0, frame = 0;
  while (!document.body.dataset.shotReady && t < 60000) {
    t += 17;
    frame++;
    shotFrame(frame);
  }
  if (!document.body.dataset.shotReady) document.body.dataset.shotReady = 'timeout';
}

// ---------- ordinary play ----------

let last = performance.now();
function frameLoop(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  view.elapsed += dt;

  if (view.state === 'playing') {
    stepWorld(world, dt, readInput());
    audio.update(world, dt);
    audio.consume(world.sfx);
    if (world.player.dead) view.state = 'dead';
    saveTimer += dt;
    if (saveTimer > 4) { saveTimer = 0; writeSave(snapshot(world)); }
  } else {
    audio.consume(world.sfx);
  }
  if (view.state === 'dead' && !world.player.dead) view.state = 'playing';

  renderer.camYaw = view.camYaw;
  renderer.sync(world, view, dt);
  renderer.render();
  requestAnimationFrame(frameLoop);
}

if (shotMode) runShot();
else {
  writeSave({ progress: world.progress });
  requestAnimationFrame(frameLoop);
}
