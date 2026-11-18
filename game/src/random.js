// One job: deterministic pseudo-random numbers, so every screenshot pose is
// reproducible from a single seed. No Math.random anywhere in the game.

export function makeRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function between(rng, low, high) {
  return low + (high - low) * rng();
}

export function choose(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function chance(rng, probability) {
  return rng() < probability;
}
