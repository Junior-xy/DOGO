import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  scorePawStyle,
  REVERSE_ITEMS,
  FACETS,
  STYLE_META,
  formatScore,
} from "../apps/mobile/src/pawstyle/pawstyle-scoring";
import {
  scoreAnswers,
  observationNotes,
  profileMeta,
  profileDescription,
  styleImages,
} from "../apps/mobile/src/pawstyle/profile";
import samples from "./pawstyle-samples.json";
const originalImageHashes: Record<string, string> = {
  "EP_Spark.png":
    "b452f93276626841ace5615a193484b4fbc308a7afa4f59f0cee3d3a1b10c860",
  "CP_Sunny.png":
    "a325913a2bffe85f7a70a3ce6147306993dcb030f37409ba138df46369094f1b",
  "EL_Scout.png":
    "e31a6ff73a557a89ec3653279798214a1e80cde466218994982de2e2ef97c1aa",
  "CL_Cloud.png":
    "ac4b89b1ce0a8ad5b0d9c35936650577a7e3c3ca44ea67330ec804c1cfa02c0d",
};
describe("PawStyle supplied phase 2 scoring", () => {
  it("matches the stated example totals using a documented synthetic 45-answer fixture", () => {
    const r = scorePawStyle(samples.example);
    expect(r.E).toBeCloseTo(4.3333333333);
    expect(r.P).toBeCloseTo(4.3333333333);
    expect(r.style.code).toBe("EP");
    for (const [id, value] of Object.entries({
      F1: 2.75,
      F2: 1,
      F3: 4.25,
      F4: 4,
      F5: 16 / 9,
    }))
      expect(r.factors[id as keyof typeof r.factors].value).toBeCloseTo(value);
    expect(r.answeredCore).toBe(45);
    expect(r.coreComplete).toBe(true);
    expect(formatScore(r.E)).toBe("4.33");
    expect(FACETS.flatMap((f) => f.items).sort()).toEqual(
      Array.from({ length: 45 }, (_, i) => `D${i + 1}`).sort(),
    );
  });
  it.each(["EP", "CP", "EL", "CL"] as const)(
    "classifies %s with the correct official title and manifest image",
    (code) => {
      const r = scorePawStyle(samples[code]);
      expect(r.style.code).toBe(code);
      expect(r.style.status).toBe("classified");
      const { descriptionZh: originalDescription, ...identity } =
        STYLE_META[code];
      expect(profileMeta(code)).toMatchObject(identity);
      expect(profileMeta(code)?.descriptionZh).not.toContain("问卷所描述");
      expect(profileDescription(r)).toBe(profileMeta(code)?.descriptionZh);
      expect(r.style.description).toBe(originalDescription);
      const file = readFileSync(`apps/mobile/public${styleImages[code].image}`);
      expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(createHash("sha256").update(file).digest("hex")).toBe(
        originalImageHashes[styleImages[code].image.split("/").pop()!],
      );
      expect(file.readUInt32BE(16)).toBe(file.readUInt32BE(20));
    },
  );
  it("treats X and missing as null, requires complete facets and factors, and preserves unaffected factors", () => {
    const r = scorePawStyle(samples.pending);
    expect(r.P).toBeNull();
    expect(r.style.status).toBe("pending");
    expect(r.style.code).toBeNull();
    expect(r.style.image).toBeNull();
    expect(r.facets.play_orientation.validItems).toBe(2);
    expect(r.factors.F3.value).toBeNull();
    expect(r.factors.F1.value).toBe(2.75);
    expect(r.answeredCore).toBe(44);
    const none = scorePawStyle({});
    expect(none.answeredCore).toBe(0);
    expect(none.missingCoreIds).toHaveLength(45);
    for (const f of Object.values(none.factors)) expect(f.value).toBeNull();
    expect(scorePawStyle({ D17: null }).scoredItems.D17).toBeNull();
    expect(profileMeta(null)).toBeNull();
  });
  it("keeps exact midpoint mixed and flags a mild non-midpoint boundary", () => {
    const mixed = scorePawStyle(samples.mixed);
    expect(mixed.E).toBe(3);
    expect(mixed.P).toBe(3);
    expect(mixed.style.status).toBe("mixed");
    expect(mixed.style.image).toBeNull();
    expect(
      scorePawStyle({ ...samples.EP, D15: 3, D31: 3, D41: 3 }).style.status,
    ).toBe("mixed");
    const boundary = scorePawStyle(samples.boundary);
    expect(boundary.style.code).toBe("EP");
    expect(formatScore(boundary.E)).toBe("3.33");
    expect(boundary.style.nearBoundaryAxes).toEqual(["E"]);
    expect(boundary.style.tags).toContain("接近分界，倾向轻微");
  });
  it("reverses exactly 14 questions and rejects invalid numbers instead of imputing", () => {
    expect(REVERSE_ITEMS).toHaveLength(14);
    for (const id of REVERSE_ITEMS) {
      expect(scorePawStyle({ [id]: 1 }).scoredItems[id]).toBe(5);
      expect(scorePawStyle({ [id]: 5 }).scoredItems[id]).toBe(1);
    }
    expect(scorePawStyle({ D17: 5 }).scoredItems.D17).toBe(5);
    for (const bad of [0, 6, 2.5, "3", [], true, NaN])
      expect(() => scorePawStyle({ D17: bad })).toThrow();
  });
  it("adapts stored answers, leaves original B/S records unchanged, and never deducts points for observation warnings", () => {
    const answers: any = Object.fromEntries(
      Object.entries(samples.example).map(([id, value]) => [id, { value }]),
    );
    Object.assign(answers, {
      B1: { value: "少于1个月" },
      B2: { value: "1–2天" },
      B4: { value: "只有大致印象" },
      B6: { value: "有，请说明", text: "搬家" },
      S1: { value: "造成伤口" },
      S3: { value: ["突然靠近", "多只同时出现"] },
    });
    const before = structuredClone(answers);
    expect(scoreAnswers(answers)).toEqual(scorePawStyle(samples.example));
    expect(answers).toEqual(before);
    expect(observationNotes(answers)).toHaveLength(4);
    expect(
      observationNotes({
        B2: { value: "3–4天" },
        B4: { value: "多数题能想到例子" },
      }),
    ).toEqual([]);
  });
  it("uses everyday copy for all types, mixed and incomplete results without changing historical records", () => {
    const expected = {
      EP: "较容易兴奋，玩耍兴趣较强。",
      CP: "比较平和，玩耍兴趣较强。",
      EL: "较容易兴奋，玩耍兴趣较弱。",
      CL: "比较平和，玩耍兴趣较弱。",
    };
    for (const code of ["EP", "CP", "EL", "CL"] as const) {
      const record = scorePawStyle(samples[code]);
      const original = structuredClone(record);
      expect(profileDescription(record)).toBe(expected[code]);
      expect(record).toEqual(original);
    }
    expect(profileDescription(scorePawStyle(samples.mixed))).toBe(
      "兴奋程度适中，玩耍兴趣适中。",
    );
    expect(profileDescription(scorePawStyle(samples.pending))).toBe(
      "还有一些情况没观察到或没填，补充后再来看看它的风格吧。",
    );
  });
});
