/**
 * 仿真步进引擎。
 *
 * 对 CCM_Re util/simulator.cpp fixedTimeStep 的 Qt 解耦移植：
 *   moveShip → iceBreaking → iceSubmersion → 记录
 * 单例/信号槽/视图直调改为纯状态机 + 事件返回，渲染由调用方负责。
 * 判据、系数与分支顺序与 narrowPhase 逐行对齐（含 84° 分界、
 * 弯曲破坏 FV ≥ pf、压碎破坏 A ≥ 0.2·l_brk²）。
 */
import { iceCharacteristicLength, iceMeshSize } from "../geometry/iceMesh";
import {
  bboxOverlap,
  closestVertex,
  intersectShipCell,
  polyBBox,
  type Poly,
  type Pt,
} from "../geometry/polygon";
import { computeFsub } from "../physics/submersion";
import { Ship, buildParametricHull, shipFromHullOut } from "./hull";

export const IceCellState = {
  Intact: 0,
  InContactWithShip: 1,
  Removed: 2,
} as const;

export interface SimParams {
  /** 仿真时间步 delta_t（s） */
  deltaT: number;
  /** 总步数 N_t（≤0 表示不限步数） */
  Nt: number;
  /** 运动方向 OpeDir（±1） */
  OpeDir: number;
  /** 航速 Vi_x / Vi_y（m/s） */
  ViX: number;
  ViY: number;

  // ---- 冰参数 ----
  /** 冰厚 hi（m） */
  hi: number;
  /** 冰弯曲强度 sigma_f（Pa） */
  sigmaF: number;
  /** 冰压缩强度 sigma_c（Pa） */
  sigmaC: number;
  /** 冰弹性模量 Ei（Pa） */
  Ei: number;
  /** 泊松比 pois */
  pois: number;
  /** 水密度 den_w（kg/m³） */
  denW: number;
  /** 冰密度 den_i（kg/m³） */
  denI: number;
  /** 摩擦系数 miu_hi */
  miu: number;
  /** 破碎长度系数 Cl */
  Cl: number;
  /** 破碎长度速度系数 Cv */
  Cv: number;
  /** 弯曲破坏系数 Cf */
  Cf: number;
  /** 冰场长度/宽度（m） */
  fieldLength: number;
  fieldWidth: number;

  // ---- 船体参数 ----
  Lpp: number;
  Bbeam: number;
  /** 吃水 Tdraft（m），作用于浸没阻力 */
  Tdraft: number;
  /** 船首楔形段长 Lbow（m） */
  Lbow: number;
  /** 浸没阻力公式用的舷侧倾角 phi（deg） */
  phi: number;
  /** 浸没阻力公式用的船首倾角 alpha（deg） */
  alpha: number;
  /** 参数化船首尖表面坡角（deg），表面坡角 ≤84° 走弯曲分支 */
  stemSlopeDeg: number;

  // ---- 其他参数（功率公式 / 报告 / 与桌面版 Param 对齐） ----
  /** 雪厚 S_c (m)，forecast 经验功率用 */
  Sc: number;
  /** 排水量 Ddisp (t)，CCM 功率公式用 */
  Ddisp: number;
  /** 总长 Loa (m)（报告/展示用） */
  Loa: number;
  /** 修正系数 f_2（推进模式枚举映射值 0.9/1.0） */
  f2: number;
  /** 修正系数 f_3（艏型枚举映射值 0.9/1.0） */
  f3: number;
  /** 修正系数 f_4（桨数枚举映射值 0.88/0.99/1.06） */
  f4: number;
  /** 斜坡/陡峭分界角（当前 C++ 判据未启用，保留参数一致性） */
  slopeL: number;
  slopeU: number;
}

export const DEFAULT_PARAMS: SimParams = {
  deltaT: 0.1,
  Nt: 500,
  OpeDir: 1,
  ViX: 2.57,
  ViY: 0,

  hi: 0.6,
  sigmaF: 500e3,
  sigmaC: 2800e3,
  Ei: 5.5e9,
  pois: 0.33,
  denW: 1000,
  denI: 900,
  miu: 0.1,
  Cl: 0.32,
  Cv: -0.09,
  Cf: 2.9,
  fieldLength: 250,
  fieldWidth: 110,

  Lpp: 100,
  Bbeam: 21,
  Tdraft: 6,
  Lbow: 25,
  phi: 30,
  alpha: 45,
  stemSlopeDeg: 45,

  Sc: 0,
  Ddisp: 10000.0,
  Loa: 0,
  f2: 0.9,
  f3: 0.9,
  f4: 0.88,
  slopeL: 70.0,
  slopeU: 80.0,
};

const DEG = Math.PI / 180;
const sinDeg = (d: number) => Math.sin(d * DEG);
const cosDeg = (d: number) => Math.cos(d * DEG);
/** C++ 源码硬编码的 pi = 3.141593（保持数值一致） */
const PI_CPP = 3.141593;
/** C++ 源码硬编码的重力加速度 9.8 */
const G_CPP = 9.8;

