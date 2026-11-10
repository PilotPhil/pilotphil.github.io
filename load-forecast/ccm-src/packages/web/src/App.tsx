import { useState } from "react";
import { AnalysisTab } from "./components/AnalysisTab";
import { ConsolePanel } from "./components/ConsolePanel";
import { HullModelTab } from "./components/HullModelTab";
import { MenuBar } from "./components/MenuBar";
import { ParamPanel } from "./components/ParamPanel";
import { SimulationTab } from "./components/SimulationTab";
import { StatusBar } from "./components/StatusBar";
import { AppProvider, useApp } from "./state/AppContext";
import { themeCssVars } from "./theme/themes";

type TabKey = "simulation" | "hull" | "analysis";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "simulation", label: "Simulation" },
  { key: "hull", label: "Hull Model" },
  { key: "analysis", label: "Analysis&Result" },
];

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<TabKey>("simulation");

  return (
    <div className={`app ${app.theme.key}`} style={themeCssVars(app.theme)}>
      <MenuBar />
      <div className="body">
        <div className="leftDock">
          <div className="dockPanel" style={{ flex: 3 }}>
            <div className="dockTitle">Param</div>
            <ParamPanel />
          </div>
          <div className="dockPanel" style={{ flex: 1 }}>
            <div className="dockTitle">Console</div>
            <ConsolePanel />
          </div>
        </div>

        <div className="visualDock">
          <div className="dockTitle">Visual</div>
          <div className="tabContent">
            <div className="tabPanel" style={{ display: tab === "simulation" ? "flex" : "none" }}>
              <SimulationTab />
            </div>
            <div className="tabPanel" style={{ display: tab === "hull" ? "flex" : "none" }}>
              <HullModelTab />
            </div>
            <div className="tabPanel" style={{ display: tab === "analysis" ? "flex" : "none" }}>
              <AnalysisTab />
            </div>
          </div>
          <div className="tabBar">
            {TABS.map((t) => (
              <div
                key={t.key}
                className={`tab${tab === t.key ? " selected" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
