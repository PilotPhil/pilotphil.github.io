/**
 * Hull Model 页签：复刻 hullProcess_widget 的四分组面板与图表。
 * 流程：选水线 xlsx（sheet A/B/C）→ check_waterline 画三条原始水线 →
 * 填 T0/T1/T2 → process（WaterlineProcess，targetCount=100）→
 * plot 四种视图 / save 存入工程 → identify 反推主尺度 → update 写回 Param。
 */
import {
  identifyHullOut,
  syntheticWaterlines,
  waterlineProcess,
  type Polyline,
} from "@ccm/core";
import { useEffect, useRef, useState } from "react";
import type { ChartSeries } from "../chart/ChartView";
import { useChartView } from "../chart/useChartView";
import { ChartContextMenu, type ChartMenuState } from "./ChartMenu";
import { useApp } from "../state/AppContext";
import { exportSeriesXlsx, parseWaterlineXlsx, type WaterlineTable } from "../io/xlsx";

const C_PROCESSED = "rgb(0,114,178)";
const C_SLOPE = "rgb(213,94,0)";
const C_WL_ANGLE = "rgb(0,158,115)";
const C_LENGTH = "rgb(86,180,233)";
const C_TARGET_LINE = "rgb(204,121,167)";
const C_SELECTED_NODE = "rgb(255,0,0)";

type PlotMode = "processed" | "slope" | "wl" | "length";

