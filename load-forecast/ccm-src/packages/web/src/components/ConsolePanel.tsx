import { useEffect, useRef } from "react";
import { useApp } from "../state/AppContext";

/** 控制台（对齐 console_widget：右上方 Clear 按钮 + 只读日志区，最多保留 2000 行）。 */
export function ConsolePanel() {
  const app = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [app.logs]);

  return (
    <div className="consolePanel">
      <div className="consoleHead">
        <button onClick={app.clearLogs}>Clear</button>
      </div>
      <div className="consoleBody" ref={bodyRef}>
        {app.logs.map((line, i) => (
          <div key={i} className={`consoleLine ${line.level.toLowerCase()}`}>
            <span className="consoleTime">[{line.time}]</span> [
            <span className="consoleLevel">{line.level}</span>] {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
