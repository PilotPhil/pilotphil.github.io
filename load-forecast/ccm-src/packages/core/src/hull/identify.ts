/**
 * 从 HullOut 反推主尺度参数（对应 hullProcess_widget.cpp onIdentifyParams）。
 *
 * - Lpp = x 列极差
 * - stem angle = 铰点行（rows/2）坡角 col6，rad→deg
 * - waterline angle = y 降到 −max|y|/2（B/4）处、取 x 最大候选点的攻角 col5，rad→deg
 */
const RAD_TO_DEG = 180.0 / Math.PI;
const MATCH_EPS = 1e-12;

export interface IdentifyResult {
  lpp: number;
  stemAngleDeg: number;
  waterlineAngleDeg: number;
  /** B/4 目标线 y 值（用于绘图叠加） */
  targetY: number;
  /** 选中节点坐标（用于绘图标注） */
  selectedX: number;
  selectedY: number;
}

export function identifyHullOut(rows: number[][]): IdentifyResult {
  if (rows.length === 0 || rows[0]!.length < 6) {
    throw new Error("Please process waterline first.");
  }
  const n = rows.length;
  if (n <= 1) {
    throw new Error("Not enough points to identify parameters.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxAbsY = 0;
  for (const r of rows) {
    minX = Math.min(minX, r[1]!);
    maxX = Math.max(maxX, r[1]!);
    maxAbsY = Math.max(maxAbsY, Math.abs(r[2]!));
  }
  const lpp = maxX - minX;

  const midRow = Math.floor(n / 2);
  const lastCol = rows[0]!.length - 1;
  const stemAngleDeg = rows[midRow]![lastCol]! * RAD_TO_DEG;

  const targetY = -1.0 * maxAbsY * (2.0 / 4.0);

  interface Candidate {
    x: number;
    index: number;
    px: number;
    py: number;
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i < n; i++) {
    const x = rows[i]![1]!
    const y = rows[i]![2]!
    if (Math.abs(y - targetY) <= MATCH_EPS) {
      candidates.push({ x, index: i, px: x, py: y });
    }
  }

  for (let i = 0; i + 1 < n; i++) {
    const x1 = rows[i]![1]!
    const y1 = rows[i]![2]!
    const x2 = rows[i + 1]![1]!
    const y2 = rows[i + 1]![2]!
    if (Math.abs(y1 - y2) <= MATCH_EPS) continue;

    const minSegY = Math.min(y1, y2);
    const maxSegY = Math.max(y1, y2);
    if (targetY < minSegY - MATCH_EPS || targetY > maxSegY + MATCH_EPS) continue;

    const t = (targetY - y1) / (y2 - y1);
    if (t < -MATCH_EPS || t > 1.0 + MATCH_EPS) continue;

    const x = x1 + (x2 - x1) * t;
    const dx1 = Math.abs(x - x1);
    const dx2 = Math.abs(x - x2);
    let selectedIndex = i;
    if (dx2 < dx1 - MATCH_EPS) {
      selectedIndex = i + 1;
    } else if (Math.abs(dx1 - dx2) <= MATCH_EPS) {
      selectedIndex = x2 >= x1 ? i + 1 : i;
    }
    candidates.push({ x, index: selectedIndex, px: x, py: targetY });
  }

  if (candidates.length === 0) {
    let minDelta = Number.POSITIVE_INFINITY;
    for (const r of rows) {
      minDelta = Math.min(minDelta, Math.abs(r[2]! - targetY));
    }
    for (let i = 0; i < n; i++) {
      const delta = Math.abs(rows[i]![2]! - targetY);
      if (Math.abs(delta - minDelta) <= MATCH_EPS) {
        candidates.push({ x: rows[i]![1]!, index: i, px: rows[i]![1]!, py: rows[i]![2]! });
      }
    }
  }

  candidates.sort((a, b) => a.x - b.x);
  const selected = candidates.length > 0 ? candidates[candidates.length - 1]! : null;

  const wlCol = Math.min(5, rows[0]!.length - 1);
  const waterlineAngleDeg = selected ? rows[selected.index]![wlCol]! * RAD_TO_DEG : 0;

  return {
    lpp,
    stemAngleDeg,
    waterlineAngleDeg,
    targetY,
    selectedX: selected ? selected.px : 0,
    selectedY: selected ? selected.py : 0,
  };
}
