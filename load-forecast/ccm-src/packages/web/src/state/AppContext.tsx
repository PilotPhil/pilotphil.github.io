/**
 * 应用全局状态：主题、仿真参数、真实船体 HullOut、冰/船配色、控制台日志、
 * Worker 控制接口与最近工程。对应桌面版 ProjectManager 单例 + QSettings 的职责。
 */
import { DEFAULT_PARAMS, parseProject, serializeProject, type SimParams } from "@ccm/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { MainToWorker, Snapshot } from "../sim/protocol";
import { DEFAULT_THEME_KEY, isThemeKey, THEMES, type Theme, type ThemeKey } from "../theme/themes";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogLine {
  time: string;
  level: LogLevel;
  text: string;
}

export interface SimColors {
  intact: string;
  contact: string;
  removed: string;
  shipFill: string;
}

export const DEFAULT_COLORS: SimColors = {
  intact: "#b6b6b6",
  contact: "#8b0000",
  removed: "#87cefa",
  shipFill: "#00007f",
};

export interface UiState {
  running: boolean;
  finished: boolean;
  step: number;
  total: number;
  stepsPerSec: number;
  fbrkLast: number;
  fsubLast: number;
  summary: Snapshot["summary"];
}

const IDLE_UI: UiState = {
  running: false,
  finished: false,
  step: 0,
  total: 0,
  stepsPerSec: 0,
  fbrkLast: 0,
  fsubLast: 0,
  summary: null,
};

export interface RecentProject {
  name: string;
  savedAt: string;
  json: string;
}

interface AppContextValue {
  theme: Theme;
  themeKey: ThemeKey;
  setThemeKey: (k: ThemeKey) => void;

  params: SimParams;
  updateParam: (key: keyof SimParams, value: number) => void;
  replaceParams: (p: SimParams) => void;

  hullOut: number[][] | null;
  setHullOut: (rows: number[][] | null) => void;

  waterlineHeight: [number, number, number] | null;
  setWaterlineHeight: (v: [number, number, number] | null) => void;

  projectName: string;
  setProjectName: (n: string) => void;
  projectDirty: boolean;

  colors: SimColors;
  setColor: (key: keyof SimColors, value: string) => void;

  logs: LogLine[];
  pushLog: (level: LogLevel, text: string) => void;
  clearLogs: () => void;

  recentProjects: RecentProject[];
  addRecentProject: (name: string, json: string) => void;

  // Worker
  ui: UiState;
  /** 是否已存在可仿真的场景（打开工程 / 新建工程 / Reload Scene 后为 true） */
  sceneReady: boolean;
  snapRef: RefObject<Snapshot | null>;
  /** 订阅快照到达（事件驱动渲染）；返回取消订阅函数 */
  onSnapshot: (cb: (snap: Snapshot) => void) => () => void;
  /** 重建场景计数，画布据此触发重新适配视图 */
  resetCount: number;
  resetScene: () => void;
  startSim: () => void;
  stopSim: () => void;
  singleStep: () => void;
  speed: number;
  setSpeed: (v: number) => void;

  // 工程文件
  saveProject: (saveAsName?: string) => void;
  openProjectJson: (json: string, fallbackName: string) => void;
  newProject: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 忽略损坏的本地存储
  }
  return fallback;
}

