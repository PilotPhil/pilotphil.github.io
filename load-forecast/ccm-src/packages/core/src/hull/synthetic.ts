/**
 * 合成破冰船水线样例（开发/测试用；真实数据到位后由 xlsx 导入替换）。
 *
 * 生成三条半宽图水线（sheet A/B/C 对应）：
 *   B（设计水线，z=T0 平面）：平行中体 + 线性船首楔形；
 *   C（z=T1 平面）：仅船首楔形段外飘（中体保持直立舷侧 → 坡角≈90° 压碎分支）；
 *   A（z=T2 平面）：稍内缩（仅参与对齐偏移计算，插值结果不被使用）。
 */
import type { Polyline } from "./waterlineArc";

export interface SyntheticShipOptions {
  /** 垂线间长 (m)，默认 100 */
  Lpp?: number;
  /** 船宽 (m)，默认 21 */
  Bbeam?: number;
  /** 船首楔形段长 (m)，默认 30 */
  Lbow?: number;
  /** 站数（含首尾），默认 21 */
  stations?: number;
}

export interface SyntheticWaterlines {
  t145: Polyline;
  t150: Polyline;
  t155: Polyline;
}

export function syntheticWaterlines(opts: SyntheticShipOptions = {}): SyntheticWaterlines {
  const L = opts.Lpp ?? 100;
  const B2 = (opts.Bbeam ?? 21) / 2;
  const Lbow = opts.Lbow ?? 30;
  const n = Math.max(opts.stations ?? 21, 4);

  const designY = (x: number): number => {
    if (x <= L - Lbow) return B2;
    return B2 * ((L - x) / Lbow);
  };
  const upperY = (x: number): number => {
    const base = designY(x);
    if (x <= L - Lbow) return base; // 中体直立舷侧
    const w = (L - x) / Lbow; // 0..1，船首向楔形段外飘
    return base * (1 + 0.12 * w * w);
  };

  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push((L * i) / (n - 1));

  return {
    t145: { x: [...xs], y: xs.map((x) => designY(x) * 0.97) },
    t150: { x: [...xs], y: xs.map(designY) },
    t155: { x: [...xs], y: xs.map(upperY) },
  };
}
