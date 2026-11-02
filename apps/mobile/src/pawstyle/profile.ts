import manifest from "./pawstyle-image-manifest.json";
import {
  scorePawStyle,
  type StyleCode,
  type PawStyleResult,
} from "./pawstyle-scoring";
import type { Answers } from "./model";
export const styleImages = manifest.types;
export function scoreAnswers(answers: Answers): PawStyleResult {
  return scorePawStyle(
    Object.fromEntries(
      Array.from({ length: 45 }, (_, i) => {
        const id = `D${i + 1}`;
        return [id, answers[id]?.value];
      }),
    ),
  );
}
export function observationNotes(answers: Answers): string[] {
  const notes: string[] = [];
  if (answers.B1?.value === "少于1个月")
    notes.push("共同生活或持续照顾少于 1 个月");
  if (["少于1天", "1–2天"].includes(String(answers.B2?.value)))
    notes.push("每周直接照顾不足 3 天");
  if (["多数没有观察过", "只有大致印象"].includes(String(answers.B4?.value)))
    notes.push("具体行为观察或例子较少");
  if (answers.B6?.value === "有，请说明")
    notes.push("近期身体状态或生活环境有变化");
  return notes;
}
export function profileMeta(code: StyleCode | null) {
  return code ? styleImages[code] : null;
}
export type ProfileRecord = {
  id: string;
  owner_id: string;
  dog_id: string;
  response_id: string;
  response_revision: number;
  created_at: string;
  raw_answers: Answers;
  result: PawStyleResult;
};
