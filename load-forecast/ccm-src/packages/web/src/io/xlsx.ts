/**
 * Excel 读写（对齐桌面版 QXlsx 行为）：
 * - 解析水线表：按 sheet 名 A/B/C，两列 x/y，第 1 行起、无表头、遇空行即停、
 *   非数值行跳过（hullProcess_widget.cpp:296-326）。
 * - 导出曲线：单工作表、系列名字母序、相邻 `<name>_x`/`<name>_y` 列
 *   （chart_base.cpp:803-854）。
 */
import * as XLSX from "xlsx";
import type { Polyline } from "@ccm/core";

export interface WaterlineTable {
  A: Polyline;
  B: Polyline;
  C: Polyline;
}

export function parseWaterlineXlsx(data: ArrayBuffer): WaterlineTable {
  const wb = XLSX.read(data, { type: "array" });
  const readSheet = (name: string): Polyline => {
    const sheet =
      wb.Sheets[name] ?? wb.Sheets[name.toUpperCase()] ?? wb.Sheets[name.toLowerCase()];
    if (!sheet) throw new Error(`缺少 sheet「${name}」（需要 A/B/C 三张）`);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const x: number[] = [];
    const y: number[] = [];
    for (const row of aoa) {
      const a = row?.[0];
      const b = row?.[1];
      if ((a === null || a === undefined) && (b === null || b === undefined)) break;
      const nx = typeof a === "number" ? a : parseFloat(String(a));
      const ny = typeof b === "number" ? b : parseFloat(String(b));
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      x.push(nx);
      y.push(ny);
    }
    if (x.length < 2) throw new Error(`sheet「${name}」有效数据不足（至少 2 行 x/y）`);
    return { x, y };
  };
  return { A: readSheet("A"), B: readSheet("B"), C: readSheet("C") };
}

export interface ExportableSeries {
  name: string;
  points: Array<{ x: number; y: number }>;
}

export function exportSeriesXlsx(series: ExportableSeries[], filename?: string): void {
  const usable = series.filter((s) => s.points.length > 0);
  if (usable.length === 0) throw new Error("没有可导出的曲线数据");
  const sorted = [...usable].sort((a, b) => a.name.localeCompare(b.name));
  const maxLen = Math.max(...sorted.map((s) => s.points.length));

  const headers: string[] = [];
  for (const s of sorted) {
    headers.push(`${s.name}_x`, `${s.name}_y`);
  }
  const aoa: Array<Array<string | number | "">> = [headers];
  for (let i = 0; i < maxLen; i++) {
    const row: Array<number | ""> = [];
    for (const s of sorted) {
      const p = s.points[i];
      row.push(p ? p.x : "", p ? p.y : "");
    }
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Series");
  const name = filename ?? `ccm_series_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
  XLSX.writeFile(wb, name);
}
