// One job: generate and query the static layout of Mirador Bay. Produces pure
// data (blocks, buildings, trees, signs, props) that render.js turns into meshes.

import { CITY, PALETTE, streetLines } from './config.js';
import { makeRandom, between, choose, chance } from './random.js';

const PARK_KEY = new Set(['44,44', '-132,132', '220,-132', '-220,-220', '132,220']);
const SHOP_SIGNS = [
  'SOLAR CAFE', 'MIRADOR', 'BAY MOTEL', 'SUNSET RADIO', 'HARBOR & CO',
  'PALM MARKET', 'REYES GARAGE', 'VELOCE', 'AZUL CLUB', 'CORAL DINER',
  'BAYVIEW BANK', 'THE PIER', 'SUN DRUGS', 'MARISOL REALTY',
];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Which blocks are green space instead of offices.
export function isParkBlock(cx, cz) {
  return PARK_KEY.has(`${cx},${cz}`);
}

// Build one built block: a 2x2 grid of tower lots with a narrow alley between.
function fillBuiltBlock(rng, block) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (chance(rng, 0.05)) continue; // an occasional empty lot
      const w = between(rng, 11, 15.5);
      const d = between(rng, 11, 15.5);
      const dist = Math.hypot(block.cx, block.cz);
      const core = Math.max(0, 1 - dist / 520);
      let h = between(rng, 11, 24) + core * between(rng, 10, 52);
      if (chance(rng, 0.08)) h *= 1.45; // a landmark spire
      h = clamp(h, 9, 92);
      const lot = {
        x: block.cx + sx * 17.2, z: block.cz + sz * 17.2,
        w, d, h,
        color: choose(rng, PALETTE.buildings),
        tier: h > 60 ? 3 : h > 38 ? 2 : h > 22 ? 1 : 0,
      };
      block.lots.push(lot);
    }
  }
}

// Scatter trees through a park block and along its pavement.
function fillPark(rng, block, trees) {
  const count = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < count; i++) {
    trees.push({
      x: block.cx + between(rng, -30, 30),
      z: block.cz + between(rng, -30, 30),
      scale: between(rng, 0.8, 1.5),
      color: choose(rng, PALETTE.trees),
    });
  }
  // A few paved paths are represented by flat props.
  block.path = true;
}

export function buildCity(seed) {
  const rng = makeRandom(seed ^ 0x51a7);
  const blocks = [];
  const trees = [];
  const signs = [];
  const props = [];

  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 8; iz++) {
      const cx = (ix - 3.5) * CITY.pitch;
      const cz = (iz - 3.5) * CITY.pitch;
      const block = { cx, cz, half: CITY.blockHalf, lots: [], park: false };
      if (isParkBlock(cx, cz)) {
        block.park = true;
        fillPark(rng, block, trees);
      } else {
        fillBuiltBlock(rng, block);
      }
      blocks.push(block);
    }
  }

  // Street trees line a handful of avenues, keeping the avenues readable.
  for (const cx of [-176, -88, 0, 88, 176]) {
    for (let z = -300; z <= 300; z += 44) {
      if (chance(rng, 0.75)) trees.push({ x: cx + between(rng, 10.5, 12), z, scale: 0.72, color: choose(rng, PALETTE.trees) });
    }
  }

  // Shop signs on the street-facing face of selected ground-floor lots.
  let signIndex = 0;
  for (const block of blocks) {
    if (block.park) continue;
    for (const lot of block.lots) {
      if (!chance(rng, 0.16) || signIndex >= SHOP_SIGNS.length) continue;
      const faceZ = Math.abs(block.cz - lot.z) > Math.abs(block.cx - lot.x);
      signs.push({
        x: lot.x, z: lot.z,
        y: between(rng, 5.5, 9),
        yaw: faceZ ? (block.cz > lot.z ? Math.PI : 0) : (block.cx > lot.x ? -Math.PI / 2 : Math.PI / 2),
        text: SHOP_SIGNS[signIndex++],
        color: choose(rng, [0xffd76a, 0xff8f6b, 0x8fe3d2, 0xffffff]),
        w: 9, h: 2.2,
      });
    }
  }

  // Waterfront: a boardwalk, a fishing pier, crates and a low seawall.
  props.push({ x: 0, z: 352, w: 720, d: 16, h: 0.6, color: 0xb8ad93, kind: 'walk' });
  props.push({ x: 0, z: 398, w: 18, d: 92, h: 0.7, color: 0x9a8a6c, kind: 'pier' });
  props.push({ x: 0, z: 444, w: 40, d: 12, h: 0.8, color: 0x9a8a6c, kind: 'pier' });
  for (let i = 0; i < 14; i++) {
    props.push({
      x: between(rng, -90, 90), z: between(rng, 332, 350),
      w: between(rng, 1.4, 2.6), d: between(rng, 1.4, 2.6), h: between(rng, 1, 2.4),
      color: choose(rng, [0x9c7d55, 0x6f8b93, 0xb05b43]), kind: 'crate',
    });
  }
  // Street lamps along the boulevard (z = 0) give the night shots structure.
  for (let x = -330; x <= 330; x += 44) {
    props.push({ x, z: -10.6, w: 0.3, d: 0.3, h: 7, color: 0x4a4f55, kind: 'lamp' });
  }

  const buildings = [];
  for (const block of blocks) for (const lot of block.lots) buildings.push(lot);

  return {
    seed, blocks, buildings, trees, signs, props,
    streets: streetLines(),
    random: rng,
  };
}