export interface NarrowResult {
  state?: number;
  fx: number;
  fy: number;
  fz: number;
  overlap: Poly | null;
}

export interface StepStats {
  step: number;
  /** 本步破冰合力 fx（N） */
  fbrkFx: number;
  /** 本步浸没阻力（N） */
  fsub: number;
  /** 本步新破坏单元数 */
  newlyRemoved: number;
}

export interface ResistanceSummaryKn {
  breakingKn: number;
  submersionKn: number;
  totalKn: number;
}

export class Simulation {
  readonly params: SimParams;
  readonly ship: Ship;
  readonly cells: Poly[] = [];
  readonly statuses: Uint8Array;
  /** 冰场范围（用于视图自适应） */
  readonly fieldBBox: ReturnType<typeof polyBBox>;
  /** 时间历程（每步一项） */
  readonly fbrkSeries: number[] = [];
  readonly fsubSeries: number[] = [];
  /** 最近一步的船-冰交叠多边形（渲染高亮用） */
  overlaps: Poly[] = [];
  currentStep = 0;

  private fsubN = 0;

  constructor(params: Partial<SimParams> = {}, hullOut: number[][] | null = null) {
    const p = { ...DEFAULT_PARAMS, ...params };
    this.params = p;

    const realHull = shipFromHullOut(hullOut ?? []);
    this.ship = new Ship(
      realHull ??
        buildParametricHull({
          Lpp: p.Lpp,
          Bbeam: p.Bbeam,
          Lbow: p.Lbow,
          stemSlopeDeg: p.stemSlopeDeg,
        }),
    );

    // 冰场对齐，与 simulator.cpp onLoadIceRequested 一致：
    // OpeDir=1 时船首尖从冰场迎风边 (x=0) 进入；OpeDir=-1 时冰场整体左移。
    const lx = p.OpeDir === -1 ? -(p.fieldLength + p.Lpp * 1.1 + 4) : 0;
    const Vi = Math.hypot(p.ViX, p.ViY);
    const mesh = iceMeshSize({
      E: p.Ei,
      hi: p.hi,
      pois: p.pois,
      denW: p.denW,
      g: G_CPP,
      Cls: p.Cl,
      Cv: p.Cv,
      Vi,
      length: p.fieldLength,
      width: p.fieldWidth,
      scale: 1,
      lxIce: lx,
      lyIce: 0,
      Bbeam: p.Bbeam,
    });
    for (const c of mesh.cells) {
      this.cells.push([
        { x: c.x0, y: c.y0 },
        { x: c.x1, y: c.y0 },
        { x: c.x1, y: c.y1 },
        { x: c.x0, y: c.y1 },
      ]);
    }
    this.statuses = new Uint8Array(this.cells.length);

    const xMax = lx + p.fieldLength;
    this.fieldBBox = { minX: lx, minY: -(p.fieldWidth / 2), maxX: xMax, maxY: p.fieldWidth / 2 };
  }

  isFinished(): boolean {
    return this.params.Nt > 0 && this.currentStep >= this.params.Nt;
  }

  /** 单个时间步；返回本步统计（渲染层据此取快照）。 */
  step(): StepStats {
    const p = this.params;
    this.currentStep++;

    // 1) moveShip：匀速运动学平移（simulator.cpp moveShip）
    this.ship.move(p.deltaT * p.ViX * p.OpeDir, p.deltaT * p.ViY * p.OpeDir);

    // 2) iceBreaking：遍历未破坏单元，宽相包围盒 → 窄相多边形求交 + 经验破坏判据
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let newlyRemoved = 0;
    this.overlaps = [];
    for (let i = 0; i < this.cells.length; i++) {
      const st = this.statuses[i]!;
      if (st !== IceCellState.Intact && st !== IceCellState.InContactWithShip) {
        continue; // Removed 单元不再参与
      }
      const cell = this.cells[i]!;
      if (!bboxOverlap(this.ship.bbox, polyBBox(cell))) continue;

      const nr = this.narrowPhase(cell);
      if (nr.state !== undefined) {
        this.statuses[i] = nr.state;
        if (nr.state === IceCellState.Removed) newlyRemoved++;
      }
      fx += nr.fx;
      fy += nr.fy;
      fz += nr.fz;
      if (nr.overlap) this.overlaps.push(nr.overlap);
    }
    this.fbrkSeries.push(fx);

    // 3) iceSubmersion：Enkvist 公式 + 一阶低通滤波
    const v = Math.hypot(p.ViX, p.ViY);
    this.fsubN = computeFsub({
      ViX: v,
      hi: p.hi,
      g: G_CPP,
      Lship: p.Lpp,
      Lbow: p.Lbow,
      Bbeam: p.Bbeam,
      Tdraft: p.Tdraft,
      phi: p.phi,
      alpha: p.alpha,
      rhoW: p.denW,
      rhoI: p.denI,
      miu: p.miu,
      opeDir: p.OpeDir,
      prevFsubN: this.fsubN,
    });
    this.fsubSeries.push(this.fsubN);

    return { step: this.currentStep, fbrkFx: fx, fsub: this.fsubN, newlyRemoved };
  }

