import { describe, expect, it } from "vitest";
import { iceCharacteristicLength, iceBreakingLength, iceMeshSize } from "../geometry/iceMesh";

/**
 * 手工推演的对照工况（参数取可整除的构造值，便于逐项核算）：
 *   length_cha = (96·1³ / (12·(1-0²)·1·0.5))^0.25 = 16^0.25 = 2
 *   length_brk = 1·2·(1+0) = 2，baseStep = 1·2 = 2
 *
 * Bbeam=17 → halfBeam = 8.5 → n = 4（8 ≤ 8.5 ≤ 10）
 *   dis = 10 − 8.5 = 1.5 > 2.5·step/5 = 1 → 第三档 step' = nextafter(8.5/3.8, +∞)
 *   numM = ceil(21/step') = 10；numN = ceil(4.2/step') = 2（偶数保持）
 *   lyIce = −2·step'/2 = −step'
 */
const CASE = {
  E: 96,
  hi: 1,
  pois: 0,
  denW: 1,
  g: 0.5,
  Cls: 1,
  Cv: 0,
  Vi: 0,
  length: 21,
  width: 4.2,
  scale: 1,
  lxIce: 0,
  lyIce: 0,
  Bbeam: 17,
} as const;

describe("冰特征长度与破碎长度", () => {
  it("弹性基础板特征长度公式", () => {
    expect(iceCharacteristicLength(96, 1, 0, 1, 0.5)).toBeCloseTo(2, 12);
    expect(iceCharacteristicLength(1536, 1, 0, 1, 0.5)).toBeCloseTo(4, 12);
  });

  it("冰厚越大特征长度越长", () => {
    const thin = iceCharacteristicLength(96, 1, 0, 1, 0.5);
    const thick = iceCharacteristicLength(96, 2, 0, 1, 0.5);
    expect(thick).toBeGreaterThan(thin);
  });

  it("破碎长度含速度修正项", () => {
    // 0.32·2·(1 − 0.09·5) = 0.352
    expect(iceBreakingLength(0.32, -0.09, 5, 2)).toBeCloseTo(0.352, 12);
  });
});

describe("iceMeshSize 步长调整三分支", () => {
  it("第三档：dis > 2.5·step/5，步长上调为 halfBeam/(n−0.2) 的相邻数", () => {
    const mesh = iceMeshSize({ ...CASE });

    expect(mesh.lengthCha).toBeCloseTo(2, 12);
    expect(mesh.lengthBrk).toBeCloseTo(2, 12);
    expect(mesh.baseStep).toBe(2);
    expect(mesh.n).toBe(4);
    expect(mesh.dis).toBeCloseTo(1.5, 12);

    const limitStep = 8.5 / 3.8;
    expect(mesh.step).toBeCloseTo(limitStep, 12);
    expect(mesh.step).toBeGreaterThanOrEqual(limitStep);

    expect(mesh.numM).toBe(10);
    expect(mesh.numN).toBe(2);
    expect(mesh.cells).toHaveLength(20);
    expect(mesh.rows).toHaveLength(20);

    const ly = mesh.cells[0]!.y0;
    expect(ly).toBeCloseTo(-mesh.step, 12);

    // 首单元（j=0, i=0）
    expect(mesh.cells[0]).toEqual({
      x0: 0,
      y0: ly,
      x1: mesh.step,
      y1: ly + mesh.step,
      xc: mesh.step / 2,
      yc: ly + mesh.step / 2,
    });

    // 末单元（j=9, i=1）
    const last = mesh.cells[19]!;
    expect(last.x0).toBeCloseTo(9 * mesh.step, 12);
    expect(last.y0).toBeCloseTo(0, 12);

    // 10 列矩阵布局与 C++ iceMesh_2d 一致：x0,y0,x1,y0,x1,y1,x0,y1,xc,yc
    const c = mesh.cells[0]!;
    expect(mesh.rows[0]).toEqual([c.x0, c.y0, c.x1, c.y0, c.x1, c.y1, c.x0, c.y1, c.xc, c.yc]);

    // 关于 y=0 对称
    expect(ly + mesh.numN * mesh.step).toBeCloseTo(-ly, 12);
  });

  it("第二档：dis ≤ 2.5·step/5，步长下调为 halfBeam/(n+0.8) 的相邻数", () => {
    // Bbeam=18 → halfBeam=9 → n=4，dis = 10−9 = 1 ≤ 1.0 → 第二档
    const mesh = iceMeshSize({ ...CASE, Bbeam: 18 });
    const limitStep = 9 / 4.8;
    expect(mesh.step).toBeCloseTo(limitStep, 12);
    expect(mesh.step).toBeLessThanOrEqual(limitStep);
  });

  it("第一档：dis < step/5 时保持原步长", () => {
    // Bbeam=19.7 → halfBeam=9.85 → n=4，dis = 10−9.85 = 0.15 < 0.4 → 保持
    const mesh = iceMeshSize({ ...CASE, Bbeam: 19.7 });
    expect(mesh.step).toBe(2);
    expect(mesh.adjustedScale).toBe(1);
    expect(mesh.numM).toBe(11);
    expect(mesh.numN).toBe(4);
  });

  it("退化：Bbeam=0 时 n=0 走第三档极限，网格为空", () => {
    const mesh = iceMeshSize({ ...CASE, Bbeam: 0 });
    expect(mesh.n).toBe(0);
    expect(mesh.cells).toHaveLength(0);
    expect(mesh.rows).toHaveLength(0);
  });
});
