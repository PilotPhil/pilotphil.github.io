/* Broad-phase structures for a single moving query against static convex bodies.
 *
 * Every implementation must return exactly the bodies whose AABBs overlap the
 * query AABB. The alternate structures differ in how many boxes they need to
 * look at, not in the answer they produce.
 */

import { clamp } from './math.js';
import { aabbOverlap } from './geometry.js';

export const BROAD_PHASE_ALGORITHMS = [
  {
    id: 'brute',
    name: '暴力枚举',
    en: 'BRUTE FORCE',
    tag: 'ALL PAIRS',
    stepTitle: '逐个包围盒比对',
    stepDesc: '查询盒依次与每个障碍体的 AABB 求交。',
    formulaHtml: 'candidate ⇔ A<sub>q</sub> ∩ B<sub>i</sub> ≠ ∅',
    liveLabel: '逐一检查',
    summary: '最直观的基线。适合小场景，物体一多就会线性变慢。',
  },
  {
    id: 'sap',
    name: '扫描排序',
    en: 'SWEEP & PRUNE',
    tag: 'SORTED X',
    stepTitle: '把 x 区间排序',
    stepDesc: '投影到 x 轴排序，只扫区间相接的一段，再做 y 确认。',
    formulaHtml: 'a.minX ≤ q.maxX ∧ a.maxX ≥ q.minX',
    liveLabel: 'X 区间筛查',
    summary: '沿一个轴排序能迅速排除远处的物体；投影重叠后才做盒检测。',
  },
  {
    id: 'grid',
    name: '均匀网格',
    en: 'UNIFORM GRID',
    tag: 'SPATIAL HASH',
    stepTitle: '查格子里的物体',
    stepDesc: '每个物体登记进覆盖的格子，只读查询盒压住的几格。',
    formulaHtml: 'cell = ⌊ p / s ⌋,　s = 网格边长',
    liveLabel: '网格访问',
    summary: '空间分布均匀时非常快；格子边长要和物体大小匹配。',
  },
  {
    id: 'quad',
    name: '四叉树',
    en: 'QUADTREE',
    tag: 'HIERARCHY',
    stepTitle: '沿树向下查询',
    stepDesc: '递归细分空间，只进入与查询盒相交的节点。',
    formulaHtml: 'Q(node) = ∅　if　node ∩ A<sub>q</sub> = ∅',
    liveLabel: '四叉树访问',
    summary: '会随着物体分布自动细分，适合疏密不均的场景。',
  },
];

export const BROAD_PHASE_BY_ID = Object.fromEntries(
  BROAD_PHASE_ALGORITHMS.map((algorithm) => [algorithm.id, algorithm]),
);

function prefixCount(items, predicate) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (predicate(items[middle])) low = middle + 1;
    else high = middle;
  }
  return low;
}

function makeCandidates(probe, bodies) {
  const candidates = [];
  for (const body of bodies) {
    if (aabbOverlap(probe.aabb, body.aabb)) candidates.push(body);
  }
  return candidates;
}

function finish(algorithm, probe, bodies, candidates, examined, overlay, metrics) {
  return {
    algorithm,
    candidates,
    examined,
    rejected: bodies.length - candidates.length,
    overlay,
    metrics,
  };
}

function runBrute(algorithm, probe, bodies) {
  const candidates = makeCandidates(probe, bodies);
  return finish(
    algorithm,
    probe,
    bodies,
    candidates,
    bodies.length,
    {
      kind: 'brute',
      testedIds: bodies.map((body) => body.id),
      candidateIds: candidates.map((body) => body.id),
    },
    { scanned: bodies.length },
  );
}

