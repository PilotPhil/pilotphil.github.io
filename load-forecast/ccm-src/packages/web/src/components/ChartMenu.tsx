import { useEffect, useState } from "react";
import type { ChartView } from "../chart/ChartView";

export interface ChartMenuState {
  x: number;
  y: number;
}

/** 图表右键菜单（Output... / Axis Settings...，对齐 chart_base.cpp:520-598）。 */
export function ChartContextMenu(props: {
  chart: ChartView | null;
  menu: ChartMenuState | null;
  onClose: () => void;
  onOutput: () => void;
}) {
  const [axisOpen, setAxisOpen] = useState(false);
  useEffect(() => {
    if (!props.menu) setAxisOpen(false);
  }, [props.menu]);

  if (!props.menu || !props.chart) return null;
  return (
    <>
      <div className="ctxMenu" style={{ left: props.menu.x, top: props.menu.y }}>
        <div
          className="menuItem"
          onClick={() => {
            props.onClose();
            props.onOutput();
          }}
        >
          Output...
        </div>
        <div
          className="menuItem"
          onClick={() => {
            setAxisOpen(true);
          }}
        >
          Axis Settings...
        </div>
      </div>
      {axisOpen && (
        <AxisSettingsDialog
          chart={props.chart}
          onClose={() => {
            setAxisOpen(false);
            props.onClose();
          }}
        />
      )}
    </>
  );
}

/** 轴设置对话框：X/Y min/max + Auto range + Axis equal。 */
export function AxisSettingsDialog(props: { chart: ChartView; onClose: () => void }) {
  const cur = props.chart.getRanges();
  const [x0, setX0] = useState(cur.x0);
  const [x1, setX1] = useState(cur.x1);
  const [y0, setY0] = useState(cur.y0);
  const [y1, setY1] = useState(cur.y1);
  const [auto, setAuto] = useState(false);
  const [equal, setEqual] = useState(false);

  return (
    <div className="dialogMask" onClick={props.onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogTitle">Axis Settings</div>
        <div className="dialogBody">
          {(
            [
              ["X min", x0, setX0],
              ["X max", x1, setX1],
              ["Y min", y0, setY0],
              ["Y max", y1, setY1],
            ] as Array<[string, number, (v: number) => void]>
          ).map(([label, value, setter]) => (
            <label className="field" key={label}>
              <span className="paramLabel">{label}</span>
              <input
                type="number"
                value={parseFloat(value.toPrecision(8))}
                disabled={auto}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) setter(v);
                }}
              />
              <span className="paramUnit" />
            </label>
          ))}
          <label className="checkRow">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto range
          </label>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={equal}
              onChange={(e) => setEqual(e.target.checked)}
            />
            Axis equal
          </label>
        </div>
        <div className="dialogFoot">
          <button
            className="primary"
            onClick={() => {
              props.chart.setAxisEqual(equal);
              if (auto) {
                props.chart.autoRange();
              } else {
                props.chart.setRanges(x0, x1, y0, y1);
              }
              props.onClose();
            }}
          >
            OK
          </button>
          <button onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