export function HullModelTab() {
  const app = useApp();
  const { canvasRef, chartRef } = useChartView(app.theme.chart);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [waterlines, setWaterlines] = useState<WaterlineTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [t0, setT0] = useState(app.waterlineHeight?.[0] ?? 10.0);
  const [t1, setT1] = useState(app.waterlineHeight?.[1] ?? 10.5);
  const [t2, setT2] = useState(app.waterlineHeight?.[2] ?? 11.0);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<PlotMode>("processed");
  const [hullOutLocal, setHullOutLocal] = useState<number[][] | null>(null);
  const [lpp, setLpp] = useState(0);
  const [stemAngle, setStemAngle] = useState(0);
  const [wlAngle, setWlAngle] = useState(0);
  const [menu, setMenu] = useState<ChartMenuState | null>(null);
  const [currentSeries, setCurrentSeries] = useState<ChartSeries[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setLegendVisible(true);
    chart.onContextMenu = (x, y) => setMenu({ x, y });
  }, [chartRef]);

  const resolveHullOut = (): number[][] | null =>
    hullOutLocal ?? (app.hullOut && app.hullOut.length > 0 ? app.hullOut : null);

  const setChart = (series: ChartSeries[], axisEqual: boolean, xLabel: string, yLabel: string) => {
    const chart = chartRef.current;
    if (!chart) return;
    setCurrentSeries(series);
    chart.setLegendVisible(true);
    chart.setGridVisible(true);
    chart.setAxisEqual(axisEqual);
    chart.setAxisLabels(xLabel, yLabel);
    chart.setSeries(series);
    chart.autoRange();
  };

  /** check_waterline：画 A/B/C 三条原始水线（蓝/橙/绿，等比轴）。 */
  const plotWaterlines = (table: WaterlineTable) => {
    setChart(
      [
        { name: "A", color: C_PROCESSED, points: toPoints(table.A), lineWidth: 4 },
        { name: "B", color: C_SLOPE, points: toPoints(table.B), lineWidth: 4 },
        { name: "C", color: C_WL_ANGLE, points: toPoints(table.C), lineWidth: 4 },
      ],
      true,
      "X [m]",
      "Y [m]",
    );
  };

  const onFileChosen = async (file: File) => {
    try {
      const table = parseWaterlineXlsx(await file.arrayBuffer());
      setWaterlines(table);
      setFileName(file.name);
      app.pushLog("INFO", `水线文件已读取：${file.name}（A:${table.A.x.length} 点 / B:${table.B.x.length} / C:${table.C.x.length}）`);
      plotWaterlines(table);
    } catch (err) {
      app.pushLog("ERROR", `水线文件解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadSample = () => {
    const w = syntheticWaterlines({ Lpp: 100, Bbeam: 21, Lbow: 30 });
    const table: WaterlineTable = { A: w.t145, B: w.t150, C: w.t155 };
    setWaterlines(table);
    setFileName("（内置合成样例）");
    app.pushLog("INFO", "已载入内置合成水线样例（真实船型请导入 xlsx）。");
    plotWaterlines(table);
  };

  const onProcess = () => {
    if (!waterlines) {
      app.pushLog("WARN", "请先选择水线文件。");
      return;
    }
    setProgress(30);
    try {
      const { rows, warnings } = waterlineProcess(waterlines.A, waterlines.B, waterlines.C, t0, t1, t2, 100);
      setHullOutLocal(rows);
      app.setWaterlineHeight([t0, t1, t2]);
      setProgress(100);
      for (const w of warnings) app.pushLog("WARN", w);
      app.pushLog("INFO", `水线处理完成：HullOut ${rows.length} 行 × 7 列（T0=${t0} / T1=${t1} / T2=${t2}）。`);
      setMode("processed");
      plotHullOut(rows, "processed");
    } catch (err) {
      setProgress(0);
      app.pushLog("ERROR", `水线处理失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const plotHullOut = (rows: number[][], which: PlotMode) => {
    if (rows.length === 0 || rows[0]!.length < 7) {
      app.pushLog("WARN", "暂无处理结果，请先 process。");
      return;
    }
    const radToDeg = 180 / Math.PI;
    if (which === "processed") {
      setChart(
        [{ name: "processed waterline", color: C_PROCESSED, points: rows.map((r) => ({ x: r[1]!, y: r[2]! })) }],
        true,
        "X [m]",
        "Y [m]",
      );
    } else if (which === "slope") {
      setChart(
        [{ name: "node slope angle", color: C_SLOPE, points: rows.map((r, i) => ({ x: i + 1, y: r[6]! * radToDeg })) }],
        false,
        "node",
        "angle [deg]",
      );
    } else if (which === "wl") {
      setChart(
        [{ name: "node waterline angle", color: C_WL_ANGLE, points: rows.map((r, i) => ({ x: i + 1, y: r[5]! * radToDeg })) }],
        false,
        "node",
        "angle [deg]",
      );
    } else {
      setChart(
        [{ name: "node length", color: C_LENGTH, points: rows.map((r, i) => ({ x: i + 1, y: r[4]! })) }],
        false,
        "node",
        "length [m]",
      );
    }
  };

  const onIdentify = () => {
    const rows = resolveHullOut();
    if (!rows) {
      app.pushLog("WARN", "暂无处理结果，请先 process。");
      return;
    }
    try {
      const id = identifyHullOut(rows);
      setLpp(id.lpp);
      setStemAngle(id.stemAngleDeg);
      setWlAngle(id.waterlineAngleDeg);
      setMode("processed");
      setChart(
        [
          { name: "processed waterline", color: C_PROCESSED, points: rows.map((r) => ({ x: r[1]!, y: r[2]! })) },
          {
            name: "identify waterline line",
            color: C_TARGET_LINE,
            lineWidth: 2,
            points: [
              { x: Math.min(...rows.map((r) => r[1]!)), y: id.targetY },
              { x: Math.max(...rows.map((r) => r[1]!)), y: id.targetY },
            ],
          },
          {
            name: "identify selected node",
            color: C_SELECTED_NODE,
            symbolOnly: true,
            symbolSize: 14,
            symbolPenWidth: 3,
            points: [{ x: id.selectedX, y: id.selectedY }],
          },
        ],
        true,
        "X [m]",
        "Y [m]",
      );
      app.pushLog("INFO", `参数识别完成：Lpp=${id.lpp.toFixed(3)} m，stem angle=${id.stemAngleDeg.toFixed(3)}°，waterline angle=${id.waterlineAngleDeg.toFixed(3)}°。`);
    } catch (err) {
      app.pushLog("ERROR", `参数识别失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const onUpdate = () => {
    app.updateParam("Lpp", lpp);
    app.updateParam("phi", stemAngle);
    app.updateParam("alpha", wlAngle);
    app.pushLog("INFO", "识别参数已写回 Param（Lpp / Stem angle / Waterline angle）；重建场景后生效。");
  };

  const onSaveResult = () => {
    const rows = resolveHullOut();
    if (!rows) {
      app.pushLog("WARN", "暂无处理结果可保存。");
      return;
    }
    app.setHullOut(rows);
    app.pushLog("INFO", "处理结果已保存到工程状态（File > Save 落盘 .ccm.json；重建场景后仿真使用真实船型）。");
  };

  return (
    <div className="chartTab">
      <div className="chartControls">
        <div className="groupBox">
          <div className="groupBoxTitle">Select waterline file</div>
          <div className="fileRow">
            <input type="text" value={fileName} readOnly placeholder="Select output file..." />
            <button onClick={() => fileInputRef.current?.click()}>Browse...</button>
          </div>
          <div className="btnRow">
            <button
              onClick={() => {
                if (waterlines) plotWaterlines(waterlines);
                else app.pushLog("WARN", "请先选择水线文件。");
              }}
            >
              check_waterline
            </button>
            <button onClick={loadSample}>加载样例</button>
          </div>
        </div>

        <div className="groupBox">
          <div className="groupBoxTitle">Drafts &amp; process</div>
          {(
            [
              ["T0:", t0, setT0],
              ["T1:", t1, setT1],
              ["T2:", t2, setT2],
            ] as Array<[string, number, (v: number) => void]>
          ).map(([label, value, setter]) => (
            <div className="paramRow" key={label}>
              <span className="paramLabel">{label}</span>
              <input
                type="number"
                step={0.1}
                value={parseFloat(value.toPrecision(8))}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) setter(v);
                }}
              />
              <span className="paramUnit">m</span>
            </div>
          ))}
          <div className="hintText">三条特征水线 T0/T1/T2，T1 为设计水线（T2 不参与计算）。</div>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <button className="wide btnPrimary" onClick={onProcess}>
            process
          </button>
        </div>

        <div className="groupBox">
          <div className="groupBoxTitle">Process result</div>
          {(
            [
              ["processed", "processed waterline"],
              ["slope", "node slope angle"],
              ["wl", "node waterline angle"],
              ["length", "node length"],
            ] as Array<[PlotMode, string]>
          ).map(([value, label]) => (
            <label className="checkRow" key={value}>
              <input
                type="radio"
                name="plotMode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
          <div className="btnRow">
            <button
              onClick={() => {
                const rows = resolveHullOut();
                if (rows) plotHullOut(rows, mode);
                else app.pushLog("WARN", "Please process waterline first.");
              }}
            >
              plot
            </button>
            <button onClick={onSaveResult}>save processed result</button>
          </div>
        </div>

        <div className="groupBox">
          <div className="groupBoxTitle">auto identify param</div>
          {(
            [
              ["Lpp", lpp, setLpp, "m"],
              ["stem angle", stemAngle, setStemAngle, "deg"],
              ["waterline angle", wlAngle, setWlAngle, "deg"],
            ] as Array<[string, number, (v: number) => void, string]>
          ).map(([label, value, setter, unit]) => (
            <div className="paramRow" key={label}>
              <span className="paramLabel wrap">{label}</span>
              <input
                type="number"
                step={0.1}
                value={parseFloat(value.toPrecision(8))}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) setter(v);
                }}
              />
              <span className="paramUnit">{unit}</span>
            </div>
          ))}
          <div className="btnRow">
            <button onClick={onIdentify}>identify</button>
            <button onClick={onUpdate}>update</button>
          </div>
        </div>
      </div>

      <div className="chartArea">
        <canvas ref={canvasRef} />
        <ChartContextMenu
          chart={chartRef.current}
          menu={menu}
          onClose={() => setMenu(null)}
          onOutput={() => {
            try {
              exportSeriesXlsx(currentSeries);
              app.pushLog("INFO", "曲线已导出为 xlsx。");
            } catch (err) {
              app.pushLog("WARN", err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFileChosen(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function toPoints(line: Polyline): Array<{ x: number; y: number }> {
  return line.x.map((x, i) => ({ x, y: line.y[i]! }));
}
