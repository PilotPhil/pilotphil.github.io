/**
 * 四套主题（对齐 CCM_Re mainwindow.cpp 的内嵌主题）：
 * Default（原生风格近似）/ Simple Light / Engineering Dark / starlike（桌面默认）。
 * 颜色值逐一取自 C++ QSS 字符串与 applyTheme 的画布/图表配色。
 */

export type ThemeKey = "default" | "simple_light" | "engineering_dark" | "starlike";

export interface CanvasTheme {
  /** 画布背景 */
  canvasBg: string;
  /** 画布外框背景 */
  frameBg: string;
  border: string;
  hint: string;
  axis: string;
}

export interface ChartTheme {
  chartBg: string;
  plotBg: string;
  axisColor: string;
  gridColor: string;
}

export interface Theme {
  key: ThemeKey;
  label: string;
  bg: string;
  text: string;
  /** 主色：主按钮 / 选中页签顶线 / 焦点环 / 进度条 */
  accent: string;
  /** accent 上的前景文字 */
  accentText: string;
  /** accent 的弱化底色（选中态背景等） */
  accentSoft: string;
  menubarBg: string;
  menubarText: string;
  menubarHover: string;
  menubarBorder: string;
  menuBg: string;
  menuText: string;
  menuHover: string;
  menuBorder: string;
  paneBg: string;
  paneBorder: string;
  leftPaneBg: string;
  leftPaneBorder: string;
  tabBg: string;
  tabText: string;
  tabSelectedBg: string;
  tabSelectedText: string;
  tabHover: string;
  tabBorder: string;
  tabRadius: string;
  groupBorder: string;
  groupTitle: string;
  buttonBg: string;
  buttonText: string;
  buttonBorder: string;
  buttonHover: string;
  buttonPressed: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  treeBg: string;
  treeAlt: string;
  treeGrid: string;
  treeSelected: string;
  treeSelectedText: string;
  headerBg: string;
  headerText: string;
  dockTitleBg: string;
  dockTitleText: string;
  dockTitleBorder: string;
  statusbarBg: string;
  statusbarText: string;
  statusbarBorder: string;
  canvas: CanvasTheme;
  chart: ChartTheme;
}

const DEFAULT_THEME: Theme = {
  key: "default",
  label: "Default",
  bg: "#f0f0f0",
  text: "#1a1a1a",
  accent: "#3d6a94",
  accentText: "#ffffff",
  accentSoft: "rgba(61, 106, 148, 0.14)",
  menubarBg: "#fafafa",
  menubarText: "#1a1a1a",
  menubarHover: "#e0e8f4",
  menubarBorder: "#c8c8c8",
  menuBg: "#ffffff",
  menuText: "#1a1a1a",
  menuHover: "#e0e8f4",
  menuBorder: "#c8c8c8",
  paneBg: "#f5f5f5",
  paneBorder: "#c8c8c8",
  leftPaneBg: "#f3f3f3",
  leftPaneBorder: "#c8c8c8",
  tabBg: "#e6e6e6",
  tabText: "#444444",
  tabSelectedBg: "#ffffff",
  tabSelectedText: "#1a1a1a",
  tabHover: "#dcdcdc",
  tabBorder: "#c8c8c8",
  tabRadius: "4px",
  groupBorder: "#c8c8c8",
  groupTitle: "#3d5468",
  buttonBg: "#e1e1e1",
  buttonText: "#1a1a1a",
  buttonBorder: "#adadad",
  buttonHover: "#e5f1fb",
  buttonPressed: "#cee4f7",
  inputBg: "#ffffff",
  inputText: "#1a1a1a",
  inputBorder: "#b8b8b8",
  treeBg: "#ffffff",
  treeAlt: "#f6f6f6",
  treeGrid: "#e0e0e0",
  treeSelected: "#cce8ff",
  treeSelectedText: "#1a1a1a",
  headerBg: "#e8e8e8",
  headerText: "#3d5468",
  dockTitleBg: "#e8e8e8",
  dockTitleText: "#3d5468",
  dockTitleBorder: "#c8c8c8",
  statusbarBg: "#efefef",
  statusbarText: "#2a3946",
  statusbarBorder: "#c8c8c8",
  canvas: {
    canvasBg: "#ffffff",
    frameBg: "#f0f0f0",
    border: "#c8c8c8",
    hint: "#6a7a8a",
    axis: "#2e3e53",
  },
  chart: {
    chartBg: "#f0f0f0",
    plotBg: "#ffffff",
    axisColor: "#3f5068",
    gridColor: "#d1dce9",
  },
};

