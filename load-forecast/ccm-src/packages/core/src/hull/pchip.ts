/**
 * PCHIP 分段三次 Hermite 插值（Fritsch–Carlson 1980，与 MATLAB interp1(...,'pchip') 同式）。
 *
 * 对应 CCM_Re hullProcess/interp1_pchip.h 对 boost::math::interpolators::pchip 的封装：
 * x 须严格递增；允许外插（落在首/末区间多项式上）。
 */
export class Pchip {
  private readonly xs: number[];
  private readonly ys: number[];
  /** 每个节点的导数 d_k */
  private readonly ds: number[];

  constructor(x: number[], y: number[]) {
    if (x.length !== y.length) throw new Error("Pchip: x/y length mismatch");
    if (x.length < 2) throw new Error("Pchip: at least two points required");
    for (let i = 0; i + 1 < x.length; i++) {
      if (!(x[i + 1]! > x[i]!)) throw new Error("Pchip: x must be strictly increasing");
    }
    this.xs = [...x];
    this.ys = [...y];

    const n = x.length;
    const h: number[] = [];
    const delta: number[] = [];
    for (let k = 0; k + 1 < n; k++) {
      h.push(x[k + 1]! - x[k]!);
      delta.push((y[k + 1]! - y[k]!) / h[k]!);
    }

    const d: number[] = new Array(n).fill(0);
    if (n === 2) {
      d[0] = delta[0]!;
      d[1] = delta[0]!;
    } else {
      // 内部节点：异号（或含 0）导数置 0，否则加权调和平均
      for (let k = 1; k + 1 < n; k++) {
        if (delta[k - 1]! * delta[k]! <= 0) {
          d[k] = 0;
        } else {
          const w1 = 2 * h[k]! + h[k - 1]!;
          const w2 = h[k]! + 2 * h[k - 1]!;
          d[k] = (w1 + w2) / (w1 / delta[k - 1]! + w2 / delta[k]!);
        }
      }
      // 端点：非中心三点公式 + 符号/幅值截断
      d[0] = ((2 * h[0]! + h[1]!) * delta[0]! - h[0]! * delta[1]!) / (h[0]! + h[1]!);
      if (Math.sign(d[0]) !== Math.sign(delta[0]!)) {
        d[0] = 0;
      } else if (
        Math.sign(delta[0]!) !== Math.sign(delta[1]!) &&
        Math.abs(d[0]) > 3 * Math.abs(delta[0]!)
      ) {
        d[0] = 3 * delta[0]!;
      }
      d[n - 1] =
        ((2 * h[n - 2]! + h[n - 3]!) * delta[n - 2]! - h[n - 2]! * delta[n - 3]!) /
        (h[n - 2]! + h[n - 3]!);
      if (Math.sign(d[n - 1]!) !== Math.sign(delta[n - 2]!)) {
        d[n - 1] = 0;
      } else if (
        Math.sign(delta[n - 2]!) !== Math.sign(delta[n - 3]!) &&
        Math.abs(d[n - 1]!) > 3 * Math.abs(delta[n - 2]!)
      ) {
        d[n - 1] = 3 * delta[n - 2]!;
      }
    }
    this.ds = d;
  }

  /** 单点求值；查询点在区间外时使用首/末区间多项式外插。 */
  evalAt(xq: number): number {
    const n = this.xs.length;
    // 二分定位区间 k：xs[k] <= xq <= xs[k+1]（越界钳到首/末区间）
    let lo = 0;
    let hi = n - 2;
    let k = 0;
    if (xq <= this.xs[0]!) {
      k = 0;
    } else if (xq >= this.xs[n - 1]!) {
      k = n - 2;
    } else {
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.xs[mid + 1]! <= xq) lo = mid + 1;
        else hi = mid - 1;
      }
      k = lo;
    }
    const h = this.xs[k + 1]! - this.xs[k]!;
    const t = (xq - this.xs[k]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * this.ys[k]! +
      (t3 - 2 * t2 + t) * h * this.ds[k]! +
      (-2 * t3 + 3 * t2) * this.ys[k + 1]! +
      (t3 - t2) * h * this.ds[k + 1]!
    );
  }
}
