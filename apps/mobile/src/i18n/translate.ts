import english from "./en.json";
export type Language = "zh" | "en";
export const LANGUAGE_KEY = "dogo.language.v1";
export function parseLanguage(value: string | null): Language {
  return value === "en" ? "en" : "zh";
}
export function translate(
  language: Language,
  source: string | number | null | undefined,
  args: readonly (string | number | null | undefined)[] = [],
): string {
  source = String(source ?? "");
  const key = source.replace(/\s+/g, " ").trim();
  const catalog: Record<string, string> = english;
  let text =
    language === "en" ? catalog[source] || catalog[key] || source : source;
  // Preserve explicit spaces around text fragments such as a number's unit.
  if (language === "en" && !catalog[source] && catalog[key]) {
    if (/^\s/.test(source) && !/^\s/.test(text)) text = " " + text;
    if (/\s$/.test(source) && !/\s$/.test(text)) text += " ";
  }
  // Interpolated user content is never translated or recursively substituted.
  return text.replace(/\{(\d+)\}/g, (match, index) =>
    args[Number(index)] === undefined ? match : String(args[Number(index)]),
  );
}

// Only use this for system messages, never names, addresses or free-form notes.
export function translateMessage(language: Language, source: string): string {
  if (language === "zh") return source;
  const save = source.match(
    /^(暂存失败|结果生成失败)：(.*)。答案已保留，请重试。$/s,
  );
  if (save)
    return `${translate(language, save[1])}: ${translateMessage(language, save[2])} ${translate(language, "答案已保留，请重试。")}`;
  const review = source.match(/^Pack 审核更新：(.*)$/);
  if (review)
    return translate(language, "Pack 审核更新：").trimEnd() + " " + review[1];
  const question = source.match(
    /^(未知题目 ID|核心题答案无效|答案格式无效|补充文字无效|选项无效|多选答案必须为数组): ([BDS]\d+)$/,
  );
  if (question) return `${translate(language, question[1])}: ${question[2]}`;
  return translate(language, source);
}