function runSweep(algorithm, probe, bodies) {
  const byMinX = bodies.slice().sort((a, b) => a.aabb.minX - b.aabb.minX);
  const byMaxX = bodies.slice().sort((a, b) => b.aabb.maxX - a.aabb.maxX);
  const minPrefix = prefixCount(byMinX, (body) => body.aabb.minX <= probe.aabb.maxX);
  const maxPrefix = prefixCount(byMaxX, (body) => body.aabb.maxX >= probe.aabb.minX);
  const useMin = minPrefix <= maxPrefix;
  const scanList = useMin ? byMinX.slice(0, minPrefix) : byMaxX.slice(0, maxPrefix);

  const candidates = [];
  let xOverlaps = 0;
  for (const body of scanList) {
    const xOverlap = body.aabb.minX <= probe.aabb.maxX && body.aabb.maxX >= probe.aabb.minX;
    if (!xOverlap) continue;
    xOverlaps += 1;
    if (aabbOverlap(probe.aabb, body.aabb)) candidates.push(body);
  }

  const xOverlappingIds = bodies
    .filter((body) => body.aabb.minX <= probe.aabb.maxX && body.aabb.maxX >= probe.aabb.minX)
    .map((body) => body.id);

  return finish(
    algorithm,
    probe,
    bodies,
    candidates,
    scanList.length,
    {
      kind: 'sap',
      band: { minX: probe.aabb.minX, maxX: probe.aabb.maxX, minY: probe.aabb.minY, maxY: probe.aabb.maxY },
      sortedBodies: byMinX,
      scannedIds: scanList.map((body) => body.id),
      xOverlappingIds,
      candidateIds: candidates.map((body) => body.id),
      axis: 'x',
    },
    {
      sorted: bodies.length,
      scanned: scanList.length,
      xOverlaps,
      side: useMin ? 'min' : 'max',
    },
  );
}

function chooseGridSize(bodies, field) {
  if (!bodies.length) return clamp(Math.min(field.w, field.h) / 10, 52, 110);
  let average = 0;
  for (const body of bodies) {
    average += Math.max(body.aabb.maxX - body.aabb.minX, body.aabb.maxY - body.aabb.minY);
  }
  average /= bodies.length;
  return clamp(Math.round((average * 1.2) / 4) * 4, 56, 116);
}

function runGrid(algorithm, probe, bodies, field) {
  const cellSize = chooseGridSize(bodies, field);
  const cols = Math.max(1, Math.ceil(field.w / cellSize));
  const rows = Math.max(1, Math.ceil(field.h / cellSize));
  const originX = field.x;
  const originY = field.y;
  const cells = new Map();

  const cellKey = (cx, cy) => cy * cols + cx;

  for (const body of bodies) {
    const x0 = clamp(Math.floor((body.aabb.minX - originX) / cellSize), 0, cols - 1);
    const x1 = clamp(Math.floor((body.aabb.maxX - originX) / cellSize), 0, cols - 1);
    const y0 = clamp(Math.floor((body.aabb.minY - originY) / cellSize), 0, rows - 1);
    const y1 = clamp(Math.floor((body.aabb.maxY - originY) / cellSize), 0, rows - 1);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const key = cellKey(cx, cy);
        let bucket = cells.get(key);
        if (!bucket) {
          bucket = [];
          cells.set(key, bucket);
        }
        bucket.push(body);
      }
    }
  }

  const qx0 = clamp(Math.floor((probe.aabb.minX - originX) / cellSize), 0, cols - 1);
  const qx1 = clamp(Math.floor((probe.aabb.maxX - originX) / cellSize), 0, cols - 1);
  const qy0 = clamp(Math.floor((probe.aabb.minY - originY) / cellSize), 0, rows - 1);
  const qy1 = clamp(Math.floor((probe.aabb.maxY - originY) / cellSize), 0, rows - 1);

  const seen = new Set();
  const seenCells = [];
  for (let cy = qy0; cy <= qy1; cy += 1) {
    for (let cx = qx0; cx <= qx1; cx += 1) {
      seenCells.push({ cx, cy });
      const bucket = cells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const body of bucket) seen.add(body);
    }
  }

  const candidates = [];
  for (const body of seen) {
    if (aabbOverlap(probe.aabb, body.aabb)) candidates.push(body);
  }

  const occupied = [];
  for (const [key, bucket] of cells) {
    const cx = key % cols;
    const cy = Math.floor(key / cols);
    occupied.push({ cx, cy, count: bucket.length });
  }

  return finish(
    algorithm,
    probe,
    bodies,
    candidates,
    seen.size,
    {
      kind: 'grid',
      originX,
      originY,
      cellSize,
      cols,
      rows,
      occupied,
      queryCells: seenCells,
      candidateIds: candidates.map((body) => body.id),
    },
    {
      cellsVisited: seenCells.length,
      cellsTotal: cols * rows,
      cellsOccupied: occupied.length,
      bodiesCollected: seen.size,
      cellSize,
      cols,
      rows,
    },
  );
}