// True when a point sits on an asphalt street rather than a block.
export function isRoad(x, z) {
  if (z > CITY.waterStart - 8) return false;
  for (const line of streetLines()) {
    if (Math.abs(x - line) < CITY.roadWidth / 2 || Math.abs(z - line) < CITY.roadWidth / 2) return true;
  }
  return false;
}

// A random point in a traffic lane, with the heading of that lane.
export function randomLanePoint(rng) {
  const lines = streetLines();
  const horizontal = chance(rng, 0.5);
  const line = choose(rng, lines);
  const along = between(rng, -330, 330);
  const dir = chance(rng, 0.5) ? 1 : -1;
  const lane = dir * (CITY.roadWidth * 0.24);
  return horizontal
    ? { x: along, z: line + lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, axis: 'x' }
    : { x: line + lane, z: along, yaw: dir > 0 ? 0 : Math.PI, axis: 'z' };
}

// Keep an actor out of buildings, off the sea and inside the city.
export function resolveCollision(city, px, pz, radius) {
  let x = clamp(px, -CITY.limit + radius, CITY.limit - radius);
  let z = clamp(pz, -CITY.limit + radius, CITY.limit - radius);
  if (z > CITY.waterStart - 5) {
    const onPier = Math.abs(x) < 11 && z < 448;
    if (!onPier) z = CITY.waterStart - 5 - radius;
  }
  for (const block of city.blocks) {
    if (Math.abs(block.cx - x) > block.half + radius || Math.abs(block.cz - z) > block.half + radius) continue;
    for (const lot of block.lots) {
      const minX = lot.x - lot.w / 2, maxX = lot.x + lot.w / 2;
      const minZ = lot.z - lot.d / 2, maxZ = lot.z + lot.d / 2;
      const nearX = clamp(x, minX, maxX), nearZ = clamp(z, minZ, maxZ);
      const dx = x - nearX, dz = z - nearZ;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nearX + (dx / d) * radius;
        z = nearZ + (dz / d) * radius;
      } else {
        // Dead centre: eject along the shallowest side.
        const left = x - minX, right = maxX - x, back = z - minZ, front = maxZ - z;
        const m = Math.min(left, right, back, front);
        if (m === left) x = minX - radius;
        else if (m === right) x = maxX + radius;
        else if (m === back) z = minZ - radius;
        else z = maxZ + radius;
      }
    }
  }
  return { x, z };
}
