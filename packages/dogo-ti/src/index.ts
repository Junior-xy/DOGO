export type Answer = 1 | 2 | 3 | 4 | 5 | "X";
export type Answers = Record<string, Answer>;
export const scoringVersion = "dogo-ti-v4.0-1";
export const reverse = [1, 4, 9, 10, 11, 18, 19, 22, 26, 28, 29, 34, 38, 41];
export const facets = [
  { name: "对人恐惧", factor: "F1", items: [1, 6, 27] },
  { name: "非社交恐惧", factor: "F1", items: [3, 11, 22] },
  { name: "对狗恐惧", factor: "F1", items: [13, 21, 42] },
  { name: "被处理恐惧", factor: "F1", items: [16, 35, 44] },
  { name: "一般情境", factor: "F2", items: [7, 18, 40] },
  { name: "特定情境", factor: "F2", items: [25, 30, 36] },
  { name: "兴奋性 E", factor: "F3", items: [15, 31, 41] },
  { name: "玩耍倾向 P", factor: "F3", items: [9, 17, 33] },
  { name: "主动投入", factor: "F3", items: [4, 14, 24] },
  { name: "亲近陪伴", factor: "F3", items: [20, 26, 37] },
  { name: "可训练性", factor: "F4", items: [29, 38, 43] },
  { name: "可控制性", factor: "F4", items: [5, 10, 32] },
  { name: "对狗攻击", factor: "F5", items: [2, 19, 34] },
  { name: "追逐捕猎", factor: "F5", items: [8, 23, 39] },
  { name: "支配相关", factor: "F5", items: [12, 28, 45] },
];
export const factorNames: Record<string, string> = {
  F1: "恐惧",
  F2: "对人攻击",
  F3: "活动兴奋",
  F4: "训练回应",
  F5: "对动物攻击",
};
export function score(answers: Answers) {
  for (const [k, v] of Object.entries(answers))
    if (
      !/^D([1-9]|[1-3]\d|4[0-5])$/.test(k) ||
      ![1, 2, 3, 4, 5, "X"].includes(v)
    )
      throw new Error("无效的核心题答案");
  const values = facets.map((f) => {
    const a = f.items.map((i) => answers[`D${i}`]);
    if (a.some((v) => v === undefined || v === "X")) return null;
    return (
      a.reduce<number>(
        (sum, v, i) =>
          sum + (reverse.includes(f.items[i]) ? 6 - Number(v) : Number(v)),
        0,
      ) / 3
    );
  });
  const factors: Record<string, number | null> = {};
  for (const f of Object.keys(factorNames)) {
    const group = facets
      .map((x, i) => (x.factor === f ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => values[i]);
    factors[f] = group.some((v) => v === null)
      ? null
      : group.reduce<number>((a, b) => a + b!, 0) / group.length;
  }
  const E = values[6],
    P = values[7];
  const style =
    E === null || P === null
      ? "待补充"
      : E === 3 || P === 3
        ? "混合倾向"
        : `${E > 3 ? "E" : "C"}${P > 3 ? "P" : "L"}`;
  return {
    facets: values,
    factors,
    E,
    P,
    style,
    validCount: Object.values(answers).filter((v) => v !== "X").length,
    subtle: [
      E !== null && E !== 3 && E >= 2.5 && E <= 3.5 ? "兴奋性呈轻微倾向" : "",
      P !== null && P !== 3 && P >= 2.5 && P <= 3.5 ? "玩耍倾向接近分界" : "",
    ].filter(Boolean),
    scoringVersion,
  };
}
// The source PRD contains formulas but no question wording. Only an approved definition can activate the questionnaire.
export type Question = { code: string; text: string; options?: string[] };
export type Questionnaire = { version: string; questions: Question[] };
export function validateDefinition(q: Questionnaire) {
  const expected = [
    ...Array.from({ length: 6 }, (_, i) => `B${i + 1}`),
    ...Array.from({ length: 45 }, (_, i) => `D${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `S${i + 1}`),
  ];
  return (
    !!q.version &&
    q.questions.length === 57 &&
    expected.every(
      (code) =>
        q.questions.filter((x) => x.code === code && x.text.trim()).length ===
        1,
    )
  );
}
export function sharePayload(
  nickname: string,
  result: ReturnType<typeof score>,
) {
  return { nickname, style: result.style, E: result.E, P: result.P };
}
