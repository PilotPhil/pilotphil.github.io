/**
 * ChartView：通用 Canvas 2D 图表，对应 CCM_Re chart_base（QwtPlot）的能力子集：
 * 多系列（颜色/线宽/仅符号）、顶部图例、网格开关、坐标轴标题、
 * 滚轮以光标为锚缩放（×1.1/0.9）、中键平移、左键拾取最近点（<10px，白底
 * 圆环 + 曲线色粗体 "(x, y)" 标签、防出界翻转）、竖直标线（虚线）与
 * 区间选区带、Auto range、Axis equal、主题配色。
 */
export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
  /** 默认 4（对齐 kDefaultSeriesLineWidth） */
  lineWidth?: number;
  /** 不画连线，只画空心圆符号（用于 identify 选中节点） */
  symbolOnly?: boolean;
  symbolSize?: number;
  symbolPenWidth?: number;
}

export interface ChartVMarker {
  x: number;
  color: string;
}

export interface ChartZone {
  x0: number;
  x1: number;
  color: string;
}

export interface ChartThemeColors {
  chartBg: string;
  plotBg: string;
  axisColor: string;
  gridColor: string;
}

const MARGIN = { left: 58, right: 14, top: 8, bottom: 26 };
const LEGEND_H = 20;

export class ChartView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private series: ChartSeries[] = [];
  private vMarkers: ChartVMarker[] = [];
  private zone: ChartZone | null = null;
  private range = { x0: 0, x1: 10, y0: 0, y1: 10 };
  private axisEqual = false;
  private gridVisible = false;
  private legendVisible = false;
  private xLabel = "";
  private yLabel = "";
  private picked: { px: number; py: number; x: number; y: number; color: string } | null = null;
  private theme: ChartThemeColors;
  private ro: ResizeObserver;
  private detachFns: Array<() => void> = [];

  /** 右键菜单回调（画布 CSS 像素坐标） */
  onContextMenu: ((x: number, y: number) => void) | null = null;
  onRangeChanged: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, theme: ChartThemeColors) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D 不可用");
    this.ctx = ctx;
    this.theme = theme;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = this.plotRect();
      const mx = e.clientX - canvas.getBoundingClientRect().left;
      const my = e.clientY - canvas.getBoundingClientRect().top;
      if (mx < rect.x || mx > rect.x + rect.w || my < rect.y || my > rect.y + rect.h) return;
      const wx = this.pxToX(mx);
      const wy = this.pxToY(my);
      const r = this.range;
      const nx0 = wx - (wx - r.x0) / factor;
      const nx1 = wx + (r.x1 - wx) / factor;
      const ny0 = wy - (wy - r.y0) / factor;
      const ny1 = wy + (r.y1 - wy) / factor;
      this.setRanges(nx0, nx1, ny0, ny1);
    };

    let middleDown = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        middleDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!middleDown) return;
      const r = this.range;
      const rect = this.plotRect();
      const dataPerPxX = (r.x1 - r.x0) / rect.w;
      const dataPerPxY = (r.y1 - r.y0) / rect.h;
      const dx = (e.clientX - lastX) * dataPerPxX;
      const dy = (e.clientY - lastY) * dataPerPxY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.setRanges(r.x0 - dx, r.x1 - dx, r.y0 + dy, r.y1 + dy);
    };
    const onPointerUp = () => {
      middleDown = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = this.plotRect();
      const mx = e.clientX - canvas.getBoundingClientRect().left;
      const my = e.clientY - canvas.getBoundingClientRect().top;
      if (mx < rect.x || mx > rect.x + rect.w || my < rect.y || my > rect.y + rect.h) return;
      this.pick(mx, my);
    };

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.onContextMenu?.(e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContext);
    this.detachFns.push(() => canvas.removeEventListener("wheel", onWheel));
    this.detachFns.push(() => canvas.removeEventListener("pointerdown", onPointerDown));
    this.detachFns.push(() => canvas.removeEventListener("pointermove", onPointerMove));
    this.detachFns.push(() => canvas.removeEventListener("pointerup", onPointerUp));
    this.detachFns.push(() => canvas.removeEventListener("click", onClick));
    this.detachFns.push(() => canvas.removeEventListener("contextmenu", onContext));

    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);
  }

  destroy(): void {
    this.ro.disconnect();
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
  }

  setTheme(theme: ChartThemeColors): void {
    this.theme = theme;
    this.draw();
  }

  setSeries(list: ChartSeries[]): void {
    this.series = list;
    this.picked = null;
    if (this.autoRangeEnabled()) this.autoRange();
    this.draw();
  }

  setMarkers(markers: ChartVMarker[]): void {
    this.vMarkers = markers;
    this.draw();
  }

  setZone(zone: ChartZone | null): void {
    this.zone = zone;
    this.draw();
  }

  setAxisLabels(x: string, y: string): void {
    this.xLabel = x;
    this.yLabel = y;
    this.draw();
  }

  setLegendVisible(v: boolean): void {
    this.legendVisible = v;
    this.draw();
  }

  setGridVisible(v: boolean): void {
    this.gridVisible = v;
    this.draw();
  }

  setAxisEqual(v: boolean): void {
    this.axisEqual = v;
    this.draw();
  }

  getRanges(): { x0: number; x1: number; y0: number; y1: number } {
    return { ...this.range };
  }

  private autoRangeEnabled(): boolean {
    // 与桌面版一致：autoRange 由调用方显式触发；此处仅在系列更换且从未手动设域时自动满幅
    return this.series.length > 0 && this.range.x0 === 0 && this.range.x1 === 10 && this.range.y0 === 0 && this.range.y1 === 10;
  }

  autoRange(): void {
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const s of this.series) {
      for (const p of s.points) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
    }
    if (!Number.isFinite(x0)) {
      x0 = 0;
      x1 = 10;
      y0 = 0;
      y1 = 10;
    }
    this.setRanges(x0, x1, y0, y1);
  }

  /** 设定显示域（带净化与 Axis equal 适配），对应 setPlotRanges。 */
  setRanges(x0: number, x1: number, y0: number, y1: number): void {
    const clean = (a: number, b: number): [number, number] => {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return [0, 1];
      if (a > b) [a, b] = [b, a];
      if (a === b) {
        const pad = Math.max(1.0, Math.abs(a) * 0.05);
        return [a - pad, b + pad];
      }
      return [a, b];
    };
    [x0, x1] = clean(x0, x1);
    [y0, y1] = clean(y0, y1);

    if (this.axisEqual) {
      const rect = this.plotRect();
      const dataAspect = (x1 - x0) / (y1 - y0);
      const viewAspect = rect.w / Math.max(rect.h, 1);
      if (dataAspect > viewAspect) {
        const yCenter = (y0 + y1) / 2;
        const half = ((x1 - x0) / viewAspect) / 2;
        y0 = yCenter - half;
        y1 = yCenter + half;
      } else {
        const xCenter = (x0 + x1) / 2;
        const half = ((y1 - y0) * viewAspect) / 2;
        x0 = xCenter - half;
        x1 = xCenter + half;
      }
    }

    this.range = { x0, x1, y0, y1 };
    this.onRangeChanged?.();
    this.draw();
  }

  private plotRect(): { x: number; y: number; w: number; h: number } {
    const legendH = this.legendVisible ? LEGEND_H : 0;
    const x = MARGIN.left;
    const y = MARGIN.top + legendH;
    const w = Math.max(this.canvas.clientWidth - MARGIN.left - MARGIN.right, 10);
    const h = Math.max(this.canvas.clientHeight - MARGIN.top - MARGIN.bottom - legendH, 10);
    return { x, y, w, h };
  }

  private xToPx(x: number): number {
    const r = this.plotRect();
    return r.x + ((x - this.range.x0) / (this.range.x1 - this.range.x0)) * r.w;
  }
  private yToPx(y: number): number {
    const r = this.plotRect();
    return r.y + r.h - ((y - this.range.y0) / (this.range.y1 - this.range.y0)) * r.h;
  }
  private pxToX(px: number): number {
    const r = this.plotRect();
    return this.range.x0 + ((px - r.x) / r.w) * (this.range.x1 - this.range.x0);
  }
  private pxToY(py: number): number {
    const r = this.plotRect();
    return this.range.y0 + ((r.y + r.h - py) / r.h) * (this.range.y1 - this.range.y0);
  }

  /** 左键拾取：全系列最近点，屏幕距离 >10px 清除标注。 */
  private pick(mx: number, my: number): void {
    let best: { d: number; x: number; y: number; color: string } | null = null;
    for (const s of this.series) {
      for (const p of s.points) {
        const px = this.xToPx(p.x);
        const py = this.yToPx(p.y);
        const d = Math.hypot(px - mx, py - my);
        if (d <= 10 && (best === null || d < best.d)) {
          best = { d, x: p.x, y: p.y, color: s.color };
        }
      }
    }
    if (best) {
      this.picked = { px: this.xToPx(best.x), py: this.yToPx(best.y), x: best.x, y: best.y, color: best.color };
    } else {
      this.picked = null;
    }
    this.draw();
  }

  draw(): void {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(canvas.clientWidth, 10);
    const ch = Math.max(canvas.clientHeight, 10);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "11px system-ui, sans-serif";

    ctx.fillStyle = this.theme.chartBg;
    ctx.fillRect(0, 0, cw, ch);

    const r = this.plotRect();

    // 绘图区
    ctx.fillStyle = this.theme.plotBg;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // 选区带（曲线之下）
    if (this.zone) {
      const zx0 = Math.max(this.xToPx(Math.max(this.zone.x0, this.range.x0)), r.x);
      const zx1 = Math.min(this.xToPx(Math.min(this.zone.x1, this.range.x1)), r.x + r.w);
      if (zx1 > zx0) {
        ctx.fillStyle = this.zone.color;
        ctx.fillRect(zx0, r.y, zx1 - zx0, r.h);
      }
    }

    // 网格 + 刻度
    ctx.strokeStyle = this.theme.gridColor;
    ctx.fillStyle = this.theme.axisColor;
    ctx.lineWidth = 1;
    const fmt = (v: number) => formatTick(v);
    const drawTicks = (span: number, toPx: (v: number) => number, horizontal: boolean, labels: boolean) => {
      const step = niceStep(span / 5);
      ctx.beginPath();
      const first = Math.ceil(this.range[horizontal ? "x0" : "y0"] / step) * step;
      const last = this.range[horizontal ? "x1" : "y1"];
      for (let v = first; v <= last + step * 1e-6; v += step) {
        const px = horizontal ? toPx(v) : r.x;
        const py = horizontal ? r.y + r.h : toPx(v);
        if (this.gridVisible) {
          ctx.moveTo(horizontal ? px : r.x, horizontal ? r.y : py);
          ctx.lineTo(horizontal ? px : r.x + r.w, horizontal ? r.y + r.h : py);
        }
        ctx.moveTo(horizontal ? px : r.x - 4, horizontal ? r.y + r.h : py);
        ctx.lineTo(horizontal ? px : r.x, horizontal ? r.y + r.h : py);
        if (labels) {
          const text = fmt(v);
          if (horizontal) {
            ctx.textAlign = "center";
            ctx.fillText(text, px, r.y + r.h + 14);
          } else {
            ctx.textAlign = "right";
            ctx.fillText(text, r.x - 6, toPx(v) + 4);
          }
        }
        void px;
        void py;
      }
      ctx.stroke();
    };
    drawTicks(this.range.x1 - this.range.x0, (v) => this.xToPx(v), true, true);
    drawTicks(this.range.y1 - this.range.y0, (v) => this.yToPx(v), false, true);

    // 边框（含顶/右轴，无刻度标注）
    ctx.strokeStyle = this.theme.axisColor;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // 轴标题
    ctx.fillStyle = this.theme.axisColor;
    if (this.xLabel) {
      ctx.textAlign = "right";
      ctx.fillText(this.xLabel, r.x + r.w, r.y + r.h + 24 > ch ? ch - 2 : r.y + r.h + 24);
    }
    if (this.yLabel) {
      ctx.save();
      ctx.translate(12, r.y + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "right";
      ctx.fillText(this.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = "start";

    // 曲线（选区之上、标线之下）
    for (const s of this.series) {
      if (s.points.length === 0) continue;
      if (!s.symbolOnly) {
        ctx.beginPath();
        for (let i = 0; i < s.points.length; i++) {
          const px = this.xToPx(s.points[i]!.x);
          const py = this.yToPx(s.points[i]!.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.lineWidth ?? 4;
        ctx.stroke();
      }
      if (s.symbolOnly || s.points.length === 1) {
        const size = s.symbolSize ?? 14;
        const penW = s.symbolPenWidth ?? 3;
        ctx.beginPath();
        ctx.arc(this.xToPx(s.points[0]!.x), this.yToPx(s.points[0]!.y), size / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = penW;
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;

    // 竖直标线（虚线）
    for (const m of this.vMarkers) {
      const px = this.xToPx(m.x);
      if (px < r.x - 1 || px > r.x + r.w + 1) continue;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, r.y);
      ctx.lineTo(px, r.y + r.h);
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = 1;

    // 顶部图例
    if (this.legendVisible && this.series.length > 0) {
      let lx = r.x + 4;
      const ly = MARGIN.top + 6;
      for (const s of this.series) {
        ctx.fillStyle = s.color;
        ctx.fillRect(lx, ly + 3, 14, 3);
        ctx.fillStyle = this.theme.axisColor;
        ctx.fillText(s.name, lx + 18, ly + 8);
        lx += 18 + ctx.measureText(s.name).width + 18;
      }
    }

    // 拾取标注（白底圆环 + 防出界标签）
    if (this.picked) {
      const { px, py, x, y, color } = this.picked;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;

      const label = `(${formatTick(x)}, ${formatTick(y)})`;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.fillStyle = color;
      const tw = ctx.measureText(label).width;
      const alignLeft = px > r.x + r.w * 0.65; // 右侧 65% 以外 → 标签放左
      const above = py < r.y + r.h * 0.35; // 顶部 35% 以内 → 标签放下方
      const lx = alignLeft ? px - tw - 12 : px + 12;
      const ly = above ? py + 18 : py - 8;
      ctx.textAlign = "start";
      ctx.fillText(label, lx, ly);
      ctx.font = "11px system-ui, sans-serif";
    }
  }
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return v.toExponential(1);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  if (abs === 0) return "0";
  return v.toFixed(3);
}
