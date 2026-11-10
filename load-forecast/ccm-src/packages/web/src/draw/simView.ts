/**
 * 仿真视图渲染（Canvas 2D）。
 *
 * 对应 CCM_Re simulation_view 的 QtCanvas 绘制：冰格网按三态着色
 * （桌面默认：完整 #B6B6B6 / 接触 #8B0000 / 破坏 #87CEFA，用户可在
 * 控制列 color 分组修改）、船体填充 #00007F + 黑边、交叠区半透明红、
 * 坐标轴与刻度标注。配色由主题与用户设置合成，支持滚轮缩放/拖拽平移。
 */
import type { Poly } from "@ccm/core";
import type { FieldBBox, Snapshot } from "../sim/protocol";

export interface ViewTransform {
  /** 缩放（设备像素/米） */
  k: number;
  /** 屏幕平移：sx = tx + x·k，sy = ty − y·k（y 轴向上） */
  tx: number;
  ty: number;
}

export interface SimViewStyle {
  intact: string;
  contact: string;
  removed: string;
  shipFill: string;
  shipBorder: string;
  iceBorder: string;
  overlapFill: string;
  overlapStroke: string;
  canvasBg: string;
  grid: string;
  gridLabel: string;
  axis: string;
  legendText: string;
}

export function fitViewTransform(field: FieldBBox, ship: Poly, w: number, h: number): ViewTransform {
  let minX = field.minX;
  let minY = field.minY;
  let maxX = field.maxX;
  let maxY = field.maxY;
  for (const p of ship) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const margin = 0.08;
  const dx = Math.max(maxX - minX, 1e-6) * (1 + 2 * margin);
  const dy = Math.max(maxY - minY, 1e-6) * (1 + 2 * margin);
  const k = Math.min(w / dx, h / dy);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { k, tx: w / 2 - cx * k, ty: h / 2 + cy * k };
}

export function drawSimView(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: Snapshot,
  cells: Poly[],
  view: ViewTransform,
  style: SimViewStyle,
): void {
  const { k, tx, ty } = view;
  const toX = (x: number) => tx + x * k;
  const toY = (y: number) => ty - y * k;

  ctx.fillStyle = style.canvasBg;
  ctx.fillRect(0, 0, w, h);

  // 可视世界范围
  const wx0 = -tx / k;
  const wx1 = (w - tx) / k;
  const wy0 = (ty - h) / k;
  const wy1 = ty / k;

  // 网格与刻度
  ctx.font = "11px system-ui, sans-serif";
  const drawAxisTicks = (span: number, horizontal: boolean) => {
    const step = niceStep(span / 6);
    ctx.strokeStyle = style.grid;
    ctx.fillStyle = style.gridLabel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horizontal) {
      for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) {
        const sx = toX(x);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.fillText(formatTick(x), sx + 3, h - 6);
      }
    } else {
      for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) {
        const sy = toY(y);
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.fillText(formatTick(y), 4, sy - 4);
      }
    }
    ctx.stroke();
  };
  drawAxisTicks(wx1 - wx0, true);
  drawAxisTicks(wy1 - wy0, false);

  // x=0 / y=0 轴线
  ctx.strokeStyle = style.axis;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (0 >= wx0 && 0 <= wx1) {
    ctx.moveTo(toX(0), 0);
    ctx.lineTo(toX(0), h);
  }
  if (0 >= wy0 && 0 <= wy1) {
    ctx.moveTo(0, toY(0));
    ctx.lineTo(w, toY(0));
  }
  ctx.stroke();

  // 冰格网（按状态分色，三批路径减少状态切换）
  const buckets: Array<[string, string, number[]]> = [
    [style.intact, style.iceBorder, []],
    [style.contact, style.iceBorder, []],
    [style.removed, style.iceBorder, []],
  ];
  for (let i = 0; i < cells.length; i++) {
    const st = snap.statuses[i] ?? 0;
    if (st <= 2) buckets[st]![2].push(i);
  }
  for (const [fill, stroke, idxs] of buckets) {
    if (idxs.length === 0) continue;
    ctx.beginPath();
    for (const i of idxs) {
      const c = cells[i]!;
      ctx.moveTo(toX(c[0]!.x), toY(c[0]!.y));
      for (let v = 1; v < c.length; v++) ctx.lineTo(toX(c[v]!.x), toY(c[v]!.y));
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 船-冰交叠区（当前步）
  for (const poly of snap.overlaps) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(toX(poly[0]!.x), toY(poly[0]!.y));
    for (let i = 1; i < poly.length; i++) ctx.lineTo(toX(poly[i]!.x), toY(poly[i]!.y));
    ctx.closePath();
    ctx.fillStyle = style.overlapFill;
    ctx.fill();
  }

  // 船体（桌面默认：填充 #00007F，黑边 max(3, lw+1)）
  const ship = snap.ship;
  if (ship.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(toX(ship[0]!.x), toY(ship[0]!.y));
    for (let i = 1; i < ship.length; i++) ctx.lineTo(toX(ship[i]!.x), toY(ship[i]!.y));
    ctx.closePath();
    ctx.fillStyle = style.shipFill;
    ctx.fill();
    ctx.strokeStyle = style.shipBorder;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 图例：半透明底板 + 左右排布，避免与网格线混叠
  const legend: Array<[string, string]> = [
    [style.intact, "完整"],
    [style.contact, "接触"],
    [style.removed, "破坏"],
    [style.shipFill, "船体"],
  ];
  const pad = 8;
  const swatch = 10;
  const itemGap = 14;
  ctx.font = "12px system-ui, 'Microsoft YaHei', sans-serif";
  const labelWidths = legend.map(([, label]) => ctx.measureText(label).width);
  const total =
    labelWidths.reduce((s, tw) => s + swatch + 6 + tw, 0) +
    (legend.length - 1) * itemGap +
    pad * 2;
  const bh = swatch + 12;
  const bx = w - 12 - total;
  const by = 8;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = style.canvasBg;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, total, bh, 4);
  else ctx.rect(bx, by, total, bh);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = style.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, total, bh, 4);
  else ctx.rect(bx, by, total, bh);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let ix = bx + pad;
  const cy = by + bh / 2;
  for (let i = 0; i < legend.length; i++) {
    const [color, label] = legend[i]!;
    ctx.fillStyle = color;
    ctx.fillRect(ix, cy - swatch / 2, swatch, swatch);
    ctx.strokeStyle = style.iceBorder;
    ctx.strokeRect(ix, cy - swatch / 2, swatch, swatch);
    ctx.fillStyle = style.legendText;
    ctx.fillText(label, ix + swatch + 6, cy + 0.5);
    ix += swatch + 6 + labelWidths[i]! + itemGap;
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

function formatTick(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(abs >= 10 ? 0 : 1);
  return v.toFixed(2);
}
