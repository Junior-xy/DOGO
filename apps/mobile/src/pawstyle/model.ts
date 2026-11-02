import source from "./questionnaire.json";
export type Value = string | number;
export type Answer = { value: Value | Value[] | null; text?: string };
export type Answers = Record<string, Answer>;
export type Question = {
  id: string;
  question: string;
  type: string;
  section: string;
  options: { value: Value; label: string }[];
  note?: string;
  allowOtherText?: boolean;
  allowText?: boolean;
  allowTextFor?: string[];
  textPrompt?: string;
};
export const questionnaire = source;
export const questions: Question[] = source.sections.flatMap((section) =>
  section.questions.map((q) => ({
    ...q,
    section: section.id,
    type:
      (q as { type?: string }).type ??
      (section as { type?: string }).type ??
      "single",
    options:
      "options" in q
        ? q.options.map((label) => ({ value: label, label }))
        : source.coreOptions,
  })),
);
export function allowsText(q: Question, value: Answer["value"] | undefined) {
  const selected = Array.isArray(value) ? value : [value];
  return !!(
    q.allowText ||
    (q.allowOtherText && selected.includes("其他")) ||
    q.allowTextFor?.some((v) => selected.includes(v))
  );
}
export function select(
  q: Question,
  prior: Answer | undefined,
  value: Value,
): Answer {
  const selected = Array.isArray(prior?.value) ? prior.value : [];
  const next =
    q.type === "multiple"
      ? selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
      : value;
  return {
    value: next,
    ...(allowsText(q, next) && prior?.text ? { text: prior.text } : {}),
  };
}
export function validAnswer(q: Question, a: unknown): a is Answer {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const answer = a as Answer;
  if (Object.keys(answer).some((k) => !["value", "text"].includes(k)))
    return false;
  const choices = q.options.map((o) => o.value);
  if (q.type === "multiple") {
    if (
      !Array.isArray(answer.value) ||
      new Set(answer.value).size !== answer.value.length ||
      !answer.value.every((v) => choices.includes(v))
    )
      return false;
  } else if (
    answer.value === null
      ? !q.allowText
      : Array.isArray(answer.value) || !choices.includes(answer.value)
  )
    return false;
  return (
    answer.text === undefined ||
    (typeof answer.text === "string" &&
      answer.text.length <= 2000 &&
      allowsText(q, answer.value))
  );
}
export function answered(q: Question, a: Answer | undefined) {
  return (
    validAnswer(q, a) &&
    a.value !== null &&
    (!Array.isArray(a.value) || a.value.length > 0)
  );
}
export const countAnswered = (answers: Answers) =>
  questions.filter((q) => answered(q, answers[q.id])).length;
export type Draft = {
  answers: Answers;
  position: number;
  updatedAt: string;
  revision: number;
  dirty: boolean;
};
export const blankDraft = (): Draft => ({
  answers: {},
  position: 0,
  updatedAt: new Date(0).toISOString(),
  revision: 0,
  dirty: false,
});
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (
      !d ||
      !d.answers ||
      typeof d.answers !== "object" ||
      Array.isArray(d.answers) ||
      !Number.isInteger(d.position) ||
      d.position < 0 ||
      d.position >= questions.length ||
      !Number.isInteger(d.revision) ||
      d.revision < 0 ||
      typeof d.dirty !== "boolean" ||
      typeof d.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(d.updatedAt))
    )
      return null;
    for (const [id, answer] of Object.entries(d.answers)) {
      const q = questions.find((q) => q.id === id);
      if (!q || !validAnswer(q, answer)) return null;
    }
    return d;
  } catch {
    return null;
  }
}
export const storageKey = (userId: string, dogId: string) =>
  `dogo:pawstyle:${questionnaire.version}:${userId}:${dogId}`;
// Serialize disk writes across mounts so rapid navigation cannot restore stale drafts.
let pending = Promise.resolve();
export function queueWrite(write: () => Promise<void>) {
  const next = pending.then(write);
  pending = next.catch(() => {});
  return next;
}
export const waitForWrites = () => pending;
