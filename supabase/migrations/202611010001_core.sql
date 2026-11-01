-- All privileged writes enter command(); clients receive read-only RLS access.
create table public.profiles(id uuid primary key references auth.users(id), display_name text not null, role text not null default 'owner' check(role in ('owner','walker','admin')), active boolean not null default true, consent_at timestamptz not null default now(), terms_version text not null default '2026-11');
create function public.on_signup() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if coalesce(new.raw_user_meta_data->>'consent','') <> 'true' then raise exception '请先同意服务条款与隐私说明'; end if;
  insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'DOGO 用户')); return new;
end $$;
create trigger dogo_signup after insert on auth.users for each row execute function public.on_signup();
create table public.dogs(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, data jsonb not null, created_at timestamptz not null default now());
create table public.questionnaire_definitions(id uuid primary key default gen_random_uuid(), version text unique not null, data jsonb not null, active boolean not null default false);
create table public.assessment_sessions(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, definition_id uuid not null references public.questionnaire_definitions, status text not null default 'draft' check(status in ('draft','submitted')), data jsonb not null default '{}', created_at timestamptz not null default now(), submitted_at timestamptz);
create table public.assessment_scores(id uuid primary key references public.assessment_sessions, owner_id uuid not null references public.profiles, data jsonb not null);
create table public.service_slots(id uuid primary key default gen_random_uuid(), start_at timestamptz not null, end_at timestamptz not null, capacity int not null default 1 check(capacity>0), status text not null default 'open' check(status in ('open','closed')), data jsonb not null default '{}', check(end_at>start_at));
create table public.solo_bookings(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, slot_id uuid not null references public.service_slots, walker_id uuid references public.profiles, status text not null default 'requested' check(status in ('requested','confirmed','in_progress','completed','cancelled','incident_review')), data jsonb not null, created_at timestamptz not null default now());
create unique index solo_dog_slot on public.solo_bookings(dog_id,slot_id) where status<>'cancelled';
create table public.packs(id uuid primary key default gen_random_uuid(), name text not null, location text not null, capacity int not null check(capacity between 1 and 20), lead_walker_id uuid not null references public.profiles, status text not null default 'open' check(status in ('open','closed')), data jsonb not null default '{}');
create table public.pack_applications(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, pack_id uuid not null references public.packs, status text not null default 'submitted' check(status in ('submitted','safety_review','intro_scheduled','approved','rejected','needs_more_info')), data jsonb not null default '{}', created_at timestamptz not null default now());
create unique index active_application on public.pack_applications(dog_id,pack_id) where status<>'rejected';
create table public.intro_meetings(id uuid primary key default gen_random_uuid(), application_id uuid not null references public.pack_applications, owner_id uuid not null references public.profiles, data jsonb not null, created_at timestamptz not null default now());
create table public.pack_memberships(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, pack_id uuid not null references public.packs, application_id uuid unique not null references public.pack_applications, unique(dog_id,pack_id));
create table public.pack_events(id uuid primary key default gen_random_uuid(), pack_id uuid not null references public.packs, slot_id uuid unique not null references public.service_slots, capacity int not null check(capacity>0), status text not null default 'open' check(status in ('open','closed')));
create table public.pack_event_bookings(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, event_id uuid not null references public.pack_events, membership_id uuid not null references public.pack_memberships, status text not null default 'confirmed' check(status in ('confirmed','in_progress','completed','cancelled')), created_at timestamptz not null default now(), unique(event_id,membership_id));
create table public.walk_tasks(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, walker_id uuid not null references public.profiles, solo_id uuid unique references public.solo_bookings, pack_booking_id uuid unique references public.pack_event_bookings, status text not null default 'assigned' check(status in ('assigned','accepted','picked_up','walking','returned','reported','cancelled')), data jsonb not null default '{}', check(num_nonnulls(solo_id,pack_booking_id)=1));
-- A calendar reservation belongs to one solo booking or one whole pack event.
create table public.walker_reservations(id uuid primary key default gen_random_uuid(), walker_id uuid not null references public.profiles, slot_id uuid not null references public.service_slots, solo_id uuid unique references public.solo_bookings, event_id uuid unique references public.pack_events, check(num_nonnulls(solo_id,event_id)=1));
create table public.handoff_records(id uuid primary key default gen_random_uuid(), task_id uuid not null references public.walk_tasks, owner_id uuid not null references public.profiles, walker_id uuid not null references public.profiles, action text not null check(action in ('picked_up','returned')), actor_id uuid not null references public.profiles, data jsonb not null, created_at timestamptz not null default now(), unique(task_id,action,actor_id));
create table public.walk_reports(id uuid primary key default gen_random_uuid(), task_id uuid unique not null references public.walk_tasks, owner_id uuid not null references public.profiles, walker_id uuid not null references public.profiles, data jsonb not null, created_at timestamptz not null default now());
create table public.report_corrections(id uuid primary key default gen_random_uuid(), report_id uuid not null references public.walk_reports, owner_id uuid not null references public.profiles, walker_id uuid not null references public.profiles, data jsonb not null, created_at timestamptz not null default now());
create table public.behavior_incidents(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, dog_id uuid not null references public.dogs, task_id uuid references public.walk_tasks, status text not null default 'open' check(status in ('open','under_review','resolved')), data jsonb not null, created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, data jsonb not null, read_at timestamptz, created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles, action text not null, resource_id uuid, data jsonb not null default '{}', created_at timestamptz not null default now());
create table public.privacy_requests(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, data jsonb not null, status text not null default 'open', created_at timestamptz not null default now());
create table public.settings(id text primary key, data jsonb not null);
insert into public.settings values('operations','{"durations":[30,60],"cancel_hours":2,"area":"试点服务区","emergency":"遇紧急情况先联系主人与当地急救/兽医，再报告运营负责人。"}');

