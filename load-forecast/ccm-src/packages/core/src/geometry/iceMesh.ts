import { nextAfter } from "./nextAfter";

/**
 * 冰场格网生成。
 *
 * 与 CCM_Re `util/util_polygon.cpp` 的 iceMesh_Number / iceMesh_Size（51-173 行）
 * 数值逐位对齐的移植；行矩阵布局保留 10 列（x0,y0,x1,y0,x1,y1,x0,y1,xc,yc），
 * 便于阶段 1 与 C++ 黄金数据直接比对。
 *
 * C++ 侧网格生成依赖 CGAL 精确内核，但此处只涉及矩形格网顶点的四则运算，
 * 双精度浮点即可逐位复现，无需多边形库。
 */

/** 冰场/冰格网基础物理参数（对应 iceMesh_Size 前八个形参） */
export interface IceMeshPhysics {
  /** 冰弹性模量 E (Pa) */
  E: number;
  /** 冰厚 hi (m) */
  hi: number;
  /** 冰泊松比 ν */
  pois: number;
  /** 水密度 ρw (kg/m³) */
  denW: number;
  /** 重力加速度 g (m/s²) */
  g: number;
  /** 破碎长度系数 Cl */
  Cls: number;
  /** 破碎长度速度系数 Cv */
  Cv: number;
  /** 航速 Vi (m/s) */
  Vi: number;
}

/**
 * 弹性基础板特征长度：(E·hi³ / (12·(1-ν²)·ρw·g))^0.25
 * 对应 util_polygon.cpp:117。
 */
export function iceCharacteristicLength(
  E: number,
  hi: number,
  pois: number,
  denW: number,
  g: number,
): number {
  return Math.pow((E * Math.pow(hi, 3)) / (12 * (1 - pois * pois) * denW * g), 0.25);
}

/** 破碎长度：Cl·length_cha·(1 + Cv·Vi)，对应 util_polygon.cpp:118。 */
export function iceBreakingLength(Cls: number, Cv: number, Vi: number, lengthCha: number): number {
  return Cls * lengthCha * (1 + Cv * Vi);
}

export interface IceMeshNumberParams extends IceMeshPhysics {
  /** y 向（船宽方向）单元数，须为偶数以保证关于 y=0 对称 */
  numN: number;
  /** x 向（航程方向）单元数 */
  numM: number;
  /** 步长缩放系数（iceMesh_Size 调整后传入 adjustedScale） */
  scale: number;
  /** 网格起点 x */
  lxIce: number;
  /** 网格起点 y */
  lyIce: number;
}

export interface IceCell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  xc: number;
  yc: number;
}

export interface IceMeshResult {
  /** 与 C++ iceMesh_2d 矩阵逐列一致的 10 列行集合，行序 i + j*numN */
  rows: number[][];
  cells: IceCell[];
  numN: number;
  numM: number;
  /** 实际采用的网格步长 */
  step: number;
}

/** 按给定单元数与起点生成格网，对应 iceMesh_Number（util_polygon.cpp:51-99）。 */
export function iceMeshNumber(p: IceMeshNumberParams): IceMeshResult {
  const lengthCha = iceCharacteristicLength(p.E, p.hi, p.pois, p.denW, p.g);
  const lengthBrk = iceBreakingLength(p.Cls, p.Cv, p.Vi, lengthCha);
  const step = p.scale * lengthBrk;

  const rows: number[][] = new Array(p.numN * p.numM);
  const cells: IceCell[] = [];
  for (let j = 0; j < p.numM; ++j) {
    const x0 = p.lxIce + step * j;
    const x1 = x0 + step;
    const xc = x0 + step * 0.5;
    for (let i = 0; i < p.numN; ++i) {
      const y0 = p.lyIce + step * i;
      const y1 = y0 + step;
      const yc = y0 + step * 0.5;
      rows[i + j * p.numN] = [x0, y0, x1, y0, x1, y1, x0, y1, xc, yc];
      cells.push({ x0, y0, x1, y1, xc, yc });
    }
  }
  return { rows, cells, numN: p.numN, numM: p.numM, step };
}

export interface IceMeshSizeParams extends IceMeshPhysics {
  /** 冰场 x 向长度 (m) */
  length: number;
  /** 冰场 y 向宽度 (m) */
  width: number;
  /** 步长缩放系数 */
  scale: number;
  /** 网格起点 x */
  lxIce: number;
  /** 接口保留；与 C++ 一致，实际布置忽略该值而以 -numN·step/2 起排（关于 y=0 对称） */
  lyIce: number;
  /** 船宽 Bbeam (m)，用于步长对齐调整 */
  Bbeam: number;
}

export interface IceMeshSizeResult extends IceMeshResult {
  lengthCha: number;
  lengthBrk: number;
  /** 调整前步长 scale·length_brk */
  baseStep: number;
  adjustedScale: number;
  /** B/2 落入第 n 个步长区间（对齐调整用） */
  n: number;
  /** (n+1)·step − B/2，步长三档调整的分档量 */
  dis: number;
}

/**
 * 依据冰场尺寸与船宽生成自适应格网，对应 iceMesh_Size（util_polygon.cpp:101-173）。
 * 步长按 B/2 落点做三档调整，保证横向单元边界贴近船宽半宽。
 */
export function iceMeshSize(p: IceMeshSizeParams): IceMeshSizeResult {
  const lengthCha = iceCharacteristicLength(p.E, p.hi, p.pois, p.denW, p.g);
  const lengthBrk = iceBreakingLength(p.Cls, p.Cv, p.Vi, lengthCha);
  const baseStep = p.scale * lengthBrk;
  const halfBeam = p.Bbeam * 0.5;

  let n = 0;
  if (baseStep > 0 && Number.isFinite(baseStep) && halfBeam >= 0 && Number.isFinite(halfBeam)) {
    while (n <= 1000 && !(n * baseStep <= halfBeam && halfBeam <= (n + 1) * baseStep)) {
      ++n;
    }
  }

  const dis = (n + 1) * baseStep - p.Bbeam / 2;
  let adjustedStep = baseStep;
  if (dis < baseStep / 5) {
    // 余量足够小，保持原步长
  } else if (dis <= (2.5 * baseStep) / 5) {
    adjustedStep = nextAfter(halfBeam / (n + 0.8), 0);
  } else {
    const limitStep = n > 0 ? halfBeam / (n - 0.2) : Number.POSITIVE_INFINITY;
    adjustedStep = nextAfter(limitStep, Number.POSITIVE_INFINITY);
  }

  const adjustedScale = adjustedStep / lengthBrk;
  const numM = Math.ceil(p.length / adjustedStep);
  let numN = Math.ceil(p.width / adjustedStep);
  if (numN % 2 !== 0) numN += 1;

  const mesh = iceMeshNumber({
    E: p.E,
    hi: p.hi,
    pois: p.pois,
    denW: p.denW,
    g: p.g,
    Cls: p.Cls,
    Cv: p.Cv,
    Vi: p.Vi,
    numN,
    numM,
    scale: adjustedScale,
    lxIce: p.lxIce,
    lyIce: (-1 * numN * adjustedStep) / 2,
  });
  return { ...mesh, lengthCha, lengthBrk, baseStep, adjustedScale, n, dis };
}