const SIMPLE_LIGHT: Theme = {
  key: "simple_light",
  label: "Simple Light",
  bg: "#f6f8fb",
  text: "#1f2d3d",
  accent: "#2f7fe6",
  accentText: "#ffffff",
  accentSoft: "rgba(47, 127, 230, 0.12)",
  menubarBg: "#ffffff",
  menubarText: "#1f2d3d",
  menubarHover: "#e9f1fb",
  menubarBorder: "#d8e1ec",
  menuBg: "#ffffff",
  menuText: "#1f2d3d",
  menuHover: "#e9f1fb",
  menuBorder: "#d8e1ec",
  paneBg: "#ffffff",
  paneBorder: "#d3deeb",
  leftPaneBg: "#f4f7fb",
  leftPaneBorder: "#d8e1ec",
  tabBg: "#edf3fa",
  tabText: "#506782",
  tabSelectedBg: "#ffffff",
  tabSelectedText: "#1f2d3d",
  tabHover: "#e4eef9",
  tabBorder: "#d3deeb",
  tabRadius: "6px",
  groupBorder: "#d8e1ec",
  groupTitle: "#4d6380",
  buttonBg: "#2f7fe6",
  buttonText: "#ffffff",
  buttonBorder: "#2466bc",
  buttonHover: "#3f8df1",
  buttonPressed: "#2466bc",
  inputBg: "#ffffff",
  inputText: "#1f2d3d",
  inputBorder: "#cdd9e5",
  treeBg: "#ffffff",
  treeAlt: "#f7fbff",
  treeGrid: "#e1e8f0",
  treeSelected: "#dfeeff",
  treeSelectedText: "#1f2d3d",
  headerBg: "#edf2f8",
  headerText: "#42566f",
  dockTitleBg: "#eef3f9",
  dockTitleText: "#42566f",
  dockTitleBorder: "#d8e1ec",
  statusbarBg: "#f6f8fb",
  statusbarText: "#1f2d3d",
  statusbarBorder: "#d8e1ec",
  canvas: {
    canvasBg: "#ffffff",
    frameBg: "rgb(246,248,251)",
    border: "rgb(206,218,232)",
    hint: "rgb(96,113,132)",
    axis: "rgb(46,62,83)",
  },
  chart: {
    chartBg: "rgb(246,248,251)",
    plotBg: "#ffffff",
    axisColor: "rgb(63,80,104)",
    gridColor: "rgb(209,220,233)",
  },
};

const ENGINEERING_DARK: Theme = {
  key: "engineering_dark",
  label: "Engineering Dark",
  bg: "#1f252d",
  text: "#d7dee7",
  accent: "#1f8f6b",
  accentText: "#e9fff8",
  accentSoft: "rgba(31, 143, 107, 0.2)",
  menubarBg: "#272f39",
  menubarText: "#d7dee7",
  menubarHover: "#344252",
  menubarBorder: "#3a4656",
  menuBg: "#2b3440",
  menuText: "#d7dee7",
  menuHover: "#3b4c61",
  menuBorder: "#3e4b5f",
  paneBg: "#202833",
  paneBorder: "#445265",
  leftPaneBg: "#202833",
  leftPaneBorder: "#3a4656",
  tabBg: "#2f3a48",
  tabText: "#9cb0c7",
  tabSelectedBg: "#202833",
  tabSelectedText: "#e5efff",
  tabHover: "#354456",
  tabBorder: "#445265",
  tabRadius: "6px",
  groupBorder: "#445265",
  groupTitle: "#9cb0c7",
  buttonBg: "#1f8f6b",
  buttonText: "#e9fff8",
  buttonBorder: "#1a7759",
  buttonHover: "#25a279",
  buttonPressed: "#1a7759",
  inputBg: "#2b3440",
  inputText: "#d7dee7",
  inputBorder: "#4b5a70",
  treeBg: "#232c37",
  treeAlt: "#26313d",
  treeGrid: "#3a4656",
  treeSelected: "#35506a",
  treeSelectedText: "#e5f0ff",
  headerBg: "#303b48",
  headerText: "#aabbd0",
  dockTitleBg: "#2a333e",
  dockTitleText: "#aabbd0",
  dockTitleBorder: "#445265",
  statusbarBg: "#1f252d",
  statusbarText: "#d7dee7",
  statusbarBorder: "#3a4656",
  canvas: {
    canvasBg: "rgb(35,44,55)",
    frameBg: "rgb(31,37,45)",
    border: "rgb(62,76,95)",
    hint: "rgb(152,169,189)",
    axis: "rgb(196,206,220)",
  },
  chart: {
    chartBg: "rgb(31,37,45)",
    plotBg: "rgb(35,44,55)",
    axisColor: "rgb(210,223,240)",
    gridColor: "rgb(78,92,112)",
  },
};