create function public.current_role() returns text language sql stable security definer set search_path='' as $$ select role from public.profiles where id=auth.uid() and active $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(public.current_role()='admin',false) $$;
create function public.is_active() returns boolean language sql stable security definer set search_path='' as $$ select public.current_role() is not null $$;
create function public.owns_dog(d uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.dogs where id=d and owner_id=auth.uid()) and public.is_active() $$;

do $$ declare t text; begin
  foreach t in array array['profiles','dogs','questionnaire_definitions','assessment_sessions','assessment_scores','service_slots','solo_bookings','packs','pack_applications','intro_meetings','pack_memberships','pack_events','pack_event_bookings','walk_tasks','walker_reservations','handoff_records','walk_reports','report_corrections','behavior_incidents','notifications','audit_logs','privacy_requests','settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy admin_read on public.%I for select to authenticated using(public.is_admin())',t);
  end loop;
  foreach t in array array['dogs','assessment_sessions','assessment_scores','solo_bookings','pack_applications','intro_meetings','pack_memberships','pack_event_bookings','walk_tasks','handoff_records','walk_reports','report_corrections','behavior_incidents','notifications','privacy_requests'] loop
    execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=auth.uid() and public.is_active())',t);
  end loop;
  foreach t in array array['walk_tasks','handoff_records','walk_reports','report_corrections'] loop
    execute format('create policy walker_read on public.%I for select to authenticated using(walker_id=auth.uid() and public.current_role()=''walker'')',t);
  end loop;
  foreach t in array array['service_slots','packs','pack_events','settings'] loop
    execute format('create policy authenticated_read on public.%I for select to authenticated using(public.is_active())',t);
  end loop;
end $$;
create policy self_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy active_questionnaire on public.questionnaire_definitions for select to authenticated using(active and public.is_active());
grant select on all tables in schema public to authenticated;

