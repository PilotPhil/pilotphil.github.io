import { useEffect, useRef } from "react";
import { ChartView, type ChartThemeColors } from "../chart/ChartView";

/** React 侧 ChartView 生命周期管理：挂载创建、卸载销毁、主题热更新。 */
export function useChartView(theme: ChartThemeColors) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartView | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new ChartView(canvas, themeRef.current);
    chartRef.current = chart;
    chart.draw();
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setTheme(theme);
  }, [theme]);

  return { canvasRef, chartRef };
}