  /** 单元窄相（对应 Simulator::narrowPhase，死代码与中间体区间跳过段未移植）。 */
  private narrowPhase(cell: Poly): NarrowResult {
    const zero: NarrowResult = { fx: 0, fy: 0, fz: 0, overlap: null };
    const p = this.params;

    const inter = intersectShipCell(this.ship.poly, cell);
    if (inter.poly === null) return zero;

    const { index } = closestVertex(this.ship.poly, { x: inter.cx, y: inter.cy });
    if (index < 0 || index >= this.ship.attrs.length) return zero;
    const attr = this.ship.attrs[index]!;

    const A = inter.area;
    if (A < 1e-6) return zero;

    const attackRawDeg = (attr.attackRad * 180) / Math.PI;
    const slopeDeg = attr.slopeDeg;
    const widthCru = inter.width;

    // 运动方向角（世界系）：Ang_i = atan2(−OpeDir·Vi_y, −OpeDir·Vi_x)
    const angI = Math.atan2(-p.OpeDir * p.ViY, -p.OpeDir * p.ViX);
    const attackDeg = (angI - attr.attackRad) * (180 / Math.PI);

    const Vi = Math.hypot(p.ViX, p.ViY);
    const lengthCha = iceCharacteristicLength(p.Ei, p.hi, p.pois, p.denW, G_CPP);
    const lengthBrk = p.Cl * lengthCha * (1 + p.Cv * Vi);

    const m = -0.16;
    const n = p.hi >= 0 && p.hi < 1 ? -0.5 + p.hi / 5 : -0.3;
    // pf = Cf·(open_ang/π)²·σf·hi²，open_ang = 2（C++ 同值）
    const pf = p.Cf * Math.pow(2 / PI_CPP, 2) * p.sigmaF * p.hi * p.hi;

    let FH = 0;
    let fH = 0;
    let FV = 0;
    let state: number | undefined;

    if (slopeDeg > 0 && slopeDeg <= 84) {
      // 斜坡区：弯曲破坏判据
      const Fcr = (p.sigmaC * A) / cosDeg(slopeDeg);
      const fV = p.miu * Fcr * sinDeg(attackDeg);
      fH = p.miu * Fcr * cosDeg(attackDeg);
      FH = Fcr * sinDeg(slopeDeg) + fV * cosDeg(slopeDeg);
      FV = Fcr * cosDeg(slopeDeg) - fV * sinDeg(slopeDeg);
      state = FV >= pf ? IceCellState.Removed : IceCellState.InContactWithShip;
    } else if (slopeDeg >= 84) {
      // 陡峭区：压碎公式
      const hiPow = Math.pow(p.hi, n);
      const widthRatio = p.hi > 0 && widthCru > 0 ? Math.pow(widthCru / p.hi, m) : 0;
      const crush = attr.segLen * hiPow * widthRatio * p.hi * p.sigmaC * sinDeg(attackDeg);
      FH = crush * sinDeg(slopeDeg);
      FV = crush * cosDeg(slopeDeg);
      fH = crush * p.miu * cosDeg(attackDeg);
      state =
        lengthBrk > 0 && A / (lengthBrk * lengthBrk) >= 0.2
          ? IceCellState.Removed
          : IceCellState.InContactWithShip;
    } else {
      // 坡角非法（≤0）：力置零，同 C++ else 分支
    }

    const fx = -FH * sinDeg(attackRawDeg) + fH * cosDeg(attackRawDeg);
    const fy = FH * cosDeg(attackRawDeg) + fH * sinDeg(attackRawDeg);
    return { state, fx, fy, fz: FV, overlap: inter.poly };
  }

  /** 三项阻力汇总（kN），对应 computeAverageResistanceSummaryKn 的平均口径。 */
  summaryKn(): ResistanceSummaryKn | null {
    const rows = Math.min(this.fbrkSeries.length, this.fsubSeries.length);
    if (rows === 0) return null;
    let sumFsub = 0;
    let sumFbrk = 0;
    for (let i = 0; i < rows; i++) {
      const fsub = Math.abs(this.fsubSeries[i]!) / 1000;
      const combined = (Math.abs(this.fbrkSeries[i]!) + Math.abs(this.fsubSeries[i]!)) / 1000;
      sumFsub += fsub;
      sumFbrk += Math.max(0, combined - fsub);
    }
    const breakingKn = sumFbrk / rows;
    const submersionKn = sumFsub / rows;
    return { breakingKn, submersionKn, totalKn: breakingKn + submersionKn };
  }
}

export type { Poly, Pt };
