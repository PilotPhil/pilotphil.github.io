import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppContext";
import { THEMES, type ThemeKey } from "../theme/themes";

interface MenuItemDef {
  label: string;
  action?: () => void;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  submenu?: { label: string; checked?: boolean; action: () => void }[];
}

export function MenuBar() {
  const app = useApp();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setRecentOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggle = (key: string) => {
    setOpenMenu((cur) => (cur === key ? null : key));
    setRecentOpen(false);
  };

  const doOpenFile = () => fileInputRef.current?.click();

  const onFileChosen = async (file: File) => {
    const json = await file.text();
    app.openProjectJson(json, file.name);
  };

  const menus: Array<{ key: string; label: string; items: MenuItemDef[] }> = [
    {
      key: "File",
      label: "File",
      items: [
        { label: "New Project", action: () => app.newProject() },
        { label: "Open Project...", action: doOpenFile },
        { separator: true, label: "" },
        { label: "Save", action: () => app.saveProject() },
        {
          label: "Save As...",
          action: () => {
            const name = window.prompt("工程名称：", app.projectName);
            if (name && name.trim()) app.saveProject(name.trim());
          },
        },
        { separator: true, label: "" },
        {
          label: "Open Recent",
          submenu: app.recentProjects.map((p) => ({
            label: `${p.name}（${new Date(p.savedAt).toLocaleString()}）`,
            action: () => app.openProjectJson(p.json, `${p.name}.ccm.json`),
          })),
        },
      ],
    },
    {
      key: "Simulation",
      label: "Simulation",
      items: [
        {
          label: "Start",
          action: app.startSim,
          disabled: app.ui.running || app.ui.finished || !app.sceneReady,
        },
        { label: "Stop", action: app.stopSim, disabled: !app.ui.running },
      ],
    },
    {
      key: "Setting",
      label: "Setting",
      items: [
        {
          label: "Style",
          submenu: (Object.keys(THEMES) as ThemeKey[]).map((k) => ({
            label: THEMES[k].label,
            checked: app.themeKey === k,
            action: () => app.setThemeKey(k),
          })),
        },
      ],
    },
    {
      key: "About",
      label: "About",
      items: [
        {
          label: "About CCM Web",
          action: () =>
            app.pushLog("INFO", "CCM Web v1.0.0 — CCM_Re（Qt 船舶破冰二维仿真）的 Web 平台重构。"),
        },
      ],
    },
  ];

  return (
    <div className="menubar" ref={barRef}>
      <div className="brand">
        <svg width="15" height="13" viewBox="0 0 18 14" aria-hidden="true">
          <path
            d="M1 3.5h7M1 10.5h7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path d="M7 1l9.5 6L7 13V1z" fill="currentColor" />
        </svg>
        <span>CCM Web</span>
      </div>
      <div className="brandSep" />
      {menus.map((m) => (
        <div key={m.key} className="menubarItemWrap">
          <div
            className={`menubarItem${openMenu === m.key ? " open" : ""}`}
            onClick={() => toggle(m.key)}
          >
            {m.label}
          </div>
          {openMenu === m.key && (
            <div className="menuDropdown">
              {m.items.map((item, idx) =>
                item.separator ? (
                  <div className="menuSeparator" key={`sep${idx}`} />
                ) : (
                  <div key={item.label}>
                    <div
                      className={`menuItem${item.disabled ? " disabled" : ""}`}
                      onClick={() => {
                        if (item.disabled) return;
                        if (item.submenu) {
                          setRecentOpen((v) => !v);
                          return;
                        }
                        item.action?.();
                        setOpenMenu(null);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.checked && <span className="checkMark">✓</span>}
                      {item.submenu && <span className="submenuArrow">▸</span>}
                    </div>
                    {item.submenu && recentOpen && (
                      <div className="menuSubmenu">
                        {item.submenu.length === 0 && (
                          <div className="menuItem disabled">（空）</div>
                        )}
                        {item.submenu.map((sub) => (
                          <div
                            key={sub.label}
                            className="menuItem"
                            onClick={() => {
                              sub.action();
                              setOpenMenu(null);
                              setRecentOpen(false);
                            }}
                          >
                            <span>{sub.label}</span>
                            {sub.checked && <span className="checkMark">✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.ccm.json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFileChosen(f);
          e.target.value = "";
          setOpenMenu(null);
        }}
      />
      <a className="homeLink" href="/#load" title="返回 Pilot Phil 主页">
        ← 主页
      </a>
    </div>
  );
}
