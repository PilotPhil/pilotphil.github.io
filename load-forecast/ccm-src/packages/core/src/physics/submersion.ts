const DEG = Math.PI / 180;

const cosDeg = (d: number) => Math.cos(d * DEG);
const sinDeg = (d: number) => Math.sin(d * DEG);
const tanDeg = (d: number) => Math.tan(d * DEG);

export interface FsubParams {
  /** 航速分量 Vi_x (m/s)，取绝对值计入速度修正（与 C++ 一致） */
  ViX: number;
  /** 冰厚 hi (m) */
  hi: number;
  /** 重力加速度 g (m/s²) */
  g: number;
  /** 船长 Lship (m) */
  Lship: number;
  /** 船首特征长 Lbow (m) */
  Lbow: number;
  /** 船宽 Bbeam (m) */
  Bbeam: number;
  /** 吃水 Tdraft (m) */
  Tdraft: number;
  /** 舷侧倾角 phi (deg) */
  phi: number;
  /** 船首倾角 alpha (deg) */
  alpha: number;
  /** 海水密度 rho_w (kg/m³) */
  rhoW: number;
  /** 冰密度 rho_i (kg/m³) */
  rhoI: number;
  /** 冰-船摩擦系数 miu */
  miu: number;
  /** 运动方向 OpeDir（±1） */
  opeDir: number;
  /** 上一步滤波输出 Fsub(n-1) */
  prevFsubN: number;
}

/**
 * Enkvist 型浸没阻力（含速度修正项与一阶低通滤波）。
 *
 * 与 CCM_Re `util/util_polygon.hpp:287-317` 的 computeFsub 数值对齐：
 *   psi  = atan(tanφ / sinα)
 *   Rs   = (ρw-ρi)·g·hi·B·(term1 + μ·term2)
 *   Fsub = aa·(-OpeDir·Rs·(1 + 11.4·|Vi|/√(g·L))) + (1-aa)·Fsub(n-1)
 *   aa   = |Vi_x / Lbow|
 */
export function computeFsub(p: FsubParams): number {
  const psi = Math.atan(tanDeg(p.phi) / sinDeg(p.alpha));
  const viAbs = Math.abs(p.ViX);
  const term1 = (p.Tdraft * (p.Bbeam + p.Tdraft)) / (p.Bbeam + 2 * p.Tdraft);
  const tanPhi = tanDeg(p.phi);
  const tanAlpha = tanDeg(p.alpha);
  const sinPhi = sinDeg(p.phi);
  const term2 =
    0.7 * p.Lship -
    p.Tdraft / tanPhi -
    p.Bbeam / 4 / tanAlpha +
    p.Tdraft * cosDeg(p.phi) * Math.cos(psi) * Math.sqrt(1 / (sinPhi * sinPhi) + 1 / (tanAlpha * tanAlpha));
  const rs = (p.rhoW - p.rhoI) * p.g * p.hi * p.Bbeam * (term1 + p.miu * term2);
  const base = rs * (1 + (11.4 * viAbs) / Math.sqrt(p.g * p.Lship));
  const aa = Math.abs(p.ViX / p.Lbow);
  const fsubmersion = -p.opeDir * base;

  return aa * fsubmersion + (1 - aa) * p.prevFsubN;
}
