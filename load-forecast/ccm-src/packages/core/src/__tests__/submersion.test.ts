import { describe, expect, it } from "vitest";
import { computeFsub, type FsubParams } from "../physics/submersion";

const BASE: FsubParams = {
  ViX: 5,
  hi: 1,
  g: 9.81,
  Lship: 100,
  Lbow: 10,
  Bbeam: 20,
  Tdraft: 5,
  phi: 30,
  alpha: 45,
  rhoW: 1025,
  rhoI: 900,
  miu: 0.1,
  opeDir: 1,
  prevFsubN: 0,
};

describe("computeFsub（Enkvist 浸没阻力，util_polygon.hpp:287-317 对齐）", () => {
  it("Vi=0 时 aa=0，退化为上一帧滤波值", () => {
    expect(computeFsub({ ...BASE, ViX: 0, prevFsubN: 123.456 })).toBe(123.456);
  });

  it("aa=1 时输出符号由 opeDir 决定", () => {
    const fwd = computeFsub({ ...BASE, ViX: 10, opeDir: 1 });
    const rev = computeFsub({ ...BASE, ViX: 10, opeDir: -1 });
    expect(fwd).toBe(-rev);
  });

  it("只依赖航速绝对值（关于符号对称）", () => {
    expect(computeFsub({ ...BASE, ViX: 5 })).toBe(computeFsub({ ...BASE, ViX: -5 }));
  });

  it("航速越大阻力绝对值越大（速度修正项单调）", () => {
    const slow = Math.abs(computeFsub({ ...BASE, ViX: 2 }));
    const fast = Math.abs(computeFsub({ ...BASE, ViX: 8 }));
    expect(fast).toBeGreaterThan(slow);
  });

  // 回归基线：由当前 TS 实现生成，Phase 1 用 CCM.exe CLI 黄金数据替换
  it("回归基线", () => {
    expect(computeFsub(BASE)).toBeCloseTo(-364826.9859755743, 6);
  });
});
