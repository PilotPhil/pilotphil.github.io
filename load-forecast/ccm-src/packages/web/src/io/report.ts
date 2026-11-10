/**
 * 仿真报告导出（纯文本 .txt，对齐 analysisResult_widget.cpp:582-713 的三段结构：
 * Parameter / Resistance / Power，段间分隔线；Parameter 段使用桌面版属性名）。
 */
import type { SimParams } from "@ccm/core";

export interface ReportInput {
  projectName: string;
  params: SimParams;
  resistance: { breakingKn: number; submersionKn: number; totalKn: number } | null;
  powerStandardKw: number | null;
  powerCcmKw: number | null;
  sections: { parameter: boolean; resistance: boolean; power: boolean };
}

const SEP = "--------------------------------";

/** 桌面版 Param 的 double 属性名 → SimParams 字段（反射输出顺序）。 */
const PARAM_EXPORT_ORDER: Array<[string, keyof SimParams]> = [
  ["delta_t", "deltaT"],
  ["hi", "hi"],
  ["sigma_f", "sigmaF"],
  ["sigma_c", "sigmaC"],
  ["Ei", "Ei"],
  ["miu_hi", "miu"],
  ["pois", "pois"],
  ["den_w", "denW"],
  ["den_i", "denI"],
  ["S_c", "Sc"],
  ["Cl", "Cl"],
  ["Cv", "Cv"],
  ["Cf", "Cf"],
  ["iceFieldLength", "fieldLength"],
  ["iceFieldWidth", "fieldWidth"],
  ["OpeDir", "OpeDir"],
  ["Vi_x", "ViX"],
  ["Vi_y", "ViY"],
  ["Tdraft", "Tdraft"],
  ["phi", "phi"],
  ["alpha", "alpha"],
  ["slope_l", "slopeL"],
  ["slope_u", "slopeU"],
  ["Lpp", "Lpp"],
  ["Loa", "Loa"],
  ["Lbow", "Lbow"],
  ["Bbeam", "Bbeam"],
  ["Ddisp", "Ddisp"],
  ["f_2", "f2"],
  ["f_3", "f3"],
  ["f_4", "f4"],
];

export function buildReportText(input: ReportInput): string {
  const lines: string[] = [];
  lines.push(input.projectName || "Unnamed Project");
  lines.push(SEP);

  if (input.sections.parameter) {
    lines.push("Parameter");
    for (const [label, key] of PARAM_EXPORT_ORDER) {
      const v = input.params[key] as number;
      lines.push(`${label}: ${Number.isFinite(v) ? v.toFixed(3) : "--"}`);
    }
    lines.push(SEP);
  }

  if (input.sections.resistance) {
    lines.push("Resistance");
    if (input.resistance) {
      lines.push(`ice-breaking resistance(kN): ${input.resistance.breakingKn.toFixed(3)}`);
      lines.push(`ice-submersion resistance(kN): ${input.resistance.submersionKn.toFixed(3)}`);
      lines.push(`ice resistance(kN): ${input.resistance.totalKn.toFixed(3)}`);
    } else {
      lines.push("（暂无仿真结果，请先在 Simulation 页签运行仿真）");
    }
    lines.push(SEP);
  }

  if (input.sections.power) {
    lines.push("Power");
    lines.push(
      `standard empirical formula power(kW): ${input.powerStandardKw !== null ? input.powerStandardKw.toFixed(3) : "--"}`,
    );
    lines.push(`CCM power(kW): ${input.powerCcmKw !== null ? input.powerCcmKw.toFixed(3) : "--"}`);
    lines.push(SEP);
  }

  return lines.join("\r\n") + "\r\n";
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
