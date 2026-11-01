import { useEffect, useState, useRef, type ElementRef } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { createURL } from "expo-linking";
import { captureRef } from "react-native-view-shot";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  StyleSheet,
  Share,
  Platform,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  client,
  command,
  snapshot,
  emptyStore,
  labels,
  date,
  dogName,
  type Store,
  type Row,
} from "@dogo/domain";
import { factorNames, type Question } from "@dogo/ti";
import { useDraft } from "./DraftContext";
import { tokens } from "@dogo/ui";
const api = client(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  Platform.OS === "web" ? undefined : AsyncStorage,
);
// This reserved key belongs only to the isolated browser-test service.
const isDemo = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === "browser-test-key";
const c = tokens.color;
type Field = {
  name: string;
  label: string;
  type?: "number" | "password" | "email" | "long" | "datetime";
  optional?: boolean;
  value?: string;
  options?:
    | { value: string; label: string }[]
    | ((values: Record<string, string>) => { value: string; label: string }[]);
};
const f = (name: string, label: string, type?: Field["type"]): Field => ({
  name,
  label,
  type,
});
function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: c.green }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function Photo({ path }: { path?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (path && api)
      void api.storage
        .from("dog-images")
        .createSignedUrl(path, 600)
        .then(({ data }) => setUrl(data?.signedUrl ?? ""));
    else setUrl("");
  }, [path]);
  return url ? (
    <Image
      source={{ uri: url }}
      style={{ width: 110, height: 110, borderRadius: 22 }}
    />
  ) : null;
}
function Card({
  children,
  tint = false,
}: {
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <View style={[s.card, tint && { backgroundColor: "#EFF4E4" }]}>
      {children}
    </View>
  );
}
function Pill({ status }: { status?: string }) {
  return <Text style={s.pill}>{labels[status ?? ""] ?? status}</Text>;
}
function Form({
  fields,
  submit,
  label = "保存",
}: {
  fields: Field[];
  submit: (v: Record<string, string>) => Promise<void>;
  label?: string;
}) {
  const [v, setV] = useState<Record<string, string>>(() =>
      Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function setField(name: string, value: string) {
    const next = { ...v, [name]: value };
    for (const field of fields) {
      if (
        typeof field.options === "function" &&
        !field.options(next).some((o) => o.value === next[field.name])
      )
        next[field.name] = "";
    }
    setV(next);
  }
  async function send() {
    setError("");
    if (fields.some((f) => !f.optional && !v[f.name]?.trim())) {
      setError("请完整填写必填信息");
      return;
    }
    if (
      fields.some(
        (f) =>
          typeof f.options === "function" &&
          !f.options(v).some((o) => o.value === v[f.name]),
      )
    ) {
      setError("可选项已变更，请重新选择散步时长");
      return;
    }
    setBusy(true);
    try {
      await submit(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      {fields.map((f) => {
        const options =
          typeof f.options === "function" ? f.options(v) : f.options;
        return (
          <View key={f.name}>
            <Text style={s.label}>
              {f.label}
              {f.optional ? "（选填）" : ""}
            </Text>
            {options ? (
              <View style={s.wrap}>
                {options.map((o) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: v[f.name] === o.value }}
                    key={o.value}
                    onPress={() => setField(f.name, o.value)}
                    style={[s.choice, v[f.name] === o.value && s.choiceOn]}
                  >
                    <Text
                      style={{
                        color: v[f.name] === o.value ? c.green : c.muted,
                      }}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : f.type === "datetime" && Platform.OS === "web" ? (
              <input
                type="datetime-local"
                aria-label={f.label}
                value={v[f.name] ?? ""}
                onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 16,
                  border: "1px solid #DCE3D3",
                  borderRadius: 14,
                  fontSize: 16,
                  background: "#FAFBF7",
                  color: c.ink,
                }}
              />
            ) : (
              <TextInput
                placeholder={
                  f.type === "datetime" ? "例如 2026-11-10 09:00" : undefined
                }
                accessibilityLabel={f.label}
                value={v[f.name] ?? ""}
                onChangeText={(x) => setV({ ...v, [f.name]: x })}
                style={[
                  s.input,
                  f.type === "long" && {
                    minHeight: 90,
                    textAlignVertical: "top",
                  },
                ]}
                multiline={f.type === "long"}
                secureTextEntry={f.type === "password"}
                autoCapitalize={f.type === "email" ? "none" : "sentences"}
                keyboardType={
                  f.type === "number"
                    ? "decimal-pad"
                    : f.type === "email"
                      ? "email-address"
                      : "default"
                }
              />
            )}
          </View>
        );
      })}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button disabled={busy} onPress={() => void send()}>
        {busy ? "正在保存…" : label}
      </Button>
    </View>
  );
}
function Result({ data, nickname }: { data: any; nickname: string }) {
  const shareView = useRef<ElementRef<typeof View>>(null);
  async function share() {
    const p = { nickname, style: data.style, E: data.E, P: data.P };
    if (Platform.OS === "web") {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 1000;
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#F2F6E8";
      g.fillRect(0, 0, 800, 1000);
      g.fillStyle = c.green;
      g.font = "bold 40px sans-serif";
      g.fillText("DOGO  /  Dogo Ti", 70, 110);
      g.fillStyle = c.ink;
      g.font = "bold 64px sans-serif";
      g.fillText(nickname.slice(0, 10), 70, 260);
      g.font = "bold 90px sans-serif";
      g.fillText(String(data.style), 70, 420);
      g.font = "28px sans-serif";
      g.fillText(`兴奋性 E  ${data.E?.toFixed(2) ?? "待补充"}`, 70, 570);
      g.fillText(`玩耍倾向 P  ${data.P?.toFixed(2) ?? "待补充"}`, 70, 630);
      g.font = "22px sans-serif";
      g.fillText("主人初评 · 一起了解它的小小世界", 70, 850);
      const a = document.createElement("a");
      a.download = "dogo-ti.png";
      a.href = canvas.toDataURL();
      a.click();
    } else if (await Sharing.isAvailableAsync()) {
      const uri = await captureRef(shareView, { format: "png", quality: 1 });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "分享 Dogo Ti 性格卡",
      });
    } else
      await Share.share({
        title: "Dogo Ti 分享卡",
        message: `${p.nickname}的 Dogo Ti：${p.style}\n兴奋性 ${p.E?.toFixed(2) ?? "待补充"} · 玩耍倾向 ${p.P?.toFixed(2) ?? "待补充"}\n主人初评，不用于自动安全判断。`,
      });
  }
  return (
    <>
      <View ref={shareView} collapsable={false} style={s.resultHero}>
        <Text style={s.eyebrow}>DOGO TI / 主人初评</Text>
        <Text style={s.heroTitle}>{nickname}的小小世界</Text>
        <Text style={s.styleCode}>{data.style}</Text>
        <Text style={s.body}>
          兴奋性 E {data.E?.toFixed(2) ?? "待补充"}　·　玩耍倾向 P{" "}
          {data.P?.toFixed(2) ?? "待补充"}
        </Text>
      </View>
      <Card>
        <Text style={s.h2}>五个维度，更了解它</Text>
        {Object.entries(factorNames).map(([key, name]) => (
          <View key={key} style={{ marginTop: 18 }}>
            <View style={s.row}>
              <Text>{name}</Text>
              <Text>{data.factors[key]?.toFixed(2) ?? "待补充"} / 5</Text>
            </View>
            <View style={s.track}>
              <View
                style={[
                  s.bar,
                  {
                    width: `${data.factors[key] === null ? 0 : ((data.factors[key] - 1) / 4) * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        ))}
        <Text style={[s.caption, { marginTop: 20 }]}>
          有效核心题 {data.validCount}
          /45。分数反映主人观察，不是风险概率或安全认证。
        </Text>
        {[data.E, data.P].some(
          (v) => v !== null && v !== 3 && v >= 2.5 && v <= 3.5,
        ) && <Text style={s.body}>部分维度接近分界，呈轻微倾向。</Text>}
      </Card>
      <Card tint>
        <Text style={s.h2}>只分享它的性格</Text>
        <Text style={s.body}>
          分享内容仅包含昵称、风格与 E/P 结果。请确认是否愿意公开昵称。
        </Text>
        <Button onPress={() => void share()}>
          {Platform.OS === "web" ? "确认并下载分享卡" : "确认并调用系统分享"}
        </Button>
      </Card>
    </>
  );
}
export default function App() {
  const router = useRouter(),
    params = useLocalSearchParams<{
      screen?: string;
      kind?: string;
      slot?: string;
      pack?: string;
    }>(),
    page = params.screen ?? "home";
  const [store, setStore] = useState<Store>(emptyStore),
    [uid, setUid] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [registerRequested, setRegister] = useState(false),
    [demoLoginBusy, setDemoLoginBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [editDog, setEditDog] = useState<Row | null>(null),
    [questionPage, setQuestionPage] = useState(0),
    [briefs, setBriefs] = useState<Record<string, any>>({});
  const [bookingKind, setBookingKind] = useState(
    params.kind === "pack" || page === "packs" ? "pack" : "solo",
  );
  const [publishKind, setPublishKind] = useState("solo");
  useEffect(() => {
    setBookingKind(
      params.kind === "pack" || page === "packs" ? "pack" : "solo",
    );
  }, [params.kind, page]);
  const isBooking = ["book", "solo", "packs"].includes(page);
  const activeTab = isBooking || page === "request" ? "book" : page;
  const register = !isDemo && registerRequested;
  const {
    selectedDog,
    setSelectedDog,
    assessment,
    setAssessment,
    answers,
    setAnswers,
    relationship,
    setRelationship,
    userId,
    setUserId,
  } = useDraft();
  useEffect(() => {
    if (uid && uid !== userId) {
      setUserId(uid);
      setAssessment(null);
      setAnswers({});
      setRelationship("");
      setSelectedDog(store.dogs.find((d) => d.owner_id === uid)?.id ?? "");
    }
  }, [uid, userId]);
  async function refresh() {
    if (!api) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.auth.getSession();
      setUid(data.session?.user.id ?? "");
      if (data.session) {
        const next = await snapshot(api);
        setStore(next);
        setSelectedDog((old) => old || next.dogs[0]?.id || "");
      } else setStore(emptyStore());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    const sub = api?.auth.onAuthStateChange(() =>
      setTimeout(() => void refresh(), 0),
    );
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (Platform.OS === "web" || !api) return;
    async function acceptLink(url: string | null | undefined) {
      if (!url || !api) return;
      const params = new URLSearchParams(url.split("#")[1] ?? "");
      const access_token = params.get("access_token"),
        refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await api.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) setError(error.message);
        else router.push("/profile");
      }
    }
    void Linking.getInitialURL().then(acceptLink);
    const subscription = Linking.addEventListener(
      "url",
      ({ url }) => void acceptLink(url),
    );
    return () => subscription.remove();
  }, []);
  const me = store.profiles.find((p) => p.id === uid),
    isWalker = me?.role === "walker",
    dogs = store.dogs.filter((d) => d.owner_id === uid),
    dog = dogs.find((d) => d.id === selectedDog),
    definition = store.questionnaire_definitions.find((q) => q.active),
    questions: Question[] = definition?.data.questions ?? [];
  const durations: number[] = store.settings[0]?.data.durations ?? [
    15, 30, 45, 60, 90, 120,
  ];
  const tabs = isWalker
    ? [
        ["home", "工作台", "⌂"],
        ["tasks", "任务", "↗"],
        ["publish", "发布时段", "+"],
        ["requests", "需求广场", "○"],
        ["profile", "我的", "♧"],
      ]
    : [
        ["home", "首页", "⌂"],
        ["book", "预约", "↗"],
        ["activities", "遛狗活动", "♧"],
        ["orders", "订单", "▤"],
        ["profile", "我的", "○"],
      ];
  function go(screen: string) {
    if (screen === "solo" || screen === "packs") {
      router.push({
        pathname: "/[screen]",
        params: { screen: "book", kind: screen === "packs" ? "pack" : "solo" },
      });
    } else router.push(`/${screen}` as any);
  }
  async function run(action: string, payload: Record<string, unknown>) {
    const result = await command(api, action, payload);
    await refresh();
    setNotice("已保存");
    return result;
  }
  async function signInDemo(role: "owner" | "walker") {
    if (!api || !isDemo || demoLoginBusy) return;
    setDemoLoginBusy(true);
    setError("");
    try {
      const { error } = await api.auth.signInWithPassword({
        email: `${role}@dogo.test`,
        password: "DogoTest123!",
      });
      if (error) throw error;
      await refresh();
      go("home");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDemoLoginBusy(false);
    }
  }
  async function uploadPhoto(d: Row) {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const response = await fetch(asset.uri);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 5242880) throw new Error("照片需小于 5MB");
    const path = `${uid}/${d.id}-${Date.now()}.jpg`;
    const { error } = await api!.storage
      .from("dog-images")
      .upload(path, bytes, { contentType: asset.mimeType ?? "image/jpeg" });
    if (error) throw error;
    await run("dog.save", { id: d.id, data: { ...d.data, image_path: path } });
  }
  const safe = (fn: () => Promise<any>) => {
    setError("");
    void fn().catch((e) => setError(e.message));
  };
  const dogField: Field = {
    name: "dog_id",
    label: "选择狗狗",
    value: selectedDog,
    options: dogs.map((d) => ({ value: d.id, label: d.data.nickname })),
  };
  function begin(row?: Row) {
    setAssessment(row ?? null);
    setAnswers(row?.data.answers ?? {});
    setRelationship(row?.data.relationship ?? "");
    setQuestionPage(0);
    go("assessment");
  }
  async function saveAssessment(submit = false) {
    if (!dog) throw new Error("请先建立狗狗档案");
    const r = await run("assessment.save", {
      id: assessment?.id,
      dog_id: dog.id,
      data: { answers, relationship },
    });
    setAssessment({ id: r.id, data: { answers, relationship } });
    if (submit) {
      await run("assessment.submit", { id: r.id });
      go("results");
    } else setNotice("测评草稿已保存，可稍后继续");
  }
  const title: Record<string, string> = {
    home: isWalker ? "今天，一起好好散步" : "每一次出门，都有好时光",
    dogs: "我的狗狗",
    assessment: "Dogo Ti 性格测试",
    results: "Dogo Ti 结果",
    book: "预约一次好好散步",
    solo: "预约一次好好散步",
    packs: "预约一次好好散步",
    activities: "已有遛狗活动",
    publish: "发布你的散步时段",
    request: "发布遛狗需求",
    requests: "主人需求广场",
    orders: "我的订单",
    tasks: "我的服务任务",
    notifications: "消息中心",
    profile: "我的 DOGO",
  };
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.app}>
        <View style={s.top}>
          <Pressable
            accessibilityRole="button"
            onPress={() => go("home")}
            style={s.logoRow}
          >
            <Image
              source={require("../../../assets/brand/dogo-original.png")}
              style={s.logo}
            />
            <Text style={s.wordmark}>DOGO</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => go("notifications")}
          >
            <Text style={s.topLink}>
              消息 {store.notifications.filter((n) => !n.read_at).length || ""}
            </Text>
          </Pressable>
        </View>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={busy}
              onRefresh={() => void refresh()}
              tintColor={c.green}
            />
          }
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.eyebrow}>
            {isWalker ? "WALK WITH CARE" : "LITTLE PAWS, BIG ADVENTURES"}
          </Text>
          <Text style={s.h1}>{title[page] ?? "DOGO"}</Text>
          {busy && <ActivityIndicator color={c.green} />}
          {!!error && (
            <Pressable onPress={() => setError("")}>
              <Text accessibilityRole="alert" style={s.error}>
                {error}　×
              </Text>
            </Pressable>
          )}
          {!!notice && (
            <Pressable onPress={() => setNotice("")}>
              <Text style={s.notice}>{notice}　×</Text>
            </Pressable>
          )}
          {!api ? (
            <>
              <View style={s.hero}>
                <Text style={s.heroTitle}>陪它探索，{"\n"}也让你安心。</Text>
                <Text style={s.body}>专属散步、友好小队，和更懂它的陪伴。</Text>
                <Image
                  source={require("../../../assets/brand/dogo-original.png")}
                  style={s.heroImage}
                />
              </View>
              <Card>
                <Text style={s.h2}>欢迎来到 DOGO</Text>
                <Text style={s.body}>
                  应用界面已准备好。连接开发环境后，即可注册、建立档案和预约散步。
                </Text>
                <Text style={s.caption}>
                  请在 apps/mobile/.env 中配置 EXPO_PUBLIC_SUPABASE_URL 和
                  EXPO_PUBLIC_SUPABASE_ANON_KEY，具体步骤见 README。
                </Text>
              </Card>
            </>
          ) : !uid ? (
            <>
              {isDemo && (
                <Card tint>
                  <Text style={s.h2}>本机演示模式</Text>
                  <Text style={s.body}>
                    选择一个身份开始体验，无需填写邮箱或密码。这里使用临时演示数据，暂不开放注册。
                  </Text>
                  <Button
                    disabled={demoLoginBusy}
                    onPress={() => void signInDemo("owner")}
                  >
                    以主人身份体验
                  </Button>
                  <Button
                    secondary
                    disabled={demoLoginBusy}
                    onPress={() => void signInDemo("walker")}
                  >
                    以遛狗师身份体验
                  </Button>
                  {demoLoginBusy && <Text style={s.caption}>正在登录…</Text>}
                </Card>
              )}
              {!isDemo && (
                <Card>
                  <Text style={s.h2}>
                    {register ? "开启你们的散步故事" : "欢迎回来"}
                  </Text>
                  <Form
                    key={String(register)}
                    fields={[
                      ...(register ? [f("display_name", "你的称呼")] : []),
                      f("email", "邮箱", "email"),
                      f("password", "密码（至少 8 位）", "password"),
                    ]}
                    label={register ? "注册 DOGO" : "登录"}
                    submit={async (v) => {
                      if (v.password.length < 8)
                        throw new Error("密码至少 8 位");
                      if (register) {
                        if (!consent)
                          throw new Error("请阅读并同意服务与隐私说明");
                        const { error } = await api.auth.signUp({
                          email: v.email,
                          password: v.password,
                          options: {
                            data: {
                              display_name: v.display_name,
                              consent: true,
                            },
                          },
                        });
                        if (error) throw error;
                        setNotice("注册已提交；如开启邮箱验证，请检查邮箱");
                      } else {
                        const { error } = await api.auth.signInWithPassword({
                          email: v.email,
                          password: v.password,
                        });
                        if (error) throw error;
                      }
                      await refresh();
                    }}
                  />
                  {register && (
                    <>
                      <Text style={s.caption}>
                        DOGO
                        保存账号、狗狗档案、测评和服务记录用于提供服务。资料仅对本人、必要的服务人员及运营人员开放。可在“我的”申请导出或删除。版本
                        2026-11。
                      </Text>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: consent }}
                        onPress={() => setConsent(!consent)}
                      >
                        <Text style={s.body}>
                          {consent ? "☑" : "☐"} 我已阅读并同意服务与隐私说明
                        </Text>
                      </Pressable>
                    </>
                  )}
                  {!isDemo && (
                    <Button secondary onPress={() => setRegister(!register)}>
                      {register ? "已有账号？去登录" : "第一次来？注册账号"}
                    </Button>
                  )}
                </Card>
              )}
              {!isDemo && (
                <Card>
                  <Text style={s.h2}>忘记密码</Text>
                  <Form
                    fields={[f("email", "注册邮箱", "email")]}
                    label="发送重置邮件"
                    submit={async (v) => {
                      const { error } = await api.auth.resetPasswordForEmail(
                        v.email,
                        {
                          redirectTo:
                            Platform.OS === "web"
                              ? `${window.location.origin}/profile`
                              : createURL("profile"),
                        },
                      );
                      if (error) throw error;
                      setNotice("密码重置邮件已发送");
                    }}
                  />
                </Card>
              )}
            </>
          ) : me?.active === false ? (
            <Card>
              <Text style={s.body}>账号已停用，请联系运营。</Text>
              <Button onPress={() => safe(async () => api.auth.signOut())}>
                退出登录
              </Button>
            </Card>
          ) : (
            <>
              {page === "home" && (
                <>
                  {isWalker ? (
                    <>
                      <Card tint>
                        <Text style={s.heroTitle}>
                          让它安心出发，
                          <Text style={{ color: c.green }}>平安回家。</Text>
                        </Text>
                        <Text style={s.body}>
                          今日待执行任务{" "}
                          {
                            store.walk_tasks.filter(
                              (t) =>
                                !["reported", "cancelled"].includes(t.status!),
                            ).length
                          }{" "}
                          项
                        </Text>
                        <Button onPress={() => go("tasks")}>
                          打开任务台 →
                        </Button>
                        <Button secondary onPress={() => go("publish")}>
                          发布我的空闲时段
                        </Button>
                        <Button secondary onPress={() => go("requests")}>
                          看看主人遛狗需求
                        </Button>
                      </Card>
                      <Text style={s.caption}>
                        只显示指派给你的任务和必要照顾信息。
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={s.hero}>
                        <View style={{ maxWidth: "65%", zIndex: 1 }}>
                          <Text style={s.heroTag}>
                            每一只狗狗，都值得被懂得
                          </Text>
                          <Text style={s.heroTitle}>
                            一起出门，
                            <Text style={{ color: c.green }}>遇见快乐。</Text>
                          </Text>
                          <Text style={s.body}>
                            专业陪伴，认真照顾。
                            <Text>把散步的时光，放心交给我们。</Text>
                          </Text>
                          <Button onPress={() => go("solo")}>
                            预约一次散步 ↗
                          </Button>
                        </View>
                        <Image
                          source={require("../../../assets/brand/dogo-original.png")}
                          style={s.heroImage}
                        />
                      </View>
                      <View style={s.row}>
                        <Text style={s.h2}>我的小伙伴</Text>
                        <Pressable onPress={() => go("dogs")}>
                          <Text style={s.topLink}>管理档案 →</Text>
                        </Pressable>
                      </View>
                      {dogs.length ? (
                        dogs.map((d) => (
                          <Pressable
                            key={d.id}
                            onPress={() => {
                              setSelectedDog(d.id);
                              go("results");
                            }}
                          >
                            <Card>
                              <View style={s.row}>
                                <View style={s.dogAvatar}>
                                  <Text style={{ fontSize: 28 }}>🐾</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                  <Text style={s.h2}>{d.data.nickname}</Text>
                                  <Text style={s.caption}>
                                    {d.data.breed || "独一无二的小伙伴"} ·{" "}
                                    {d.data.age} 岁 · {d.data.weight} kg
                                  </Text>
                                </View>
                                <Text style={s.topLink}>了解它 ↗</Text>
                              </View>
                            </Card>
                          </Pressable>
                        ))
                      ) : (
                        <Card>
                          <Text style={s.h2}>先认识一下你的小伙伴</Text>
                          <Text style={s.body}>
                            添加狗狗档案，让每一次照顾更贴心。
                          </Text>
                          <Button onPress={() => go("dogs")}>
                            添加我的狗狗 ＋
                          </Button>
                        </Card>
                      )}
                      <Pressable onPress={() => begin()}>
                        <Card tint>
                          <Text style={s.eyebrow}>DOGO TI</Text>
                          <Text style={s.h2}>它的性格，有自己的小宇宙。</Text>
                          <Text style={s.body}>
                            从日常观察出发，认识它的兴奋、玩耍与陪伴倾向。
                          </Text>
                          <Text style={s.topLink}>探索 Dogo Ti →</Text>
                        </Card>
                      </Pressable>
                      <View style={s.serviceGrid}>
                        <Pressable style={s.service} onPress={() => go("solo")}>
                          <Text style={s.serviceIcon}>↗</Text>
                          <Text style={s.h2}>Solo Walk</Text>
                          <Text style={s.caption}>
                            一对一专属陪伴{"\n"}按它的节奏慢慢走
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[s.service, { backgroundColor: "#F7EBCD" }]}
                          onPress={() => go("packs")}
                        >
                          <Text style={s.serviceIcon}>♧</Text>
                          <Text style={s.h2}>Pack Walk</Text>
                          <Text style={s.caption}>
                            和新朋友一起出发{"\n"}人工审核，安心同行
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </>
              )}
              {page === "dogs" && (
                <>
                  {dogs.map((d) => (
                    <Card key={d.id}>
                      <View style={s.row}>
                        <Text style={s.h2}>{d.data.nickname}</Text>
                        <Button secondary onPress={() => setEditDog(d)}>
                          编辑
                        </Button>
                      </View>
                      <Photo path={d.data.image_path} />
                      <Button
                        secondary
                        onPress={() => safe(() => uploadPhoto(d))}
                      >
                        选择狗狗照片
                      </Button>
                      <Text style={s.body}>
                        {d.data.age} 岁 · {d.data.weight} kg · 疫苗：
                        {d.data.vaccine || "待确认"}
                      </Text>
                      <Text style={s.caption}>
                        紧急联系人 {d.data.emergency_name} ·{" "}
                        {d.data.emergency_phone}
                      </Text>
                    </Card>
                  ))}
                  <Card>
                    <Text style={s.h2}>
                      {editDog ? "编辑狗狗" : "添加新伙伴"}
                    </Text>
                    <Form
                      key={editDog?.id ?? "new"}
                      fields={[
                        f("nickname", "狗狗昵称"),
                        f("age", "年龄（岁）", "number"),
                        f("weight", "体重（kg）", "number"),
                        { ...f("breed", "品种"), optional: true },
                        { ...f("sex", "性别"), optional: true },
                        f("vaccine", "疫苗状态"),
                        {
                          ...f("health", "健康与照顾限制", "long"),
                          optional: true,
                        },
                        { ...f("gear", "装备与牵引说明"), optional: true },
                        f("emergency_name", "紧急联系人"),
                        f("emergency_phone", "联系电话"),
                      ].map((f) => ({
                        ...f,
                        value: String(editDog?.data[f.name] ?? ""),
                      }))}
                      submit={async (v) => {
                        await run("dog.save", {
                          id: editDog?.id,
                          data: {
                            ...editDog?.data,
                            ...v,
                            age: Number(v.age),
                            weight: Number(v.weight),
                          },
                        });
                        setEditDog(null);
                      }}
                    />
                    {editDog && (
                      <Button secondary onPress={() => setEditDog(null)}>
                        取消编辑
                      </Button>
                    )}
                  </Card>
                </>
              )}
              {page === "assessment" && (
                <>
                  {!dogs.length ? (
                    <Card>
                      <Text style={s.body}>请先添加狗狗档案。</Text>
                      <Button onPress={() => go("dogs")}>建立档案</Button>
                    </Card>
                  ) : !definition ? (
                    <Card>
                      <Text style={s.h2}>完整问卷正在准备中</Text>
                      <Text style={s.body}>
                        团队需要核对原版 B/D/S
                        题目后发布。我们不会使用编造题目产生性格结果。
                      </Text>
                      <Text style={s.caption}>
                        已实现 45 道核心题的正式计分规则。
                      </Text>
                    </Card>
                  ) : (
                    <>
                      <View style={s.wrap}>
                        {dogs.map((d) => (
                          <Button
                            key={d.id}
                            secondary={selectedDog !== d.id}
                            onPress={() => {
                              setSelectedDog(d.id);
                              setAssessment(null);
                              setAnswers({});
                              setQuestionPage(0);
                            }}
                          >
                            {d.data.nickname}
                          </Button>
                        ))}
                      </View>
                      <Text style={s.body}>
                        依据平时的实际观察作答。核心题为 1–5 分；X 表示未观察 /
                        不适用，不等于 3。
                      </Text>
                      <Text style={s.caption}>
                        {Object.keys(answers).length}/57 已作答 · 版本{" "}
                        {definition.version}
                      </Text>
                      <View style={s.track}>
                        <View
                          style={[
                            s.bar,
                            {
                              width: `${(Object.keys(answers).length / 57) * 100}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={s.label}>照顾者关系</Text>
                      <TextInput
                        style={s.input}
                        value={relationship}
                        onChangeText={setRelationship}
                        placeholder="例如：主人、家庭照顾者"
                      />
                      {questions
                        .slice(questionPage * 6, questionPage * 6 + 6)
                        .map((q) => (
                          <Card key={q.code}>
                            <Text style={s.caption}>{q.code}</Text>
                            <Text style={s.h2}>{q.text}</Text>
                            {q.code.startsWith("D") ? (
                              <View style={s.wrap}>
                                {[1, 2, 3, 4, 5, "X"].map((v) => (
                                  <Pressable
                                    accessibilityRole="radio"
                                    accessibilityState={{
                                      selected: answers[q.code] === v,
                                    }}
                                    key={v}
                                    style={[
                                      s.answer,
                                      answers[q.code] === v && s.choiceOn,
                                    ]}
                                    onPress={() =>
                                      setAnswers({ ...answers, [q.code]: v })
                                    }
                                  >
                                    <Text>{v}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : q.options ? (
                              <View style={s.wrap}>
                                {q.options.map((v) => (
                                  <Pressable
                                    key={v}
                                    style={[
                                      s.choice,
                                      answers[q.code] === v && s.choiceOn,
                                    ]}
                                    onPress={() =>
                                      setAnswers({ ...answers, [q.code]: v })
                                    }
                                  >
                                    <Text>{v}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : (
                              <TextInput
                                accessibilityLabel={q.text}
                                style={s.input}
                                multiline
                                value={answers[q.code] ?? ""}
                                onChangeText={(v) =>
                                  setAnswers({ ...answers, [q.code]: v })
                                }
                              />
                            )}
                          </Card>
                        ))}
                      <View style={s.row}>
                        <Button
                          secondary
                          disabled={!questionPage}
                          onPress={() => setQuestionPage(questionPage - 1)}
                        >
                          上一页
                        </Button>
                        <Text>
                          {questionPage + 1} / {Math.ceil(questions.length / 6)}
                        </Text>
                        <Button
                          secondary
                          disabled={(questionPage + 1) * 6 >= questions.length}
                          onPress={() => setQuestionPage(questionPage + 1)}
                        >
                          下一页
                        </Button>
                      </View>
                      <Button
                        secondary
                        onPress={() => safe(() => saveAssessment())}
                      >
                        暂存，稍后继续
                      </Button>
                      <Button
                        disabled={Object.keys(answers).length !== 57}
                        onPress={() => safe(() => saveAssessment(true))}
                      >
                        提交并查看结果
                      </Button>
                    </>
                  )}
                </>
              )}
              {page === "results" && (
                <>
                  <View style={s.wrap}>
                    {dogs.map((d) => (
                      <Button
                        key={d.id}
                        secondary={selectedDog !== d.id}
                        onPress={() => setSelectedDog(d.id)}
                      >
                        {d.data.nickname}
                      </Button>
                    ))}
                  </View>
                  {store.assessment_sessions
                    .filter((a) => a.dog_id === selectedDog)
                    .slice()
                    .reverse()
                    .map((a) => (
                      <View key={a.id}>
                        {a.status === "draft" ? (
                          <Card>
                            <Text style={s.h2}>未完成的测评</Text>
                            <Button onPress={() => begin(a)}>
                              继续填写草稿
                            </Button>
                          </Card>
                        ) : (
                          <>
                            <Text style={s.caption}>
                              {date(a.submitted_at)}
                            </Text>
                            {store.assessment_scores
                              .filter((x) => x.id === a.id)
                              .map((x) => (
                                <Result
                                  key={x.id}
                                  data={x.data}
                                  nickname={dog?.data.nickname ?? "狗狗"}
                                />
                              ))}
                            <Card>
                              <Text style={s.body}>
                                情境事件需要人工了解，Dogo Ti 不代替 Pack
                                安全审核。
                              </Text>
                            </Card>
                          </>
                        )}
                      </View>
                    ))}
                  <Button onPress={() => begin()}>开始一次新测评</Button>
                </>
              )}
              {(isBooking || page === "request") && !isWalker && (
                <Card tint>
                  <Text style={s.h2}>时间由你来定</Text>
                  <Text style={s.body}>
                    没有合适的活动时段？发布你需要的散步时间，等待遛狗师接单。
                  </Text>
                  {page !== "request" && (
                    <Button onPress={() => go("request")}>发布遛狗需求</Button>
                  )}
                  {page === "request" && (
                    <Button secondary onPress={() => go("book")}>
                      查看可预约时段
                    </Button>
                  )}
                </Card>
              )}
              {isBooking && !isWalker && (
                <View style={s.wrap}>
                  <Button
                    secondary={bookingKind !== "solo"}
                    onPress={() => setBookingKind("solo")}
                  >
                    单独散步 · Solo
                  </Button>
                  <Button
                    secondary={bookingKind !== "pack"}
                    onPress={() => setBookingKind("pack")}
                  >
                    结伴散步 · Pack
                  </Button>
                </View>
              )}
              {isBooking && !isWalker && bookingKind === "solo" && (
                <>
                  <Card tint>
                    <Text style={s.h2}>专属它的散步时光</Text>
                    <Text style={s.body}>
                      {durations.join(" / ")} 分钟 · 专属陪伴 · 双方交接
                    </Text>
                    <Text style={s.caption}>
                      服务区域：{store.settings[0]?.data.area ?? "试点服务区"}
                      。遛狗师发布的时段预约成功后直接确认，其他时段由运营确认；暂不提供在线支付。
                    </Text>
                  </Card>
                  {!dogs.length ? (
                    <Button onPress={() => go("dogs")}>先添加狗狗档案</Button>
                  ) : (
                    <Card>
                      <Form
                        fields={[
                          dogField,
                          {
                            name: "slot_id",
                            label: "可预约时段",
                            value: params.slot,
                            options: store.service_slots
                              .filter(
                                (x) =>
                                  x.status === "open" &&
                                  x.data.source !== "owner_request" &&
                                  new Date(x.start_at!).getTime() >
                                    Date.now() &&
                                  !store.pack_events.some(
                                    (e) => e.slot_id === x.id,
                                  ),
                              )
                              .map((x) => ({
                                value: x.id,
                                label: `${date(x.start_at)} — ${date(x.end_at)}${x.data.publisher_id ? " · 遛狗师发布" : " · 运营安排"}`,
                              })),
                          },
                          {
                            name: "duration",
                            label: "散步时长",
                            options: (values) => {
                              const slot = store.service_slots.find(
                                (x) => x.id === values.slot_id,
                              );
                              const available = slot
                                ? (new Date(slot.end_at!).getTime() -
                                    new Date(slot.start_at!).getTime()) /
                                  60000
                                : Infinity;
                              return durations
                                .filter((n) => n <= available)
                                .map((n) => ({
                                  value: String(n),
                                  label: `${n} 分钟`,
                                }));
                            },
                          },
                          {
                            ...f(
                              "handoff",
                              "交接地点（遛狗师时段以活动地点为准）",
                            ),
                            value: store.walk_activities.find(
                              (a) => a.slot_id === params.slot,
                            )?.data.location,
                            optional: true,
                          },
                          {
                            ...f("notes", "给遛狗师的备注", "long"),
                            optional: true,
                          },
                        ]}
                        label="提交预约"
                        submit={async (v) => {
                          await run("solo.book", {
                            ...v,
                            duration: Number(v.duration),
                          });
                          go("orders");
                        }}
                      />
                      <Text style={s.caption}>
                        运营安排的时段请填写交接地点；遛狗师发布的时段使用活动集合地点。名额在提交时实时核验。
                      </Text>
                    </Card>
                  )}
                </>
              )}
              {isBooking && !isWalker && bookingKind === "pack" && (
                <>
                  <Text style={s.body}>
                    先认识，再同行。每只狗狗通过人工安全审核后，才能报名对应小队的活动。
                  </Text>
                  {!store.packs.length && (
                    <Card>
                      <Text style={s.body}>
                        小队筹备中，开放后会出现在这里。
                      </Text>
                    </Card>
                  )}
                  {store.packs
                    .filter(
                      (p) =>
                        p.status === "open" &&
                        (!params.pack || p.id === params.pack),
                    )
                    .map((p) => (
                      <Card key={p.id}>
                        <View style={s.row}>
                          <Text style={s.h2}>{p.name}</Text>
                          <Text style={s.pill}>最多 {p.capacity} 只</Text>
                        </View>
                        <Text style={s.body}>
                          {p.location} · {p.data.description}
                        </Text>
                        <Text style={s.caption}>
                          参与条件：{p.data.requirements}
                        </Text>
                        <Form
                          fields={[
                            dogField,
                            {
                              ...f("notes", "补充说明", "long"),
                              optional: true,
                            },
                          ]}
                          label="申请加入，等待审核"
                          submit={async (v) => {
                            await run("pack.apply", { ...v, pack_id: p.id });
                          }}
                        />
                        {store.pack_applications
                          .filter((a) => a.pack_id === p.id)
                          .map((a) => (
                            <View style={s.subcard} key={a.id}>
                              <Text style={s.h2}>
                                {dogName(store, a.dog_id)} 的申请
                              </Text>
                              <Pill status={a.status} />
                              <Text style={s.body}>
                                {a.data.review_reason ??
                                  "运营会认真了解它的情况，请耐心等待。"}
                              </Text>
                              {store.intro_meetings
                                .filter((m) => m.application_id === a.id)
                                .map((m) => (
                                  <Text style={s.body} key={m.id}>
                                    首次见面：{date(m.data.scheduled_at)}{" "}
                                    {m.data.outcome ?? ""}
                                  </Text>
                                ))}
                            </View>
                          ))}
                        {store.pack_events
                          .filter(
                            (e) =>
                              e.pack_id === p.id &&
                              e.status === "open" &&
                              new Date(
                                store.service_slots.find(
                                  (slot) => slot.id === e.slot_id,
                                )?.start_at ?? 0,
                              ).getTime() > Date.now(),
                          )
                          .map((e) => (
                            <View style={s.subcard} key={e.id}>
                              <Text style={s.h2}>下一次一起出发</Text>
                              <Text style={s.body}>
                                {date(
                                  store.service_slots.find(
                                    (s) => s.id === e.slot_id,
                                  )?.start_at,
                                )}
                              </Text>
                              <Form
                                fields={[
                                  {
                                    ...dogField,
                                    options: dogs
                                      .filter((d) =>
                                        store.pack_memberships.some(
                                          (m) =>
                                            m.pack_id === p.id &&
                                            m.dog_id === d.id,
                                        ),
                                      )
                                      .map((d) => ({
                                        value: d.id,
                                        label: d.data.nickname,
                                      })),
                                  },
                                ]}
                                label="报名这次活动"
                                submit={async (v) => {
                                  await run("pack.book", {
                                    ...v,
                                    event_id: e.id,
                                  });
                                  go("orders");
                                }}
                              />
                            </View>
                          ))}
                      </Card>
                    ))}
                </>
              )}
              {page === "request" &&
                !isWalker &&
                (!dogs.length ? (
                  <Button onPress={() => go("dogs")}>先添加狗狗档案</Button>
                ) : (
                  <Card>
                    <Form
                      fields={[
                        dogField,
                        f("title", "需求标题"),
                        f("start_at", "希望开始时间", "datetime"),
                        {
                          name: "duration",
                          label: "需要遛狗多久",
                          value: "30",
                          options: durations.map((n) => ({
                            value: String(n),
                            label: `${n} 分钟`,
                          })),
                        },
                        f("area", "公开服务区域（如小区或公园）"),
                        f("handoff", "详细交接地点（接单后可见）"),
                        {
                          ...f("public_notes", "公开需求备注", "long"),
                          optional: true,
                        },
                      ]}
                      label="发布需求，等待接单"
                      submit={async (v) => {
                        const start = new Date(v.start_at.replace(" ", "T"));
                        if (!Number.isFinite(start.getTime()))
                          throw new Error("请填写有效的开始时间");
                        await run("request.publish", {
                          ...v,
                          start_at: start.toISOString(),
                          duration: Number(v.duration),
                        });
                        go("orders");
                      }}
                    />
                    <Text style={s.caption}>
                      需求标题、区域、备注和狗狗昵称、品种、体重会展示给遛狗师，请不要在公开备注填写电话或门牌号。结束时间由开始时间与时长计算；未接单前可随时撤回。
                    </Text>
                  </Card>
                ))}
              {page === "requests" && isWalker && (
                <>
                  <Card tint>
                    <Text style={s.h2}>找到适合你的下一段散步</Text>
                    <Text style={s.body}>
                      这里展示主人发布、尚未被接单的需求。确认时间和区域合适后接单，详细交接资料会加入你的任务。
                    </Text>
                    <Button secondary onPress={() => safe(refresh)}>
                      刷新需求
                    </Button>
                  </Card>
                  {!store.walk_requests.length && (
                    <Card>
                      <Text style={s.body}>
                        暂时没有待接单需求，稍后再来看看。
                      </Text>
                    </Card>
                  )}
                  {store.walk_requests.map((r) => (
                    <Card key={r.id}>
                      <Text style={s.h2}>{r.data.title}</Text>
                      <Text style={s.body}>
                        {date(r.start_at)} — {date(r.end_at)} ·{" "}
                        {r.data.duration} 分钟
                      </Text>
                      <Text style={s.body}>
                        {r.data.area} · {r.data.nickname} ·{" "}
                        {r.data.breed || "品种未填写"} · {r.data.weight} kg
                      </Text>
                      {!!r.data.public_notes && (
                        <Text style={s.body}>{r.data.public_notes}</Text>
                      )}
                      <Button
                        onPress={() =>
                          safe(async () => {
                            await run("request.claim", { id: r.id });
                            go("tasks");
                          })
                        }
                      >
                        确认接下这个需求
                      </Button>
                      <Text style={s.caption}>
                        接单即确认服务，请确保你有足够的往返和交接时间。
                      </Text>
                    </Card>
                  ))}
                </>
              )}
              {page === "activities" && !isWalker && (
                <>
                  <Card tint>
                    <Text style={s.h2}>挑一个时间，一起出发</Text>
                    <Text style={s.body}>
                      这里是遛狗师发布的散步时段和小队活动。选好活动后，为你的狗狗预约。
                    </Text>
                    <Button secondary onPress={() => safe(refresh)}>
                      刷新活动
                    </Button>
                  </Card>
                  {!store.walk_activities.length && (
                    <Card>
                      <Text style={s.body}>
                        暂时没有可预约活动，稍后再来看看，也可以到“预约”提交散步申请。
                      </Text>
                    </Card>
                  )}
                  {store.walk_activities.map((a) => (
                    <Card key={a.id}>
                      <View style={s.row}>
                        <Text style={s.h2}>{a.data.title}</Text>
                        <Pill
                          status={a.kind === "pack" ? "结伴散步" : "单独散步"}
                        />
                      </View>
                      <Text style={s.body}>
                        {date(a.start_at)} — {date(a.end_at)}
                      </Text>
                      <Text style={s.body}>
                        遛狗师：{a.data.walker_name} · {a.data.location}
                      </Text>
                      {!!a.data.description && (
                        <Text style={s.body}>{a.data.description}</Text>
                      )}
                      <Text style={s.caption}>
                        剩余 {a.remaining} / {a.capacity} 个名额
                        {a.kind === "pack"
                          ? " · 需先通过对应小队的安全审核"
                          : " · 预约成功即确认"}
                      </Text>
                      <Button
                        disabled={!a.remaining}
                        onPress={() =>
                          router.push({
                            pathname: "/[screen]",
                            params: {
                              screen: "book",
                              kind: a.kind,
                              slot: a.slot_id,
                              ...(a.pack_id ? { pack: a.pack_id } : {}),
                            },
                          })
                        }
                      >
                        {a.remaining ? "预约这个活动" : "名额已满"}
                      </Button>
                    </Card>
                  ))}
                </>
              )}
              {page === "publish" && isWalker && (
                <>
                  <Card tint>
                    <Text style={s.h2}>把空闲时间变成一段好时光</Text>
                    <Text style={s.body}>
                      发布你可以服务的时间和地点，主人可在“遛狗活动”中预约。请预留足够的交接与往返时间。
                    </Text>
                  </Card>
                  <View style={s.wrap}>
                    <Button
                      secondary={publishKind !== "solo"}
                      onPress={() => setPublishKind("solo")}
                    >
                      发布单独时段
                    </Button>
                    <Button
                      secondary={publishKind !== "pack"}
                      onPress={() => setPublishKind("pack")}
                    >
                      发布 Pack 活动
                    </Button>
                  </View>
                  {publishKind === "pack" &&
                  !store.packs.some(
                    (p) => p.lead_walker_id === uid && p.status === "open",
                  ) ? (
                    <Card>
                      <Text style={s.body}>
                        你还没有负责的小队，请联系运营安排后再发布 Pack
                        活动。你现在可以发布单独散步时段。
                      </Text>
                    </Card>
                  ) : (
                    <Card>
                      <Form
                        key={publishKind}
                        fields={[
                          f("title", "活动名称"),
                          f("start_at", "开始时间", "datetime"),
                          f("end_at", "结束时间", "datetime"),
                          ...(publishKind === "solo"
                            ? [f("location", "集合地点")]
                            : [
                                {
                                  name: "pack_id",
                                  label: "负责的小队",
                                  options: store.packs
                                    .filter(
                                      (p) =>
                                        p.lead_walker_id === uid &&
                                        p.status === "open",
                                    )
                                    .map((p) => ({
                                      value: p.id,
                                      label: `${p.name} · ${p.location} · 最多 ${p.capacity} 只`,
                                    })),
                                },
                                {
                                  ...f("capacity", "本次名额", "number"),
                                  value: "1",
                                },
                              ]),
                          {
                            ...f("description", "活动说明", "long"),
                            optional: true,
                          },
                        ]}
                        label="发布遛狗时段"
                        submit={async (v) => {
                          const start = new Date(v.start_at.replace(" ", "T")),
                            end = new Date(v.end_at.replace(" ", "T"));
                          if (
                            !Number.isFinite(start.getTime()) ||
                            !Number.isFinite(end.getTime())
                          )
                            throw new Error("请填写有效的开始和结束时间");
                          await run("walk.publish", {
                            ...v,
                            kind: publishKind,
                            start_at: start.toISOString(),
                            end_at: end.toISOString(),
                            capacity:
                              publishKind === "pack" ? Number(v.capacity) : 1,
                          });
                          setNotice("时段已发布，主人现在可以查看和预约");
                        }}
                      />
                      <Text style={s.caption}>
                        时间按你当前设备的当地时间填写。Pack
                        活动沿用小队集合地点，成员仍须通过安全审核。
                      </Text>
                    </Card>
                  )}
                  <Text style={s.h2}>我发布的时段</Text>
                  {!store.walk_publications.length && (
                    <Text style={s.body}>还没有发布时段。</Text>
                  )}
                  {[...store.walk_publications].reverse().map((p) => {
                    const slot = store.service_slots.find(
                      (x) => x.id === p.slot_id,
                    );
                    return (
                      <Card key={p.id}>
                        <View style={s.row}>
                          <Text style={s.h2}>{p.data.title}</Text>
                          <Pill
                            status={
                              p.status === "published" ? "已发布" : "已撤回"
                            }
                          />
                        </View>
                        <Text style={s.body}>
                          {date(slot?.start_at)} — {date(slot?.end_at)}
                        </Text>
                        <Text style={s.body}>{p.data.location}</Text>
                        {p.status === "published" && (
                          <Button
                            secondary
                            onPress={() =>
                              safe(async () => {
                                await run("walk.withdraw", { id: p.id });
                                setNotice("时段已撤回");
                              })
                            }
                          >
                            撤回时段
                          </Button>
                        )}
                        <Text style={s.caption}>
                          已有有效预约的时段无法撤回，请联系运营处理。
                        </Text>
                      </Card>
                    );
                  })}
                </>
              )}
              {page === "orders" && (
                <>
                  {[...store.solo_bookings, ...store.pack_event_bookings]
                    .length === 0 && (
                    <Card>
                      <Text style={s.body}>
                        还没有预约，选一个好天气出发吧。
                      </Text>
                      <Button onPress={() => go("solo")}>预约散步</Button>
                    </Card>
                  )}
                  {[...store.solo_bookings, ...store.pack_event_bookings].map(
                    (b) => (
                      <Card key={b.id}>
                        <View style={s.row}>
                          <Text style={s.h2}>
                            {dogName(store, b.dog_id)} ·{" "}
                            {b.event_id ? "Pack" : "Solo"} Walk
                          </Text>
                          <Pill
                            status={
                              b.data?.source === "owner_request" &&
                              b.status === "requested"
                                ? "等待遛狗师接单"
                                : b.status
                            }
                          />
                        </View>
                        <Text style={s.caption}>订单 {b.id.slice(0, 8)}</Text>
                        {b.data?.source === "owner_request" && (
                          <Text style={s.body}>
                            我的需求：{b.data.title} · {b.data.duration} 分钟
                          </Text>
                        )}
                        <Text style={s.body}>
                          {date(
                            store.service_slots.find(
                              (s) =>
                                s.id ===
                                (b.slot_id ??
                                  store.pack_events.find(
                                    (e) => e.id === b.event_id,
                                  )?.slot_id),
                            )?.start_at,
                          )}{" "}
                          {b.data?.handoff}
                        </Text>
                        {!b.event_id &&
                          ["requested", "confirmed"].includes(b.status!) && (
                            <>
                              <Text style={s.caption}>
                                {b.data?.source === "owner_request" &&
                                b.status === "requested"
                                  ? "尚未接单，可随时撤回需求。"
                                  : `开始前 ${store.settings[0]?.data.cancel_hours ?? 2} 小时可自助取消。`}
                              </Text>
                              <Form
                                fields={[f("reason", "取消原因")]}
                                label={
                                  b.data?.source === "owner_request" &&
                                  b.status === "requested"
                                    ? "撤回需求"
                                    : "取消预约"
                                }
                                submit={async (v) => {
                                  await run("solo.cancel", { id: b.id, ...v });
                                }}
                              />
                            </>
                          )}
                        {store.walk_tasks
                          .filter(
                            (t) =>
                              t.solo_id === b.id || t.pack_booking_id === b.id,
                          )
                          .map((t) => (
                            <View key={t.id} style={s.subcard}>
                              <Pill status={t.status} />
                              {Object.entries(t.data).map(([k, v]) => (
                                <Text key={k} style={s.caption}>
                                  {labels[k.replace("_at", "")] ?? k} ·{" "}
                                  {date(String(v))}
                                </Text>
                              ))}
                              {[
                                "accepted",
                                "picked_up",
                                "walking",
                                "returned",
                              ].includes(t.status!) && (
                                <Button
                                  secondary
                                  onPress={() =>
                                    safe(() =>
                                      run("handoff.confirm", {
                                        id: t.id,
                                        status: [
                                          "accepted",
                                          "picked_up",
                                        ].includes(t.status!)
                                          ? "picked_up"
                                          : "returned",
                                      }),
                                    )
                                  }
                                >
                                  {["accepted", "picked_up"].includes(t.status!)
                                    ? "我已确认接狗交接"
                                    : "我已接回狗狗，确认归还"}
                                </Button>
                              )}
                              {store.walk_reports
                                .filter((r) => r.task_id === t.id)
                                .map((r) => (
                                  <View key={r.id}>
                                    <Text style={s.h2}>这次散步报告</Text>
                                    <Text style={s.body}>{r.data.summary}</Text>
                                    <Text style={s.body}>
                                      {r.data.observations}
                                    </Text>
                                    <Text style={s.caption}>
                                      {date(r.data.actual_start_at)} →{" "}
                                      {date(r.data.actual_end_at)}
                                    </Text>
                                    {store.report_corrections
                                      .filter(
                                        (c) =>
                                          c.data.report_id === r.id ||
                                          (c as any).report_id === r.id,
                                      )
                                      .map((c) => (
                                        <Text key={c.id} style={s.body}>
                                          更正：{c.data.summary}（
                                          {c.data.reason}）
                                        </Text>
                                      ))}
                                  </View>
                                ))}
                            </View>
                          ))}
                      </Card>
                    ),
                  )}
                </>
              )}
              {page === "tasks" && (
                <>
                  {store.walk_tasks.length === 0 && (
                    <Card>
                      <Text style={s.body}>暂时没有分配的任务。</Text>
                    </Card>
                  )}
                  {store.walk_tasks.map((t) => (
                    <Card key={t.id}>
                      <View style={s.row}>
                        <Text style={s.h2}>
                          {t.solo_id ? "Solo" : "Pack"} 服务任务
                        </Text>
                        <Pill status={t.status} />
                      </View>
                      <Text style={s.caption}>{t.id.slice(0, 8)}</Text>
                      <Button
                        secondary
                        onPress={() =>
                          safe(async () => {
                            const { data, error } = await api.rpc(
                              "task_brief",
                              { task: t.id },
                            );
                            if (error) throw error;
                            setBriefs({ ...briefs, [t.id]: data });
                          })
                        }
                      >
                        查看照顾与紧急联系信息
                      </Button>
                      {briefs[t.id] && (
                        <View style={s.subcard}>
                          <Text style={s.h2}>{briefs[t.id].nickname}</Text>
                          {!!briefs[t.id].title && (
                            <Text style={s.h2}>{briefs[t.id].title}</Text>
                          )}
                          <Text style={s.body}>
                            {date(briefs[t.id].start_at)} —{" "}
                            {date(briefs[t.id].end_at)}
                            {briefs[t.id].duration
                              ? ` · ${briefs[t.id].duration} 分钟`
                              : ""}
                          </Text>
                          {!!briefs[t.id].notes && (
                            <Text style={s.body}>
                              备注：{briefs[t.id].notes}
                            </Text>
                          )}
                          <Text style={s.body}>
                            交接点：{briefs[t.id].handoff}
                            <Text>
                              {"\n"}健康：{briefs[t.id].health}
                              {"\n"}装备：{briefs[t.id].gear}
                            </Text>
                          </Text>
                          <Button
                            secondary
                            onPress={() =>
                              void Linking.openURL(
                                `tel:${briefs[t.id].emergency_phone}`,
                              )
                            }
                          >
                            联系 {briefs[t.id].emergency_name}
                          </Button>
                          <Text style={s.caption}>
                            {store.settings[0]?.data.emergency}
                          </Text>
                        </View>
                      )}
                      {[
                        "assigned",
                        "accepted",
                        "picked_up",
                        "walking",
                      ].includes(t.status!) && (
                        <Form
                          fields={
                            ["accepted", "walking"].includes(t.status!)
                              ? [f("notes", "交接确认与装备记录")]
                              : []
                          }
                          label={
                            (
                              {
                                assigned: "接受任务",
                                accepted: "确认接狗",
                                picked_up: "开始散步",
                                walking: "结束散步并确认归还",
                              } as Record<string, string>
                            )[t.status!]
                          }
                          submit={async (v) => {
                            await run("task.advance", {
                              id: t.id,
                              status: (
                                {
                                  assigned: "accepted",
                                  accepted: "picked_up",
                                  picked_up: "walking",
                                  walking: "returned",
                                } as Record<string, string>
                              )[t.status!],
                              ...v,
                            });
                          }}
                        />
                      )}
                      {t.status === "returned" && (
                        <Form
                          fields={[
                            f("summary", "整体状况", "long"),
                            {
                              ...f("observations", "观察与异常说明", "long"),
                              optional: true,
                            },
                          ]}
                          label="提交服务报告"
                          submit={async (v) => {
                            await run("task.report", { id: t.id, ...v });
                          }}
                        />
                      )}
                      {!["reported", "cancelled"].includes(t.status!) && (
                        <View style={s.subcard}>
                          <Text style={s.h2}>异常事件</Text>
                          <Form
                            fields={[
                              f("description", "事件经过与已采取措施", "long"),
                            ]}
                            label="登记并通知运营"
                            submit={async (v) => {
                              await run("incident.create", { id: t.id, ...v });
                            }}
                          />
                        </View>
                      )}
                      {store.walk_reports
                        .filter((r) => r.task_id === t.id)
                        .map((r) => (
                          <View key={r.id}>
                            <Text style={s.body}>{r.data.summary}</Text>
                            <Form
                              fields={[
                                f("reason", "更正原因"),
                                f("summary", "更正内容", "long"),
                              ]}
                              label="添加更正记录"
                              submit={async (v) => {
                                await run("report.correct", { id: r.id, ...v });
                              }}
                            />
                          </View>
                        ))}
                    </Card>
                  ))}
                </>
              )}
              {page === "notifications" && (
                <>
                  {!store.notifications.length && (
                    <Card>
                      <Text style={s.body}>暂时没有新消息。</Text>
                    </Card>
                  )}
                  {store.notifications
                    .slice()
                    .reverse()
                    .map((n) => (
                      <Card key={n.id}>
                        <Text style={s.h2}>{n.data.title}</Text>
                        <Text style={s.caption}>{date(n.created_at)}</Text>
                        {!n.read_at && (
                          <Button
                            secondary
                            onPress={() =>
                              safe(() => run("notification.read", { id: n.id }))
                            }
                          >
                            标记已读
                          </Button>
                        )}
                      </Card>
                    ))}
                </>
              )}
              {page === "profile" && (
                <>
                  <Card>
                    <Text style={s.h2}>{me?.display_name ?? "DOGO 用户"}</Text>
                    <Pill status={me?.role} />
                    <Button secondary onPress={() => go("dogs")}>
                      我的狗狗档案
                    </Button>
                    <Button secondary onPress={() => go("results")}>
                      测评历史与分享卡
                    </Button>
                    <Button secondary onPress={() => go("notifications")}>
                      消息中心
                    </Button>
                  </Card>
                  {!isDemo && (
                    <Card>
                      <Text style={s.h2}>重置密码</Text>
                      <Form
                        fields={[
                          f("password", "新密码（至少 8 位）", "password"),
                        ]}
                        label="更新密码"
                        submit={async (v) => {
                          if (v.password.length < 8)
                            throw new Error("密码至少8位");
                          const { error } = await api.auth.updateUser({
                            password: v.password,
                          });
                          if (error) throw error;
                          setNotice("密码已更新");
                        }}
                      />
                    </Card>
                  )}
                  <Card>
                    <Text style={s.h2}>隐私与资料管理</Text>
                    <Text style={s.body}>
                      可申请导出或删除资料。运营将核实身份和服务留档要求后办理。
                    </Text>
                    <Form
                      fields={[
                        {
                          name: "kind",
                          label: "申请类型",
                          options: [
                            { value: "export", label: "导出我的资料" },
                            { value: "delete", label: "申请删除资料" },
                          ],
                        },
                        { ...f("reason", "补充说明", "long"), optional: true },
                      ]}
                      label="提交资料申请"
                      submit={async (v) => {
                        await run("privacy.request", v);
                      }}
                    />
                  </Card>
                  <Button
                    secondary
                    onPress={() =>
                      safe(async () => {
                        await api.auth.signOut();
                        go("home");
                      })
                    }
                  >
                    退出登录
                  </Button>
                </>
              )}
            </>
          )}
          <Text style={s.footer}>DOGO · 用心陪伴每一步</Text>
        </ScrollView>
        <View style={s.nav}>
          {tabs.map(([id, label, icon]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === id }}
              key={id}
              onPress={() => go(id)}
              style={s.navItem}
            >
              <Text style={[s.navIcon, activeTab === id && { color: c.green }]}>
                {icon}
              </Text>
              <Text
                style={[
                  s.navLabel,
                  activeTab === id && { color: c.green, fontWeight: "700" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.paper },
  app: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    backgroundColor: c.paper,
  },
  top: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomColor: c.line,
    borderBottomWidth: 1,
  },
  logoRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  logo: { width: 40, height: 40, borderRadius: 10 },
  wordmark: { fontWeight: "900", fontSize: 25, letterSpacing: 1, color: c.ink },
  topLink: { color: c.green, fontSize: 13, fontWeight: "600" },
  content: { padding: 24, paddingBottom: 36, gap: 18 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#82906B",
    fontWeight: "700",
  },
  h1: {
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "700",
    color: c.ink,
    marginBottom: 4,
  },
  h2: { fontSize: 19, fontWeight: "700", color: c.ink, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 25, color: c.muted, marginVertical: 10 },
  caption: { fontSize: 12, lineHeight: 21, color: c.muted },
  hero: {
    backgroundColor: "#EAF1D7",
    borderRadius: 28,
    padding: 26,
    minHeight: 300,
    overflow: "hidden",
    position: "relative",
  },
  heroTitle: {
    fontSize: 31,
    lineHeight: 43,
    fontWeight: "700",
    color: c.ink,
    marginVertical: 10,
  },
  heroTag: { fontSize: 11, color: c.green },
  heroImage: {
    position: "absolute",
    width: 220,
    height: 220,
    right: -65,
    bottom: -25,
    transform: [{ rotate: "-7deg" }],
    opacity: 0.85,
  },
  card: {
    backgroundColor: c.white,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    gap: 10,
  },
  button: {
    backgroundColor: c.green,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginVertical: 4,
    minHeight: 48,
  },
  buttonText: { color: "white", fontSize: 14, fontWeight: "600" },
  secondary: { backgroundColor: "#EEF3E5" },
  label: { fontSize: 13, color: c.muted, marginBottom: 8 },
  input: {
    backgroundColor: "#FAFBF7",
    borderColor: "#DDE3D3",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: c.ink,
    minHeight: 48,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    padding: 12,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  choiceOn: { borderColor: c.green, backgroundColor: "#E7F0D7" },
  answer: {
    minWidth: 46,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    fontSize: 11,
    color: c.green,
    backgroundColor: "#EEF3DF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  error: {
    backgroundColor: "#FDEEE8",
    color: c.danger,
    padding: 16,
    borderRadius: 12,
    lineHeight: 23,
  },
  notice: {
    backgroundColor: "#EAF3DC",
    color: c.green,
    padding: 14,
    borderRadius: 12,
  },
  dogAvatar: { backgroundColor: "#F6EDDA", padding: 14, borderRadius: 18 },
  serviceGrid: { flexDirection: "row", gap: 14 },
  service: {
    flex: 1,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#E8EFDD",
  },
  serviceIcon: { fontSize: 36, color: c.green, marginBottom: 22 },
  subcard: {
    backgroundColor: "#F5F7EE",
    padding: 18,
    borderRadius: 16,
    gap: 10,
    marginTop: 12,
  },
  track: {
    height: 7,
    borderRadius: 5,
    backgroundColor: "#E9EDDF",
    marginTop: 9,
    overflow: "hidden",
  },
  bar: { height: 7, backgroundColor: "#89A763", borderRadius: 5 },
  resultHero: { backgroundColor: "#F8E6B5", borderRadius: 25, padding: 28 },
  styleCode: {
    fontSize: 62,
    fontWeight: "800",
    color: c.green,
    marginVertical: 20,
  },
  footer: {
    fontSize: 11,
    textAlign: "center",
    color: "#9AA18E",
    marginTop: 22,
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4, minHeight: 44 },
  navIcon: { fontSize: 24, color: "#959D88" },
  navLabel: { fontSize: 11, color: "#959D88" },
});
