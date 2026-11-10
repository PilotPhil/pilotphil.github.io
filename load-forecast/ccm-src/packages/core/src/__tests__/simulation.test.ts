import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  IceCellState,
  Simulation,
  type SimParams,
} from "../engine/simulation";

const SMALL: Partial<SimParams> = {
  fieldLength: 30,
  fieldWidth: 15,
  Lpp: 40,
  Bbeam: 10,
  Lbow: 8,
  Nt: 80,
  ViX: 2.57,
  ViY: 0,
};

function removedCount(sim: Simulation): number {
  let n = 0;
  for (const s of sim.statuses) if (s === IceCellState.Removed) n++;
  return n;
}

describe("Simulation（fixedTimeStep 移植）", () => {
  it("构造：冰场对齐与网格规模", () => {
    const sim = new Simulation(SMALL);
    // l_brk = 0.32·l_cha·(1−0.09·2.57) ≈ 2.536 → numM = ceil(30/2.536) = 12, numN = 6
    expect(sim.cells.length).toBe(12 * 6);
    expect(sim.statuses.every((s) => s === IceCellState.Intact)).toBe(true);
    expect(sim.fieldBBox.minX).toBe(0);
    expect(sim.isFinished()).toBe(false);

    const rev = new Simulation({ ...SMALL, OpeDir: -1 });
    expect(rev.fieldBBox.minX).toBeLessThan(0);
  });

  it("步进：冰被实际破坏、状态单调推进、力为有限值", () => {
    const sim = new Simulation(SMALL);
    let prevRemoved = 0;
    for (let k = 0; k < 80; k++) {
      const stats = sim.step();
      expect(Number.isFinite(stats.fbrkFx)).toBe(true);
      expect(Number.isFinite(stats.fsub)).toBe(true);
      expect(stats.fsub).toBeLessThan(0); // OpeDir=1 时浸没阻力为负（迎流方向）

      const nowRemoved = removedCount(sim);
      expect(nowRemoved).toBeGreaterThanOrEqual(prevRemoved);
      prevRemoved = nowRemoved;
    }

    expect(prevRemoved).toBeGreaterThan(0);
    expect(sim.fbrkSeries).toHaveLength(80);
    expect(sim.fsubSeries).toHaveLength(80);
    expect(sim.isFinished()).toBe(true);

    // 状态只能沿 Intact → InContact → Removed 单向推进
    expect(sim.statuses.every((s) => s === IceCellState.Intact || s === IceCellState.InContactWithShip || s === IceCellState.Removed)).toBe(true);
  });

  it("summaryKn 与时间历程手工均值一致（C++ 汇总口径）", () => {
    const sim = new Simulation(SMALL);
    for (let k = 0; k < 30; k++) sim.step();

    const s = sim.summaryKn()!;
    let sumFsub = 0;
    let sumFbrk = 0;
    for (let i = 0; i < 30; i++) {
      const fsub = Math.abs(sim.fsubSeries[i]!) / 1000;
      sumFsub += fsub;
      sumFbrk += Math.max(0, (Math.abs(sim.fbrkSeries[i]!) + Math.abs(sim.fsubSeries[i]!)) / 1000 - fsub);
    }
    expect(s.submersionKn).toBeCloseTo(sumFsub / 30, 9);
    expect(s.breakingKn).toBeCloseTo(sumFbrk / 30, 9);
    expect(s.totalKn).toBeCloseTo(s.breakingKn + s.submersionKn, 12);
  });

  it("默认参数可完整跑完且破坏量合理", () => {
    const sim = new Simulation({ ...DEFAULT_PARAMS, Nt: 200 });
    for (let k = 0; k < 200; k++) sim.step();
    const s = sim.summaryKn()!;
    expect(s.totalKn).toBeGreaterThan(0);
    expect(Number.isFinite(s.totalKn)).toBe(true);
    expect(removedCount(sim)).toBeGreaterThan(50);
  });
});
