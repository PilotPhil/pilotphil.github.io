/**
 * Analysis & Result 页签：复刻 analysisResult_widget。
 * 左 2 : 右 8；"standard empirical formula"（forecast 功率）+ "CCM"（双滑块
 * 区间 ↔ 橙/绿虚线竖标线 + 半透明蓝选区带、区间四指标、报告导出）。
 * 曲线 = 逐步原始值 |·|/1000 kN（蓝 FBRK+FSUB / 红 FSUB），X = i·delta_t。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type SimParams } from "@ccm/core";
import type { ChartSeries } from "../chart/ChartView";
import { useChartView } from "../chart/useChartView";
import { ChartContextMenu, type ChartMenuState } from "./ChartMenu";
import { useApp } from "../state/AppContext";
import { buildReportText, downloadTextFile } from "../io/report";
import { exportSeriesXlsx } from "../io/xlsx";

const C_COMBINED = "#0000ff";
const C_FSUB = "#ff0000";
const C_MARKER_START = "rgb(255,159,28)";
const C_MARKER_END = "rgb(46,204,113)";
const C_ZONE = "rgba(88,166,255,0.22)";

interface CcmResult {
  breakingKn: number;
  submersionKn: number;
  totalKn: number;
  powerKw: number;
}

function readonlyValue(v: number | null): string {
  return v !== null && Number.isFinite(v) ? v.toFixed(3) : "--";
}

export function AnalysisTab() {
  const app = useApp();
  const { canvasRef, chartRef } = useChartView(app.theme.chart);
  const [menu, setMenu] = useState<ChartMenuState | null>(null);
  const [currentSeries, setCurrentSeries] = useState<ChartSeries[]>([]);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(100);
  const [ccm, setCcm] = useState<CcmResult | null>(null);
  const [powerStandard, setPowerStandard] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const dataDomainRef = useRef<{ minX: number; maxX: number } | null>(null);
  const seriesRef = useRef<{ combined: Array<{ x: number; y: number }>; fsub: Array<{ x: number; y: number }> } | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.onContextMenu = (x, y) => setMenu({ x, y });
  }, [chartRef]);

  const hasData = () => {
    const snap = app.snapRef.current;
    return !!snap && snap.fbrkSeries.length > 0 && snap.fbrkSeries.length === snap.fsubSeries.length;
  };

  /** calculate：从最新仿真时间历程重建曲线 + 满幅 + 立即出区间统计。 */
  const calculate = useCallback(() => {
    const snap = app.snapRef.current;
    if (!snap || snap.fbrkSeries.length === 0 || snap.fbrkSeries.length !== snap.fsubSeries.length) {
      app.pushLog("WARN", "暂无仿真数据，请先在 Simulation 页签运行仿真。");
      return;
    }
    const dt = Math.max(1e-6, app.params.deltaT > 0 ? app.params.deltaT : 1.0);
    const n = snap.fbrkSeries.length;
    const combined: Array<{ x: number; y: number }> = [];
    const fsubPts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const fbrk = Math.abs(snap.fbrkSeries[i]!) / 1000;
      const fsub = Math.abs(snap.fsubSeries[i]!) / 1000;
      combined.push({ x: t, y: fbrk + fsub });
      fsubPts.push({ x: t, y: fsub });
    }
    seriesRef.current = { combined, fsub: fsubPts };
    dataDomainRef.current = { minX: 0, maxX: (n - 1) * dt };

    const series: ChartSeries[] = [
      { name: "FBRK+FSUB", color: C_COMBINED, points: combined, lineWidth: 4 },
      { name: "FSUB", color: C_FSUB, points: fsubPts, lineWidth: 4 },
    ];
    setCurrentSeries(series);
    const chart = chartRef.current;
    if (chart) {
      chart.setLegendVisible(false);
      chart.setGridVisible(true);
      chart.setAxisEqual(false);
      chart.setAxisLabels("Time [s]", "Ice Force [kN]");
      chart.setSeries(series);
      chart.autoRange();
    }
    updateRangeSelection(rangeStart, rangeEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, chartRef, rangeStart, rangeEnd]);

  /** 区间统计（对齐 updateCcmResultFromCurrentRange：FBRK 分量钳非负 + 中点回退）。 */
  const computeRangeStats = useCallback(
    (startPct: number, endPct: number): CcmResult | null => {
      const data = seriesRef.current;
      const domain = dataDomainRef.current;
      if (!data || !domain) return null;
      const startX = domain.minX + ((domain.maxX - domain.minX) * startPct) / 100;
      const endX = domain.minX + ((domain.maxX - domain.minX) * endPct) / 100;

      let sumFsub = 0;
      let sumFbrk = 0;
      let count = 0;
      for (let i = 0; i < data.combined.length; i++) {
        const t = data.combined[i]!.x;
        if (t < startX || t > endX) continue;
        const fsub = data.fsub[i]!.y;
        const comb = data.combined[i]!.y;
        sumFsub += fsub;
        sumFbrk += Math.max(0, comb - fsub);
        count++;
      }

      const p = app.params;
      const vi = Math.hypot(p.ViX, p.ViY);
      if (count === 0) {
        // 回退：取最接近区间中点的单个采样点
        const midX = (startX + endX) / 2;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < data.combined.length; i++) {
          const d = Math.abs(data.combined[i]!.x - midX);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        if (best < 0) return null;
        const fsub = data.fsub[best]!.y;
        const fbrk = Math.max(0, data.combined[best]!.y - fsub);
        return { breakingKn: fbrk, submersionKn: fsub, totalKn: fbrk + fsub, powerKw: ccmPower(fbrk + fsub, p, vi) };
      }

      const avgFbrk = sumFbrk / count;
      const avgFsub = sumFsub / count;
      const r = avgFbrk + avgFsub;
      return { breakingKn: avgFbrk, submersionKn: avgFsub, totalKn: r, powerKw: ccmPower(r, p, vi) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.params],
  );

  const updateRangeSelection = useCallback(
    (startPct: number, endPct: number) => {
      const chart = chartRef.current;
      if (!chart) return;
      const domain = dataDomainRef.current;
      let startX: number;
      let endX: number;
      if (domain) {
        startX = domain.minX + ((domain.maxX - domain.minX) * startPct) / 100;
        endX = domain.minX + ((domain.maxX - domain.minX) * endPct) / 100;
      } else {
        const r = chart.getRanges();
        startX = r.x0 + ((r.x1 - r.x0) * startPct) / 100;
        endX = r.x0 + ((r.x1 - r.x0) * endPct) / 100;
      }
      chart.setMarkers([
        { x: startX, color: C_MARKER_START },
        { x: endX, color: C_MARKER_END },
      ]);
      chart.setZone({ x0: startX, x1: endX, color: C_ZONE });
      setCcm(computeRangeStats(startPct, endPct));
    },
    [chartRef, computeRangeStats],
  );

  // 仿真完成自动刷新（桌面版需手动 calculate，Web 版补全自动 + 保留手动）
  const prevFinished = useRef(app.ui.finished);
  useEffect(() => {
    if (app.ui.finished && !prevFinished.current) {
      calculate();
    }
    prevFinished.current = app.ui.finished;
  }, [app.ui.finished, calculate]);

  const onForecast = () => {
    const p = app.params;
    const v = Math.hypot(p.ViX, p.ViY);
    const f1 = (1.2 * p.Bbeam) / Math.cbrt(Math.max(p.Ddisp, 1e-6));
    const power = 0.736 * f1 * p.f2 * p.f3 * p.f4 * (240 * p.Bbeam * p.hi * (1 + p.hi + 0.035 * v * v) + 70 * p.Sc * Math.sqrt(Math.max(p.Lpp, 0)));
    setPowerStandard(power);
    app.pushLog("INFO", `经验公式功率：${power.toFixed(3)} kW。`);
  };

  const onSlider = (which: "start" | "end", value: number) => {
    let s = rangeStart;
    let e = rangeEnd;
    if (which === "start") {
      s = value;
      if (s > e) e = s; // 交叉钳制
      setRangeEnd(e);
      setRangeStart(s);
    } else {
      e = value;
      if (e < s) s = e;
      setRangeStart(s);
      setRangeEnd(e);
    }
    updateRangeSelection(s, e);
  };

  const speed = useMemo(() => Math.hypot(app.params.ViX, app.params.ViY), [app.params.ViX, app.params.ViY]);

  return (
    <div className="chartTab">
      <div className="chartControls">
        <div className="groupBox">
          <div className="groupBoxTitle">standard empirical formula</div>
          <button className="wide btnPrimary" onClick={onForecast}>
            forecast
          </button>
          <div className="readonlyRow">
            <span className="paramLabel">Power:</span>
            <input type="text" readOnly value={readonlyValue(powerStandard)} />
            <span className="paramUnit">kW</span>
          </div>
        </div>

        <div className="groupBox">
          <div className="groupBoxTitle">CCM</div>
          <div className="subGroupBox">
            <div className="groupBoxTitle">Average Range</div>
            <div className="sliderRow">
              <span className="paramLabel">Start: {rangeStart}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={rangeStart}
                onChange={(e) => onSlider("start", Number(e.target.value))}
              />
            </div>
            <div className="sliderRow">
              <span className="paramLabel">End: {rangeEnd}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={rangeEnd}
                onChange={(e) => onSlider("end", Number(e.target.value))}
              />
            </div>
          </div>
          <button className="wide btnPrimary" onClick={calculate}>
            calculate
          </button>
          <div className="readonlyRow">
            <span className="paramLabel wrap" title="ice-breaking resistance">ice-breaking resistance</span>
            <input type="text" readOnly value={readonlyValue(ccm?.breakingKn ?? null)} />
            <span className="paramUnit">kN</span>
          </div>
          <div className="readonlyRow">
            <span className="paramLabel wrap" title="ice-submersion resistance">ice-submersion resistance</span>
            <input type="text" readOnly value={readonlyValue(ccm?.submersionKn ?? null)} />
            <span className="paramUnit">kN</span>
          </div>
          <div className="readonlyRow">
            <span className="paramLabel wrap" title="ice resistance">ice resistance</span>
            <input type="text" readOnly value={readonlyValue(ccm?.totalKn ?? null)} />
            <span className="paramUnit">kN</span>
          </div>
          <div className="readonlyRow">
            <span className="paramLabel wrap">power</span>
            <input type="text" readOnly value={readonlyValue(ccm?.powerKw ?? null)} />
            <span className="paramUnit">kW</span>
          </div>
          <button className="wide" onClick={() => setReportOpen(true)}>
            Export Simulation Report
          </button>
        </div>

        <div className="hintText">
          航速 {speed.toFixed(2)} m/s；区间统计随滑块实时更新（曲线 = |F|/1000 kN，时间 = 步号 × delta_t）。
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

      {reportOpen && (
        <ReportDialog
          onClose={() => setReportOpen(false)}
          ccm={ccm}
          powerStandard={powerStandard}
        />
      )}
    </div>
  );
}

