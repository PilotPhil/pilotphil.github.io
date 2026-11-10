/**
 * 二维多边形几何工具。
 *
 * 替代 CCM_Re 中 CGAL Exact_predicates_exact_constructions_kernel 的用法：
 * 仿真中船体多边形（参数化线性楔形船首，凸多边形）与冰单元（轴对齐矩形）
 * 求交，用 Sutherland–Hodgman 凸裁剪即可精确求解，无需通用布尔库。
 * 接口语义与 `util_polygon.hpp` 的 computePolygonIntersection 保持一致：
 * 返回 { 面积, 质心, 宽度(边交点最大距离), 交叠多边形 }。
 */

export interface Pt {
  x: number;
  y: number;
}

export type Poly = Pt[];

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polyBBox(poly: Poly): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** CGAL Bbox_2::do_overlap 语义：区间端点相等也算重叠。 */
export function bboxOverlap(a: BBox, b: BBox): boolean {
  return (
    a.maxX >= b.minX && b.maxX >= a.minX && a.maxY >= b.minY && b.maxY >= a.minY
  );
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function clipHalfPlane(subject: Poly, a: Pt, b: Pt): Poly {
  const out: Poly = [];
  const n = subject.length;
  for (let i = 0; i < n; i++) {
    const cur = subject[i]!;
    const nxt = subject[(i + 1) % n]!;
    const dCur = cross(a, b, cur);
    const dNxt = cross(a, b, nxt);
    if (dCur >= 0) {
      out.push(cur);
    }
    if ((dCur > 0 && dNxt < 0) || (dCur < 0 && dNxt > 0)) {
      const t = dCur / (dCur - dNxt);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

/**
 * 凸/非凸被裁多边形与轴对齐矩形求交（Sutherland–Hodgman）。
 * 裁剪矩形为凸，鞋带公式面积对结果恒正确；返回空数组表示无交叠。
 */
export function clipPolyToRect(subject: Poly, r: Rect): Poly {
  const corners: Poly = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  let out = subject;
  for (let i = 0; i < 4 && out.length > 0; i++) {
    out = clipHalfPlane(out, corners[i]!, corners[(i + 1) % 4]!);
  }
  return out;
}

export interface AreaCentroid {
  area: number;
  cx: number;
  cy: number;
}

/** 鞋带公式面积与质心（对应 util_polygon.hpp computePolygonAreaCentroid）。 */
export function polyAreaCentroid(poly: Poly): AreaCentroid | null {
  const n = poly.length;
  if (n < 3) return null;
  let crossSum = 0;
  let cxSum = 0;
  let cySum = 0;
  for (let i = 0; i < n; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % n]!;
    const c = p0.x * p1.y - p1.x * p0.y;
    crossSum += c;
    cxSum += (p0.x + p1.x) * c;
    cySum += (p0.y + p1.y) * c;
  }
  const signedArea = 0.5 * crossSum;
  if (Math.abs(signedArea) < 1e-12) return null;
  return { area: Math.abs(signedArea), cx: cxSum / (6 * signedArea), cy: cySum / (6 * signedArea) };
}

interface SegIntersect {
  kind: "point" | "segment";
  p: Pt;
  q?: Pt;
}

const SEG_EPS = 1e-9;

/** 线段求交：含共线重叠段与端点接触情形（对应 CGAL::intersection 的 point/segment 两种结果）。 */
export function segmentIntersect(a: Pt, b: Pt, c: Pt, d: Pt): SegIntersect | null {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  const s1 = Math.abs(d1) < SEG_EPS ? 0 : Math.sign(d1);
  const s2 = Math.abs(d2) < SEG_EPS ? 0 : Math.sign(d2);
  const s3 = Math.abs(d3) < SEG_EPS ? 0 : Math.sign(d3);
  const s4 = Math.abs(d4) < SEG_EPS ? 0 : Math.sign(d4);

  if ((s1 * s2 < 0 && s3 * s4 < 0)) {
    // t 为沿 AB 的参数：cross(c,d,·) 在 AB 上线性过零
    const t = d1 / (d1 - d2);
    return {
      kind: "point",
      p: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) },
    };
  }

  if (s1 === 0 && s2 === 0 && s3 === 0 && s4 === 0) {
    // 共线：取参数区间交集
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 < SEG_EPS * SEG_EPS) {
      return onSeg(a, b, c) || onSeg(a, b, d) ? { kind: "point", p: a } : null;
    }
    const t0 = (((c.x - a.x) * abx + (c.y - a.y) * aby) / len2);
    const t1 = (((d.x - a.x) * abx + (d.y - a.y) * aby) / len2);
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi < lo - SEG_EPS) return null;
    const p = { x: a.x + lo * abx, y: a.y + lo * aby };
    const q = { x: a.x + hi * abx, y: a.y + hi * aby };
    return hi - lo < SEG_EPS ? { kind: "point", p } : { kind: "segment", p, q };
  }

  if (s1 === 0 && between(a, b, c)) return { kind: "point", p: c };
  if (s2 === 0 && between(a, b, d)) return { kind: "point", p: d };
  if (s3 === 0 && between(c, d, a)) return { kind: "point", p: a };
  if (s4 === 0 && between(c, d, b)) return { kind: "point", p: b };

  return null;
}

