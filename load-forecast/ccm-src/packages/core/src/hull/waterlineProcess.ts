/**
 * WaterlineProcess 全链移植（对应 CCM_Re hullProcess/WaterlineProcess.cpp）。
 *
 * 输入三条水线折线（半宽图坐标，单位 m）与水线高度 T0/T1/T2（T1 为设计水线，
 * T2 未参与计算，保留接口一致），输出 7 列 HullOut 矩阵：
 *   [序号(1-based), x, y, 0(保留列), 段长(m), 攻角 atan2(dy,dx)(rad), 坡角(rad)]
 * 行数 = 2·targetCount − 2（targetCount=100 → 198）。
 *
 * 移植保持与 C++ 逐行一致，包括 buildFullHull 的原位“倒序”循环的
 * 实际别名效果（后半区不受影响）——物理引擎消费的就是该行为。
 */
import { interpWaterlineArc, type Polyline } from "./waterlineArc";
import { Pchip } from "./pchip";

const HALF_PI = 1.5707963267948966;

function alignWaterline(w: Polyline, xOffset: number, yOffset: number): Polyline {
  return {
    x: w.x.map((v) => v - xOffset),
    y: w.y.map((v) => v - yOffset),
  };
}

/** 线段 (x1,y1)-(x2,y2) 与 y=0 的交点；|dy| 近零时返回 (x1, 0)。 */
function computeIntercept(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1e-12) {
    return [x1, 0];
  }
  const x0 = (0 - y1) * ((x2 - x1) / dy) + x1;
  return [x0, 0];
}

function insertEndpointsWithDup(w: Polyline): Polyline {
  if (w.x.length < 2 || w.y.length < 2) {
    throw new Error("Waterline must have at least two points.");
  }
  const [x0, y0] = computeIntercept(w.x[0]!, w.y[0]!, w.x[1]!, w.y[1]!);
  const [x0b, y0b] = computeIntercept(
    w.x[w.x.length - 2]!,
    w.y[w.y.length - 2]!,
    w.x[w.x.length - 1]!,
    w.y[w.y.length - 1]!,
  );
  const out: Polyline = { x: [...w.x], y: [...w.y] };
  if (x0 !== w.x[0] || y0 !== w.y[0]) {
    out.x.unshift(x0);
    out.y.unshift(y0);
  }
  if (x0b !== out.x[out.x.length - 1] || y0b !== out.y[out.y.length - 1]) {
    out.x.push(x0b);
    out.y.push(y0b);
  }
  out.x.unshift(x0);
  out.y.unshift(y0);
  out.x.push(x0b);
  out.y.push(y0b);
  return out;
}

