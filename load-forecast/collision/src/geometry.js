/* Convex-polygon geometry, bounding boxes, support points and Minkowski sums. */

import { TAU, convexHull, cross, dot, range, sub } from './math.js';

/**
 * Build a chunky convex polygon in a normalized local space where the
 * farthest vertex sits at radius 1. Hulling the sampled points keeps the
 * result strictly convex even when the random radii are irregular.
 */
export function createLocalPolygon(random, requestedVertices = 6) {
  const vertices = [];
  const count = Math.max(3, requestedVertices);
  const phase = range(random, 0, TAU);
  for (let i = 0; i < count; i += 1) {
    const angle = phase + (i / count) * TAU + range(random, -0.1, 0.1);
    const radius = range(random, 0.78, 1);
    vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  const hull = convexHull(vertices);
  const maxRadius = Math.max(...hull.map((p) => Math.hypot(p.x, p.y)), 1e-6);
  return hull.map((p) => ({ x: p.x / maxRadius, y: p.y / maxRadius }));
}

export function transformPolygon(localVertices, cx, cy, angle, radius) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return localVertices.map(({ x, y }) => {
    const sx = x * radius;
    const sy = y * radius;
    return {
      x: cx + sx * cos - sy * sin,
      y: cy + sx * sin + sy * cos,
    };
  });
}

export function boundsOf(points, pad = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function boundsCenter(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

export function boundsSize(bounds) {
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

export function aabbOverlap(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

export function aabbContains(outer, inner) {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
}

export function aabbDistanceSq(a, b) {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return dx * dx + dy * dy;
}

export function expandBounds(bounds, amount) {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}

/**
 * Pick the vertex that is furthest along `direction`.
 * Returns both the point and its index so callers can draw the support vertex.
 */
export function supportVertex(vertices, direction) {
  let best = vertices[0];
  let bestIndex = 0;
  let bestDot = dot(best, direction);
  for (let i = 1; i < vertices.length; i += 1) {
    const value = dot(vertices[i], direction);
    if (value > bestDot) {
      best = vertices[i];
      bestIndex = i;
      bestDot = value;
    }
  }
  return { point: best, index: bestIndex };
}

/**
 * Exact Minkowski difference hull for two convex polygons: every pairwise
 * vertex difference is a vertex candidate of A ⊖ B, and the hull of those
 * candidates is the full difference body.
 */
export function minkowskiDifferenceHull(verticesA, verticesB) {
  const points = [];
  for (const a of verticesA) {
    for (const b of verticesB) {
      points.push({ x: a.x - b.x, y: a.y - b.y });
    }
  }
  return convexHull(points);
}

/** Signed area > 0 means counter-clockwise. */
export function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += cross(a, b);
  }
  return area * 0.5;
}

/** Simple segment intersection helper, used only by the self-check tools. */
export function segmentsIntersect(a, b, c, d) {
  const ab = sub(b, a);
  const cd = sub(d, c);
  const denom = cross(ab, cd);
  if (Math.abs(denom) < 1e-9) return false;
  const ac = sub(c, a);
  const t = cross(ac, cd) / denom;
  const u = cross(ac, ab) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
