import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export type Row = {
  id: string;
  owner_id?: string;
  dog_id?: string;
  walker_id?: string;
  lead_walker_id?: string;
  slot_id?: string;
  pack_id?: string;
  event_id?: string;
  application_id?: string;
  task_id?: string;
  solo_id?: string;
  pack_booking_id?: string;
  status?: string;
  name?: string;
  location?: string;
  capacity?: number;
  remaining?: number;
  kind?: "solo" | "pack";
  start_at?: string;
  end_at?: string;
  created_at?: string;
  submitted_at?: string;
  read_at?: string;
  role?: string;
  display_name?: string;
  active?: boolean;
  version?: string;
  data: Record<string, any>;
};
export const labels: Record<string, string> = {
  requested: "待确认",
  confirmed: "已确认",
  in_progress: "服务中",
  completed: "已完成",
  cancelled: "已取消",
  submitted: "已提交",
  safety_review: "安全审核中",
  intro_scheduled: "已安排首次见面",
  approved: "已批准",
  rejected: "未通过",
  needs_more_info: "待补充",
  assigned: "待接单",
  accepted: "已接单",
  picked_up: "已接狗",
  walking: "散步中",
  returned: "已归还",
  reported: "报告已提交",
  open: "待处理",
  under_review: "处理中",
  resolved: "已解决",
  draft: "草稿",
  owner: "主人",
  walker: "遛狗师",
  admin: "管理员",
};
export const tables = [
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
] as const;
export type Store = Record<
  (typeof tables)[number] | "walk_activities" | "walk_requests",
  Row[]
>;
export const emptyStore = () =>
  Object.fromEntries(
    [...tables, "walk_activities", "walk_requests"].map((t) => [t, []]),
  ) as unknown as Store;
export function client(
  url?: string,
  key?: string,
  storage?: any,
): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !storage,
      ...(storage ? { storage } : {}),
    },
  });
}
export async function snapshot(api: SupabaseClient): Promise<Store> {
  const results = await Promise.all(
    tables.map(async (table) => {
      const { data, error } = await api.from(table).select("*");
      if (error) throw new Error(error.message);
      return [table, data ?? []];
    }),
  );
  const { data: activities, error } = await api.rpc("list_walk_activities");
  if (error) throw new Error(error.message);
  const { data: requests, error: requestError } =
    await api.rpc("list_walk_requests");
  if (requestError) throw new Error(requestError.message);
  return {
    ...Object.fromEntries(results),
    walk_activities: activities ?? [],
    walk_requests: requests ?? [],
  } as Store;
}
export async function command(
  api: SupabaseClient | null,
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!api) throw new Error("请先配置 Supabase 开发环境");
  const { data, error } = await api.rpc("command", { action, payload });
  if (error) throw new Error(error.message);
  return data as { id: string };
}
export const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "待安排";
export const dogName = (store: Store, id?: string) =>
  store.dogs.find((d) => d.id === id)?.data.nickname ?? "狗狗";
