import { describe, expect, it } from "vitest";
import { Pchip } from "../hull/pchip";
import { interpWaterlineArc } from "../hull/waterlineArc";
import { syntheticWaterlines } from "../hull/synthetic";
import { waterlineProcess } from "../hull/waterlineProcess";
import { identifyHullOut } from "../hull/identify";

describe("PCHIP（Fritsch–Carlson）", () => {
  it("端点精确通过、线性数据严格线性", () => {
    const p = new Pchip([0, 1, 2, 3], [1, 3, 5, 7]); // y = 2x+1
    expect(p.evalAt(0)).toBe(1);
    expect(p.evalAt(3)).toBe(7);
    expect(p.evalAt(1.5)).toBeCloseTo(4, 12);
  });

  it("单调数据插值保持单调（不过冲）", () => {
    const p = new Pchip([0, 1, 2, 3, 4], [0, 0.1, 0.9, 2.5, 3]);
    let prev = -Infinity;
    for (let x = 0; x <= 4; x += 0.01) {
      const v = p.evalAt(x);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it("允许外插（首/末区间多项式延伸）", () => {
    const p = new Pchip([0, 1, 2], [0, 1, 0]);
    expect(Number.isFinite(p.evalAt(-0.5))).toBe(true);
    expect(Number.isFinite(p.evalAt(2.5))).toBe(true);
  });

  it("非严格递增输入抛错", () => {
    expect(() => new Pchip([0, 1, 1], [0, 1, 2])).toThrow();
  });
});

describe("interpWaterlineArc（等弧长重采样）", () => {
  it("targetCount 个点、首尾为原折线端点", () => {
    const line = { x: [0, 1, 2, 5], y: [0, 0, 1, 1] };
    const res = interpWaterlineArc(line.x, line.y, 0, 10);
    expect(res.x).toHaveLength(10);
    expect(res.y).toHaveLength(10);
    expect(res.x[0]).toBe(0);
    expect(res.y[0]).toBe(0);
    expect(res.x[9]).toBe(5);
    expect(res.y[9]).toBe(1);
  });

  it("重采样总弧长守恒（PCHIP 过折点会圆滑与局部停顿，不要求逐步均匀）", () => {
    const line = { x: [0, 3, 3, 0], y: [0, 0, 4, 4] }; // 直角折线，总长 3+4+4=11
    const res = interpWaterlineArc(line.x, line.y, 0, 12);
    let total = 0;
    for (let i = 1; i < res.x.length; i++) {
      total += Math.hypot(res.x[i]! - res.x[i - 1]!, res.y[i]! - res.y[i - 1]!);
    }
    // PCHIP 圆滑折角使曲线略短于折线，但应接近
    expect(total).toBeGreaterThan(9.5);
    expect(total).toBeLessThanOrEqual(11.5);
  });

  it("零长度折线退化为重复端点", () => {
    const res = interpWaterlineArc([1, 1, 1], [2, 2, 2], 0, 5);
    expect(res.x).toEqual([1, 1]);
    expect(res.y).toEqual([2, 2]);
  });
});

describe("waterlineProcess（全链移植，targetCount=100）", () => {
  const w = syntheticWaterlines();
  const result = waterlineProcess(w.t145, w.t150, w.t155, 10, 10.5, 11, 100);

  it("输出 198 行 × 7 列，序号 1..198", () => {
    expect(result.rows).toHaveLength(198);
    for (const row of result.rows) {
      expect(row).toHaveLength(7);
      expect(row.every((v) => Number.isFinite(v))).toBe(true);
    }
    expect(result.rows[0]![0]).toBe(1);
    expect(result.rows[197]![0]).toBe(198);
  });

  it("铰点行特值：段长 1e-10、攻角 π/2", () => {
    const hinge = result.rows[99]!; // rows/2 = 198/2 = 99
    expect(hinge[4]).toBe(1e-10);
    expect(hinge[5]).toBeCloseTo(Math.PI / 2, 12);
  });

  it("几何范围与输入主尺度一致", () => {
    const xs = result.rows.map((r) => r[1]!);
    const ysAbs = result.rows.map((r) => Math.abs(r[2]!));
    const xSpan = Math.max(...xs) - Math.min(...xs);
    expect(xSpan).toBeGreaterThan(95);
    expect(xSpan).toBeLessThanOrEqual(100);
    const maxY = Math.max(...ysAbs);
    expect(maxY).toBeGreaterThan(10.5 * 0.95);
    expect(maxY).toBeLessThan(10.5 * 1.15);
  });

  it("坡角范围合法（0, π/2]，中体接近直立（压碎分支）", () => {
    const slopes = result.rows.map((r) => r[6]!);
    for (const s of slopes) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(Math.PI / 2 + 1e-12);
    }
    // 平行中体区域（x ∈ [−70, 0] 远端）坡角应接近 π/2
    const midSlopes = result.rows.filter((r) => r[1]! < -75).map((r) => r[6]!);
    expect(midSlopes.length).toBeGreaterThan(10);
    for (const s of midSlopes) {
      expect(s).toBeGreaterThan((88 * Math.PI) / 180);
    }
  });

  it("空输入抛错", () => {
    const w2 = syntheticWaterlines();
    expect(() => waterlineProcess({ x: [], y: [] }, w2.t150, w2.t155, 10, 10.5, 11, 100)).toThrow();
  });
});

describe("identifyHullOut（参数反推）", () => {
  it("Lpp / stem angle / waterline angle 回代合理", () => {
    const w = syntheticWaterlines();
    const { rows } = waterlineProcess(w.t145, w.t150, w.t155, 10, 10.5, 11, 100);
    const id = identifyHullOut(rows);

    expect(id.lpp).toBeGreaterThan(95);
    expect(id.lpp).toBeLessThanOrEqual(100);
    // 铰点行坡角：中体直立舷侧 → 接近 90°
    expect(id.stemAngleDeg).toBeGreaterThan(85);
    expect(id.stemAngleDeg).toBeLessThanOrEqual(90);
    // B/4 处水线角：楔形区攻角，应在 (0, 90) 内
    expect(id.waterlineAngleDeg).toBeGreaterThan(0);
    expect(id.waterlineAngleDeg).toBeLessThan(90);
    expect(id.targetY).toBeLessThan(0);
  });

  it("行数不足抛错", () => {
    expect(() => identifyHullOut([[1, 0, 0, 0, 0, 0, 0]])).toThrow();
  });
});
