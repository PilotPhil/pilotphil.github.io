import { describe, expect, it } from "vitest";
import { nextAfter } from "../geometry/nextAfter";

describe("nextAfter（对应 C++ std::nextafter）", () => {
  it("向 +∞ 方向取相邻数", () => {
    expect(nextAfter(1, Number.POSITIVE_INFINITY)).toBe(1.0000000000000002);
  });

  it("向 0 方向取相邻数", () => {
    expect(nextAfter(1, 0)).toBe(0.9999999999999999);
  });

  it("x 与 toward 相同时原样返回", () => {
    expect(nextAfter(2.5, 2.5)).toBe(2.5);
    expect(nextAfter(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("±0 的相邻数是最小 subnormal", () => {
    expect(nextAfter(0, 1)).toBe(Number.MIN_VALUE);
    expect(nextAfter(0, -1)).toBe(-Number.MIN_VALUE);
  });

  it("最大有限数向 +∞ 越界为 Infinity（与 C++ 行为一致）", () => {
    expect(nextAfter(Number.MAX_VALUE, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("负数方向语义正确", () => {
    expect(nextAfter(-1, Number.NEGATIVE_INFINITY)).toBe(-1.0000000000000002);
    expect(nextAfter(-1, 0)).toBe(-0.9999999999999999);
  });
});
