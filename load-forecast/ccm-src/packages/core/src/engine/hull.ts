/**
 * 参数化水线船型。
 *
 * CCM_Re 的 HullOut 矩阵为每行 7 列：[序号, x, y, -, 段长, 攻角(rad), 坡角(rad)]，
 * 由 WaterlineProcess 从三条水线型值表计算。Web 版在 xlsx 导入（阶段 2）落地前，
 * 先用参数化船型直接生成同一结构的逐顶点属性：
 *   - 顶点序与 C++ 一致：船首尖在 (0,0)，先沿 +y 舷侧走到船尾 (−Lpp, B/2)，
 *     镜像出 −y 舷侧，船尾封板由首尾顶点连线隐式闭合；
 *   - 段长/攻角：顶点指向下一顶点线段的长度与方向角（generateHull 同式）；
 *   - 坡角：船体表面与铅垂的夹角——平行中体为直立舷侧（90°，压碎分支），
 *     船首楔形段由 90° 线性过渡到 stemSlopeDeg（弯曲分支），分界阈值 84°
 *     与 simulator.cpp narrowPhase 一致。
 */
import type { Poly, Pt } from "../geometry/polygon";
import { polyBBox, type BBox } from "../geometry/polygon";

export interface HullVertexAttrs {
  /** 顶点指向下一顶点的段长（m） */
  segLen: number;
  /** 段方向角 atan2(dy, dx)（rad） */
  attackRad: number;
  /** 船体表面坡角（deg，90°=直立舷侧） */
  slopeDeg: number;
}

export interface HullShapeParams {
  Lpp: number;
  Bbeam: number;
  /** 船首楔形段长度（从船首尖起算） */
  Lbow: number;
  /** 船首尖处表面坡角（deg） */
  stemSlopeDeg: number;
  /** 每舷侧采样点数下限，默认 24 */
  pointsPerSide?: number;
}

export interface Hull {
  vertices: Poly;
  attrs: HullVertexAttrs[];
}

export function buildParametricHull(p: HullShapeParams): Hull {
  const Lpp = Math.max(p.Lpp, 1e-6);
  const halfBeam = p.Bbeam / 2;
  const Lbow = Math.min(Math.max(p.Lbow, 1e-6), Lpp);
  const nSide = Math.max(Math.floor(p.pointsPerSide ?? 24), 8);

  // 半条水线：船首尖 (0,0) → 楔形段 → 平行中体 → 船尾舷角 (−Lpp, B/2)
  const nWedge = nSide;
  const nMid = Math.max(Math.floor(nSide / 2), 3);
  const half: Pt[] = [];
  for (let k = 0; k < nWedge; k++) {
    const t = k / (nWedge - 1);
    half.push({ x: -Lbow * t, y: halfBeam * t });
  }
  for (let k = 1; k <= nMid; k++) {
    const x = -Lbow - ((Lpp - Lbow) * k) / nMid;
    half.push({ x, y: halfBeam });
  }

  // 镜像出封闭多边形：跳过首尖与船尾舷角的重复点
  const vertices: Poly = [...half];
  for (let k = half.length - 2; k >= 1; k--) {
    vertices.push({ x: half[k]!.x, y: -half[k]!.y });
  }

  const attrs: HullVertexAttrs[] = [];
  const m = vertices.length;
  for (let i = 0; i < m; i++) {
    const cur = vertices[i]!;
    const nxt = vertices[(i + 1) % m]!;
    const dx = nxt.x - cur.x;
    const dy = nxt.y - cur.y;
    const midX = (cur.x + nxt.x) / 2;
    const slopeDeg =
      midX <= -Lbow
        ? 90
        : 90 - (90 - p.stemSlopeDeg) * (1 - Math.abs(midX) / Lbow);
    attrs.push({ segLen: Math.hypot(dx, dy), attackRad: Math.atan2(dy, dx), slopeDeg });
  }

  return { vertices, attrs };
}

/** 平移运动的船体（对应 simulator.h 的 ship 类，dphi 恒为 0）。 */
export class Ship {
  readonly attrs: HullVertexAttrs[];
  poly: Poly;
  bbox: BBox;

  constructor(hull: Hull) {
    this.attrs = hull.attrs;
    this.poly = hull.vertices;
    this.bbox = polyBBox(this.poly);
  }

  move(dx: number, dy: number): void {
    for (let i = 0; i < this.poly.length; i++) {
      const v = this.poly[i]!;
      v.x += dx;
      v.y += dy;
    }
    this.bbox = polyBBox(this.poly);
  }
}

/**
 * 由真实 WaterlineProcess 输出（N×7：[序号, x, y, 0, 段长, 攻角(rad), 坡角(rad)]）
 * 构造船体；无效输入返回 null（调用方回退参数化船型）。
 */
export function shipFromHullOut(rows: number[][]): Hull | null {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const vertices: Poly = [];
  const attrs: HullVertexAttrs[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 7) return null;
    const x = r[1];
    const y = r[2];
    const segLen = r[4];
    const attackRad = r[5];
    const slopeRad = r[6];
    if (![x, y, segLen, attackRad, slopeRad].every((v) => typeof v === "number" && Number.isFinite(v))) {
      return null;
    }
    vertices.push({ x: x!, y: y! });
    attrs.push({ segLen: segLen!, attackRad: attackRad!, slopeDeg: (slopeRad! * 180) / Math.PI });
  }
  return { vertices, attrs };
}
