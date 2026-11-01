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
  it("does not expose private helper functions or anonymous commands", async () => {
    await as(owner);
    await expect(
      db.query("select public.notify($1,$2,$3)", [other, "fake", dog]),
    ).rejects.toThrow("permission");
    await db.exec("reset role; set role anon");
    await expect(
      db.query("select public.list_walk_activities()"),
    ).rejects.toThrow("permission");
    await expect(cmd("dog.save", { data: dogData })).rejects.toThrow(
      "permission",
    );
  });
});
