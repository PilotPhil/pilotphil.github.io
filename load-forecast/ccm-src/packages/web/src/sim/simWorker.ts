/// <reference lib="webworker" />
/**
 * 仿真 Worker：把 @ccm/core 的 Simulation 放到独立线程步进，
 * 每批步进后向主线程发快照，主线程只做渲染（对齐 C++「4ms 定时器步进 + 合帧重绘」节奏）。
 */
import { DEFAULT_PARAMS, Simulation, type SimParams } from "@ccm/core";
import type { MainToWorker, Snapshot } from "./protocol";

let sim: Simulation | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let stepsPerTick = 1;
let version = 0;
let lastStepsPerSec = 0;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function postSnapshot(includeCells = false): void {
  if (!sim) return;
  version++;
  const snap: Snapshot = {
    type: "snapshot",
    version,
    step: sim.currentStep,
    total: sim.params.Nt,
    ship: sim.ship.poly,
    ...(includeCells ? { cells: sim.cells } : {}),
    statuses: sim.statuses.slice(),
    overlaps: sim.overlaps,
    fieldBBox: sim.fieldBBox,
    fbrkLast: sim.fbrkSeries.length > 0 ? sim.fbrkSeries[sim.fbrkSeries.length - 1]! : 0,
    fsubLast: sim.fsubSeries.length > 0 ? sim.fsubSeries[sim.fsubSeries.length - 1]! : 0,
    fbrkSeries: sim.fbrkSeries.slice(),
    fsubSeries: sim.fsubSeries.slice(),
    running,
    finished: sim.isFinished(),
    summary: sim.summaryKn(),
    stepsPerSec: lastStepsPerSec,
  };
  ctx.postMessage(snap);
}

function doSteps(n: number): void {  if (!sim) return;
  const t0 = performance.now();
  let did = 0;
  for (let k = 0; k < n; k++) {
    if (sim.isFinished()) break;
    sim.step();
    did++;
  }
  const ms = performance.now() - t0;
  if (did > 0 && ms > 0) lastStepsPerSec = did / (ms / 1000);
  postSnapshot();
  if (sim.isFinished()) running = false;
}

function loop(): void {
  if (!running || !sim) return;
  doSteps(stepsPerTick);
  if (running && !sim.isFinished()) {
    timer = setTimeout(loop, 4);
  }
}

ctx.onmessage = (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "reset": {
      running = false;
      if (timer !== undefined) clearTimeout(timer);
      sim = new Simulation({ ...DEFAULT_PARAMS, ...msg.params }, msg.hullOut ?? null);
      lastStepsPerSec = 0;
      postSnapshot(true);
      break;
    }
    case "start": {
      if (!sim || sim.isFinished() || running) break;
      running = true;
      loop();
      break;
    }
    case "stop": {
      running = false;
      if (timer !== undefined) clearTimeout(timer);
      postSnapshot();
      break;
    }
    case "single": {
      if (!sim || running) break;
      doSteps(1);
      break;
    }
    case "speed": {
      stepsPerTick = Math.max(1, Math.floor(msg.speed));
      break;
    }
  }
};
