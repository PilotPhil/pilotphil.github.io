import type { ResistanceSummaryKn, SimParams, Poly } from "@ccm/core";

export interface FieldBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Worker → 主线程：每批步进后的仿真快照 */
export interface Snapshot {
  type: "snapshot";
  /** 快照序号，单调递增，渲染层据此判断是否需要重绘 */
  version: number;
  step: number;
  total: number;
  /** 船体多边形顶点 */
  ship: Poly;
  /** 冰单元几何（仅重建场景后的首个快照携带，之后省略） */
  cells?: Poly[];
  /** 冰单元状态（Intact=0 / InContactWithShip=1 / Removed=2，与 core 一致） */
  statuses: Uint8Array;
  /** 最近一步的船-冰交叠多边形 */
  overlaps: Poly[];
  fieldBBox: FieldBBox;
  /** 最近一步破冰合力 fx（N）与浸没阻力（N） */
  fbrkLast: number;
  fsubLast: number;
  /** 完整时间历程（N） */
  fbrkSeries: number[];
  fsubSeries: number[];
  running: boolean;
  finished: boolean;
  summary: ResistanceSummaryKn | null;
  /** 本批步进吞吐（步/秒） */
  stepsPerSec: number;
}

export type MainToWorker =
  | { type: "reset"; params: Partial<SimParams>; hullOut?: number[][] | null }
  | { type: "start" }
  | { type: "stop" }
  | { type: "single" }
  | { type: "speed"; speed: number };
