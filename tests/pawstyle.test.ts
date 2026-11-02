import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  questionnaire,
  questions,
  allowsText,
  select,
  countAnswered,
  blankDraft,
  parseDraft,
  storageKey,
  queueWrite,
  waitForWrites,
} from "../apps/mobile/src/pawstyle/model";
describe("PawStyle answers without scoring", () => {
  it("preserves the approved source text, IDs and sections", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("apps/mobile/src/pawstyle/questionnaire.json"))
        .digest("hex"),
    ).toBe("df487218bb6af7192ee8bb9cf90b28003b5587f20f86310a274b54b63a6b02c3");
    expect(
      questionnaire.sections.map((s) => [s.id, s.questions.length]),
    ).toEqual([
      ["B", 6],
      ["D", 45],
      ["S", 5],
    ]);
    expect(new Set(questions.map((q) => q.id)).size).toBe(56);
    expect(questions.filter((q) => q.section === "D").map((q) => q.id)).toEqual(
      Array.from({ length: 45 }, (_, i) => `D${i + 1}`),
    );
    for (const q of questions.filter((q) => q.section === "D"))
      expect(q.options).toEqual(questionnaire.coreOptions);
    for (const id of ["B3", "B5", "S3"])
      expect(questions.find((q) => q.id === id)?.type).toBe("multiple");
  });
  it("replaces single selections, toggles multiple choices and counts X but not empty arrays", () => {
    const single = questions[0],
      multi = questions[2];
    expect(
      select(
        single,
        { value: single.options[0].value },
        single.options[1].value,
      ),
    ).toEqual({ value: single.options[1].value });
    const first = select(multi, undefined, multi.options[0].value);
    const both = select(multi, first, multi.options[1].value);
    expect(both.value).toEqual([
      multi.options[0].value,
      multi.options[1].value,
    ]);
    expect(select(multi, both, multi.options[0].value).value).toEqual([
      multi.options[1].value,
    ]);
    expect(
      countAnswered({
        S2: { value: null, text: "先写场景" },
        D1: { value: "X" },
        B3: { value: [] },
        B1: { value: single.options[0].value },
        D99: { value: 1 },
      }),
    ).toBe(2);
  });
  it("only permits designated text and removes hidden text when the selection changes", () => {
    const b5 = questions.find((q) => q.id === "B5")!,
      b6 = questions.find((q) => q.id === "B6")!;
    expect(allowsText(b5, ["其他"])).toBe(true);
    expect(allowsText(b5, ["召回"])).toBe(false);
    expect(select(b5, { value: ["其他"], text: "转圈" }, "其他")).toEqual({
      value: [],
    });
    expect(select(b6, { value: "有，请说明", text: "搬家" }, "没有")).toEqual({
      value: "没有",
    });
    for (const id of ["S2", "S4", "S5"])
      expect(
        allowsText(
          questions.find((q) => q.id === id)!,
          "有",
        ),
      ).toBe(true);
  });
  it("recovers typed answers and isolates users, dogs and questionnaire version", () => {
    const draft = {
      ...blankDraft(),
      answers: { D1: { value: "X" }, B5: { value: ["其他"], text: "转圈" } },
      position: 4,
      dirty: true,
    };
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseDraft("bad json")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, position: 56 }))).toBeNull();
    expect(
      parseDraft(JSON.stringify({ ...draft, answers: { D1: { value: "5" } } })),
    ).toBeNull();
    expect(storageKey("user1", "dog1")).not.toBe(storageKey("user2", "dog1"));
    expect(storageKey("user1", "dog1")).not.toBe(storageKey("user1", "dog2"));
    expect(storageKey("user1", "dog1")).toContain(questionnaire.version);
  });
  it("serializes persistence and recovers after a failed local write", async () => {
    const seen: number[] = [];
    const failed = queueWrite(async () => {
      seen.push(1);
      throw Error("disk full");
    });
    const next = queueWrite(async () => {
      seen.push(2);
    });
    await expect(failed).rejects.toThrow("disk full");
    await next;
    await waitForWrites();
    expect(seen).toEqual([1, 2]);
  });
});
