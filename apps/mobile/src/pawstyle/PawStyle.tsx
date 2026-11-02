import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tokens } from "@dogo/ui";
import {
  questionnaire,
  questions,
  allowsText,
  select,
  countAnswered,
  answered,
  blankDraft,
  parseDraft,
  storageKey,
  queueWrite,
  waitForWrites,
  type Draft,
} from "./model";
const c = tokens.color;
export function PawStyle({
  api,
  userId,
  dogId,
}: {
  api: SupabaseClient;
  userId: string;
  dogId: string;
}) {
  const key = storageKey(userId, dogId);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const current = useRef(draft);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    async function load() {
      await waitForWrites();
      let local: Draft | null = null;
      let diskError = "";
      try {
        local = parseDraft(await AsyncStorage.getItem(key));
      } catch {
        diskError = "无法读取本机草稿。";
      }
      const { data, error: cloudError } = await api
        .from("pawstyle_responses")
        .select("*")
        .retry(false)
        .then(
          (result) => result,
          () => ({ data: null, error: { message: "暂时无法连接" } }),
        );
      if (cancelled) return;
      const row = data?.find(
        (r) =>
          r.owner_id === userId &&
          r.dog_id === dogId &&
          r.version === questionnaire.version,
      );
      const cloud: Draft | null = row
        ? parseDraft(
            JSON.stringify({
              answers: row.answers,
              position: row.position,
              updatedAt: row.updated_at,
              revision: row.revision,
              dirty: false,
            }),
          )
        : null;
      // Unsynced local edits take priority; retain their base revision to detect conflicts.
      const restored = local?.dirty ? local : (cloud ?? local ?? blankDraft());
      if (local?.dirty && cloud && local.revision !== cloud.revision)
        setConflict(cloud);
      current.current = restored;
      setDraft(restored);
      setReady(true);
      setStatus(
        local?.dirty
          ? "已恢复本机草稿，尚未同步到账号"
          : cloud
            ? "已恢复账号中保存的答案"
            : "选择答案后自动保存到本机",
      );
      setError(
        diskError +
          (cloudError
            ? "暂时无法读取账号草稿，可继续本机填写并稍后重试。"
            : ""),
      );
    }
    void load().catch(() => {
      if (!cancelled) {
        setReady(true);
        setError("草稿加载失败，请检查网络后重新进入。");
      }
    });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [api, key, userId, dogId]);
  function persist(next: Draft) {
    current.current = next;
    setDraft(next);
    setStatus("正在保存到本机…");
    void queueWrite(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .then(() => {
        if (alive.current && current.current === next)
          setStatus(
            next.dirty
              ? "已自动保存到本机，点击暂存可同步到账号"
              : "已保存到账号，可稍后继续",
          );
      })
      .catch(() => {
        if (alive.current) {
          setStatus("");
          setError("本机保存失败，请点击暂存将答案保存到账号后再退出。");
        }
      });
  }
  function edit(update: Partial<Draft>) {
    persist({
      ...current.current,
      ...update,
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
  }
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const sent = current.current;
    try {
      await waitForWrites();
      const { data, error } = await api.rpc("save_pawstyle", {
        payload: {
          dog_id: dogId,
          version: questionnaire.version,
          answers: sent.answers,
          position: sent.position,
          expected_revision: sent.revision,
        },
      });
      if (error) throw new Error(error.message);
      const saved = {
        ...current.current,
        revision: data.revision,
        dirty: current.current !== sent,
      };
      if (alive.current) persist(saved);
      else
        await queueWrite(() =>
          AsyncStorage.setItem(key, JSON.stringify(saved)),
        );
    } catch (e) {
      if (alive.current) {
        setStatus("尚未同步到账号");
        setError(
          `暂存失败：${(e as Error).message}。答案仍保留在当前页面；请重试。`,
        );
        const { data } = await api
          .from("pawstyle_responses")
          .select("*")
          .retry(false);
        const row = data?.find(
          (r) =>
            r.owner_id === userId &&
            r.dog_id === dogId &&
            r.version === questionnaire.version,
        );
        if (alive.current && row && row.revision !== sent.revision) {
          const remote = parseDraft(
            JSON.stringify({
              answers: row.answers,
              position: row.position,
              updatedAt: row.updated_at,
              revision: row.revision,
              dirty: false,
            }),
          );
          if (remote) setConflict(remote);
        }
      }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }
  if (!ready)
    return (
      <ActivityIndicator accessibilityLabel="正在恢复问卷" color={c.green} />
    );
  const q = questions[draft.position];
  const answer = draft.answers[q.id];
  const total = countAnswered(draft.answers);
  const section = questionnaire.sections.find((s) => s.id === q.section)!;
  const action = (label: string, fn: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={fn}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.container}>
      <Text style={styles.caption}>
        版本 {questionnaire.version} · 答案仅用于保存本次观察
      </Text>
      <Text style={styles.body}>
        已作答 {total} / {questions.length} 题 ·{" "}
        {Math.round((total / questions.length) * 100)}%
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: questions.length, now: total }}
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={total}
        accessibilityLabel="问卷填写进度"
        style={styles.track}
      >
        <View
          style={[
            styles.bar,
            { width: `${(total / questions.length) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.sections}>
        {questionnaire.sections.map((section) => {
          const members = questions.filter((q) => q.section === section.id);
          return (
            <Pressable
              key={section.id}
              accessibilityRole="button"
              disabled={saving}
              onPress={() =>
                edit({
                  position: questions.findIndex(
                    (q) => q.section === section.id,
                  ),
                })
              }
              style={[
                styles.section,
                q.section === section.id && styles.selected,
              ]}
            >
              <Text style={styles.caption}>
                {section.id} · {section.title}
              </Text>
              <Text style={styles.caption}>
                {members.filter((q) => answered(q, draft.answers[q.id])).length}{" "}
                / {members.length}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.card}>
        <Text style={styles.caption}>
          {section.id} · {section.title} · 第 {draft.position + 1} /{" "}
          {questions.length} 题
        </Text>
        <Text style={styles.question}>
          {q.id}　{q.question}
        </Text>
        <Text style={styles.caption}>
          {q.type === "multiple"
            ? "多选，可选择多个选项"
            : "单选，请选择一个选项"}
        </Text>
        {q.note && <Text style={styles.caption}>{q.note}</Text>}
        {q.options.map((option) => {
          const checked = Array.isArray(answer?.value)
            ? answer.value.includes(option.value)
            : answer?.value === option.value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole={q.type === "multiple" ? "checkbox" : "radio"}
              accessibilityLabel={
                q.section === "D"
                  ? `${option.value} · ${option.label}`
                  : option.label
              }
              aria-checked={checked}
              accessibilityState={{ checked }}
              disabled={saving}
              style={[styles.option, checked && styles.selected]}
              onPress={() =>
                edit({
                  answers: {
                    ...draft.answers,
                    [q.id]: select(q, answer, option.value),
                  },
                })
              }
            >
              <Text style={styles.body}>
                {checked ? "●" : "○"}　
                {q.section === "D" ? `${option.value} · ` : ""}
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        {allowsText(q, answer?.value) && (
          <View>
            <Text style={styles.caption}>
              {q.textPrompt ?? "请补充说明"}（选填，最多 2000 字）
            </Text>
            <TextInput
              accessibilityLabel={q.textPrompt ?? "请补充说明"}
              multiline
              maxLength={2000}
              editable={!saving}
              style={styles.input}
              value={answer?.text ?? ""}
              onChangeText={(text) =>
                edit({
                  answers: {
                    ...draft.answers,
                    [q.id]: { value: answer?.value ?? null, text },
                  },
                })
              }
            />
          </View>
        )}
      </View>
      <View style={styles.navigation}>
        {action(
          "上一题",
          () => edit({ position: draft.position - 1 }),
          saving || draft.position === 0,
        )}
        {action(
          "下一题",
          () => edit({ position: draft.position + 1 }),
          saving || draft.position === questions.length - 1,
        )}
      </View>
      {conflict && (
        <View style={styles.card}>
          <Text style={styles.body}>
            账号中有另一份更新的草稿。请选择要继续使用的答案，避免覆盖其他设备的填写。
          </Text>
          {action("使用账号草稿", () => {
            persist(conflict);
            setConflict(null);
            setError("");
          })}
          {action("保留本机答案，允许下次暂存覆盖账号草稿", () => {
            persist({
              ...current.current,
              revision: conflict.revision,
              dirty: true,
            });
            setConflict(null);
            setError("");
          })}
        </View>
      )}
      {action(
        saving ? "正在暂存…" : "暂存，稍后继续",
        () => void save(),
        saving || !!conflict,
      )}
      {total === questions.length && (
        <Text style={styles.body}>
          全部题目已填写，可暂存答案，也可返回修改。
        </Text>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.caption}>
        {status}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 16 },
  name: { fontSize: 24, fontWeight: "700", color: c.ink },
  body: { fontSize: 16, lineHeight: 25, color: c.ink },
  caption: { fontSize: 13, lineHeight: 21, color: c.muted },
  sections: { gap: 8, flexDirection: "row" },
  section: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    padding: 12,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: c.line,
  },
  question: { fontSize: 21, lineHeight: 31, fontWeight: "700", color: c.ink },
  option: {
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    minHeight: 50,
  },
  selected: { backgroundColor: "#EAF1D8", borderColor: c.green },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    fontSize: 16,
    color: c.ink,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: c.green,
    padding: 16,
    borderRadius: 15,
    alignItems: "center",
    flexGrow: 1,
  },
  buttonText: { color: "white", fontWeight: "700", fontSize: 15 },
  navigation: { flexDirection: "row", gap: 12 },
  track: {
    height: 8,
    backgroundColor: "#E5E9DE",
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: { height: 8, backgroundColor: c.green },
  error: { color: "#B53329", lineHeight: 23 },
});
