// Ephemeral browser test fixture, NEVER a production Auth replacement.
// Only synthetic users, loopback binding and in-memory data; explicitly opt in.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
if (process.env.DOGO_TEST_HARNESS !== "1")
  throw new Error("Set DOGO_TEST_HARNESS=1 for browser tests only");
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
);
for (const f of [
  "202611010001_core.sql",
  "202611010002_commands.sql",
  "202611010004_walker_publications.sql",
])
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/" + f, import.meta.url),
      "utf8",
    ),
  );
const users = {};
const tokens = new Map();
for (const role of ["owner", "walker", "admin"]) {
  const id = randomUUID();
  users[role] = {
    id,
    email: `${role}@dogo.test`,
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { display_name: role },
    created_at: new Date().toISOString(),
  };
  await db.query(`insert into auth.users values($1,$2)`, [
    id,
    JSON.stringify({
      consent: true,
      display_name: { owner: "林小满", walker: "陈晓", admin: "DOGO 运营" }[
        role
      ],
    }),
  ]);
  await db.query("update public.profiles set role=$1 where id=$2", [role, id]);
}
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('test.uid',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function cmd(action, payload) {
  const r = await db.query("select public.command($1,$2) result", [
    action,
    JSON.stringify(payload),
  ]);
  return r.rows[0].result.id;
}
await as(users.owner.id);
const dog = await cmd("dog.save", {
  data: {
    nickname: "豆豆",
    age: 2,
    weight: 12,
    breed: "金毛",
    vaccine: "已接种",
    health: "无特别限制",
    gear: "胸背与牵引绳",
    emergency_name: "测试主人",
    emergency_phone: "10000000000",
  },
});
await as(users.admin.id);
const start = new Date(Date.now() + 86400000 * 2);
start.setHours(10, 0, 0, 0);
const end = new Date(+start + 3600000);
const slot = await cmd("admin.slot.create", {
  start_at: start.toISOString(),
  end_at: end.toISOString(),
  capacity: 3,
  label: "校园公园",
});
const pack = await cmd("admin.pack.create", {
  name: "草地漫步小队",
  location: "校园公园南门",
  capacity: 4,
  walker_id: users.walker.id,
  description: "在树荫和草地间，发现新的散步伙伴。",
  requirements: "疫苗有效、牵引适应，需人工安全审核",
});
await as(users.owner.id);
await cmd("solo.book", {
  dog_id: dog,
  slot_id: slot,
  duration: 30,
  handoff: "公园南门",
  notes: "喜欢慢慢闻闻草地",
});
await as(users.walker.id);
for (const [offset, kind, title] of [
  [4, "solo", "午后公园慢步"],
  [5, "pack", "草地小队周末同行"],
]) {
  const starts = new Date(+start + offset * 86400000);
  await cmd("walk.publish", {
    kind,
    title,
    location: "校园公园南门",
    description: "沿着林荫步道，享受一段轻松的散步时光。",
    pack_id: pack,
    capacity: 4,
    start_at: starts.toISOString(),
    end_at: new Date(+starts + 3600000).toISOString(),
  });
}
await db.exec("reset role");
let queue = Promise.resolve();
const server = createServer((req, res) => {
  queue = queue
    .then(() => handle(req, res))
    .catch((e) => {
      res.writeHead(500);
      res.end(JSON.stringify({ message: e.message }));
    });
});
async function handle(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ??
      "authorization,apikey,content-type,x-client-info,prefer,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.end();
    return;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1000000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  const body = raw ? JSON.parse(raw) : {},
    url = new URL(req.url, "http://localhost");
  const send = (data, status = 200) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  try {
    if (url.pathname === "/auth/v1/token") {
      let user;
      if (url.searchParams.get("grant_type") === "refresh_token")
        user = tokens.get(body.refresh_token);
      else
        user = Object.values(users).find(
          (u) => u.email === body.email && body.password === "DogoTest123!",
        );
      if (!user) return send({ msg: "测试账号或密码不正确" }, 400);
      const token = randomUUID();
      tokens.set(token, user);
      return send({
        access_token: token,
        refresh_token: token,
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    const user = tokens.get(req.headers.authorization?.replace("Bearer ", ""));
    if (!user) return send({ message: "Authentication required" }, 401);
    if (url.pathname === "/auth/v1/user") return send(user);
    if (url.pathname === "/auth/v1/logout") {
      tokens.delete(req.headers.authorization?.replace("Bearer ", ""));
      return send({});
    }
    await as(user.id);
    if (url.pathname === "/rest/v1/rpc/command")
      return send({ id: await cmd(body.action, body.payload) });
    if (url.pathname === "/rest/v1/rpc/task_brief") {
      const r = await db.query("select public.task_brief($1) result", [
        body.task,
      ]);
      return send(r.rows[0].result);
    }
    if (url.pathname === "/rest/v1/rpc/list_walk_activities")
      return send(
        (await db.query("select public.list_walk_activities() result")).rows[0]
          .result,
      );
    const table = url.pathname.split("/").pop();
    const allowed = [
      "walk_publications",
      "profiles",
      "dogs",
      "questionnaire_definitions",
      "assessment_sessions",
      "assessment_scores",
      "service_slots",
      "solo_bookings",
      "packs",
      "pack_applications",
      "intro_meetings",
      "pack_memberships",
      "pack_events",
      "pack_event_bookings",
      "walk_tasks",
      "handoff_records",
      "walk_reports",
      "report_corrections",
      "behavior_incidents",
      "notifications",
      "audit_logs",
      "privacy_requests",
      "settings",
    ];
    if (
      url.pathname.startsWith("/rest/v1/") &&
      allowed.includes(table) &&
      req.method === "GET"
    )
      return send((await db.query(`select * from public.${table}`)).rows);
    return send({ message: "Unsupported test endpoint" }, 404);
  } catch (e) {
    send({ message: e.message, code: e.code ?? "TEST_ERROR" }, 400);
  } finally {
    await db.exec("reset role");
  }
}
server.listen(54329, "127.0.0.1", () =>
  console.log("DOGO ephemeral browser fixture at 127.0.0.1:54329"),
);