function quadtreeDepth(field) {
  return clamp(Math.ceil(Math.log2(Math.max(1, Math.min(field.w, field.h) / 130))), 2, 4);
}

function makeQuadNode(x, y, w, h, depth) {
  return {
    x,
    y,
    w,
    h,
    bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
    depth,
    items: [],
    children: null,
    hasContent: false,
    visited: false,
  };
}

function splitQuadNode(node) {
  const halfW = node.w * 0.5;
  const halfH = node.h * 0.5;
  node.children = [
    makeQuadNode(node.x, node.y, halfW, halfH, node.depth + 1),
    makeQuadNode(node.x + halfW, node.y, halfW, halfH, node.depth + 1),
    makeQuadNode(node.x, node.y + halfH, halfW, halfH, node.depth + 1),
    makeQuadNode(node.x + halfW, node.y + halfH, halfW, halfH, node.depth + 1),
  ];
}

function insertQuadNode(node, body, maxDepth) {
  if (!aabbOverlap(node.bounds, body.aabb)) return false;
  node.hasContent = true;
  if (node.depth >= maxDepth) {
    node.items.push(body);
    return true;
  }
  if (!node.children) splitQuadNode(node);
  let inserted = false;
  for (const child of node.children) {
    if (insertQuadNode(child, body, maxDepth)) inserted = true;
  }
  if (!inserted) node.items.push(body);
  return true;
}

function runQuadtree(algorithm, probe, bodies, field) {
  const maxDepth = quadtreeDepth(field);
  const root = makeQuadNode(field.x, field.y, field.w, field.h, 0);
  for (const body of bodies) insertQuadNode(root, body, maxDepth);

  let nodesVisited = 0;
  let nodesExamined = 0;
  let totalContentNodes = 0;
  const countNodes = (node) => {
    if (!node.hasContent) return;
    totalContentNodes += 1;
    if (node.children) {
      for (const child of node.children) countNodes(child);
    }
  };
  countNodes(root);

  const seen = new Set();
  const visit = (node) => {
    if (!node.hasContent) return;
    nodesExamined += 1;
    if (!aabbOverlap(node.bounds, probe.aabb)) return;
    node.visited = true;
    nodesVisited += 1;
    for (const body of node.items) seen.add(body);
    if (node.children && node.depth < maxDepth) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);

  const candidates = [];
  for (const body of seen) {
    if (aabbOverlap(probe.aabb, body.aabb)) candidates.push(body);
  }

  return finish(
    algorithm,
    probe,
    bodies,
    candidates,
    seen.size,
    {
      kind: 'quadtree',
      root,
      visitedNodes: nodesVisited,
      candidateIds: candidates.map((body) => body.id),
    },
    {
      maxDepth,
      nodesVisited,
      nodesExamined,
      nodesTotal: totalContentNodes,
      leaves: Math.pow(4, maxDepth),
      bodiesCollected: seen.size,
    },
  );
}

export function runBroadPhase(algorithmId, probe, bodies, field) {
  const algorithm = BROAD_PHASE_BY_ID[algorithmId] || BROAD_PHASE_BY_ID.brute;
  switch (algorithm.id) {
    case 'sap':
      return runSweep(algorithm, probe, bodies);
    case 'grid':
      return runGrid(algorithm, probe, bodies, field);
    case 'quad':
      return runQuadtree(algorithm, probe, bodies, field);
    case 'brute':
    default:
      return runBrute(algorithm, probe, bodies);
  }
}
