// One job: the tuning table. Dimensions, palettes, names and specs live here;
// no behaviour does. Every other module reads from this table.

export const CITY = {
  name: 'MIRADOR BAY',
  pitch: 88,          // distance between street centre lines
  roadWidth: 18,      // asphalt width of a street
  gridMin: -4,
  gridMax: 4,
  waterStart: 360,    // sea begins south of this z
  limit: 350,         // playable half-extent
};
CITY.blockHalf = (CITY.pitch - CITY.roadWidth) / 2; // 35

// Street centre lines, e.g. -352, -264, ... 352.
export function streetLines() {
  const result = [];
  for (let k = CITY.gridMin; k <= CITY.gridMax; k++) result.push(k * CITY.pitch);
  return result;
}

export const PALETTE = {
  sky: 0x8fcbea,
  fog: 0xc3dfef,
  asphalt: 0x4b5058,
  asphaltLight: 0x5b6169,
  sidewalk: 0xcfc8b6,
  sand: 0xd8c6a0,
  grass: 0x86a85e,
  water: 0x2e7ea6,
  white: 0xf2efe6,
  gold: 0xffcf5a,
  buildings: [0xe9d9ba, 0xd9b18d, 0xcb8f6c, 0xf0dfc5, 0xb6c4c8, 0xd7aa7f, 0xc6cbb2, 0xa9bfc9, 0xe2b9a6, 0xc2b09b, 0xdcc9a6, 0xb99079],
  trees: [0x4f8b3e, 0x69a24b, 0x3f7a46, 0x7cb257],
};

// Eight original vehicles: id, display name, body w/l/h (metres), cabin height,
// acceleration, top speed, steering grip and mass.
export const VEHICLE_TYPES = [
  { id:'lark',     name:'Lark',      w:1.95, l:4.15, h:1.10, cab:0.62, accel:15, top:33, grip:7.4, mass:1.0, colors:[0xd9d5cb,0x8fa8b5,0xc85b4a,0x4f6e8a] },
  { id:'metro',    name:'Metro Cab', w:2.00, l:4.45, h:1.16, cab:0.66, accel:16, top:35, grip:7.2, mass:1.1, colors:[0xf6c945,0x222831,0x2b2b2b] },
  { id:'drifter',  name:'Drifter',   w:1.90, l:4.35, h:0.98, cab:0.55, accel:23, top:47, grip:8.6, mass:0.9, colors:[0xc9362b,0x2e8f8a,0xf0f0ea,0x3c4a63] },
  { id:'vantage',  name:'Vantage',   w:2.18, l:4.75, h:1.38, cab:0.80, accel:15, top:37, grip:6.6, mass:1.5, colors:[0x3d5a45,0x7c6a55,0x30343a,0xb7b0a0] },
  { id:'hauler',   name:'Hauler',    w:2.20, l:5.30, h:1.28, cab:0.86, accel:12, top:32, grip:5.8, mass:1.9, colors:[0x4a78a0,0xb5b0a4,0xa03e33,0x4d5d52] },
  { id:'cargo',    name:'Cargo Van',w:2.16, l:5.10, h:1.85, cab:0.30, accel:11, top:31, grip:5.9, mass:1.8, colors:[0xe9e6dc,0x9aa7ad,0x35506b] },
  { id:'sunliner', name:'Sunliner',  w:1.96, l:4.50, h:1.02, cab:0.52, accel:20, top:44, grip:8.0, mass:1.0, colors:[0xf2e3c0,0x66b3bd,0xe9a24a,0xc95f7d] },
  { id:'veltro',   name:'Veltro',    w:1.94, l:4.30, h:0.88, cab:0.48, accel:29, top:57, grip:9.2, mass:0.85, colors:[0xd6272f,0xf0f0ea,0x22252b,0xe7b53b] },
];
export const VEHICLE_BY_ID = Object.fromEntries(VEHICLE_TYPES.map(v => [v.id, v]));

// Five weapons: id, name, damage, rounds per second, magazine, projectile speed, range, pellets.
export const WEAPONS = [
  { id:'fists',   name:'Fists',   damage:9,  rate:2.6, mag:0,   speed:0,  range:2.6, pellets:1 },
  { id:'pistol',  name:'Pistol',  damage:26, rate:5.5, mag:12,  speed:95, range:55,  pellets:1 },
  { id:'smg',     name:'SMG',     damage:13, rate:12,  mag:30,  speed:90, range:45,  pellets:1 },
  { id:'shotgun', name:'Shotgun', damage:13, rate:1.4, mag:8,   speed:80, range:28,  pellets:6 },
  { id:'rifle',   name:'Rifle',   damage:38, rate:6.5, mag:20,  speed:120,range:80,  pellets:1 },
];

export const WANTED_STARS = 5;
export const HERO_NAME = 'Kai Reyes';
