/* A compact 2D GJK implementation for convex polygons.
 *
 * The routine searches the Minkowski difference A ⊖ B for a point closest to
 * the origin. If that distance reaches zero the shapes intersect; otherwise
 * the final distance is the separation between the two polygons.
 */

import { add, clamp, cross, dist2, dot, len2, negate, scale, sub } from './math.js';
import { supportVertex } from './geometry.js';

const HIT_EPSILON = 0.01;
const HIT_EPSILON_SQ = HIT_EPSILON * HIT_EPSILON;

function minkowskiSupport(verticesA, verticesB, direction) {
  const a = supportVertex(verticesA, direction);
  const b = supportVertex(verticesB, negate(direction));
  return {
    point: { x: a.point.x - b.point.x, y: a.point.y - b.point.y },
    witnessA: a.point,
    witnessB: b.point,
    indexA: a.index,
    indexB: b.index,
  };
}

function closestOnSegment(a, b) {
  const ab = sub(b, a);
  const denom = len2(ab);
  const t = denom > 1e-12 ? clamp(-dot(a, ab) / denom, 0, 1) : 0;
  const point = add(a, scale(ab, t));
  if (t <= 1e-9) return { point, distSq: len2(a), simplex: [a] };
  if (t >= 1 - 1e-9) return { point, distSq: len2(b), simplex: [b] };
  return { point, distSq: len2(point), simplex: [a, b] };
}

/**
 * Closest point on the current simplex to the origin.
 * The returned simplex is reduced to the smallest feature supporting it.
 */
function closestPointOnSimplex(simplex) {
  if (simplex.length === 1) {
    return { point: simplex[0], distSq: len2(simplex[0]), simplex: [simplex[0]], containsOrigin: false };
  }

  if (simplex.length === 2) {
    const near = closestOnSegment(simplex[0], simplex[1]);
    return { ...near, containsOrigin: near.distSq < 1e-18 };
  }

  const [a, b, c] = simplex;
  const ab = sub(b, a);
  const ac = sub(c, a);
  const area2 = cross(ab, ac);
  if (Math.abs(area2) < 1e-9) {
    const candidates = [
      closestOnSegment(a, b),
      closestOnSegment(b, c),
      closestOnSegment(c, a),
    ];
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
      if (candidates[i].distSq < best.distSq) best = candidates[i];
    }
    return { ...best, containsOrigin: best.distSq < 1e-18 };
  }

  const s0 = cross(ab, negate(a));
  const s1 = cross(sub(c, b), negate(b));
  const s2 = cross(sub(a, c), negate(c));
  const insideCcw = s0 >= -1e-9 && s1 >= -1e-9 && s2 >= -1e-9;
  const insideCw = s0 <= 1e-9 && s1 <= 1e-9 && s2 <= 1e-9;
  if (insideCcw || insideCw) {
    return { point: { x: 0, y: 0 }, distSq: 0, simplex: [a, b, c], containsOrigin: true };
  }

  const candidates = [
    closestOnSegment(a, b),
    closestOnSegment(b, c),
    closestOnSegment(c, a),
  ];
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].distSq < best.distSq) best = candidates[i];
  }
  return { ...best, containsOrigin: false };
}

function makeTraceEntry(iteration, direction, support, simplexSize) {
  return {
    iteration,
    direction: { x: direction.x, y: direction.y },
    support: { x: support.point.x, y: support.point.y },
    witnessA: { x: support.witnessA.x, y: support.witnessA.y },
    witnessB: { x: support.witnessB.x, y: support.witnessB.y },
    simplexSize,
  };
}

/**
 * @param {Array<{x:number,y:number}>} verticesA world-space convex polygon A
 * @param {Array<{x:number,y:number}>} verticesB world-space convex polygon B
 * @param {{centerA?, centerB?, maxIterations?, hitEpsilon?}} [options]
 * @returns {{
 *   hit: boolean,
 *   iterations: number,
 *   distance: number,
 *   simplex: Array<{x:number,y:number}>,
 *   trace: Array<object>,
 *   converged: boolean,
 * }}
 */
export function gjk(verticesA, verticesB, options = {}) {
  const { centerA, centerB, maxIterations = 32 } = options;
  const measurementA = centerA || averagePoint(verticesA);
  const measurementB = centerB || averagePoint(verticesB);

  let direction = sub(measurementA, measurementB);
  if (len2(direction) < 1e-12) direction = { x: 1, y: 0 };

  const initialSupport = minkowskiSupport(verticesA, verticesB, direction);
  const firstEntry = makeTraceEntry(1, direction, initialSupport, 1);
  let simplex = [initialSupport.point];
  const trace = [firstEntry];

  if (dist2(initialSupport.point, { x: 0, y: 0 }) <= HIT_EPSILON_SQ) {
    return {
      hit: true,
      iterations: 1,
      distance: 0,
      simplex,
      trace,
      converged: true,
      witnessA: initialSupport.witnessA,
      witnessB: initialSupport.witnessB,
    };
  }

  for (let step = 0; step < maxIterations; step += 1) {
    const near = closestPointOnSimplex(simplex);
    if (near.containsOrigin || near.distSq <= HIT_EPSILON_SQ) {
      return {
        hit: true,
        iterations: trace.length,
        distance: 0,
        simplex: near.simplex,
        trace,
        converged: true,
      };
    }

    direction = negate(near.point);
    const support = minkowskiSupport(verticesA, verticesB, direction);

    /* If the support point cannot improve the closest distance, the closest
       feature we already have is the answer. This is the GJK convergence test. */
    const progress = dot(support.point, direction) - dot(near.point, direction);
    const tolerance = 1e-7 * (1 + near.distSq);
    const duplicate = simplex.some((point) => dist2(point, support.point) < 1e-10);
    if (duplicate || progress <= tolerance) {
      return {
        hit: near.distSq <= HIT_EPSILON_SQ,
        iterations: trace.length,
        distance: Math.sqrt(Math.max(0, near.distSq)),
        simplex: near.simplex,
        trace,
        converged: !duplicate,
      };
    }

    simplex = near.simplex.concat([support.point]);
    trace.push(makeTraceEntry(trace.length + 1, direction, support, simplex.length));
  }

  const near = closestPointOnSimplex(simplex);
  return {
    hit: near.containsOrigin || near.distSq <= HIT_EPSILON_SQ,
    iterations: trace.length,
    distance: Math.sqrt(Math.max(0, near.distSq)),
    simplex: near.simplex,
    trace,
    converged: false,
  };
}

function averagePoint(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}