function nowTime(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // 主题
  const [themeKey, setThemeKeyState] = useState<ThemeKey>(() => {
    const stored = localStorage.getItem("ccm.theme");
    return isThemeKey(stored) ? stored : DEFAULT_THEME_KEY;
  });
  const setThemeKey = useCallback((k: ThemeKey) => {
    setThemeKeyState(k);
    localStorage.setItem("ccm.theme", k);
  }, []);
  const theme = THEMES[themeKey];

  // 仿真参数
  const [params, setParams] = useState<SimParams>({ ...DEFAULT_PARAMS });
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const updateParam = useCallback((key: keyof SimParams, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);
  const replaceParams = useCallback((p: SimParams) => setParams({ ...p }), []);

  // 船体
  const [hullOut, setHullOutState] = useState<number[][] | null>(null);
  const hullOutRef = useRef(hullOut);
  hullOutRef.current = hullOut;
  const setHullOut = useCallback((rows: number[][] | null) => setHullOutState(rows), []);
  const [waterlineHeight, setWaterlineHeight] = useState<[number, number, number] | null>(null);

  // 工程
  const [projectName, setProjectName] = useState("未命名工程");
  const [projectDirty, setProjectDirty] = useState(false);

  // 配色
  const [colors, setColors] = useState<SimColors>(() => loadJson("ccm.colors", DEFAULT_COLORS));
  const setColor = useCallback((key: keyof SimColors, value: string) => {
    setColors((c) => {
      const next = { ...c, [key]: value };
      localStorage.setItem("ccm.colors", JSON.stringify(next));
      return next;
    });
  }, []);

  // 日志
  const [logs, setLogs] = useState<LogLine[]>([]);
  const pushLog = useCallback((level: LogLevel, text: string) => {
    setLogs((ls) => [...ls.slice(-500), { time: nowTime(), level, text }]);
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);

  // 最近工程（浏览器无法按路径重读文件，连同内容一起存 localStorage）
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() =>
    loadJson<RecentProject[]>("ccm.recent", []),
  );
  const addRecentProject = useCallback((name: string, json: string) => {
    setRecentProjects((list) => {
      const next = [
        { name, savedAt: new Date().toISOString(), json },
        ...list.filter((p) => p.name !== name),
      ].slice(0, 8);
      try {
        localStorage.setItem("ccm.recent", JSON.stringify(next));
      } catch {
        // 容量超限时忽略（工程内容过大）
      }
      return next;
    });
  }, []);

  // Worker
  const workerRef = useRef<Worker | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const snapListenersRef = useRef<Array<(snap: Snapshot) => void>>([]);
  const [ui, setUi] = useState<UiState>(IDLE_UI);
  const uiRef = useRef<UiState>(IDLE_UI);
  const lastUiPushRef = useRef(0);
  const [resetCount, setResetCount] = useState(0);
  const resetCountRef = useRef(0);
  const [speed, setSpeedState] = useState(4);
  /** 场景是否已建立：启动时不自动建场景，打开工程/新建/Reload Scene 才建 */
  const [sceneReady, setSceneReady] = useState(false);
  const sceneReadyRef = useRef(false);

  useEffect(() => {
    const worker = new Worker(new URL("../sim/simWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<Snapshot>) => {
      const snap = e.data;
      if (snap.type !== "snapshot") return;
      snapRef.current = snap;
      for (const cb of snapListenersRef.current) cb(snap);

      const now = performance.now();
      const prev = uiRef.current;
      const structural = snap.running !== prev.running || snap.finished !== prev.finished;
      if (structural || now - lastUiPushRef.current > 120) {
        lastUiPushRef.current = now;
        const next: UiState = {
          running: snap.running,
          finished: snap.finished,
          step: snap.step,
          total: snap.total,
          stepsPerSec: snap.stepsPerSec,
          fbrkLast: snap.fbrkLast,
          fsubLast: snap.fsubLast,
          summary: snap.summary,
        };
        uiRef.current = next;
        setUi(next);
      }
    };

    worker.postMessage({ type: "speed", speed: 4 } satisfies MainToWorker);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 订阅快照到达事件（事件驱动渲染用；返回取消订阅函数）。 */
  const onSnapshot = useCallback((cb: (snap: Snapshot) => void) => {
    snapListenersRef.current.push(cb);
    return () => {
      snapListenersRef.current = snapListenersRef.current.filter((x) => x !== cb);
    };
  }, []);

  const post = useCallback((msg: MainToWorker) => {
    workerRef.current?.postMessage(msg);
  }, []);

  /** 建场：所有会（重新）创建场景的路径统一走这里 */
  const postReset = useCallback(() => {
    post({ type: "reset", params: paramsRef.current, hullOut: hullOutRef.current });
    sceneReadyRef.current = true;
    setSceneReady(true);
    resetCountRef.current += 1;
    setResetCount(resetCountRef.current);
  }, [post]);

  const resetScene = useCallback(() => postReset(), [postReset]);

  const startSim = useCallback(() => {
    if (!sceneReadyRef.current) {
      pushLog("WARN", "暂无场景：请先 Reload Scene 或打开工程后再开始仿真。");
      return;
    }
    post({ type: "start" });
  }, [post, pushLog]);
  const stopSim = useCallback(() => post({ type: "stop" }), [post]);
  const singleStep = useCallback(() => {
    if (!sceneReadyRef.current) {
      pushLog("WARN", "暂无场景：请先 Reload Scene 或打开工程后再单步。");
      return;
    }
    post({ type: "single" });
  }, [post, pushLog]);
  const setSpeed = useCallback(
    (v: number) => {
      setSpeedState(v);
      post({ type: "speed", speed: v });
    },
    [post],
  );

  // 工程文件
  const saveProject = useCallback(
    (saveAsName?: string) => {
      const name = (saveAsName ?? projectName).trim() || "未命名工程";
      const json = serializeProject({
        name,
        params: paramsRef.current,
        hullOut: hullOutRef.current,
        waterlineHeight: waterlineHeight ?? null,
      });
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.ccm.json`;
      a.click();
      URL.revokeObjectURL(url);
      addRecentProject(name, json);
      setProjectName(name);
      setProjectDirty(false);
      pushLog("INFO", `工程已保存：${name}.ccm.json`);
    },
    [projectName, waterlineHeight, addRecentProject, pushLog],
  );

  const applyProject = useCallback(
    (project: ReturnType<typeof parseProject>, json: string) => {
      replaceParams(project.params);
      setHullOutState(project.hullOut);
      setWaterlineHeight(project.waterlineHeight);
      setProjectName(project.name);
      setProjectDirty(false);
      addRecentProject(project.name, json);
      // 以工程参数重建场景
      paramsRef.current = project.params;
      hullOutRef.current = project.hullOut;
      postReset();
      pushLog("INFO", `工程已打开：${project.name}（参数 ${Object.keys(project.params).length} 项${project.hullOut ? "，含真实船体" : ""}）`);
    },
    [addRecentProject, postReset, pushLog, replaceParams],
  );

  const openProjectJson = useCallback(
    (json: string, fallbackName: string) => {
      try {
        const project = parseProject(json);
        applyProject(project, json);
      } catch (err) {
        pushLog("ERROR", `打开工程失败：${err instanceof Error ? err.message : String(err)}（文件 ${fallbackName}）`);
      }
    },
    [applyProject, pushLog],
  );

  // 支持 ?project=<url> 链接直接打开工程（配合 tools/h5_to_ccm.py 转换结果使用）
  // 裸文件名按 /projects/<名> → /<名> 依次尝试（转换结果放在 public/projects/）
  const linkProjectLoadedRef = useRef(false);
  useEffect(() => {
    if (linkProjectLoadedRef.current) return; // StrictMode 双挂载防重
    linkProjectLoadedRef.current = true;
    const param = new URLSearchParams(window.location.search).get("project");
    if (!param) return;
    const absolute = /^(https?:)?\/\//.test(param) || param.startsWith("/");
    // 相对路径按当前页面目录解析，保证部署在 /load-forecast/ccm/ 这类子路径下也能取到工程
    const baseUrl = new URL(".", window.location.href);
    const bare = param.replace(/^\.?\//, "").replace(/^projects\//, "");
    const candidates = absolute
      ? [param]
      : [new URL(`projects/${bare}`, baseUrl).href, new URL(bare, baseUrl).href];
    const name = decodeURIComponent(param.split("/").pop() ?? "").replace(/\.ccm\.json$/i, "");
    void (async () => {
      let lastText: string | null = null;
      for (const url of candidates) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const text = await r.text();
          if (text.trimStart().startsWith("{")) {
            openProjectJson(text, name);
            return;
          }
          lastText = text;
        } catch {
          // 下一个候选路径
        }
      }
      if (lastText !== null) {
        // 拿到了非 JSON 内容（如 SPA fallback 的 index.html）
        openProjectJson(lastText, name);
        return;
      }
      pushLog("ERROR", `链接工程加载失败：找不到 ${param}（尝试过 ${candidates.join("、")}）`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newProject = useCallback(() => {
    const fresh = { ...DEFAULT_PARAMS };
    replaceParams(fresh);
    setHullOutState(null);
    setWaterlineHeight(null);
    setProjectName("未命名工程");
    paramsRef.current = fresh;
    hullOutRef.current = null;
    postReset();
    pushLog("INFO", "已新建工程（参数恢复默认）。");
  }, [postReset, pushLog, replaceParams]);

  const value: AppContextValue = {
    theme,
    themeKey,
    setThemeKey,
    params,
    updateParam,
    replaceParams,
    hullOut,
    setHullOut,
    waterlineHeight,
    setWaterlineHeight,
    projectName,
    setProjectName,
    projectDirty,
    colors,
    setColor,
    logs,
    pushLog,
    clearLogs,
    recentProjects,
    addRecentProject,
    ui,
    sceneReady,
    snapRef,
    onSnapshot,
    resetCount,
    resetScene,
    startSim,
    stopSim,
    singleStep,
    speed,
    setSpeed,
    saveProject,
    openProjectJson,
    newProject,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}