/** CCM 区间功率（对齐 analysisResult_widget.cpp:496-506）。 */
function ccmPower(rKn: number, p: SimParams, vi: number): number {
  const hi = Math.max(p.hi, 1e-6);
  const disp = Math.max(p.Ddisp, 1e-6);
  const f1 = (1.2 * p.Bbeam) / Math.cbrt(disp);
  const fv =
    2200 * Math.exp((-56 * vi) / Math.sqrt(9.8 * hi)) +
    14 * Math.exp((-3 * vi) / Math.sqrt(9.8 * hi)) +
    1.6;
  return f1 * p.f2 * p.f4 * rKn * vi * fv;
}

function ReportDialog(props: {
  onClose: () => void;
  ccm: CcmResult | null;
  powerStandard: number | null;
}) {
  const app = useApp();
  const [parameter, setParameter] = useState(true);
  const [resistance, setResistance] = useState(true);
  const [power, setPower] = useState(true);
  const [filename, setFilename] = useState(`${app.projectName || "Unnamed Project"}_simulation_report.txt`);

  return (
    <div className="dialogMask" onClick={props.onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogTitle">Export Simulation Report</div>
        <div className="dialogBody">
          <label className="checkRow">
            <input type="checkbox" checked={parameter} onChange={(e) => setParameter(e.target.checked)} />
            Parameter
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={resistance} onChange={(e) => setResistance(e.target.checked)} />
            Resistance
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={power} onChange={(e) => setPower(e.target.checked)} />
            Power
          </label>
          <div className="fileRow">
            <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} />
          </div>
          {!parameter && !resistance && !power && (
            <div className="hintText">至少勾选一个导出段。</div>
          )}
        </div>
        <div className="dialogFoot">
          <button
            className="primary"
            disabled={!parameter && !resistance && !power}
            onClick={() => {
              const text = buildReportText({
                projectName: app.projectName,
                params: { ...DEFAULT_PARAMS, ...app.params },
                resistance: app.ui.summary
                  ? {
                      breakingKn: app.ui.summary.breakingKn,
                      submersionKn: app.ui.summary.submersionKn,
                      totalKn: app.ui.summary.totalKn,
                    }
                  : props.ccm
                    ? {
                        breakingKn: props.ccm.breakingKn,
                        submersionKn: props.ccm.submersionKn,
                        totalKn: props.ccm.totalKn,
                      }
                    : null,
                powerStandardKw: props.powerStandard,
                powerCcmKw: props.ccm?.powerKw ?? null,
                sections: { parameter, resistance, power },
              });
              downloadTextFile(filename.endsWith(".txt") ? filename : `${filename}.txt`, text);
              app.pushLog("INFO", `报告已导出：${filename}`);
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