-- Full raw assessments and dog records are deliberately NOT exposed to walkers.
create function public.task_brief(task uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare t public.walk_tasks; d public.dogs; begin
 select * into t from public.walk_tasks where id=task;
 if t.id is null or not public.is_active() or not (t.walker_id=auth.uid() or t.owner_id=auth.uid() or public.is_admin()) then raise exception '无权查看任务'; end if;
 select * into d from public.dogs where id=t.dog_id;
 return jsonb_build_object('nickname',d.data->'nickname','weight',d.data->'weight','health',d.data->'health','gear',d.data->'gear','emergency_name',d.data->'emergency_name','emergency_phone',d.data->'emergency_phone','handoff',coalesce((select data->'handoff' from public.solo_bookings where id=t.solo_id),(select to_jsonb(p.location) from public.pack_event_bookings b join public.pack_events e on e.id=b.event_id join public.packs p on p.id=e.pack_id where b.id=t.pack_booking_id)));
end $$;

create function public.ti_score(a jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare groups int[][] := array[[1,6,27],[3,11,22],[13,21,42],[16,35,44],[7,18,40],[25,30,36],[15,31,41],[9,17,33],[4,14,24],[20,26,37],[29,38,43],[5,10,32],[2,19,34],[8,23,39],[12,28,45]]; rev int[]:=array[1,4,9,10,11,18,19,22,26,28,29,34,38,41]; vals numeric[]:='{}'; factors jsonb:='{}'; item int; i int; j int; v text; total numeric; missing boolean; e numeric; p numeric; sty text; count_valid int:=0; bounds int[][]:=array[[1,4],[5,6],[7,10],[11,12],[13,15]];
begin
 for i in 1..45 loop
  v:=a->>('D'||i); if v is not null and v not in ('1','2','3','4','5','X') then raise exception '无效答案'; end if;
  if v in ('1','2','3','4','5') then count_valid:=count_valid+1; end if;
 end loop;
 for i in 1..15 loop total:=0; missing:=false;
  for j in 1..3 loop item:=groups[i][j]; v:=a->>('D'||item);
   if v is null or v='X' then missing:=true; else total:=total+case when item=any(rev) then 6-v::numeric else v::numeric end; end if;
  end loop;
  vals:=array_append(vals,case when missing then null else total/3 end);
 end loop;
 for i in 1..5 loop total:=0; missing:=false;
  for j in bounds[i][1]..bounds[i][2] loop if vals[j] is null then missing:=true; else total:=total+vals[j]; end if; end loop;
  factors:=factors||jsonb_build_object('F'||i,case when missing then null else total/(bounds[i][2]-bounds[i][1]+1) end);
 end loop;
 e:=vals[7]; p:=vals[8]; sty:=case when e is null or p is null then '待补充' when e=3 or p=3 then '混合倾向' else (case when e>3 then 'E' else 'C' end)||(case when p>3 then 'P' else 'L' end) end;
 return jsonb_build_object('facets',vals,'factors',factors,'E',e,'P',p,'style',sty,'validCount',count_valid,'scoringVersion','dogo-ti-v4.0-1');
end $$;

create function public.notify(recipient uuid, title text, resource uuid) returns void language sql security definer set search_path='' as $$ insert into public.notifications(owner_id,data) values(recipient,jsonb_build_object('title',title,'resource_id',resource)) $$;
create function public.reserve_walker(w uuid, s uuid, solo uuid, event uuid) returns void language plpgsql security definer set search_path='' as $$ declare slot public.service_slots; begin
 perform 1 from public.profiles where id=w and role='walker' and active for update;
 if not found then raise exception '请选择已审核的遛狗师'; end if;
 select * into strict slot from public.service_slots where id=s;
 if exists(select 1 from public.walker_reservations r join public.service_slots x on x.id=r.slot_id where r.walker_id=w and x.start_at<slot.end_at and x.end_at>slot.start_at) then raise exception '遛狗师时段冲突'; end if;
 insert into public.walker_reservations(walker_id,slot_id,solo_id,event_id) values(w,s,solo,event);
end $$;
