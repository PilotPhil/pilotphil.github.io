/**
 * 参数面板：复刻 param_widget 的分组树、单位换算（kPa/GPa/kts）、
 * 枚举属性（Heading/推进模式/艏型/桨数）与 alpha→艏型联动。
 */
import type { SimParams } from "@ccm/core";
import { useEffect, useRef } from "react";
import { useApp } from "../state/AppContext";

const KPA_TO_PA = 1e3;
const GPA_TO_PA = 1e9;
const MPS_PER_KTS = 0.5144;

interface NumFieldDef {
  kind: "num";
  key: keyof SimParams;
  label: string;
  unit?: string;
  factor?: number;
  int?: boolean;
}

interface EnumFieldDef {
  kind: "enum";
  key: keyof SimParams;
  label: string;
  options: Array<{ label: string; value: number }>;
  unit?: string;
}

type FieldDef = NumFieldDef | EnumFieldDef;
interface GroupDef {
  title: string;
  children: Array<FieldDef | GroupDef>;
}

const TREE: GroupDef[] = [
  {
    title: "Simulation",
    children: [
      { kind: "num", key: "deltaT", label: "Time Step", unit: "s" },
      { kind: "num", key: "Nt", label: "Number of Steps", int: true },
    ],
  },
  {
    title: "Ice",
    children: [
      { kind: "num", key: "Sc", label: "Snow Thickness", unit: "m" },
      { kind: "num", key: "hi", label: "Ice Thickness", unit: "m" },
      { kind: "num", key: "fieldLength", label: "Ice Field Length", unit: "m" },
      { kind: "num", key: "fieldWidth", label: "Ice Field Width", unit: "m" },
      {
        title: "strength",
        children: [
          { kind: "num", key: "sigmaF", label: "Flexural Strength", unit: "kPa", factor: KPA_TO_PA },
          { kind: "num", key: "sigmaC", label: "Compressive Strength", unit: "kPa", factor: KPA_TO_PA },
          { kind: "num", key: "Ei", label: "Elastic Modulus", unit: "GPa", factor: GPA_TO_PA },
        ],
      },
      { kind: "num", key: "miu", label: "Ship-Ice Friction Coefficient" },
      { kind: "num", key: "denW", label: "Water Density", unit: "kg/m^3" },
      { kind: "num", key: "denI", label: "Ice Density", unit: "kg/m^3" },
      { kind: "num", key: "pois", label: "Poisson's Ratio" },
      { kind: "num", key: "Cl", label: "Cl" },
      { kind: "num", key: "Cv", label: "Cv" },
      { kind: "num", key: "Cf", label: "Cf" },
    ],
  },
  {
    title: "Hull",
    children: [
      {
        title: "Main Dimensions",
        children: [
          { kind: "num", key: "Lpp", label: "Waterline Length", unit: "m" },
          { kind: "num", key: "Lbow", label: "Bow Length", unit: "m" },
          { kind: "num", key: "Bbeam", label: "Ship Beam", unit: "m" },
          { kind: "num", key: "Tdraft", label: "Draft", unit: "m" },
          { kind: "num", key: "Ddisp", label: "Displacement", unit: "t" },
        ],
      },
      { kind: "num", key: "phi", label: "Stem angle", unit: "deg" },
      { kind: "num", key: "alpha", label: "Waterline angle at B/4", unit: "deg" },
      {
        title: "motion",
        children: [
          {
            kind: "enum",
            key: "OpeDir",
            label: "Heading",
            options: [
              { label: "Bow-first Icebreaking", value: 1 },
              { label: "Stern-first Icebreaking", value: -1 },
            ],
          },
          { kind: "num", key: "ViX", label: "X Velocity", unit: "kts", factor: MPS_PER_KTS },
          { kind: "num", key: "ViY", label: "Y Velocity", unit: "kts", factor: MPS_PER_KTS },
        ],
      },
      {
        title: "Propeller and Rudder",
        children: [
          {
            kind: "enum",
            key: "f2",
            label: "propeller propulsion mode",
            options: [
              { label: "Controllable-pitch/electric", value: 0.9 },
              { label: "Fixed-pitch", value: 1.0 },
            ],
          },
          {
            kind: "enum",
            key: "f3",
            label: "bow hull-form parameter",
            options: [
              { label: "≤ 45°", value: 0.9 },
              { label: "> 45°", value: 1.0 },
            ],
          },
          {
            kind: "enum",
            key: "f4",
            label: "Number of propellers",
            options: [
              { label: "Single", value: 0.88 },
              { label: "Twin", value: 0.99 },
              { label: "Three", value: 1.06 },
            ],
          },
          { kind: "num", key: "slopeL", label: "slope_l", unit: "deg" },
          { kind: "num", key: "slopeU", label: "slope_u", unit: "deg" },
        ],
      },
      { kind: "num", key: "stemSlopeDeg", label: "Stem slope (parametric fallback)", unit: "deg" },
    ],
  },
];

/** 禁止滚轮改值（对齐 DecoratedDoubleSpinBoxFactory 的 eventFilter 行为）。 */
function useDisableWheel(ref: React.MutableRefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement === el) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}

function NumberInput(props: {
  value: number;
  int?: boolean;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useDisableWheel(ref);
  return (
    <input
      ref={ref}
      type="number"
      step={props.int ? 1 : 0.1}
      value={Number.isFinite(props.value) ? parseFloat(props.value.toPrecision(8)) : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) props.onChange(props.int ? Math.round(v) : v);
      }}
    />
  );
}

function FieldRow({ def }: { def: FieldDef }) {
  const app = useApp();
  const value = app.params[def.key] as number;
  const factor = def.kind === "num" ? (def.factor ?? 1) : 1;

  const handleChange = (v: number) => {
    app.updateParam(def.key, v);
    // alpha → 艏型参数自动联动（对齐 param_widget.cpp:422-428）
    if (def.key === "alpha") {
      app.updateParam("f3", v <= 45 ? 0.9 : 1.0);
    }
  };

  return (
    <div className="paramRow">
      <span className="paramLabel" title={def.label}>
        {def.label}
      </span>
      {def.kind === "enum" ? (
        <select
          value={value}
          onChange={(e) => app.updateParam(def.key, Number(e.target.value))}
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <NumberInput value={value / factor} int={def.int} onChange={(v) => handleChange(v * factor)} />
          <span className="paramUnit">{def.unit ?? ""}</span>
        </>
      )}
    </div>
  );
}

function GroupSection({ def, depth }: { def: GroupDef; depth: number }) {
  return (
    <details className="paramGroup" open={depth === 0}>
      <summary>{def.title}</summary>
      <div className="paramGroupBody">
        {def.children.map((child, i) =>
          "children" in child ? (
            <GroupSection key={`${child.title}${i}`} def={child} depth={depth + 1} />
          ) : (
            <FieldRow key={child.key} def={child} />
          ),
        )}
      </div>
    </details>
  );
}

export function ParamPanel() {
  return (
    <div className="paramPanel">
      {TREE.map((g) => (
        <GroupSection key={g.title} def={g} depth={0} />
      ))}
    </div>
  );
}
