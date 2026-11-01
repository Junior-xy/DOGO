"use client";
import { useEffect, useState, type FormEvent } from "react";
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
const api = client(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string;
  optional?: boolean;
};
const nav = [
  ["overview", "总览", "◫"],
  ["orders", "预约与指派", "↗"],
  ["reviews", "Pack 安全审核", "◎"],
  ["services", "时段与 Pack", "▦"],
  ["people", "用户与遛狗师", "♧"],
  ["incidents", "异常与隐私请求", "!"],
  ["settings", "运营设置", "⚙"],
  ["audit", "操作记录", "≡"],
];
function Form({
  title,
  fields,
  submit,
  label = "保存",
  danger = false,
}: {
  title?: string;
  fields: Field[];
  submit: (v: Record<string, string>) => Promise<void>;
  label?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      await submit(
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      );
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send}>
      {title && <h3>{title}</h3>}
      <div className="fields">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select
                name={f.name}
                required={!f.optional}
                defaultValue={f.value ?? ""}
              >
                <option value="">请选择</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                required={!f.optional}
                defaultValue={f.value}
              />
            ) : (
              <input
                name={f.name}
                type={f.type ?? "text"}
                required={!f.optional}
                defaultValue={f.value}
                step={f.type === "number" ? "any" : undefined}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className={danger ? "danger" : ""}>
        {busy ? "处理中…" : label}
      </button>
    </form>
  );
}
const field = (name: string, label: string, type?: string): Field => ({
  name,
  label,
  type,
});
function Pill({ status }: { status?: string }) {
  return (
    <span className={"pill " + status}>{labels[status ?? ""] ?? status}</span>
  );
}
export default function Page() {
  const [store, setStore] = useState<Store>(emptyStore),
    [uid, setUid] = useState(""),
    [page, setPage] = useState("overview"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  async function refresh() {
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.auth.getSession();
      setUid(data.session?.user.id ?? "");
      if (data.session) setStore(await snapshot(api));
      else setStore(emptyStore());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const sub = api?.auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  async function run(action: string, payload: Record<string, unknown>) {
    await command(api, action, payload);
    setMessage("操作已保存，审计记录已更新");
    await refresh();
  }
  const me = store.profiles.find((p) => p.id === uid),
    walkers = store.profiles
      .filter((p) => p.role === "walker" && p.active)
      .map((p) => ({ value: p.id, label: p.display_name ?? p.id }));
  const pickWalker: Field = {
    name: "walker_id",
    label: "负责遛狗师",
    options: walkers,
  };
  const pending = store.solo_bookings.filter((x) => x.status === "requested"),
    reviews = store.pack_applications.filter(
      (x) => !["approved", "rejected"].includes(x.status!),
    );
  const slotOptions = store.service_slots
    .filter(
      (x) =>
        x.status === "open" && new Date(x.start_at!).getTime() > Date.now(),
    )
    .map((x) => ({
      value: x.id,
      label: `${date(x.start_at)} · ${x.capacity}名额`,
    }));
  function Info({ row }: { row: Row }) {
    return (
      <dl>
        {Object.entries(row.data ?? {}).map(([k, v]) => (
          <div key={k}>
            <dt>
              {(
                {
                  nickname: "昵称",
                  weight: "体重",
                  age: "年龄",
                  health: "健康说明",
                  gear: "装备",
                  emergency_name: "紧急联系人",
                  emergency_phone: "联系电话",
                  notes: "备注",
                  review_reason: "审核理由",
                  scheduled_at: "首次见面时间",
                  observations: "观察",
                  outcome: "结论",
                  summary: "报告",
                  description: "事件经过",
                  resolution: "处理说明",
                  title: "通知",
                } as Record<string, string>
              )[k] ?? k}
            </dt>
            <dd>
              {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          <img src="/dogo.png" alt="DOGO 小狗 logo" />
          <span>
            DOGO<small>运营工作台</small>
          </span>
        </a>
        <div className="workspace">服务运营 / MVP</div>
        <nav>
          {nav.map(([id, title, icon]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => setPage(id)}
            >
              <span>{icon}</span>
              {title}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="dot" /> 每一次散步，都值得被照顾
          <p>人工审核 · 安全交接 · 全程留痕</p>
        </div>
        <div className="account">
          {me?.display_name ?? "DOGO 团队"}
          <small>{me ? labels[me.role!] : "尚未登录"}</small>
          {uid && (
            <button className="text" onClick={() => void api?.auth.signOut()}>
              退出登录
            </button>
          )}
        </div>
      </aside>
      <main>
        <header>
          <span>DOGO / {nav.find((x) => x[0] === page)?.[1]}</span>
          <div>
            <span className="date">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
            <button className="secondary" onClick={() => void refresh()}>
              刷新数据
            </button>
          </div>
        </header>
        {!api ? (
          <section className="setup">
            <p className="eyebrow">WELCOME TO DOGO</p>
            <h1>
              好好散步，
              <br />
              从这里开始。
            </h1>
            <p>
              工作台已准备好。连接 Supabase
              开发项目后，即可管理预约、人工审核与遛狗师任务。
            </p>
            <div className="card">
              <h3>连接开发环境</h3>
              <p>
                在 apps/admin/.env.local 中配置公开项目 URL 和 publishable
                key，然后重启开发服务。
              </p>
              <code>
                NEXT_PUBLIC_SUPABASE_URL
                <br />
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              <p>数据库初始化和账号设置见仓库 README。</p>
            </div>
            <img src="/dogo.png" alt="DOGO 品牌小狗" />
          </section>
        ) : !uid ? (
          <section className="login">
            <p className="eyebrow">DOGO OPERATIONS</p>
            <h1>欢迎回来</h1>
            <p>使用已获得运营权限的账号登录。</p>
            <Form
              fields={[
                field("email", "邮箱", "email"),
                field("password", "密码", "password"),
              ]}
              label="登录工作台"
              submit={async (v) => {
                const { error } = await api.auth.signInWithPassword({
                  email: v.email,
                  password: v.password,
                });
                if (error) throw error;
                await refresh();
              }}
            />
          </section>
        ) : loading && !me ? (
          <p>正在加载工作台…</p>
        ) : me?.role !== "admin" ? (
          <section className="card">
            <h2>此账号没有运营权限</h2>
            <p>请使用主人 / 遛狗师移动端，或联系管理员开通权限。</p>
          </section>
        ) : (
          <>
            <div className="title">
              <div>
                <p className="eyebrow">A GOOD DAY STARTS WITH A WALK</p>
                <h1>{nav.find((x) => x[0] === page)?.[1]}</h1>
                <p>让每一次出门，都成为好时光。</p>
              </div>
              <span className="live">
                <span className="dot" />
                {loading ? "同步中" : "数据已连接"}
              </span>
            </div>
            {message && (
              <div
                role="status"
                className="notice"
                onClick={() => setMessage("")}
              >
                {message} ×
              </div>
            )}
            {page === "overview" && (
              <>
                <div className="stats">
                  {[
                    ["待确认预约", pending.length, "等待安排遛狗师"],
                    ["待审核申请", reviews.length, "每一份申请，认真了解"],
                    [
                      "服务任务",
                      store.walk_tasks.filter(
                        (x) => !["reported", "cancelled"].includes(x.status!),
                      ).length,
                      "守护每一步安心",
                    ],
                    [
                      "待处理异常",
                      store.behavior_incidents.filter(
                        (x) => x.status !== "resolved",
                      ).length,
                      "需要运营关注",
                    ],
                  ].map(([title, note, sub]) => (
                    <div className="card stat" key={title}>
                      <p>{title}</p>
                      <strong>{note}</strong>
                      <small>{sub}</small>
                    </div>
                  ))}
                </div>
                <div className="two-col">
                  <section className="card">
                    <div className="section-title">
                      <h2>待办预约</h2>
                      <button
                        className="text"
                        onClick={() => setPage("orders")}
                      >
                        查看全部 ↗
                      </button>
                    </div>
                    {pending.length ? (
                      pending.slice(0, 5).map((b) => (
                        <div className="list-row" key={b.id}>
                          <div className="avatar">🐾</div>
                          <div>
                            <b>{dogName(store, b.dog_id)}</b>
                            <p>
                              {date(
                                store.service_slots.find(
                                  (s) => s.id === b.slot_id,
                                )?.start_at,
                              )}{" "}
                              · Solo Walk
                            </p>
                          </div>
                          <Pill status={b.status} />
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        今天的待办已处理完毕
                        <br />
                        <small>新的预约会出现在这里</small>
                      </div>
                    )}
                  </section>
                  <section className="brand-card">
                    <p className="eyebrow">CARE, EVERY STEP.</p>
                    <h2>
                      不止是散步，
                      <br />
                      也是一份安心。
                    </h2>
                    <p>请先了解狗狗，再确认它的同行伙伴。</p>
                    <button onClick={() => setPage("reviews")}>
                      查看安全审核 ↗
                    </button>
                    <img src="/dogo.png" alt="DOGO" />
                  </section>
                </div>
                <section className="card">
                  <h2>最近服务报告</h2>
                  {store.walk_reports.length ? (
                    store.walk_reports
                      .slice(-4)
                      .reverse()
                      .map((r) => (
                        <div className="list-row" key={r.id}>
                          <div>
                            <b>{r.data.summary}</b>
                            <p>{date(r.created_at)}</p>
                          </div>
                          <Pill status="completed" />
                        </div>
                      ))
                  ) : (
                    <p className="empty">服务完成后，报告将在这里归档。</p>
                  )}
                </section>
              </>
            )}
            {page === "orders" && (
              <div className="stack">
                {store.solo_bookings.length === 0 && (
                  <p className="empty card">暂无 Solo 预约</p>
                )}
                {store.solo_bookings.map((b) => (
                  <section className="card" key={b.id}>
                    <div className="section-title">
                      <h2>{dogName(store, b.dog_id)} · Solo Walk</h2>
                      <Pill status={b.status} />
                    </div>
                    <p>
                      {date(
                        store.service_slots.find((s) => s.id === b.slot_id)
                          ?.start_at,
                      )}{" "}
                      · {b.data.duration} 分钟 · {b.data.handoff}
                    </p>
                    <small>订单 {b.id}</small>
                    <p>{b.data.notes}</p>
                    {b.status === "requested" && (
                      <Form
                        fields={[pickWalker]}
                        label="确认并指派"
                        submit={(v) =>
                          run("admin.solo.confirm", { id: b.id, ...v })
                        }
                      />
                    )}{" "}
                    {["requested", "confirmed"].includes(b.status!) && (
                      <details>
                        <summary>取消预约</summary>
                        <Form
                          fields={[field("reason", "取消原因")]}
                          label="取消预约"
                          danger
                          submit={(v) => run("solo.cancel", { id: b.id, ...v })}
                        />
                      </details>
                    )}
                    <details>
                      <summary>服务过程与报告</summary>
                      {store.walk_tasks
                        .filter((t) => t.solo_id === b.id)
                        .map((t) => (
                          <div key={t.id}>
                            <Pill status={t.status} />
                            <Info row={t} />
                            {store.handoff_records
                              .filter((h) => h.task_id === t.id)
                              .map((h) => (
                                <Info key={h.id} row={h} />
                              ))}
                            {store.walk_reports
                              .filter((r) => r.task_id === t.id)
                              .map((r) => (
                                <Info key={r.id} row={r} />
                              ))}
                          </div>
                        ))}
                    </details>
                  </section>
                ))}
                <section className="card">
                  <h2>Pack 活动预约</h2>
                  {store.pack_event_bookings.map((b) => (
                    <div className="list-row" key={b.id}>
                      <span>
                        {dogName(store, b.dog_id)} · {b.id.slice(0, 8)}
                      </span>
                      <Pill status={b.status} />
                    </div>
                  ))}
                </section>
              </div>
            )}
            {page === "reviews" && (
              <div className="stack">
                {store.pack_applications.length === 0 && (
                  <p className="empty card">暂无 Pack 申请</p>
                )}
                {store.pack_applications.map((a) => (
                  <section className="card" key={a.id}>
                    <div className="section-title">
                      <h2>
                        {dogName(store, a.dog_id)} →{" "}
                        {store.packs.find((p) => p.id === a.pack_id)?.name}
                      </h2>
                      <Pill status={a.status} />
                    </div>
                    <p>
                      请核实情境事件、健康、体型和牵引条件。风格类型不能替代人工安全判断。
                    </p>
                    <details>
                      <summary>审核所需档案与情境记录</summary>
                      {store.dogs
                        .filter((d) => d.id === a.dog_id)
                        .map((d) => (
                          <Info key={d.id} row={d} />
                        ))}
                      {store.assessment_sessions
                        .filter(
                          (s) =>
                            s.dog_id === a.dog_id && s.status === "submitted",
                        )
                        .map((s) => (
                          <Info key={s.id} row={s} />
                        ))}
                      {store.behavior_incidents
                        .filter((i) => i.dog_id === a.dog_id)
                        .map((i) => (
                          <Info key={i.id} row={i} />
                        ))}
                    </details>
                    <Info row={a} />
                    {!["approved", "rejected"].includes(a.status!) && (
                      <Form
                        fields={[
                          {
                            name: "status",
                            label: "处理方式",
                            options: (["submitted", "needs_more_info"].includes(
                              a.status!,
                            )
                              ? ["safety_review"]
                              : a.status === "safety_review"
                                ? [
                                    "intro_scheduled",
                                    "approved",
                                    "rejected",
                                    "needs_more_info",
                                  ]
                                : ["approved", "rejected", "needs_more_info"]
                            ).map((s) => ({ value: s, label: labels[s] })),
                          },
                          field("reason", "审核理由"),
                          {
                            ...field(
                              "scheduled_at",
                              "首见时间（安排首见时必填）",
                              "datetime-local",
                            ),
                            optional: true,
                          },
                          {
                            name: "safety_checked",
                            label: "人工安全核实",
                            options: [
                              {
                                value: "true",
                                label: "已核实情境、行为、健康和装备",
                              },
                              { value: "false", label: "尚未完成" },
                            ],
                          },
                        ]}
                        label="保存审核决定"
                        submit={(v) =>
                          run("admin.pack.review", {
                            id: a.id,
                            ...v,
                            scheduled_at: v.scheduled_at
                              ? new Date(v.scheduled_at).toISOString()
                              : null,
                          })
                        }
                      />
                    )}{" "}
                    {store.intro_meetings
                      .filter((m) => m.application_id === a.id)
                      .map((m) => (
                        <div className="subcard" key={m.id}>
                          <h3>首次见面 · {date(m.data.scheduled_at)}</h3>
                          {m.data.outcome ? (
                            <Info row={m} />
                          ) : (
                            <Form
                              fields={[
                                field(
                                  "observations",
                                  "互动与异常观察",
                                  "textarea",
                                ),
                                field("outcome", "结论与处理建议"),
                              ]}
                              label="归档首见记录"
                              submit={(v) =>
                                run("admin.intro.record", { id: m.id, ...v })
                              }
                            />
                          )}
                        </div>
                      ))}
                  </section>
                ))}
              </div>
            )}
            {page === "services" && (
              <div className="two-col">
                <section className="card">
                  <Form
                    title="发布 Solo 时段"
                    fields={[
                      field("start_at", "开始时间", "datetime-local"),
                      field("end_at", "结束时间", "datetime-local"),
                      field("capacity", "名额", "number"),
                      field("label", "服务区域"),
                    ]}
                    submit={(v) =>
                      run("admin.slot.create", {
                        ...v,
                        start_at: new Date(v.start_at).toISOString(),
                        end_at: new Date(v.end_at).toISOString(),
                      })
                    }
                  />
                  <h3>已发布时段</h3>
                  {store.service_slots.map((s) => (
                    <div className="list-row" key={s.id}>
                      <span>
                        {date(s.start_at)}
                        <small>
                          {s.capacity} 个名额 · {s.status}
                        </small>
                      </span>
                      {s.status === "open" && (
                        <button
                          className="secondary"
                          onClick={() =>
                            run("admin.slot.close", { id: s.id }).catch((e) =>
                              setError(e.message),
                            )
                          }
                        >
                          关闭
                        </button>
                      )}
                    </div>
                  ))}
                </section>
                <section className="card">
                  <Form
                    title="创建 Pack"
                    fields={[
                      field("name", "小队名称"),
                      field("location", "集合地点"),
                      field("capacity", "狗狗数量上限", "number"),
                      pickWalker,
                      field("description", "小队介绍", "textarea"),
                      field("requirements", "参与条件"),
                    ]}
                    submit={(v) => run("admin.pack.create", v)}
                  />
                  <hr />
                  <Form
                    title="发布单次 Pack 活动"
                    fields={[
                      {
                        name: "pack_id",
                        label: "选择 Pack",
                        options: store.packs.map((p) => ({
                          value: p.id,
                          label: p.name!,
                        })),
                      },
                      {
                        name: "slot_id",
                        label: "选择空闲时段",
                        options: slotOptions,
                      },
                    ]}
                    submit={(v) => run("admin.event.create", v)}
                  />
                  {store.packs.map((p) => (
                    <div className="subcard" key={p.id}>
                      <h3>{p.name}</h3>
                      <p>
                        {p.location} · 最多 {p.capacity} 只
                      </p>
                      <p>{p.data.requirements}</p>
                      {store.pack_events
                        .filter((e) => e.pack_id === p.id)
                        .map((e) => (
                          <p key={e.id}>
                            {date(
                              store.service_slots.find(
                                (s) => s.id === e.slot_id,
                              )?.start_at,
                            )}{" "}
                            · {e.status}
                          </p>
                        ))}
                    </div>
                  ))}
                </section>
              </div>
            )}
            {page === "people" && (
              <div className="stack">
                {store.profiles.map((p) => (
                  <section className="card" key={p.id}>
                    <div className="section-title">
                      <h3>{p.display_name}</h3>
                      <Pill status={p.role} />
                    </div>
                    <small>{p.id}</small>
                    <p>{p.active ? "账号有效" : "已停用"}</p>
                    {p.id !== uid && (
                      <Form
                        fields={[
                          {
                            name: "role",
                            label: "业务角色",
                            value: p.role,
                            options: ["owner", "walker", "admin"].map((v) => ({
                              value: v,
                              label: labels[v],
                            })),
                          },
                          {
                            name: "active",
                            label: "账号状态",
                            value: String(p.active),
                            options: [
                              { value: "true", label: "启用" },
                              { value: "false", label: "停用" },
                            ],
                          },
                          field("reason", "资质审核或变更理由"),
                        ]}
                        label="更新权限"
                        submit={(v) =>
                          run("admin.profile.update", { id: p.id, ...v })
                        }
                      />
                    )}
                    <details>
                      <summary>所属狗狗档案</summary>
                      {store.dogs
                        .filter((d) => d.owner_id === p.id)
                        .map((d) => (
                          <Info key={d.id} row={d} />
                        ))}
                    </details>
                  </section>
                ))}
              </div>
            )}
            {page === "incidents" && (
              <div className="stack">
                {store.behavior_incidents.map((i) => (
                  <section className="card" key={i.id}>
                    <div className="section-title">
                      <h3>{dogName(store, i.dog_id)} · 事件核实</h3>
                      <Pill status={i.status} />
                    </div>
                    <Info row={i} />
                    {i.status !== "resolved" && (
                      <Form
                        fields={[field("reason", "处理说明")]}
                        label={i.status === "open" ? "开始复核" : "标记已解决"}
                        submit={(v) =>
                          run("admin.incident.resolve", {
                            id: i.id,
                            status:
                              i.status === "open" ? "under_review" : "resolved",
                            ...v,
                          })
                        }
                      />
                    )}
                  </section>
                ))}
                {store.privacy_requests.map((r) => (
                  <section className="card" key={r.id}>
                    <h3>
                      资料{r.data.kind === "export" ? "导出" : "删除"}申请
                    </h3>
                    <Info row={r} />
                    <Pill status={r.status} />
                    {r.status === "open" && (
                      <Form
                        fields={[field("reason", "实际办理情况与用户反馈")]}
                        label="记录办理结果"
                        submit={(v) =>
                          run("admin.privacy.resolve", { id: r.id, ...v })
                        }
                      />
                    )}
                  </section>
                ))}
              </div>
            )}
            {page === "settings" && (
              <div className="stack">
                <section className="card">
                  <Form
                    title="运营配置"
                    fields={[
                      {
                        ...field("area", "服务区域"),
                        value: store.settings[0]?.data.area,
                      },
                      {
                        ...field("durations", "允许时长（分钟，用逗号分隔）"),
                        value: store.settings[0]?.data.durations?.join(","),
                      },
                      {
                        ...field(
                          "cancel_hours",
                          "提前多少小时可自助取消",
                          "number",
                        ),
                        value: String(
                          store.settings[0]?.data.cancel_hours ?? 2,
                        ),
                      },
                      {
                        ...field("emergency", "应急指引", "textarea"),
                        value: store.settings[0]?.data.emergency,
                      },
                    ]}
                    submit={(v) =>
                      run("admin.settings.save", {
                        data: {
                          ...v,
                          cancel_hours: Number(v.cancel_hours),
                          durations: v.durations.split(",").map(Number),
                        },
                      })
                    }
                  />
                </section>
                <section className="card">
                  <h2>Dogo Ti 原始问卷</h2>
                  <p>
                    当前 PRD 没有题目原文。请由团队核对 v4.0
                    原文后发布，历史版本会永久保留。
                  </p>
                  <p>
                    格式：version 和 questions 数组；每题包含 code、text，可附
                    options 字符串数组。
                  </p>
                  <Form
                    fields={[field("json", "完整问卷 JSON", "textarea")]}
                    label="发布完整新版本"
                    submit={(v) =>
                      run("admin.questionnaire.publish", {
                        data: JSON.parse(v.json),
                      })
                    }
                  />
                  {store.questionnaire_definitions.map((q) => (
                    <p key={q.id}>
                      {q.version} · {q.active ? "当前版本" : "已归档"}
                    </p>
                  ))}
                </section>
              </div>
            )}
            {page === "audit" && (
              <section className="card">
                <h2>操作审计</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>操作</th>
                        <th>操作人</th>
                        <th>资源 / 状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.audit_logs
                        .slice()
                        .reverse()
                        .map((r) => (
                          <tr key={r.id}>
                            <td>{date(r.created_at)}</td>
                            <td>{(r as any).action}</td>
                            <td>
                              {
                                store.profiles.find(
                                  (p) => p.id === (r as any).actor_id,
                                )?.display_name
                              }
                            </td>
                            <td>{JSON.stringify(r.data)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="text" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}
        <footer>DOGO · 用心陪伴每一步</footer>
      </main>
    </div>
  );
}
