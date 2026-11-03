import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandLogo } from "../BrandLogo";
import { tokens } from "@dogo/ui";
import { formatScore, type StyleCode } from "./pawstyle-scoring";
import { observationNotes, profileMeta, type ProfileRecord } from "./profile";
import { questions } from "./model";
const c = tokens.color;
const nativeImages = {
  EP: require("../../public/images/pawstyle/EP_Spark.png"),
  CP: require("../../public/images/pawstyle/CP_Sunny.png"),
  EL: require("../../public/images/pawstyle/EL_Scout.png"),
  CL: require("../../public/images/pawstyle/CL_Cloud.png"),
};
export function Portrait({ code }: { code: StyleCode | null }) {
  const meta = profileMeta(code);
  const [failed, setFailed] = useState(false);
  if (!meta || !code || failed)
    return (
      <View style={s.fallback}>
        <BrandLogo size={120} label="DOGO 通用画像" />
        <Text style={s.caption}>
          {failed ? "类型画像暂时无法加载" : "继续观察，慢慢了解它"}
        </Text>
      </View>
    );
  return (
    <View testID="pawstyle-portrait" style={s.crop}>
      <Image
        accessibilityLabel={`${meta.titleZh}画像`}
        source={
          Platform.OS === "web" ? { uri: meta.image } : nativeImages[code]
        }
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={s.portrait}
      />
    </View>
  );
}
export function PawStyleResults({
  api,
  userId,
  dogId,
  nickname,
  onEdit,
}: {
  api: SupabaseClient;
  userId: string;
  dogId: string;
  nickname: string;
  onEdit: () => void;
}) {
  const [records, setRecords] = useState<ProfileRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [reload, setReload] = useState(0),
    [details, setDetails] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api
      .from("pawstyle_results")
      .select("*")
      .retry(false)
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setError("暂时无法读取结果，请重试。");
            setLoading(false);
            return;
          }
          const rows = (data as ProfileRecord[])
            .filter((r) => r.owner_id === userId && r.dog_id === dogId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          setRecords(rows);
          setSelected(rows[0]?.id ?? "");
          setLoading(false);
        },
        () => {
          if (!cancelled) {
            setError("暂时无法读取结果，请重试。");
            setLoading(false);
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [api, userId, dogId, reload]);
  const button = (text: string, fn: () => void) => (
    <Pressable accessibilityRole="button" onPress={fn} style={s.button}>
      <Text style={s.buttonText}>{text}</Text>
    </Pressable>
  );
  if (loading)
    return (
      <ActivityIndicator
        accessibilityLabel="正在读取 DOGO ti 结果"
        color={c.green}
      />
    );
  if (error)
    return (
      <View style={s.card}>
        <Text accessibilityRole="alert">{error}</Text>
        {button("重新读取", () => setReload(reload + 1))}
        {button("返回问卷", onEdit)}
      </View>
    );
  const record = records.find((r) => r.id === selected);
  if (!record)
    return (
      <View style={s.card}>
        <Text style={s.title}>还没有 DOGO ti 结果</Text>
        <Text style={s.body}>
          填写问卷后，点击“保存并查看结果”。已有草稿可以继续填写。
        </Text>
        {button("继续填写问卷", onEdit)}
      </View>
    );
  const result = record.result,
    meta = profileMeta(result.style.code),
    notes = observationNotes(record.raw_answers);
  const date = new Date(record.created_at).toLocaleString("zh-CN");
  return (
    <View style={s.stack}>
      <View style={s.card}>
        <Text style={s.eyebrow}>{nickname} · DOGO ti</Text>
        <Portrait key={record.id} code={result.style.code} />
        <Text accessibilityRole="header" style={s.title}>
          {meta
            ? `${result.style.code} ${meta.nickname} · ${meta.titleZh}`
            : result.style.label}
        </Text>
        <Text style={s.body}>
          {meta?.descriptionZh ?? result.style.description}
        </Text>
        <View style={s.tags}>
          {result.style.tags
            .filter((t) => t !== "接近分界，倾向轻微")
            .map((tag) => (
              <Text key={tag} style={s.tag}>
                {tag}
              </Text>
            ))}
        </View>
        {result.style.status === "classified" && result.style.nearBoundary && (
          <Text style={s.note}>
            接近分界，倾向轻微（{result.style.nearBoundaryAxes.join(" / ")}）
          </Text>
        )}
        <Text style={s.caption}>记录时间：{date}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>两轴倾向</Text>
        <View style={s.axes}>
          {[
            ["E", "兴奋性", result.E],
            ["P", "玩耍倾向", result.P],
          ].map(([id, label, value]) => (
            <View key={String(id)} style={s.axis}>
              <Text style={s.body}>
                {id} · {label}
              </Text>
              <Text testID={`score-${id}`} style={s.score}>
                {formatScore(value as number | null)}
              </Text>
              <Text style={s.caption}>1–5 分</Text>
            </View>
          ))}
        </View>
        <Text style={s.caption}>
          数值保留两位小数，分类使用未四舍五入的分数。3
          表示中间倾向；未观察或未答不会用中间分替代。
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>五维观察档案</Text>
        {Object.entries(result.factors).map(([id, f]) => (
          <View key={id} style={s.factor}>
            <View style={s.row}>
              <Text style={[s.body, { flex: 1 }]}>
                {id} · {f.label}
              </Text>
              <Text testID={`score-${id}`} style={s.body}>
                {formatScore(f.value)}
                {f.value === null ? "" : " / 5"}
              </Text>
            </View>
            {f.value !== null ? (
              <View style={s.track}>
                <View
                  style={[s.bar, { width: `${((f.value - 1) / 4) * 100}%` }]}
                />
              </View>
            ) : (
              <Text style={s.caption}>
                完整分面 {f.validFacets} / {f.totalFacets}，补齐后再计算
              </Text>
            )}
          </View>
        ))}
        <Text style={s.caption}>
          各维度描述不同倾向，不合成为总分；高低不代表好坏，也不是准确率、概率或百分位。
        </Text>
        {button(details ? "收起 15 个分面" : "查看 15 个分面", () =>
          setDetails(!details),
        )}
        {details &&
          Object.entries(result.facets).map(([key, f]) => (
            <View key={key} style={s.row}>
              <Text style={[s.caption, { flex: 1 }]}>
                {f.label}（{f.validItems}/3）
              </Text>
              <Text style={s.caption}>{formatScore(f.value)}</Text>
            </View>
          ))}
      </View>
      <View style={s.card}>
        <Text style={s.heading}>完整度与观察基础</Text>
        <Text style={s.body}>
          有效核心题 {result.answeredCore} / {result.coreTotal}
        </Text>
        {!!result.missingCoreIds.length && (
          <Text style={s.caption}>
            待补充：{result.missingCoreIds.join("、")}
          </Text>
        )}
        {notes.length > 0 ? (
          <>
            <Text style={s.note}>观察基础有限或近期状态可能影响结果</Text>
            {notes.map((note) => (
              <Text key={note} style={s.body}>
                · {note}
              </Text>
            ))}
          </>
        ) : (
          <Text style={s.body}>
            结果来自本次照顾者观察，请结合具体情境理解。
          </Text>
        )}
        {questions
          .filter((q) => q.section === "B")
          .some((q) => !record.raw_answers[q.id]) && (
          <Text style={s.caption}>
            部分观察背景尚未填写，可在下次填写时补充。
          </Text>
        )}
        <Text style={s.caption}>观察提醒不会改变分数。</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>独立情境记录</Text>
        {questions
          .filter((q) => q.section === "S")
          .map((q) => {
            const a = record.raw_answers[q.id];
            return (
              <View key={q.id} style={s.factor}>
                <Text style={s.body}>
                  {q.id} · {q.question}
                </Text>
                <Text style={s.caption}>
                  {a?.value == null ||
                  (Array.isArray(a.value) && !a.value.length)
                    ? "未填写"
                    : Array.isArray(a.value)
                      ? a.value.join("、")
                      : String(a.value)}
                </Text>
                {!!a?.text && <Text style={s.body}>{a.text}</Text>}
              </View>
            );
          })}
        <Text style={s.note}>
          咬伤、护物、逃脱或持续紧张等情境需要独立了解。人格均分不覆盖事件记录，性格类型不能作为
          Pack 自动安全放行依据。
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>档案说明</Text>
        <Text style={s.caption}>
          照顾者报告的中文试用档案，尚未经过正式验证，不是诊断或安全认证。
        </Text>
        <Text style={s.caption}>
          问卷版本：{result.versions.questionnaire}
          {"\n"}档案版本：{result.versions.profile}
          {"\n"}计分版本：{result.versions.scoring}
        </Text>
        {button("修改答案并复测", onEdit)}
        <Text style={s.caption}>复测会保存为新记录，之前的结果保持不变。</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>历次结果（{records.length}）</Text>
        {records.map((r, i) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityState={{ selected: r.id === selected }}
            onPress={() => {
              setSelected(r.id);
              setDetails(false);
            }}
            style={[
              s.history,
              r.id === selected && {
                borderColor: c.green,
                backgroundColor: "#EAF1D8",
              },
            ]}
          >
            <Text style={s.body}>
              记录 {records.length - i} · {r.result.style.label}
            </Text>
            <Text style={s.caption}>
              {new Date(r.created_at).toLocaleString("zh-CN")}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 18 },
  card: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 22,
    gap: 16,
    borderWidth: 1,
    borderColor: c.line,
  },
  title: { fontSize: 25, lineHeight: 36, fontWeight: "700", color: c.ink },
  heading: { fontSize: 20, lineHeight: 29, fontWeight: "700", color: c.ink },
  eyebrow: { fontSize: 13, color: c.green, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 25, color: c.ink },
  caption: { fontSize: 13, lineHeight: 22, color: c.muted },
  crop: {
    width: "100%",
    aspectRatio: 4 / 3,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#FFF6E8",
  },
  portrait: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "133.333333%",
  },
  fallback: {
    alignItems: "center",
    padding: 20,
    gap: 12,
    backgroundColor: "#F4F6E8",
    borderRadius: 18,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    color: c.green,
    backgroundColor: "#EEF3E3",
    padding: 8,
    borderRadius: 10,
    fontSize: 14,
  },
  note: {
    fontSize: 14,
    lineHeight: 23,
    color: "#77591D",
    backgroundColor: "#FFF4D9",
    borderRadius: 12,
    padding: 12,
  },
  axes: { flexDirection: "row", gap: 12 },
  axis: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F6F8F0",
    gap: 8,
  },
  score: { fontSize: 29, fontWeight: "700", color: c.green },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  factor: { gap: 9 },
  track: {
    height: 7,
    backgroundColor: "#E9EDDF",
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: { height: 7, backgroundColor: c.green },
  button: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: c.green,
    alignItems: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "white" },
  history: {
    padding: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    gap: 6,
  },
});
