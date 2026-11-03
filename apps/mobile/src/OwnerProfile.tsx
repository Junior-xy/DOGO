import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Row } from "@dogo/domain";
import { tokens } from "@dogo/ui";
import { PawIcon } from "./BrandIcons";
import { Portrait } from "./pawstyle/PawStyleResults";
import {
  profileMeta,
  profileDescription,
  type ProfileRecord,
} from "./pawstyle/profile";
const c = tokens.color;
export function OwnerProfile({
  api,
  userId,
  dogs,
  selectedDog,
  onSelect,
  onDogs,
  onQuestionnaire,
  onResults,
}: {
  api: SupabaseClient;
  userId: string;
  dogs: Row[];
  selectedDog: string;
  onSelect: (id: string) => void;
  onDogs: () => void;
  onQuestionnaire: () => void;
  onResults: () => void;
}) {
  const [results, setResults] = useState<ProfileRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .from("pawstyle_results")
      .select("*")
      .retry(false)
      .then(
        ({ data, error }) => {
          if (active) {
            setResults((data ?? []) as ProfileRecord[]);
            setError(!!error);
            setLoading(false);
          }
        },
        () => {
          if (active) {
            setError(true);
            setLoading(false);
          }
        },
      );
    return () => {
      active = false;
    };
  }, [api, userId]);
  const dog = dogs.find((d) => d.id === selectedDog) ?? dogs[0];
  const latest = results
    .filter((r) => r.owner_id === userId && r.dog_id === dog?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const meta = profileMeta(latest?.result.style.code ?? null);
  const button = (title: string, fn: () => void) => (
    <Pressable accessibilityRole="button" onPress={fn} style={s.button}>
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
  return (
    <>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.title}>我的狗狗档案</Text>
          <Text style={s.count}>{dogs.length} 位小伙伴</Text>
        </View>
        {dogs.length ? (
          dogs.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`查看${d.data.nickname}的档案`}
              onPress={() => {
                onSelect(d.id);
                onDogs();
              }}
              style={s.dog}
            >
              <View style={s.avatar}>
                <PawIcon size={30} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{d.data.nickname}</Text>
                <Text style={s.caption}>
                  {d.data.breed || "独一无二的小伙伴"} · {d.data.age} 岁
                </Text>
              </View>
              <Text style={s.caption}>查看 ›</Text>
            </Pressable>
          ))
        ) : (
          <Text style={s.body}>添加狗狗档案，开始记录你们的日常。</Text>
        )}
        {button("管理狗狗档案", onDogs)}
      </View>
      <View style={[s.card, { backgroundColor: "#FFF1D9" }]}>
        <Text style={s.title}>我的狗狗</Text>
        <Text style={s.caption}>DOGO ti · 认识它的小小世界</Text>
        {dog ? (
          <>
            <View style={s.choices}>
              {dogs.map((d) => (
                <Pressable
                  accessibilityRole="button"
                  key={d.id}
                  accessibilityLabel={`查看${d.data.nickname}的形象`}
                  onPress={() => onSelect(d.id)}
                  style={[
                    s.choice,
                    d.id === dog.id && { backgroundColor: c.green },
                  ]}
                >
                  <Text style={{ color: d.id === dog.id ? "white" : c.green }}>
                    {d.data.nickname}
                  </Text>
                </Pressable>
              ))}
            </View>
            {loading ? (
              <ActivityIndicator color={c.green} />
            ) : (
              <Portrait
                key={latest?.id ?? dog.id}
                code={latest?.result.style.code ?? null}
              />
            )}
            <Text style={s.name}>
              {dog.data.nickname}
              {meta
                ? ` · ${meta.titleZh}`
                : latest
                  ? ` · ${latest.result.style.label}`
                  : "的专属形象"}
            </Text>
            <Text style={s.body}>
              {error
                ? "暂时无法读取形象，稍后可以在结果页重试。"
                : latest
                  ? profileDescription(latest.result)
                  : "完成 DOGO ti 问卷，了解它的日常倾向，生成属于它的形象档案。"}
            </Text>
            {button(
              latest ? "查看 DOGO ti 结果与历史" : "填写 DOGO ti 问卷",
              latest ? onResults : onQuestionnaire,
            )}
            {latest && button("继续填写或复测", onQuestionnaire)}
          </>
        ) : (
          button("先添加狗狗档案", onDogs)
        )}
      </View>
    </>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    padding: 22,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: c.ink },
  count: { fontSize: 12, color: c.muted },
  dog: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  avatar: { backgroundColor: "#F3E7CF", padding: 12, borderRadius: 17 },
  name: { fontSize: 19, fontWeight: "700", color: c.ink, lineHeight: 28 },
  body: { fontSize: 14, lineHeight: 24, color: c.muted },
  caption: { fontSize: 12, lineHeight: 21, color: c.muted },
  button: {
    backgroundColor: c.green,
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600", fontSize: 14 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderRadius: 14, padding: 10, backgroundColor: "#F7E7C8" },
});