function insertEndpoints(w: Polyline): Polyline {
  if (w.x.length < 2 || w.y.length < 2) {
    throw new Error("Waterline must have at least two points.");
  }
  const [x0, y0] = computeIntercept(w.x[0]!, w.y[0]!, w.x[1]!, w.y[1]!);
  const [x0b, y0b] = computeIntercept(
    w.x[w.x.length - 2]!,
    w.y[w.y.length - 2]!,
    w.x[w.x.length - 1]!,
    w.y[w.y.length - 1]!,
  );
  const out: Polyline = { x: [...w.x], y: [...w.y] };
  if (x0 !== w.x[0] || y0 !== w.y[0]) {
    out.x.unshift(x0);
    out.y.unshift(y0);
  }
  if (x0b !== out.x[out.x.length - 1] || y0b !== out.y[out.y.length - 1]) {
    out.x.push(x0b);
    out.y.push(y0b);
  }
  return out;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm3 = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

/** 三点确定平面的法向与铅垂轴夹角（0=水平面，π/2=垂直壁面）。 */
function hullSlope(p1: Vec3, p2: Vec3, p3: Vec3): number {
  const z: Vec3 = { x: 0, y: 0, z: 1 };
  let u = cross3(sub3(p2, p1), sub3(p3, p1));
  const uNorm = norm3(u);
  if (uNorm === 0) {
    return 0;
  }
  u = { x: u.x / uNorm, y: u.y / uNorm, z: u.z / uNorm };
  const crossUZ = cross3(u, z);
  return Math.atan2(norm3(crossUZ), u.z);
}

/** 半水线 + 镜像 → 2n−1 行 [序号, x, y, slope]（保持 C++ 原位倒序循环的别名行为）。 */
function buildFullHull(x150: number[], y150: number[], slopes: number[]): number[][] {
  const num = x150.length;
  const total = num * 2 - 1;
  const full: number[][] = Array.from({ length: total }, () => [0, 0, 0, 0]);

  for (let i = 0; i < num; i++) {
    full[i]![0] = i + 1;
    full[i]![1] = x150[i]!;
    full[i]![2] = y150[i]!;
    full[i]![3] = slopes[i]!;
  }
  for (let i = num; i < total; i++) {
    const mirror = 2 * num - i - 2;
    full[i]![0] = i + 1;
    full[i]![1] = full[mirror]![1]!;
    full[i]![2] = -full[mirror]![2]!;
    full[i]![3] = full[mirror]![3]!;
  }
  // C++ 原位倒序（无交换）——保留其对后半区的实际效果
  for (let i = 0; i < total; i++) {
    const src = full[total - 1 - i]!;
    full[i]![1] = src[1]!;
    full[i]![2] = src[2]!;
    full[i]![3] = src[3]!;
  }
  return full;
}

/** 7 列输出生成（保持 C++ generateHull 的镜像与铰点特值）。 */
function generateHull(hull: number[][]): number[][] {
  const m = hull.length;
  const nn = Math.floor((m + 1) / 2);
  const out: number[][] = Array.from({ length: m }, () => [0, 0, 0, 0, 0, 0, 0]);

  for (let i = 0; i < m; i++) {
    out[i]![0] = hull[i]![0]!;
    out[i]![1] = hull[i]![1]!;
    out[i]![2] = hull[i]![2]!;
    out[i]![6] = hull[i]![3]!;
  }

  for (let i = 0; i + 1 < nn; i++) {
    const dx = hull[i + 1]![1]! - hull[i]![1]!;
    const dy = hull[i + 1]![2]! - hull[i]![2]!;
    out[i]![4] = Math.sqrt(dx * dx + dy * dy);
    out[i]![5] = Math.atan2(dy, dx);
  }
  out[nn - 1]![4] = 1e-10;
  out[nn - 1]![5] = HALF_PI;

  for (let i = nn; i < m; i++) {
    const mirror = 2 * nn - i - 2;
    out[i]![4] = out[mirror]![4]!;
    out[i]![5] = Math.PI - out[mirror]![5]!;
    out[i]![2] = -1.0 * out[i]![2]!;
  }

  // 去掉最后一行
  out.pop();
  return out;
}

export interface HullOutResult {
  /** N×7：[序号, x, y, 0, 段长, 攻角(rad), 坡角(rad)] */
  rows: number[][];
  warnings: string[];
}

/**
 * 主流程：对齐 → 端点插入 → 弧长重采样 → 坡角 → 拼全型 → 7 列输出。
 * 对应 WaterlineProcess(raw_T145, raw_T150, raw_T155, T0, T1, T2, targetCount)；
 * sheet A→raw_T145（仅参与对齐），B→raw_T150（z=T0 平面），C→raw_T155（z=T1 平面）。
 */
export function waterlineProcess(
  rawT145: Polyline,
  rawT150: Polyline,
  rawT155: Polyline,
  T0: number,
  T1: number,
  T2: number,
  targetCount: number,
): HullOutResult {
  void T2; // 与 C++ 一致：未参与计算
  const warnings: string[] = [];
  if (
    rawT145.x.length !== rawT145.y.length ||
    rawT150.x.length !== rawT150.y.length ||
    rawT155.x.length !== rawT155.y.length
  ) {
    throw new Error("WaterlineProcess: mismatched x/y sizes.");
  }
  if (rawT145.x.length === 0 || rawT150.x.length === 0 || rawT155.x.length === 0) {
    throw new Error("WaterlineProcess: empty input waterline.");
  }

  const maxX = (pts: Polyline) => Math.max(...pts.x);
  const minY = (pts: Polyline) => Math.min(...pts.y);
  const xMax = Math.max(maxX(rawT145), maxX(rawT150), maxX(rawT155));
  const yMin = Math.min(minY(rawT145), minY(rawT150), minY(rawT155));

  const t145 = insertEndpointsWithDup(alignWaterline(rawT145, xMax, yMin));
  const t150 = insertEndpoints(alignWaterline(rawT150, xMax, yMin));
  const t155 = insertEndpoints(alignWaterline(rawT155, xMax, yMin));

  const res150 = interpWaterlineArc(t150.x, t150.y, 0.0, targetCount);
  const res155 = interpWaterlineArc(t155.x, t155.y, 0.0, targetCount);

  const num = res150.x.length;
  const slopes: number[] = new Array(num).fill(0);
  for (let i = 1; i < num; i++) {
    const p0: Vec3 = { x: res150.x[i]!, y: res150.y[i]!, z: T0 };
    const p1: Vec3 = { x: res150.x[i - 1]!, y: res150.y[i - 1]!, z: T0 };
    const p2: Vec3 = { x: res155.x[i]!, y: res155.y[i]!, z: T1 };
    slopes[i] = hullSlope(p1, p0, p2);
  }
  {
    const p0: Vec3 = { x: res150.x[1]!, y: res150.y[1]!, z: T0 };
    const p1: Vec3 = { x: res150.x[0]!, y: res150.y[0]!, z: T0 };
    const p2: Vec3 = { x: res155.x[0]!, y: res155.y[0]!, z: T1 };
    slopes[0] = hullSlope(p1, p0, p2);
  }
  for (let i = 0; i < num; i++) {
    if (slopes[i]! > HALF_PI) slopes[i] = HALF_PI;
  }

  const fullHull = buildFullHull(res150.x, res150.y, slopes);
  const rows = generateHull(fullHull);

  // 质量告警（与 C++ 一致：仅告警不抛错）
  const pts = rows.map((r) => ({ x: r[1]!, y: r[2]! }));
  const eps = 1e-9;
  outer: for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i]!.x - pts[j]!.x;
      const dy = pts[i]!.y - pts[j]!.y;
      if (dx * dx + dy * dy <= eps * eps) {
        warnings.push("WaterlineProcess: duplicate waterline points detected.");
        break outer;
      }
    }
  }
  let signed = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    signed += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(0.5 * signed) < eps) {
    warnings.push("WaterlineProcess: waterline polygon area is near zero.");
  }

  return { rows, warnings };
}