function between(a: Pt, b: Pt, p: Pt): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - SEG_EPS &&
    p.x <= Math.max(a.x, b.x) + SEG_EPS &&
    p.y >= Math.min(a.y, b.y) - SEG_EPS &&
    p.y <= Math.max(a.y, b.y) + SEG_EPS
  );
}

function onSeg(a: Pt, b: Pt, p: Pt): boolean {
  return between(a, b, p);
}

function appendUnique(points: Pt[], p: Pt): void {
  for (const q of points) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (dx * dx + dy * dy <= 1e-12) return;
  }
  points.push(p);
}

/** 收集两多边形所有边的交点（含共线重叠端点），对应 collectEdgeIntersectionPoints。 */
export function collectEdgeIntersectionPoints(a: Poly, b: Poly): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j]!;
      const b1 = b[(j + 1) % b.length]!;
      const hit = segmentIntersect(a0, a1, b0, b1);
      if (!hit) continue;
      appendUnique(points, hit.p);
      if (hit.kind === "segment") appendUnique(points, hit.q!);
    }
  }
  return points;
}

export interface PolygonIntersectionResult {
  area: number;
  cx: number;
  cy: number;
  /** 边交点集合中两两最大距离（接触宽度），对应 result.width */
  width: number;
  /** 交叠区域多边形（外边界），无交叠时为 null */
  poly: Poly | null;
}

/** 船体多边形与冰单元（矩形）求交，语义对齐 util_polygon.hpp computePolygonIntersection。 */
export function intersectShipCell(ship: Poly, cell: Poly): PolygonIntersectionResult {
  const clipped = clipPolyToRect(ship, polyBBox(cell));
  const ac = polyAreaCentroid(clipped);
  const result: PolygonIntersectionResult = { area: 0, cx: 0, cy: 0, width: 0, poly: null };
  if (!ac) return result;

  result.area = ac.area;
  result.cx = ac.cx;
  result.cy = ac.cy;
  result.poly = clipped;

  const pts = collectEdgeIntersectionPoints(ship, cell);
  if (pts.length >= 2) {
    let maxDist2 = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i]!.x - pts[j]!.x;
        const dy = pts[i]!.y - pts[j]!.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > maxDist2) maxDist2 = dist2;
      }
    }
    result.width = Math.sqrt(maxDist2);
  }
  return result;
}

/** 距给定点最近的顶点（对应 findClosestPointInHull，严格小于取首个最小值）。 */
export function closestVertex(poly: Poly, pt: Pt): { index: number; point: Pt } {
  let minDist2 = Number.POSITIVE_INFINITY;
  let index = -1;
  let point: Pt = { x: 0, y: 0 };
  for (let i = 0; i < poly.length; i++) {
    const dx = poly[i]!.x - pt.x;
    const dy = poly[i]!.y - pt.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < minDist2) {
      minDist2 = dist2;
      index = i;
      point = poly[i]!;
    }
  }
  return { index, point };
}

export function translatePoly(poly: Poly, dx: number, dy: number): Poly {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
