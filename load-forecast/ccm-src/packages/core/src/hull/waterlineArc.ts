/**
 * 水线按弧长重采样（对应 CCM_Re hullProcess/interpWaterlineArc.h）。
 *
 * targetCount >= 2 时忽略 spacing，按 [0, 总弧长] 等分取 targetCount 个查询点
 * （含首尾端点），分别对 x(s)、y(s) 做 PCHIP 插值。
 */
import { Pchip } from "./pchip";
import { nextAfter } from "../geometry/nextAfter";

export interface Polyline {
  x: number[];
  y: number[];
}

export function interpWaterlineArc(
  x: number[],
  y: number[],
  spacing: number,
  targetCount: number,
): Polyline {
  const n = x.length;
  if (n === 0 || n !== y.length) {
    throw new Error("interpWaterlineArc: mismatched x/y sizes");
  }

  // 累计弧长
  const s: number[] = new Array(n);
  s[0] = 0;
  for (let i = 1; i < n; i++) {
    s[i] = s[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, y[i]! - y[i - 1]!);
  }
  const maxS = s[n - 1]!;

  // 去除零长度段：epsS = maxS 的 1 ulp（maxS=0 时退化为机器精度）
  const epsS = maxS > 0 ? nextAfter(maxS, Number.POSITIVE_INFINITY) - maxS : Number.EPSILON;
  const sx: number[] = [x[0]!];
  const sy: number[] = [y[0]!];
  const ss: number[] = [0];
  let lastS = 0;
  for (let i = 1; i < n; i++) {
    if (s[i]! - lastS > epsS) {
      sx.push(x[i]!);
      sy.push(y[i]!);
      ss.push(s[i]!);
      lastS = s[i]!;
    }
  }

  // 退化：仅剩 1 点或总长为 0 → 该点重复两次
  if (ss.length === 1 || maxS <= 0) {
    return { x: [x[0]!, x[0]!], y: [y[0]!, y[0]!] };
  }

  // 查询点
  let sq: number[];
  if (targetCount >= 2) {
    sq = [];
    for (let i = 0; i < targetCount; i++) {
      sq.push((i * maxS) / (targetCount - 1));
    }
  } else {
    if (!(spacing > 0)) {
      throw new Error("interpWaterlineArc: spacing must be positive");
    }
    sq = [];
    for (let v = 0; v < maxS; v += spacing) {
      sq.push(v);
    }
    sq.push(maxS);
  }

  const px = new Pchip(ss, sx);
  const py = new Pchip(ss, sy);
  return { x: sq.map((v) => px.evalAt(v)), y: sq.map((v) => py.evalAt(v)) };
}