const STARLIKE: Theme = {
  key: "starlike",
  label: "starlike",
  bg: "#e6eaef",
  text: "#22303c",
  accent: "#006b8d",
  accentText: "#f3fbff",
  accentSoft: "rgba(0, 107, 141, 0.12)",
  menubarBg: "#006b8d",
  menubarText: "#f3fbff",
  menubarHover: "#0a7fa6",
  menubarBorder: "#0f4f67",
  menuBg: "#f5f7fa",
  menuText: "#22303c",
  menuHover: "#d6e6f2",
  menuBorder: "#aeb9c5",
  paneBg: "#f8fafc",
  paneBorder: "#b8c4cf",
  leftPaneBg: "#edf1f5",
  leftPaneBorder: "#b8c4cf",
  tabBg: "#d8e0e8",
  tabText: "#314353",
  tabSelectedBg: "#f8fafc",
  tabSelectedText: "#1f2b36",
  tabHover: "#cfd8e2",
  tabBorder: "#b8c4cf",
  tabRadius: "4px",
  groupBorder: "#b8c4cf",
  groupTitle: "#3e556b",
  buttonBg: "#d6dde5",
  buttonText: "#1f2c38",
  buttonBorder: "#a6b2bf",
  buttonHover: "#cdd6df",
  buttonPressed: "#bec8d2",
  inputBg: "#ffffff",
  inputText: "#1f2b36",
  inputBorder: "#b3bfcb",
  treeBg: "#fdfefe",
  treeAlt: "#f2f5f8",
  treeGrid: "#d4dbe2",
  treeSelected: "#d5e5f3",
  treeSelectedText: "#1f2b36",
  headerBg: "#dde4eb",
  headerText: "#324657",
  dockTitleBg: "#dfe5ec",
  dockTitleText: "#324657",
  dockTitleBorder: "#b8c4cf",
  statusbarBg: "#e3e8ee",
  statusbarText: "#2a3946",
  statusbarBorder: "#b8c4cf",
  canvas: {
    canvasBg: "rgb(248,250,252)",
    frameBg: "rgb(230,234,239)",
    border: "rgb(184,196,207)",
    hint: "rgb(95,112,128)",
    axis: "rgb(64,82,103)",
  },
  chart: {
    chartBg: "rgb(230,234,239)",
    plotBg: "rgb(248,250,252)",
    axisColor: "rgb(46,63,79)",
    gridColor: "rgb(194,204,214)",
  },
};

export const THEMES: Record<ThemeKey, Theme> = {
  default: DEFAULT_THEME,
  simple_light: SIMPLE_LIGHT,
  engineering_dark: ENGINEERING_DARK,
  starlike: STARLIKE,
};

export const DEFAULT_THEME_KEY: ThemeKey = "starlike";

export function isThemeKey(v: string | null): v is ThemeKey {
  return v === "default" || v === "simple_light" || v === "engineering_dark" || v === "starlike";
}

/** 注入到根元素的 CSS 变量 */
export function themeCssVars(t: Theme): Record<string, string> {
  return {
    "--c-bg": t.bg,
    "--c-text": t.text,
    "--c-accent": t.accent,
    "--c-accent-text": t.accentText,
    "--c-accent-soft": t.accentSoft,
    "--c-menubar-bg": t.menubarBg,
    "--c-menubar-text": t.menubarText,
    "--c-menubar-hover": t.menubarHover,
    "--c-menubar-border": t.menubarBorder,
    "--c-menu-bg": t.menuBg,
    "--c-menu-text": t.menuText,
    "--c-menu-hover": t.menuHover,
    "--c-menu-border": t.menuBorder,
    "--c-pane-bg": t.paneBg,
    "--c-pane-border": t.paneBorder,
    "--c-leftpane-bg": t.leftPaneBg,
    "--c-leftpane-border": t.leftPaneBorder,
    "--c-tab-bg": t.tabBg,
    "--c-tab-text": t.tabText,
    "--c-tab-selected-bg": t.tabSelectedBg,
    "--c-tab-selected-text": t.tabSelectedText,
    "--c-tab-hover": t.tabHover,
    "--c-tab-border": t.tabBorder,
    "--c-tab-radius": t.tabRadius,
    "--c-group-border": t.groupBorder,
    "--c-group-title": t.groupTitle,
    "--c-button-bg": t.buttonBg,
    "--c-button-text": t.buttonText,
    "--c-button-border": t.buttonBorder,
    "--c-button-hover": t.buttonHover,
    "--c-button-pressed": t.buttonPressed,
    "--c-input-bg": t.inputBg,
    "--c-input-text": t.inputText,
    "--c-input-border": t.inputBorder,
    "--c-tree-bg": t.treeBg,
    "--c-tree-alt": t.treeAlt,
    "--c-tree-grid": t.treeGrid,
    "--c-tree-selected": t.treeSelected,
    "--c-tree-selected-text": t.treeSelectedText,
    "--c-header-bg": t.headerBg,
    "--c-header-text": t.headerText,
    "--c-dock-title-bg": t.dockTitleBg,
    "--c-dock-title-text": t.dockTitleText,
    "--c-dock-title-border": t.dockTitleBorder,
    "--c-statusbar-bg": t.statusbarBg,
    "--c-statusbar-text": t.statusbarText,
    "--c-statusbar-border": t.statusbarBorder,
    "--c-canvas-border": t.canvas.border,
  };
}
