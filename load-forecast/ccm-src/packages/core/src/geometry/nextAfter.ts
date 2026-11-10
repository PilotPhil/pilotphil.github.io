const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/**
 * 返回距 x 最近、朝 toward 方向的下一个 IEEE-754 双精度数。
 *
 * 与 C++ std::nextafter(x, toward) 语义一致，用于冰网格步长微调
 * （对应 CCM_Re util_polygon.cpp:142 的 nextafter(limitStep, 0.0)
 * 与 util_polygon.cpp:147 的 nextafter(limitStep, +inf)）。
 */
export function nextAfter(x: number, toward: number): number {
  if (Number.isNaN(x) || Number.isNaN(toward)) return NaN;
  if (x === toward) return x;

  if (x === 0) {
    // ±0 的相邻数是 ±2^-1074（最小 subnormal）
    return toward > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  }

  f64[0] = x;
  let bits = u64[0]!;
  const xIsNegative = (bits >> 63n) === 1n;
  const movingDown = toward < x;
  // IEEE-754 采用符号-数值编码：正数向增大方向、负数向减小方向对应整数位型 +1
  const magnitudeGrowing = xIsNegative ? movingDown : !movingDown;
  bits = magnitudeGrowing ? bits + 1n : bits - 1n;
  u64[0] = bits;
  return f64[0]!;
}
