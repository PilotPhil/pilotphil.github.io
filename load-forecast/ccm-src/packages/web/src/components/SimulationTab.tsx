/**
 * Simulation 页签：左侧控制列（Simulation Control + color 两组，复刻
 * simulation_view 的 buildUi 布局）+ 右侧仿真画布。
 *
 * 渲染是事件驱动的：快照到达 / 视图交互 / 主题配色变化时重绘，
 * 不依赖 requestAnimationFrame（嵌入 webview 或遮挡场景下 rAF 可能被饿死）。
 */
import { useEffect, useRef, useState } from "react";
import type { Poly } from "@ccm/core";
import { drawSimView, fitViewTransform, type SimViewStyle, type ViewTransform } from "../draw/simView";
import type { FieldBBox } from "../sim/protocol";
import { useApp, type SimColors } from "../state/AppContext";

const SPEEDS: Array<{ label: string; v: number }> = [
  { label: "1×", v: 1 },
  { label: "4×", v: 4 },
  { label: "16×", v: 16 },
  { label: "64×", v: 64 },
  { label: "256×", v: 256 },
  { label: "全速", v: 1e6 },
];

function ensureSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

export function SimulationTab() {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewTransform>({ k: 1, tx: 0, ty: 0 });
  const fitPendingRef = useRef(true);
  /** 上一次适配时的场景 bbox 标识（bbox 变化 → 重新适配） */
  const lastFitKeyRef = useRef("");
  const lastDrawnRef = useRef(-1);
  /** 冰格几何只在重建场景后的首个快照携带，这里缓存最新一份 */
  const cellsRef = useRef<Poly[]>([]);
  const drawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDrawMsRef = useRef(0);
  /** 是否收到过快照（决定画布空态提示与按钮可用性） */
  const [hasSnap, setHasSnap] = useState(false);

  const drawNow = () => {
    const snap = app.snapRef.current;
    const canvas = canvasRef.current;
    if (!snap || !canvas) return;
    // 场景 bbox 变化（工程加载/改参数重建）时强制重新适配：
    // reset 后首个快照可能晚于 fitPending 消费，旧场景的适配不能留给新场景
    const fitKey = `${snap.fieldBBox.minX}|${snap.fieldBBox.minY}|${snap.fieldBBox.maxX}|${snap.fieldBBox.maxY}`;
    if (fitPendingRef.current || fitKey !== lastFitKeyRef.current) {
      fitPendingRef.current = false;
      lastFitKeyRef.current = fitKey;
      viewRef.current = fitViewTransform(
        snap.fieldBBox,
        snap.ship,
        canvas.clientWidth || window.innerWidth,
        canvas.clientHeight || window.innerHeight,
      );
    }
    if (snap.version === lastDrawnRef.current) return;
    lastDrawnRef.current = snap.version;
    if (snap.cells) cellsRef.current = snap.cells;

    const { w, h } = ensureSize(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = app.colors;
    const t = app.theme.canvas;
    const style: SimViewStyle = {
      intact: c.intact,
      contact: c.contact,
      removed: c.removed,
      shipFill: c.shipFill,
      shipBorder: "#000000",
      iceBorder: "#000000",
      overlapFill: "rgba(255,0,0,0.47)",
      overlapStroke: "rgba(255,90,90,0.9)",
      canvasBg: t.canvasBg,
      grid: t.border,
      gridLabel: t.hint,
      axis: t.axis,
      legendText: t.axis,
    };
    drawSimView(ctx, w, h, snap, cellsRef.current, viewRef.current, style);
  };

  /** 合帧调度：最快 ~60fps，尾部保证最终帧一定绘制 */
  const scheduleDraw = () => {
    if (drawTimerRef.current !== null) return;
    const elapsed = performance.now() - lastDrawMsRef.current;
    const delay = Math.max(0, 16 - elapsed);
    drawTimerRef.current = setTimeout(() => {
      drawTimerRef.current = null;
      lastDrawMsRef.current = performance.now();
      drawNow();
    }, delay);
  };

  // 快照到达即重绘（rAF 在遮挡的 webview 中会被饿死，故不使用）
  useEffect(() => {
    return app.onSnapshot(() => {
      setHasSnap(true);
      scheduleDraw();
    });
  }, [app]);

  // 主题/配色变化重绘（视图变换之外的依赖）
  const styleKey = `${app.theme.key}|${app.colors.intact}|${app.colors.contact}|${app.colors.removed}|${app.colors.shipFill}`;
  useEffect(() => {
    lastDrawnRef.current = -1; // 强制重绘
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  // 重建场景后重新适配视图
  useEffect(() => {
    fitPendingRef.current = true;
    const snap = app.snapRef.current;
    if (snap) lastDrawnRef.current = -1;
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.resetCount]);

  const fitView = () => {
    const snap = app.snapRef.current;
    const canvas = canvasRef.current;
    if (!snap || !canvas) return;
    viewRef.current = fitViewTransform(
      snap.fieldBBox,
      snap.ship,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    lastDrawnRef.current = -1;
    scheduleDraw();
  };

  // 画布交互：滚轮缩放（光标锚点）、拖拽平移、双击适配
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = () => (canvas.width && canvas.clientWidth ? canvas.width / canvas.clientWidth : 1);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ratio = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const s = dpr();
      const mx = e.offsetX * s;
      const my = e.offsetY * s;
      const v = viewRef.current;
      const wx = (mx - v.tx) / v.k;
      const wy = (v.ty - my) / v.k;
      const k2 = Math.min(Math.max(v.k * ratio, 1e-3), 1e6);
      viewRef.current = { k: k2, tx: mx - wx * k2, ty: my + wy * k2 };
      lastDrawnRef.current = -1;
      scheduleDraw();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const s = dpr();
      const v = viewRef.current;
      v.tx += (e.clientX - lastX) * s;
      v.ty += (e.clientY - lastY) * s;
      lastX = e.clientX;
      lastY = e.clientY;
      lastDrawnRef.current = -1;
      scheduleDraw();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onDblClick = () => {
      fitView();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("dblclick", onDblClick);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("dblclick", onDblClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = app.ui.total > 0 ? Math.min(100, (100 * app.ui.step) / app.ui.total) : 0;
  const running = app.ui.running;

  return (
    <div className="simTab">
      <div className="simControls">
        <div className="groupBox">
          <div className="groupBoxTitle">Simulation Control</div>
          <button className="wide" onClick={() => { app.resetScene(); app.pushLog("INFO", "场景已重建。"); }}>
            Reload Scene
          </button>
          <button
            className="wide btnPrimary"
            onClick={app.startSim}
            disabled={running || app.ui.finished || !app.sceneReady}
          >
            Start
          </button>
          <button className="wide" onClick={app.stopSim} disabled={!running}>
            Stop
          </button>
          <button
            className="wide"
            onClick={app.singleStep}
            disabled={running || app.ui.finished || !app.sceneReady}
          >
            Single Step
          </button>
          <div className="stepLabel">
            Step: {app.ui.step}/{app.ui.total > 0 ? app.ui.total : "∞"}
          </div>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <div className="speedRow">
            {SPEEDS.map((s) => (
              <button
                key={s.v}
                className={`chip${app.speed === s.v ? " active" : ""}`}
                onClick={() => app.setSpeed(s.v)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="groupBox">
          <div className="groupBoxTitle">color</div>
          {(
            [
              ["intact", "Ice intact"],
              ["contact", "Ice contact"],
              ["removed", "Ice removed"],
              ["shipFill", "Ship fill"],
            ] as Array<[keyof SimColors, string]>
          ).map(([key, label]) => (
            <div className="colorRow" key={key}>
              <span className="paramLabel">{label}</span>
              <input
                type="color"
                className="colorSwatch"
                style={{ background: app.colors[key], borderColor: "#333333" }}
                value={app.colors[key]}
                onChange={(e) => app.setColor(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="simCanvasWrap">
        <canvas ref={canvasRef} />
        {!hasSnap && (
          <div className="canvasEmpty">
            <div className="canvasEmptyTitle">暂无场景</div>
            <div>打开工程（File ▸ Open Project）或点击左侧 Reload Scene 重建冰场与船体</div>
          </div>
        )}
      </div>
    </div>
  );
}
