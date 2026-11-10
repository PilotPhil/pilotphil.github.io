import { useApp } from "../state/AppContext";

export function StatusBar() {
  const app = useApp();
  const stateLabel = app.ui.finished
    ? "已完成"
    : app.ui.running
      ? "仿真运行中"
      : app.ui.step > 0
        ? "已暂停"
        : "就绪";
  const stateDot = app.ui.finished
    ? " finished"
    : app.ui.running
      ? " running"
      : app.ui.step > 0
        ? " paused"
        : "";
  const stepMs = app.ui.stepsPerSec > 0 ? 1000 / app.ui.stepsPerSec : 0;

  return (
    <div className="statusbar">
      <span>CCM v1.0.0</span>
      <span className="sep">|</span>
      <span className="grow">
        <span className={`statusDot${stateDot}`} />
        <span>
          {app.projectName}
          {app.projectDirty ? " *" : ""} — {stateLabel}
        </span>
      </span>
      <span>Step: {stepMs > 0 ? stepMs.toFixed(1) : "--"} ms</span>
      <span className="sep">|</span>
      <span>吞吐: {app.ui.stepsPerSec > 0 ? app.ui.stepsPerSec.toFixed(0) : "--"} 步/s</span>
    </div>
  );
}
