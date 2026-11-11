/* Tiny 2D math helpers shared by the demo and its solvers. */

export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (a, b, t) => a + (b - a) * t;

export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const vec = (x = 0, y = 0) => ({ x, y });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });

export const dot = (a, b) => a.x * b.x + a.y * b.y;

export const cross = (a, b) => a.x * b.y - a.y * b.x;

export const len2 = (a) => a.x * a.x + a.y * a.y;

export const length = (a) => Math.sqrt(len2(a));

export const dist2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const normalize = (a) => {
  const l = length(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};

export const perp = (a) => ({ x: -a.y, y: a.x });

export const negate = (a) => ({ x: -a.x, y: -a.y });

/* Mulberry32: deterministic, compact PRNG so a seed always recreates a layout. */
export function makeRandom(seed = 1) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let n = t;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (random, min, max) => min + random() * (max - min);

export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function easeOutCubic(t) {
  const x = 1 - clamp(t, 0, 1);
  return 1 - x * x * x;
}

/* Monotone chain convex hull. Returns points in counter-clockwise order. */
export function convexHull(points) {
  if (points.length <= 1) return points.slice();
  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const turn = (o, a, b) => cross(sub(a, o), sub(b, o));
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
