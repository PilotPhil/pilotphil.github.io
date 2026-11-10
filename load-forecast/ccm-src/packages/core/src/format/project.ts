/**
 * .ccm.json 工程文件（Web 版原生格式）。
 *
 * 对应桌面版 HDF5 工程的 Web 等价物：全部仿真参数 + 可选的真实船体
 * HullOut + 水线高度。加载时对字段逐个校验并与默认值合并，
 * 旧文件缺字段不报错。
 */
import { DEFAULT_PARAMS, type SimParams } from "../engine/simulation";

export const PROJECT_FORMAT = "ccm-web-project";
export const PROJECT_VERSION = 1;

export interface CcmProject {
  format: string;
  version: number;
  name: string;
  savedAt: string;
  params: SimParams;
  hullOut: number[][] | null;
  waterlineHeight: [number, number, number] | null;
}

export interface ProjectInput {
  name: string;
  params: SimParams;
  hullOut: number[][] | null;
  waterlineHeight: [number, number, number] | null;
}

export function serializeProject(input: ProjectInput): string {
  const project: CcmProject = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: input.name,
    savedAt: new Date().toISOString(),
    params: { ...input.params },
    hullOut: input.hullOut,
    waterlineHeight: input.waterlineHeight,
  };
  return JSON.stringify(project, null, 2);
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function validateHullOut(raw: unknown): number[][] | null {
  if (!Array.isArray(raw)) return null;
  const rows: number[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 7) return null;
    if (!row.slice(0, 7).every(isFiniteNumber)) return null;
    rows.push(row.slice(0, 7) as number[]);
  }
  return rows.length >= 3 ? rows : null;
}

export function parseProject(json: string): CcmProject {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("无效的工程文件：不是合法 JSON。");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("无效的工程文件：内容为空。");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== PROJECT_FORMAT) {
    throw new Error("无效的工程文件：格式标识不匹配（需要 .ccm.json）。");
  }
  if (obj.version !== PROJECT_VERSION) {
    throw new Error(`不支持的工程版本：${String(obj.version)}`);
  }

  const params: SimParams = { ...DEFAULT_PARAMS };
  if (typeof obj.params === "object" && obj.params !== null) {
    const saved = obj.params as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_PARAMS) as Array<keyof SimParams>) {
      const v = saved[key];
      if (isFiniteNumber(v)) {
        (params as unknown as Record<string, number>)[key] = v;
      }
    }
  }

  const name = typeof obj.name === "string" && obj.name.length > 0 ? obj.name : "未命名工程";
  const savedAt = typeof obj.savedAt === "string" ? obj.savedAt : "";

  let waterlineHeight: [number, number, number] | null = null;
  if (Array.isArray(obj.waterlineHeight) && obj.waterlineHeight.length === 3) {
    const [a, b, c] = obj.waterlineHeight as unknown[];
    if (isFiniteNumber(a) && isFiniteNumber(b) && isFiniteNumber(c)) {
      waterlineHeight = [a, b, c];
    }
  }

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    savedAt,
    params,
    hullOut: validateHullOut(obj.hullOut),
    waterlineHeight,
  };
}
