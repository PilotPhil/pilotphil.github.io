import { describe, expect, it } from "vitest";
import {
  bboxOverlap,
  closestVertex,
  clipPolyToRect,
  collectEdgeIntersectionPoints,
  intersectShipCell,
  polyAreaCentroid,
  polyBBox,
  segmentIntersect,
  type Poly,
} from "../geometry/polygon";

const rect = (minX: number, minY: number, maxX: number, maxY: number): Poly => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

describe("Sutherland–Hodgman 矩形裁剪（替代 CGAL 求交）", () => {
  it("正方形与矩形角部交叠：面积/质心精确", () => {
    const poly = rect(0, 0, 4, 4);
    const clipped = clipPolyToRect(poly, { minX: 2, minY: 1, maxX: 6, maxY: 5 });
    const ac = polyAreaCentroid(clipped)!;
    expect(ac.area).toBeCloseTo(2 * 3, 12);
    expect(ac.cx).toBeCloseTo(3, 12);
    expect(ac.cy).toBeCloseTo(2.5, 12);
  });

  it("船首楔形（凸多边形）与矩形求交", () => {
    // 三角形 (0,0)-(4,0)-(0,4) 与 [1,3]×[1,3] 的交为梯形
    const tri: Poly = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    const clipped = clipPolyToRect(tri, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    const ac = polyAreaCentroid(clipped)!;
    // 交叠区域：x∈[1,3], y∈[1, min(4−x,3)] → 面积 = ∫[1,3] (3−x) dx = 2
    expect(ac.area).toBeCloseTo(2, 10);
  });

  it("相离返回空；相切返回零面积退化多边形", () => {
    const poly = rect(0, 0, 2, 2);
    expect(clipPolyToRect(poly, { minX: 3, minY: 0, maxX: 5, maxY: 1 })).toHaveLength(0);
    const touching = clipPolyToRect(poly, { minX: 2, minY: 0, maxX: 5, maxY: 1 });
    expect(polyAreaCentroid(touching)).toBeNull();
  });
});

describe("segmentIntersect（边交点收集，对应 CGAL::intersection）", () => {
  it("正规相交", () => {
    const hit = segmentIntersect({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 1 });
    expect(hit?.kind).toBe("point");
    expect(hit!.p.x).toBeCloseTo(1, 12);
    expect(hit!.p.y).toBeCloseTo(0, 12);
  });

  it("共线重叠返回重叠段两端点", () => {
    const hit = segmentIntersect({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 0 }, { x: 6, y: 0 });
    expect(hit?.kind).toBe("segment");
    expect(hit!.p.x).toBeCloseTo(1, 12);
    expect(hit!.q!.x).toBeCloseTo(4, 12);
  });

  it("不相交返回 null", () => {
    expect(segmentIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 2 })).toBeNull();
  });

  it("collectEdgeIntersectionPoints：正方形贴合矩形边", () => {
    const sq = rect(0, 0, 2, 2);
    const r = rect(2, 0.5, 4, 1.5);
    const pts = collectEdgeIntersectionPoints(sq, r);
    // 共享边 x=2, y∈[0.5,1.5] → 两个端点
    expect(pts).toHaveLength(2);
  });
});

describe("intersectShipCell（对齐 computePolygonIntersection 语义）", () => {
  it("面积/质心/宽度与解析值一致", () => {
    // 船体矩形与冰单元对角交叠：交叠 1×2，宽度 = √5（两个交点的对角距离）
    const ship = rect(0, 0, 3, 3);
    const cell = rect(2, 1, 6, 6);
    const res = intersectShipCell(ship, cell);
    expect(res.poly).not.toBeNull();
    expect(res.area).toBeCloseTo(2, 12);
    expect(res.cx).toBeCloseTo(2.5, 12);
    expect(res.cy).toBeCloseTo(2, 12);
    expect(res.width).toBeCloseTo(Math.sqrt(5), 12); // 交点 (3,1)-(2,3) 的距离
  });

  it("无交叠时 poly=null、面积为 0", () => {
    const res = intersectShipCell(rect(0, 0, 1, 1), rect(5, 5, 6, 6));
    expect(res.poly).toBeNull();
    expect(res.area).toBe(0);
  });
});

describe("closestVertex / bboxOverlap", () => {
  it("最近顶点取首个最小值", () => {
    const { index } = closestVertex(rect(0, 0, 2, 2), { x: 2.1, y: 0 });
    expect(index).toBe(1);
  });

  it("bboxOverlap 端点相切视为重叠（CGAL do_overlap 语义）", () => {
    expect(bboxOverlap({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 1, minY: 0, maxX: 2, maxY: 1 })).toBe(true);
    expect(bboxOverlap({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 1.1, minY: 0, maxX: 2, maxY: 1 })).toBe(false);
  });

  it("polyBBox 正确", () => {
    expect(polyBBox([{ x: 1, y: -2 }, { x: 3, y: 4 }])).toEqual({ minX: 1, minY: -2, maxX: 3, maxY: 4 });
  });
});
