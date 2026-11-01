import { describe, it, expect } from "vitest";
import {
  score,
  reverse,
  facets,
  sharePayload,
  validateDefinition,
  type Answers,
} from "../packages/dogo-ti/src/index";
const all = (n: 1 | 2 | 3 | 4 | 5 = 3): Answers =>
  Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`D${i + 1}`, n]));
describe("Dogo Ti PRD §6", () => {
  it("covers 45 items once and 14 reverse items", () => {
    expect(new Set(facets.flatMap((f) => f.items)).size).toBe(45);
    expect(reverse).toHaveLength(14);
  });
  it("keeps neutral results mixed", () => {
    const s = score(all());
    expect(s.style).toBe("混合倾向");
    expect(Object.values(s.factors)).toEqual([3, 3, 3, 3, 3]);
  });
  it.each([
    ["EP", 5, 5],
    ["CP", 1, 5],
    ["EL", 5, 1],
    ["CL", 1, 1],
  ] as const)("classifies %s with raw precision", (style, e, p) => {
    const a = all();
    a.D15 = e;
    a.D31 = e;
    a.D41 = (6 - e) as 1 | 5;
    a.D9 = (6 - p) as 1 | 5;
    a.D17 = p;
    a.D33 = p;
    expect(score(a).style).toBe(style);
  });
  it("X removes a facet and parent factor, never imputes 3", () => {
    const a = all();
    a.D17 = "X";
    const s = score(a);
    expect(s.P).toBeNull();
    expect(s.E).toBe(3);
    expect(s.factors.F3).toBeNull();
    expect(s.style).toBe("待补充");
    expect(s.validCount).toBe(44);
  });
  it("each reverse item transforms 1 to 5", () => {
    for (const item of reverse) {
      const a = all();
      a[`D${item}`] = 1;
      const s = score(a);
      expect(s.facets[facets.findIndex((f) => f.items.includes(item))]).toBe(
        11 / 3,
      );
    }
  });
  it("shows slight tendencies without rounding before classification", () => {
    const a = all();
    a.D15 = 4;
    a.D17 = 5;
    a.D33 = 4;
    const s = score(a);
    expect(s.style).toBe("EP");
    expect(s.E).toBe(10 / 3);
    expect(s.subtle).toHaveLength(1);
  });
  it("rejects invalid answers and excludes private fields from share", () => {
    expect(() => score({ D1: 7 } as unknown as Answers)).toThrow();
    expect(() => score({ D46: 3 })).toThrow();
    expect(Object.keys(sharePayload("豆豆", score(all())))).toEqual([
      "nickname",
      "style",
      "E",
      "P",
    ]);
  });
  it("rejects incomplete and duplicate questionnaire definitions", () => {
    expect(validateDefinition({ version: "1", questions: [] })).toBe(false);
  });
});
