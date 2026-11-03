import { scorePawStyle } from "../apps/mobile/src/pawstyle/pawstyle-scoring";
import samples from "./pawstyle-samples.json";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { score, type Answers } from "../packages/dogo-ti/src/index";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  admin = "00000000-0000-4000-8000-000000000003",
  walker = "00000000-0000-4000-8000-000000000004";
async function as(id: string) {
  await db.exec(
    `reset role; select set_config('test.uid','${id}',false); set role authenticated;`,
  );
}
async function cmd(action: string, payload: any = {}) {
  const r = await db.query<{ result: { id: string } }>(
    "select public.command($1,$2::jsonb) as result",
    [action, JSON.stringify(payload)],
  );
  return r.rows[0].result.id;
}
const dogData = {
  nickname: "豆豆",
  age: 2,
  weight: 12,
  emergency_name: "测试联系人",
  emergency_phone: "123456789",
  health: "无",
  gear: "胸背",
};
let dog: string,
  otherDog: string,
  slot: string,
  solo: string,
  task: string,
  pack: string,
  application: string,
  event: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of [
    "202611010001_core.sql",
    "202611010002_commands.sql",
    "202611010004_walker_publications.sql",
    "202611020005_owner_requests.sql",
    "202611020006_signup_roles.sql",
    "202611020007_pawstyle.sql",
    "202611020008_pawstyle_results.sql",
    "202611020009_dog_removal.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(
    readFileSync("supabase/migrations/202611010003_storage.sql", "utf8"),
  );
  for (const id of [owner, other, admin, walker])
    await db.query(`insert into auth.users values($1,'{"consent":true}')`, [
      id,
    ]);
  await db.query(`update public.profiles set role='admin' where id=$1`, [
    admin,
  ]);
  await db.query(`update public.profiles set role='walker' where id=$1`, [
    walker,
  ]);
}, 60000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL transactions, RLS and full workflows", () => {
  it("requires consent and ignores role escalation in signup metadata", async () => {
    await db.exec("reset role");
    await expect(
      db.query(`insert into auth.users values(gen_random_uuid(),'{}')`),
    ).rejects.toThrow("同意");
    const id = "00000000-0000-4000-8000-000000000099";
    await db.query(
      `insert into auth.users values($1,'{"consent":true,"role":"admin"}')`,
      [id],
    );
    expect(
      (
        await db.query<{ role: string }>(
          "select role from public.profiles where id=$1",
          [id],
        )
      ).rows[0].role,
    ).toBe("owner");
  });
  it("registers active owners and walkers without manual approval", async () => {
    for (const role of ["owner", "walker"]) {
      await db.exec("reset role");
      const id =
        role === "owner"
          ? "00000000-0000-4000-8000-000000000091"
          : "00000000-0000-4000-8000-000000000092";
      await db.query("insert into auth.users values($1,$2)", [
        id,
        JSON.stringify({
          consent: true,
          display_name: "自选身份",
          signup_role: role,
          role: "admin",
          active: false,
        }),
      ]);
      await as(id);
      const profile = (
        await db.query<any>("select * from public.profiles where id=$1", [id])
      ).rows[0];
      expect(profile.role).toBe(role);
      expect(profile.active).toBe(true);
      if (role === "walker") {
        const offer = await cmd("walk.publish", {
          kind: "solo",
          title: "新注册直接发布",
          location: "公园",
          start_at: "2088-01-01T10:00:00Z",
          end_at: "2088-01-01T11:00:00Z",
        });
        expect(offer).toBeTruthy();
        await cmd("walk.withdraw", { id: offer });
      } else expect(await cmd("dog.save", { data: dogData })).toBeTruthy();
      await expect(cmd("admin.settings.save", {})).rejects.toThrow("管理员");
    }
  });
  it("rejects privileged signup roles and does not change roles through metadata edits", async () => {
    await db.exec("reset role");
    for (const role of ["admin", "superuser", ""]) {
      await expect(
        db.query("insert into auth.users values(gen_random_uuid(),$1)", [
          JSON.stringify({ consent: true, signup_role: role }),
        ]),
      ).rejects.toThrow("注册身份");
    }
    await expect(
      db.query(
        `insert into auth.users values(gen_random_uuid(),' {"signup_role":"walker"}')`,
      ),
    ).rejects.toThrow("同意");
    const id = "00000000-0000-4000-8000-000000000092";
    await db.query(
      `update auth.users set raw_user_meta_data='{"signup_role":"admin"}' where id=$1`,
      [id],
    );
    expect(
      (
        await db.query<any>("select role from public.profiles where id=$1", [
          id,
        ])
      ).rows[0].role,
    ).toBe("walker");
    // Applying the additive migration never reclassifies existing accounts.
    await db.exec(
      readFileSync("supabase/migrations/202611020006_signup_roles.sql", "utf8"),
    );
    expect(
      (
        await db.query<any>("select role from public.profiles where id=$1", [
          owner,
        ])
      ).rows[0].role,
    ).toBe("owner");
    expect(
      (
        await db.query<any>("select role from public.profiles where id=$1", [
          admin,
        ])
      ).rows[0].role,
    ).toBe("admin");
  });
  it("isolates private image uploads and reads by owner", async () => {
    await as(owner);
    await db.query(
      `insert into storage.objects(bucket_id,name) values('dog-images',$1)`,
      [owner + "/dog.jpg"],
    );
    await expect(
      db.query(
        `insert into storage.objects(bucket_id,name) values('dog-images',$1)`,
        [other + "/fake.jpg"],
      ),
    ).rejects.toThrow();
    await as(other);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await as(walker);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await as(admin);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
  });
  it("persists dogs and rejects owner impersonation and direct writes", async () => {
    await as(owner);
    dog = await cmd("dog.save", { data: dogData });
    await expect(
      db.query(`update public.profiles set role='admin'`),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into public.dogs(owner_id,data) values($1,'{}')`, [
        other,
      ]),
    ).rejects.toThrow();
    await as(other);
    otherDog = await cmd("dog.save", { data: dogData });
    expect((await db.query("select * from public.dogs")).rows).toHaveLength(1);
    await expect(cmd("dog.save", { id: dog, data: dogData })).rejects.toThrow(
      "无权",
    );
    await expect(cmd("admin.slot.create", {})).rejects.toThrow("管理员");
  });
  it("serializes capacity and makes duplicate booking idempotent", async () => {
    await as(admin);
    slot = await cmd("admin.slot.create", {
      start_at: "2099-01-01T10:00:00Z",
      end_at: "2099-01-01T11:00:00Z",
      capacity: 1,
    });
    await as(owner);
    const p = { dog_id: dog, slot_id: slot, duration: 30, handoff: "公园入口" };
    solo = await cmd("solo.book", p);
    expect(await cmd("solo.book", p)).toBe(solo);
    await as(other);
    await expect(cmd("solo.book", { ...p, dog_id: otherDog })).rejects.toThrow(
      "名额已满",
    );
  });
  it("assigns tasks, protects walker data and blocks skipping handoffs", async () => {
    await as(admin);
    await cmd("admin.solo.confirm", { id: solo, walker_id: walker });
    await as(walker);
    const rows = await db.query<{ id: string }>(
      "select id from public.walk_tasks",
    );
    task = rows.rows[0].id;
    expect((await db.query("select * from public.dogs")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from public.assessment_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select public.task_brief($1)", [task])).rows,
    ).toHaveLength(1);
    await expect(
      cmd("task.advance", { id: task, status: "walking" }),
    ).rejects.toThrow("状态");
    await cmd("task.advance", { id: task, status: "accepted" });
    await expect(
      cmd("task.advance", { id: task, status: "picked_up", notes: "核对胸背" }),
    ).rejects.toThrow("主人确认");
    await as(other);
    await expect(
      cmd("task.advance", { id: task, status: "picked_up" }),
    ).rejects.toThrow("自己的任务");
  });
  it("completes Solo with two-party handoffs, immutable report and notification", async () => {
    await as(owner);
    await cmd("handoff.confirm", { id: task, status: "picked_up" });
    await as(walker);
    await cmd("task.advance", {
      id: task,
      status: "picked_up",
      notes: "胸背与牵引确认",
    });
    await cmd("task.advance", { id: task, status: "walking" });
    await as(owner);
    await cmd("handoff.confirm", { id: task, status: "returned" });
    await as(walker);
    await cmd("task.advance", {
      id: task,
      status: "returned",
      notes: "已安全归还主人",
    });
    await cmd("task.report", {
      id: task,
      summary: "散步顺利完成，精神状态良好",
    });
    await expect(
      cmd("task.report", { id: task, summary: "覆盖旧报告是不允许的" }),
    ).rejects.toThrow();
    await as(owner);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.solo_bookings",
        )
      ).rows[0].status,
    ).toBe("completed");
    expect(
      (await db.query("select * from public.walk_reports")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.notifications")).rows.length,
    ).toBeGreaterThan(0);
  });
  it("rejects overlapping walker assignments even across distinct slots", async () => {
    await as(admin);
    const s = await cmd("admin.slot.create", {
      start_at: "2099-01-01T10:30:00Z",
      end_at: "2099-01-01T11:30:00Z",
      capacity: 2,
    });
    await as(other);
    const b = await cmd("solo.book", {
      dog_id: otherDog,
      slot_id: s,
      duration: 30,
      handoff: "门口",
    });
    await as(admin);
    await expect(
      cmd("admin.solo.confirm", { id: b, walker_id: walker }),
    ).rejects.toThrow("冲突");
  });
  it("requires human Pack review, intro evidence and separate event enrollment", async () => {
    await as(admin);
    pack = await cmd("admin.pack.create", {
      name: "草地小队",
      location: "公园",
      capacity: 1,
      walker_id: walker,
    });
    const s = await cmd("admin.slot.create", {
      start_at: "2099-01-02T10:00:00Z",
      end_at: "2099-01-02T11:00:00Z",
      capacity: 1,
    });
    event = await cmd("admin.event.create", { pack_id: pack, slot_id: s });
    await as(owner);
    await expect(
      cmd("pack.book", { dog_id: dog, event_id: event }),
    ).rejects.toThrow("人工审核");
    application = await cmd("pack.apply", { dog_id: dog, pack_id: pack });
    await as(admin);
    await expect(
      cmd("admin.pack.review", {
        id: application,
        status: "approved",
        reason: "直接批准",
        safety_checked: true,
      }),
    ).rejects.toThrow("迁移");
    await cmd("admin.pack.review", {
      id: application,
      status: "safety_review",
      reason: "开始核实",
    });
    await cmd("admin.pack.review", {
      id: application,
      status: "intro_scheduled",
      reason: "安排见面",
      scheduled_at: "2098-12-01T10:00:00Z",
    });
    await expect(
      cmd("admin.pack.review", {
        id: application,
        status: "approved",
        reason: "人工核实",
        safety_checked: true,
      }),
    ).rejects.toThrow("首次见面");
    const intro = (
      await db.query<{ id: string }>("select id from public.intro_meetings")
    ).rows[0].id;
    await cmd("admin.intro.record", {
      id: intro,
      outcome: "可加入",
      observations: "现场互动正常，无异常，建议保持牵引",
    });
    await cmd("admin.pack.review", {
      id: application,
      status: "approved",
      reason: "健康与行为人工核验完成",
      safety_checked: true,
    });
    expect(
      (await db.query("select * from public.pack_event_bookings")).rows,
    ).toHaveLength(0);
    await as(owner);
    await cmd("pack.book", { dog_id: dog, event_id: event });
  });
  it("completes the Pack execution loop", async () => {
    await as(walker);
    const id = (
      await db.query<{ id: string }>(
        "select id from public.walk_tasks where pack_booking_id is not null",
      )
    ).rows[0].id;
    await cmd("task.advance", { id, status: "accepted" });
    await as(owner);
    await cmd("handoff.confirm", { id, status: "picked_up" });
    await as(walker);
    await cmd("task.advance", { id, status: "picked_up", notes: "双方确认" });
    await cmd("task.advance", { id, status: "walking" });
    await as(owner);
    await cmd("handoff.confirm", { id, status: "returned" });
    await as(walker);
    await cmd("task.advance", { id, status: "returned", notes: "安全交还" });
    await cmd("task.report", {
      id,
      summary: "Pack 活动顺利结束，狗狗状态良好",
    });
    await as(owner);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.pack_event_bookings",
        )
      ).rows[0].status,
    ).toBe("completed");
  });
  it("matches SQL scores to TypeScript, stores immutable assessment versions", async () => {
    await as(admin);
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => ({
        code: `B${i + 1}`,
        text: "TEST background",
      })),
      ...Array.from({ length: 45 }, (_, i) => ({
        code: `D${i + 1}`,
        text: "TEST only, not a production question",
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        code: `S${i + 1}`,
        text: "TEST situation",
      })),
    ];
    await cmd("admin.questionnaire.publish", {
      data: { version: "test-fixture", questions },
    });
    const answers = Object.fromEntries(
      questions.map((q) => [q.code, q.code.startsWith("D") ? 3 : "测试回答"]),
    );
    await as(owner);
    const id = await cmd("assessment.save", {
      dog_id: dog,
      data: { answers, relationship: "主人" },
    });
    await cmd("assessment.submit", { id });
    await expect(
      cmd("assessment.save", { id, dog_id: dog, data: { answers } }),
    ).rejects.toThrow("无法修改");
    const result = (
      await db.query<{ data: any }>(
        "select data from public.assessment_scores where id=$1",
        [id],
      )
    ).rows[0].data;
    expect(result.style).toBe("混合倾向");
    await db.exec("reset role");
    for (let seed = 0; seed < 20; seed++) {
      const a: Answers = Object.fromEntries(
        Array.from({ length: 45 }, (_, i) => [
          `D${i + 1}`,
          (i * 7 + seed) % 6 === 5 ? "X" : ((i * 7 + seed) % 5) + 1,
        ]),
      );
      const sql = (
        await db.query<{ s: any }>("select public.ti_score($1::jsonb) s", [
          JSON.stringify(a),
        ])
      ).rows[0].s;
      const ts = score(a);
      expect(sql.style).toBe(ts.style);
      for (const key of Object.keys(ts.factors)) {
        if (ts.factors[key] === null) expect(sql.factors[key]).toBeNull();
        else expect(sql.factors[key]).toBeCloseTo(ts.factors[key]!, 10);
      }
    }
    await as(other);
    expect(
      (await db.query("select * from public.assessment_scores")).rows,
    ).toHaveLength(0);
  });
  const offerStart = new Date(Date.now() + 30 * 86400000).toISOString();
  const offerEnd = new Date(Date.now() + 30 * 86400000 + 3600000).toISOString();
  const offer = {
    kind: "solo",
    title: "湖边慢走",
    location: "公园南门",
    start_at: offerStart,
    end_at: offerEnd,
  };
  let publication: string,
    publishedSlot: string,
    publishedBooking: string,
    packPublication: string,
    publishedEvent: string;
  async function feed() {
    return (
      await db.query<{ items: any[] }>(
        "select public.list_walk_activities() items",
      )
    ).rows[0].items;
  }
  it("limits publication to active walkers and validates time and Pack ownership", async () => {
    await as(owner);
    await expect(cmd("walk.publish", offer)).rejects.toThrow("遛狗师");
    await expect(
      db.query("select public.command_v1('walk.publish','{}')"),
    ).rejects.toThrow("permission");
    await as(walker);
    await expect(
      cmd("walk.publish", { ...offer, start_at: new Date(0).toISOString() }),
    ).rejects.toThrow("未来");
    await expect(
      cmd("walk.publish", { ...offer, end_at: offerStart }),
    ).rejects.toThrow("未来");
    await expect(
      cmd("walk.publish", {
        ...offer,
        end_at: new Date(+new Date(offerStart) + 60000).toISOString(),
      }),
    ).rejects.toThrow("短于");
    await expect(
      cmd("walk.publish", { ...offer, kind: "pack", pack_id: other }),
    ).rejects.toThrow("自己负责");
    await expect(
      cmd("walk.publish", {
        ...offer,
        kind: "pack",
        pack_id: pack,
        capacity: 999,
      }),
    ).rejects.toThrow("上限");
    expect(
      (await db.query("select * from public.walk_publications")).rows,
    ).toHaveLength(0);
    publication = await cmd("walk.publish", { ...offer, walker_id: other });
    const item = (await feed()).find((p) => p.id === publication);
    publishedSlot = item.slot_id;
    expect(item.walker_id).toBe(walker);
    expect(item.remaining).toBe(1);
    expect(item.capacity).toBe(1);
    await expect(cmd("walk.publish", offer)).rejects.toThrow("冲突");
    await as(owner);
    expect(
      (await db.query("select * from public.walk_publications")).rows,
    ).toHaveLength(0);
    expect((await feed()).find((p) => p.id === publication).data.title).toBe(
      "湖边慢走",
    );
  });
  it("confirms published Solo reservations with the publisher and preserves capacity on retry", async () => {
    await as(owner);
    publishedBooking = await cmd("solo.book", {
      slot_id: publishedSlot,
      dog_id: dog,
      duration: 30,
      handoff: "伪造地点",
      walker_id: other,
    });
    expect(
      await cmd("solo.book", {
        slot_id: publishedSlot,
        dog_id: dog,
        duration: 30,
      }),
    ).toBe(publishedBooking);
    const booking = (
      await db.query<any>("select * from public.solo_bookings where id=$1", [
        publishedBooking,
      ])
    ).rows[0];
    expect(booking.status).toBe("confirmed");
    expect(booking.walker_id).toBe(walker);
    expect(booking.data.handoff).toBe("公园南门");
    expect(
      (
        await db.query("select * from public.walk_tasks where solo_id=$1", [
          publishedBooking,
        ])
      ).rows,
    ).toHaveLength(1);
    await as(other);
    const publicItem = (await feed()).find((p) => p.id === publication);
    expect(publicItem.remaining).toBe(0);
    expect(JSON.stringify(publicItem)).not.toContain(dog);
    expect(JSON.stringify(publicItem)).not.toContain(owner);
    await expect(
      cmd("solo.book", {
        slot_id: publishedSlot,
        dog_id: otherDog,
        duration: 30,
      }),
    ).rejects.toThrow("已满");
    await expect(cmd("walk.withdraw", { id: publication })).rejects.toThrow(
      "自己发布",
    );
    await as(walker);
    await expect(cmd("walk.withdraw", { id: publication })).rejects.toThrow(
      "已有预约",
    );
  });
  it("reserves advertised availability against admin assignments and safely withdraws after cancellation", async () => {
    await as(admin);
    await expect(
      cmd("admin.profile.update", {
        id: walker,
        role: "owner",
        active: true,
        reason: "测试",
      }),
    ).rejects.toThrow("撤回");
    await expect(
      cmd("admin.slot.close", { id: publishedSlot }),
    ).rejects.toThrow("已有预约");
    await expect(
      cmd("admin.event.create", { slot_id: publishedSlot, pack_id: pack }),
    ).rejects.toThrow("不能转为");
    const overlap = await cmd("admin.slot.create", {
      start_at: offerStart,
      end_at: offerEnd,
      capacity: 1,
    });
    await as(other);
    const pending = await cmd("solo.book", {
      slot_id: overlap,
      dog_id: otherDog,
      duration: 30,
      handoff: "其他地点",
    });
    await as(admin);
    await expect(
      cmd("admin.solo.confirm", { id: pending, walker_id: walker }),
    ).rejects.toThrow("冲突");
    await as(owner);
    await cmd("solo.cancel", { id: publishedBooking, reason: "测试取消" });
    expect((await feed()).find((p) => p.id === publication).remaining).toBe(1);
    // Cancellation restores the offered seat without freeing the advertised calendar.
    await as(admin);
    await expect(
      cmd("admin.solo.confirm", { id: pending, walker_id: walker }),
    ).rejects.toThrow("冲突");
    await as(walker);
    await cmd("walk.withdraw", { id: publication });
    expect(await cmd("walk.withdraw", { id: publication })).toBe(publication);
    expect((await feed()).some((p) => p.id === publication)).toBe(false);
    await as(owner);
    await expect(
      cmd("solo.book", { slot_id: publishedSlot, dog_id: dog, duration: 30 }),
    ).rejects.toThrow("不可预约");
    await as(admin);
    await cmd("admin.solo.confirm", { id: pending, walker_id: walker });
    await as(walker);
    await expect(cmd("walk.publish", offer)).rejects.toThrow("冲突");
  });
  it("publishes Pack activities with existing membership approval and shared inventory", async () => {
    await as(walker);
    packPublication = await cmd("walk.publish", {
      ...offer,
      kind: "pack",
      pack_id: pack,
      capacity: 1,
      start_at: new Date(Date.now() + 32 * 86400000).toISOString(),
      end_at: new Date(Date.now() + 32 * 86400000 + 3600000).toISOString(),
    });
    const item = (await feed()).find((p) => p.id === packPublication);
    publishedEvent = item.event_id;
    const approvedPack = (
      await db.query<any>("select * from public.packs where id=$1", [pack])
    ).rows[0];
    expect(item.data.location).toBe(approvedPack.location);
    await as(other);
    await expect(
      cmd("pack.book", { event_id: publishedEvent, dog_id: otherDog }),
    ).rejects.toThrow("人工审核");
    await as(owner);
    const booking = await cmd("pack.book", {
      event_id: publishedEvent,
      dog_id: dog,
    });
    expect(
      await cmd("pack.book", { event_id: publishedEvent, dog_id: dog }),
    ).toBe(booking);
    expect((await feed()).find((p) => p.id === packPublication).remaining).toBe(
      0,
    );
    await as(walker);
    const tasks = (
      await db.query<any>(
        "select * from public.walk_tasks where pack_booking_id=$1",
        [booking],
      )
    ).rows;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].walker_id).toBe(walker);
    await expect(cmd("walk.withdraw", { id: packPublication })).rejects.toThrow(
      "已有预约",
    );
  });
  it("closes unbooked publications through admin controls and removes unavailable offers", async () => {
    await as(walker);
    const id = await cmd("walk.publish", {
      ...offer,
      start_at: new Date(Date.now() + 35 * 86400000).toISOString(),
      end_at: new Date(Date.now() + 35 * 86400000 + 3600000).toISOString(),
    });
    const item = (await feed()).find((p) => p.id === id);
    await as(admin);
    await cmd("admin.slot.close", { id: item.slot_id });
    expect((await feed()).some((p) => p.id === id)).toBe(false);
    expect(
      (
        await db.query(
          "select * from public.walker_reservations where publication_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    // Simulate account deactivation outside normal guarded operations.
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      walker,
    ]);
    await as(owner);
    expect((await feed()).some((p) => p.id === packPublication)).toBe(false);
    await expect(
      cmd("pack.book", { event_id: publishedEvent, dog_id: dog }),
    ).rejects.toThrow("不可预约");
    await db.exec("reset role");
    await db.query("update public.profiles set active=true where id=$1", [
      walker,
    ]);
    await as(owner);
    expect((await feed()).some((p) => p.id === packPublication)).toBe(true);
  });
  const secondWalker = "00000000-0000-4000-8000-000000000005";
  let request: string, requestSlot: string, requestTask: string;
  const requestData = {
    title: "周末帮忙遛狗",
    start_at: "2090-01-01T09:00:00Z",
    duration: 90,
    area: "湖边小区",
    handoff: "私密门牌 7 幢 202",
    public_notes: "希望慢慢走",
  };
  async function requests() {
    return (
      await db.query<{ items: any[] }>(
        "select public.list_walk_requests() items",
      )
    ).rows[0].items;
  }
  it("expands durations and validates owner-published requests", async () => {
    await db.exec("reset role");
    await db.query(`insert into auth.users values($1,'{"consent":true}')`, [
      secondWalker,
    ]);
    await db.query("update public.profiles set role='walker' where id=$1", [
      secondWalker,
    ]);
    await as(walker);
    expect(
      (
        await db.query<any>(
          "select data from public.settings where id='operations'",
        )
      ).rows[0].data.durations,
    ).toEqual([15, 30, 45, 60, 90, 120]);
    await expect(
      cmd("request.publish", { ...requestData, dog_id: dog }),
    ).rejects.toThrow("只有主人");
    await as(other);
    await expect(
      cmd("request.publish", { ...requestData, dog_id: dog }),
    ).rejects.toThrow("自己的狗狗");
    await as(owner);
    await expect(
      cmd("request.publish", {
        ...requestData,
        dog_id: dog,
        start_at: "2000-01-01",
      }),
    ).rejects.toThrow("未来");
    await expect(
      cmd("request.publish", { ...requestData, dog_id: dog, duration: 20 }),
    ).rejects.toThrow("时长");
    await expect(
      cmd("request.publish", { ...requestData, dog_id: dog, handoff: "" }),
    ).rejects.toThrow("交接地点");
    request = await cmd("request.publish", {
      ...requestData,
      dog_id: dog,
      owner_id: other,
    });
    expect(await cmd("request.publish", { ...requestData, dog_id: dog })).toBe(
      request,
    );
    const b = (
      await db.query<any>("select * from public.solo_bookings where id=$1", [
        request,
      ])
    ).rows[0];
    requestSlot = b.slot_id;
    expect(b.owner_id).toBe(owner);
    expect(b.status).toBe("requested");
    const slot = (
      await db.query<any>("select * from public.service_slots where id=$1", [
        requestSlot,
      ])
    ).rows[0];
    expect(+new Date(slot.end_at) - +new Date(slot.start_at)).toBe(90 * 60000);
    await expect(
      cmd("request.publish", {
        ...requestData,
        dog_id: dog,
        start_at: "2090-01-01T09:30:00Z",
      }),
    ).rejects.toThrow("已有需求或预约");
    expect(await requests()).toEqual([]);
  });
  it("exposes only public request details to walkers and blocks booking-slot reuse", async () => {
    await as(walker);
    const item = (await requests()).find((r) => r.id === request);
    expect(item.data.duration).toBe(90);
    expect(item.data.area).toBe("湖边小区");
    expect(JSON.stringify(item)).not.toContain("私密门牌");
    expect(JSON.stringify(item)).not.toContain(dogData.emergency_phone);
    expect(item.owner_id).toBeUndefined();
    expect(item.dog_id).toBeUndefined();
    expect(
      (
        await db.query("select * from public.solo_bookings where id=$1", [
          request,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      JSON.stringify(
        (
          await db.query("select * from public.service_slots where id=$1", [
            requestSlot,
          ])
        ).rows,
      ),
    ).not.toContain("私密门牌");
    await as(other);
    await expect(
      cmd("solo.book", {
        dog_id: otherDog,
        slot_id: requestSlot,
        duration: 30,
        handoff: "伪造",
      }),
    ).rejects.toThrow("仅支持");
    await expect(cmd("request.claim", { id: request })).rejects.toThrow(
      "遛狗师",
    );
    await as(admin);
    await expect(
      cmd("admin.event.create", { slot_id: requestSlot, pack_id: pack }),
    ).rejects.toThrow("仅支持");
    await expect(cmd("admin.slot.close", { id: requestSlot })).rejects.toThrow(
      "仅支持",
    );
  });
  it("allows exactly one walker to claim and unlocks the task brief after acceptance", async () => {
    await as(walker);
    expect(
      await cmd("request.claim", { id: request, walker_id: secondWalker }),
    ).toBe(request);
    expect(await cmd("request.claim", { id: request })).toBe(request);
    const tasks = (
      await db.query<any>("select * from public.walk_tasks where solo_id=$1", [
        request,
      ])
    ).rows;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].walker_id).toBe(walker);
    expect(tasks[0].status).toBe("accepted");
    requestTask = tasks[0].id;
    const brief = (
      await db.query<any>("select public.task_brief($1) result", [requestTask])
    ).rows[0].result;
    expect(brief.handoff).toBe(requestData.handoff);
    expect(brief.duration).toBe(90);
    expect(brief.notes).toBe(requestData.public_notes);
    expect((await requests()).some((r) => r.id === request)).toBe(false);
    await as(secondWalker);
    await expect(cmd("request.claim", { id: request })).rejects.toThrow(
      "已被接单",
    );
    await expect(
      db.query("select public.task_brief($1)", [requestTask]),
    ).rejects.toThrow("无权");
    await as(owner);
    const b = (
      await db.query<any>("select * from public.solo_bookings where id=$1", [
        request,
      ])
    ).rows[0];
    expect(b.status).toBe("confirmed");
    expect(b.walker_id).toBe(walker);
    await cmd("solo.cancel", { id: request, reason: "更改计划" });
    await as(walker);
    expect(
      (
        await db.query<any>(
          "select status from public.walk_tasks where id=$1",
          [requestTask],
        )
      ).rows[0].status,
    ).toBe("cancelled");
    await as(admin);
    expect(
      (
        await db.query(
          "select * from public.walker_reservations where solo_id=$1",
          [request],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects claims overlapping published availability and succeeds after that offer is withdrawn", async () => {
    await as(owner);
    const id = await cmd("request.publish", {
      ...requestData,
      dog_id: dog,
      start_at: "2090-02-01T09:00:00Z",
      duration: 120,
    });
    await as(walker);
    const offer = await cmd("walk.publish", {
      kind: "solo",
      title: "已发布空闲时段",
      location: "公园",
      start_at: "2090-02-01T09:30:00Z",
      end_at: "2090-02-01T10:30:00Z",
    });
    await expect(cmd("request.claim", { id })).rejects.toThrow("冲突");
    expect((await requests()).some((r) => r.id === id)).toBe(true);
    await cmd("walk.withdraw", { id: offer });
    await cmd("request.claim", { id });
    await expect(
      cmd("walk.publish", {
        kind: "solo",
        title: "冲突时段",
        location: "公园",
        start_at: "2090-02-01T10:45:00Z",
        end_at: "2090-02-01T11:15:00Z",
      }),
    ).rejects.toThrow("冲突");
    await as(owner);
    await cmd("solo.cancel", { id, reason: "取消测试" });
  });
  it("lets owners withdraw unclaimed near-term requests and hides expired or unavailable requests", async () => {
    await as(owner);
    const id = await cmd("request.publish", {
      ...requestData,
      dog_id: dog,
      start_at: new Date(Date.now() + 3600000).toISOString(),
      duration: 15,
    });
    await as(other);
    await expect(cmd("solo.cancel", { id, reason: "越权" })).rejects.toThrow(
      "无权",
    );
    await as(owner);
    await cmd("solo.cancel", { id, reason: "无需散步" });
    await as(walker);
    await expect(cmd("request.claim", { id })).rejects.toThrow("取消或过期");
    expect((await requests()).some((r) => r.id === id)).toBe(false);
    await as(owner);
    const exp = await cmd("request.publish", {
      ...requestData,
      dog_id: dog,
      start_at: "2090-03-01T09:00:00Z",
      duration: 45,
    });
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      owner,
    ]);
    await as(walker);
    expect((await requests()).some((r) => r.id === exp)).toBe(false);
    await expect(cmd("request.claim", { id: exp })).rejects.toThrow(
      "账号已不可用",
    );
    await db.exec("reset role");
    await db.query("update public.profiles set active=true where id=$1", [
      owner,
    ]);
    await db.query(
      "update public.service_slots set start_at=now()-interval '1 hour',end_at=now()-interval '15 minutes' where id=(select slot_id from public.solo_bookings where id=$1)",
      [exp],
    );
    await as(walker);
    expect((await requests()).some((r) => r.id === exp)).toBe(false);
    await expect(cmd("request.claim", { id: exp })).rejects.toThrow("过期");
    await as(admin);
    await expect(
      cmd("admin.solo.confirm", { id: exp, walker_id: walker }),
    ).rejects.toThrow("过期");
    await as(owner);
    await cmd("solo.cancel", { id: exp, reason: "过期清理" });
  });
  it("honors expanded durations for ordinary bookings while enforcing slot length", async () => {
    await as(admin);
    const slot = await cmd("admin.slot.create", {
      start_at: "2090-04-01T09:00:00Z",
      end_at: "2090-04-01T09:45:00Z",
      capacity: 1,
    });
    await as(owner);
    await expect(
      cmd("solo.book", {
        dog_id: dog,
        slot_id: slot,
        duration: 90,
        handoff: "门口",
      }),
    ).rejects.toThrow("时长");
    const id = await cmd("solo.book", {
      dog_id: dog,
      slot_id: slot,
      duration: 45,
      handoff: "门口",
    });
    expect(id).toBeTruthy();
    await expect(
      db.query("select public.command_v2('request.claim','{}')"),
    ).rejects.toThrow("permission");
    await expect(
      db.query("select public.task_brief_v1($1)", [requestTask]),
    ).rejects.toThrow("permission");
  });
  it("does not expose private helper functions or anonymous commands", async () => {
    await as(owner);
    await expect(
      db.query("select public.notify($1,$2,$3)", [other, "fake", dog]),
    ).rejects.toThrow("permission");
    await db.exec("reset role; set role anon");
    await expect(
      db.query("select public.list_walk_requests()"),
    ).rejects.toThrow("permission");
    await expect(
      db.query("select public.list_walk_activities()"),
    ).rejects.toThrow("permission");
    await expect(cmd("dog.save", { data: dogData })).rejects.toThrow(
      "permission",
    );
  });

  it("stores the exact official PawStyle question bank and all 56 answers without scores", async () => {
    const bank = JSON.parse(
      readFileSync("apps/mobile/src/pawstyle/questionnaire.json", "utf8"),
    );
    await as(owner);
    const stored = (
      await db.query<any>("select data from public.pawstyle_questionnaires")
    ).rows[0].data;
    expect(stored).toEqual(bank);
    const answers: Record<string, any> = {};
    for (const section of bank.sections)
      for (const q of section.questions) {
        answers[q.id] = {
          value:
            section.id === "D"
              ? "X"
              : q.type === "multiple"
                ? [q.options[0], q.options[1]]
                : q.options[0],
        };
      }
    answers.B5 = { value: ["召回", "其他"], text: "转圈" };
    answers.B6 = { value: "有，请说明", text: "近期搬家" };
    answers.S2.text = "玩具旁";
    answers.S4.text = "昨天门口";
    answers.S5.text = "无活动限制";
    const privateDog = await cmd("dog.save", {
      data: { ...dogData, nickname: "问卷狗狗" },
    });
    const before = (
      await db.query<any>("select count(*) from public.assessment_scores")
    ).rows[0].count;
    const payload = {
      dog_id: privateDog,
      version: bank.version,
      answers,
      position: 55,
      expected_revision: 0,
    };
    const save = async (p: any) =>
      (
        await db.query<any>("select public.save_pawstyle($1) result", [
          JSON.stringify(p),
        ])
      ).rows[0].result;
    const first = await save(payload);
    expect(first.revision).toBe(1);
    const row = (
      await db.query<any>(
        "select * from public.pawstyle_responses where id=$1",
        [first.id],
      )
    ).rows[0];
    expect(row.answers).toEqual(answers);
    expect(Object.keys(row.answers)).toHaveLength(56);
    expect(row.position).toBe(55);
    const updated = await save({
      ...payload,
      expected_revision: 1,
      answers: { D1: { value: 5 } },
      position: 6,
    });
    expect(updated.id).toBe(first.id);
    expect(updated.revision).toBe(2);
    await expect(save({ ...payload, expected_revision: 1 })).rejects.toThrow(
      "更新的草稿",
    );
    expect(
      (await db.query<any>("select count(*) from public.assessment_scores"))
        .rows[0].count,
    ).toBe(before);
    await as(other);
    expect(
      (
        await db.query("select * from public.pawstyle_responses where id=$1", [
          first.id,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(save({ ...payload, expected_revision: 2 })).rejects.toThrow(
      "无权",
    );
    await as(walker);
    expect(
      (
        await db.query("select * from public.pawstyle_responses where id=$1", [
          first.id,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(save({ ...payload, expected_revision: 2 })).rejects.toThrow(
      "无权",
    );
    await as(owner);
    await expect(
      db.query(
        "update public.pawstyle_responses set answers='{}' where id=$1",
        [first.id],
      ),
    ).rejects.toThrow("permission denied");
  });
  it("validates PawStyle IDs, modes, core options, text rules and draft positions", async () => {
    await as(owner);
    const privateDog = await cmd("dog.save", { data: dogData });
    const payload = {
      dog_id: privateDog,
      version: "DOGO-DPQ-CN5-v0.1",
      answers: {},
      position: 0,
      expected_revision: 0,
    };
    const save = async (patch: any) =>
      db.query("select public.save_pawstyle($1)", [
        JSON.stringify({ ...payload, ...patch }),
      ]);
    for (const answers of [
      { D46: { value: 1 } },
      { D1: { value: 0 } },
      { D1: { value: "5" } },
      { D1: { value: [1] } },
      { B3: { value: "在家休息" } },
      { B3: { value: ["在家休息", "在家休息"] } },
      { B5: { value: ["不在题库"] } },
      { S3: { value: "未发现" } },
      { B1: { value: "少于1个月", text: "不可写" } },
      { B5: { value: ["召回"], text: "未选其他" } },
      { B6: { value: "没有", text: "不可写" } },
      { S2: { value: "有", text: "长".repeat(2001) } },
      { D1: { value: 1, score: 5 } },
    ])
      await expect(save({ answers })).rejects.toThrow();
    for (const position of [-1, 56, null])
      await expect(save({ position })).rejects.toThrow();
    await expect(save({ version: "unknown" })).rejects.toThrow("版本");
    await save({
      answers: {
        S2: { value: null, text: "先写场景" },
        B3: { value: [] },
        D1: { value: 1 },
        D2: { value: 2 },
        D3: { value: 3 },
        D4: { value: 4 },
        D5: { value: 5 },
        D6: { value: "X" },
      },
    });
    await db.exec("reset role; set role anon");
    await expect(save({})).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });

  it("matches server scoring to the supplied TypeScript reference across all profiles and missing values", async () => {
    await db.exec("reset role");
    // Quantize only for comparison of floating point representation, never for classification.
    const normalize = (value: any): any =>
      typeof value === "number"
        ? Number(value.toFixed(10))
        : Array.isArray(value)
          ? value.map(normalize)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, normalize(v)]),
              )
            : value;
    for (const core of [
      ...Object.values(samples),
      {},
      { D1: 1, D17: null },
      ...Array.from({ length: 25 }, (_, seed) =>
        Object.fromEntries(
          Array.from({ length: 45 }, (_, i) => [
            `D${i + 1}`,
            (i + seed) % 11 === 0 ? "X" : ((i * 7 + seed) % 5) + 1,
          ]),
        ),
      ),
    ]) {
      const result = (
        await db.query<any>("select public.score_pawstyle_core($1) result", [
          JSON.stringify(core),
        ])
      ).rows[0].result;
      expect(normalize(result)).toEqual(normalize(scorePawStyle(core)));
    }
  });
  it("keeps immutable repeat-test results with raw B/S answers, rejects forged scores and isolates owners", async () => {
    await as(owner);
    const privateDog = await cmd("dog.save", { data: dogData });
    const answers: any = Object.fromEntries(
      Object.entries(samples.example).map(([id, value]) => [id, { value }]),
    );
    Object.assign(answers, {
      B6: { value: "有，请说明", text: "搬家" },
      S1: { value: "造成伤口" },
      S3: { value: ["突然靠近", "多只同时出现"] },
      S2: { value: "有", text: "食盆附近" },
    });
    const save = async (a: any, revision: number) =>
      (
        await db.query<any>("select public.save_pawstyle($1) result", [
          JSON.stringify({
            dog_id: privateDog,
            version: "DOGO-DPQ-CN5-v0.1",
            answers: a,
            position: 55,
            expected_revision: revision,
          }),
        ])
      ).rows[0].result;
    const draft = await save(answers, 0);
    const submit = async (id: string, revision: number) =>
      (
        await db.query<any>("select public.submit_pawstyle($1) result", [
          JSON.stringify({
            response_id: id,
            expected_revision: revision,
            result: { style: { code: "CL" } },
          }),
        ])
      ).rows[0].result;
    const first = await submit(draft.id, 1);
    expect(await submit(draft.id, 1)).toEqual(first);
    const rows = async () =>
      (
        await db.query<any>(
          "select * from public.pawstyle_results where dog_id=$1 order by response_revision",
          [privateDog],
        )
      ).rows;
    expect((await rows())[0].raw_answers).toEqual(answers);
    expect((await rows())[0].result.style.code).toBe("EP");
    const next = { ...answers, D17: { value: "X" } };
    await save(next, 1);
    await submit(draft.id, 2);
    const records = await rows();
    expect(records).toHaveLength(2);
    expect(records[0].raw_answers).toEqual(answers);
    expect(records[0].result.style.code).toBe("EP");
    expect(records[1].result.style.status).toBe("pending");
    await expect(submit(draft.id, 1)).rejects.toThrow("已经更新");
    await expect(
      db.query(
        "update public.pawstyle_results set raw_answers='{}' where id=$1",
        [first.id],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("delete from public.pawstyle_results where id=$1", [first.id]),
    ).rejects.toThrow("permission denied");
    for (const who of [other, walker]) {
      await as(who);
      expect(await rows()).toHaveLength(0);
      await expect(submit(draft.id, 2)).rejects.toThrow("无权");
    }
    await db.exec("reset role; set role anon");
    await expect(submit(draft.id, 2)).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
  it("archives only owned dogs, preserves assessment history and prevents future use", async () => {
    await as(owner);
    const id = await cmd("dog.save", { data: dogData });
    const payload = {
      dog_id: id,
      version: "DOGO-DPQ-CN5-v0.1",
      answers: { D1: { value: 3 } },
      position: 6,
      expected_revision: 0,
    };
    const draft = (
      await db.query<any>("select public.save_pawstyle($1) result", [
        JSON.stringify(payload),
      ])
    ).rows[0].result;
    await db.query("select public.submit_pawstyle($1)", [
      JSON.stringify({ response_id: draft.id, expected_revision: 1 }),
    ]);
    const remove = () => db.query("select public.delete_dog($1)", [id]);
    for (const who of [other, walker, admin]) {
      await as(who);
      await expect(remove()).rejects.toThrow();
    }
    await db.exec("reset role; set role anon");
    await expect(remove()).rejects.toThrow("permission denied");
    await db.exec("reset role");
    await db.query("update public.profiles set active=false where id=$1", [
      owner,
    ]);
    await as(owner);
    await expect(remove()).rejects.toThrow("主人权限");
    await db.exec("reset role");
    await db.query("update public.profiles set active=true where id=$1", [
      owner,
    ]);
    await as(owner);
    await remove();
    await remove(); // A retry is safe.
    expect(
      (
        await db.query<any>("select deleted_at from public.dogs where id=$1", [
          id,
        ])
      ).rows[0].deleted_at,
    ).toBeTruthy();
    await expect(cmd("dog.save", { id, data: dogData })).rejects.toThrow(
      "无权",
    );
    await expect(
      db.query("select public.save_pawstyle($1)", [
        JSON.stringify({ ...payload, expected_revision: 1 }),
      ]),
    ).rejects.toThrow("无权");
    await expect(
      cmd("solo.book", {
        dog_id: id,
        slot_id: slot,
        duration: 30,
        handoff: "入口",
      }),
    ).rejects.toThrow();
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select * from public.pawstyle_results where dog_id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.audit_logs where resource_id=$1 and action='dog.delete'",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "insert into public.solo_bookings(owner_id,dog_id,slot_id,data) values($1,$2,$3,'{}')",
        [owner, id, slot],
      ),
    ).rejects.toThrow("已删除");
    await expect(
      db.query(
        "insert into public.pack_applications(owner_id,dog_id,pack_id) values($1,$2,$3)",
        [owner, id, pack],
      ),
    ).rejects.toThrow("已删除");
  });
  it("blocks removal for active Solo, Pack and tasks while preserving completed services", async () => {
    await as(owner);
    const id = await cmd("dog.save", { data: dogData });
    await db.exec("reset role");
    const soloId = (
      await db.query<any>(
        "insert into public.solo_bookings(owner_id,dog_id,slot_id,data) values($1,$2,$3,'{}') returning id",
        [owner, id, slot],
      )
    ).rows[0].id;
    const remove = () => db.query("select public.delete_dog($1)", [id]);
    const blocked = async () => {
      await as(owner);
      await expect(remove()).rejects.toThrow("未完成");
      await db.exec("reset role");
    };
    await blocked();
    await db.query(
      "update public.solo_bookings set status='completed' where id=$1",
      [soloId],
    );
    const taskId = (
      await db.query<any>(
        "insert into public.walk_tasks(owner_id,dog_id,walker_id,solo_id) values($1,$2,$3,$4) returning id",
        [owner, id, walker, soloId],
      )
    ).rows[0].id;
    await blocked();
    await db.query(
      "update public.walk_tasks set status='reported' where id=$1",
      [taskId],
    );
    const appId = (
      await db.query<any>(
        "insert into public.pack_applications(owner_id,dog_id,pack_id) values($1,$2,$3) returning id",
        [owner, id, pack],
      )
    ).rows[0].id;
    const member = (
      await db.query<any>(
        "insert into public.pack_memberships(owner_id,dog_id,pack_id,application_id) values($1,$2,$3,$4) returning id",
        [owner, id, pack, appId],
      )
    ).rows[0].id;
    const booking = (
      await db.query<any>(
        "insert into public.pack_event_bookings(owner_id,dog_id,event_id,membership_id) values($1,$2,$3,$4) returning id",
        [owner, id, event, member],
      )
    ).rows[0].id;
    await blocked();
    await db.query(
      "update public.pack_event_bookings set status='cancelled' where id=$1",
      [booking],
    );
    await as(owner);
    await remove();
    expect(
      (
        await db.query<any>(
          "select status from public.pack_applications where id=$1",
          [appId],
        )
      ).rows[0].status,
    ).toBe("rejected");
    expect(
      (
        await db.query("select * from public.solo_bookings where id=$1", [
          soloId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.walk_tasks where id=$1", [taskId]))
        .rows,
    ).toHaveLength(1);
    await db.exec("reset role");
  });
});
