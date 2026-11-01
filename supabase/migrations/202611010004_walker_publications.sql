-- Walker-owned offers reuse existing slots, bookings, Pack approvals and tasks.
create table public.walk_publications (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references public.profiles,
  slot_id uuid unique not null references public.service_slots,
  pack_id uuid references public.packs,
  event_id uuid unique references public.pack_events,
  kind text not null check (kind in ('solo','pack')),
  status text not null default 'published' check (status in ('published','withdrawn')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  check ((kind='solo' and pack_id is null and event_id is null) or
         (kind='pack' and pack_id is not null and event_id is not null))
);
alter table public.walk_publications enable row level security;
create policy publication_owner_read on public.walk_publications for select to authenticated
  using (public.is_admin() or (walker_id=auth.uid() and public.current_role()='walker'));
grant select on public.walk_publications to authenticated;

-- A published Solo slot reserves its walker even before an owner books it.
alter table public.walker_reservations add column publication_id uuid unique references public.walk_publications;
alter table public.walker_reservations drop constraint walker_reservations_check;
alter table public.walker_reservations add constraint walker_reservations_source_check
  check (num_nonnulls(solo_id,event_id,publication_id)=1);

create function public.list_walk_activities() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by start_at),'[]'::jsonb) from (
  select s.start_at, jsonb_build_object(
    'id',p.id,'slot_id',s.id,'walker_id',p.walker_id,'pack_id',p.pack_id,'event_id',p.event_id,
    'kind',p.kind,'status',p.status,'start_at',s.start_at,'end_at',s.end_at,
    'capacity',case when p.kind='solo' then s.capacity else least(e.capacity,k.capacity) end,
    'remaining',greatest(0,case when p.kind='solo' then s.capacity-(select count(*) from public.solo_bookings b where b.slot_id=s.id and b.status<>'cancelled')
      else least(e.capacity,k.capacity)-(select count(*) from public.pack_event_bookings b where b.event_id=e.id and b.status<>'cancelled') end),
    'data',p.data||jsonb_build_object('walker_name',u.display_name)) item
  from public.walk_publications p join public.service_slots s on s.id=p.slot_id
  join public.profiles u on u.id=p.walker_id
  left join public.pack_events e on e.id=p.event_id left join public.packs k on k.id=p.pack_id
  where public.is_active() and p.status='published' and s.status='open' and s.start_at>now()
    and u.active and u.role='walker' and (p.kind='solo' or (e.status='open' and k.status='open'))
 ) available;
$$;

-- Keep the previous dispatcher private. Existing clients keep the same public RPC.
alter function public.command(text,jsonb) rename to command_v1;
revoke execute on function public.command_v1(text,jsonb) from public,anon,authenticated;
create function public.command(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); actor_role text:=public.current_role();
  publication public.walk_publications; slot public.service_slots; pack public.packs;
  new_slot uuid; new_event uuid; result jsonb; booking public.solo_bookings;
  starts timestamptz; ends timestamptz; kind text; title text; location text; capacity int;
begin
  if uid is null or actor_role is null then raise exception '请登录有效账户'; end if;
  if action='walk.publish' then
    if actor_role<>'walker' then raise exception '只有已审核的遛狗师可以发布'; end if;
    kind:=payload->>'kind'; title:=trim(coalesce(payload->>'title','')); location:=trim(coalesce(payload->>'location',''));
    starts:=(payload->>'start_at')::timestamptz; ends:=(payload->>'end_at')::timestamptz;
    if kind is null or kind not in ('solo','pack') or title='' or (kind='solo' and location='') then raise exception '请填写服务类型、活动名称和集合地点'; end if;
    if starts is null or ends is null or starts<=now() or ends<=starts then raise exception '请选择有效的未来起止时间'; end if;
    if not exists(select 1 from public.settings o,jsonb_array_elements_text(o.data->'durations') d where o.id='operations' and d.value::int<=extract(epoch from(ends-starts))/60) then raise exception '时段短于允许的散步时长'; end if;
    -- Same walker row lock as reserve_walker(): prevents publication/assignment races.
    perform 1 from public.profiles where id=uid and active and role='walker' for update;
    if not found then raise exception '遛狗师账号不可用'; end if;
    if exists(select 1 from public.walker_reservations r join public.service_slots s on s.id=r.slot_id where r.walker_id=uid and s.start_at<ends and s.end_at>starts) then raise exception '与已有任务或已发布时段冲突'; end if;
    capacity:=1;
    if kind='pack' then
      select * into pack from public.packs where id=(payload->>'pack_id')::uuid and lead_walker_id=uid and status='open' for update;
      if pack.id is null then raise exception '只能为自己负责且开放的 Pack 发布活动'; end if;
      capacity:=coalesce((payload->>'capacity')::int,pack.capacity);
      if capacity<1 or capacity>pack.capacity then raise exception '活动名额不能超过 Pack 上限'; end if;
      -- The approved Pack meeting point is authoritative for task handoffs.
      location:=pack.location;
    end if;
    insert into public.service_slots(start_at,end_at,capacity,data)
      values(starts,ends,capacity,jsonb_build_object('label',location,'publisher_id',uid,'publication_kind',kind)) returning id into new_slot;
    if kind='pack' then
      insert into public.pack_events(pack_id,slot_id,capacity) values(pack.id,new_slot,capacity) returning id into new_event;
    end if;
    insert into public.walk_publications(walker_id,slot_id,pack_id,event_id,kind,data)
      values(uid,new_slot,pack.id,new_event,kind,jsonb_build_object('title',title,'location',location,'description',coalesce(payload->>'description','')))
      returning * into publication;
    insert into public.walker_reservations(walker_id,slot_id,event_id,publication_id)
      values(uid,new_slot,new_event,case when kind='solo' then publication.id else null end);
    insert into public.audit_logs(actor_id,action,resource_id,data) values(uid,action,publication.id,jsonb_build_object('kind',kind));
    return jsonb_build_object('id',publication.id);
  elsif action='walk.withdraw' then
    -- Lock slot first, same order as booking, to serialize withdrawal against booking.
    select * into publication from public.walk_publications where id=(payload->>'id')::uuid;
    if publication.id is null or not ((actor_role='walker' and publication.walker_id=uid) or actor_role='admin') then raise exception '只能撤回自己发布的时段'; end if;
    select * into slot from public.service_slots where id=publication.slot_id for update;
    select * into publication from public.walk_publications where id=publication.id for update;
    if publication.status='withdrawn' then return jsonb_build_object('id',publication.id); end if;
    if exists(select 1 from public.solo_bookings where slot_id=slot.id and status in ('requested','confirmed','in_progress','incident_review'))
      or exists(select 1 from public.pack_event_bookings where event_id=publication.event_id and status in ('confirmed','in_progress')) then raise exception '已有预约，不能直接撤回，请联系运营处理'; end if;
    update public.walk_publications set status='withdrawn' where id=publication.id;
    update public.service_slots set status='closed' where id=slot.id;
    update public.pack_events set status='closed' where id=publication.event_id;
    delete from public.walker_reservations where publication_id=publication.id or event_id=publication.event_id;
    insert into public.audit_logs(actor_id,action,resource_id) values(uid,action,publication.id);
    return jsonb_build_object('id',publication.id);
  elsif action='pack.book' then
    -- All activity bookings lock the slot before the event, matching withdrawal.
    select s.* into slot from public.service_slots s join public.pack_events e on e.slot_id=s.id where e.id=(payload->>'event_id')::uuid for update of s;
    select * into publication from public.walk_publications p where p.slot_id=slot.id;
    if publication.id is not null and (publication.status<>'published' or not exists(select 1 from public.profiles where id=publication.walker_id and role='walker' and active)) then raise exception '该遛狗师活动已不可预约'; end if;
    return public.command_v1(action,payload);
  elsif action='admin.slot.close' and actor_role='admin' then
    select * into publication from public.walk_publications p where p.slot_id=(payload->>'id')::uuid;
    if publication.id is not null then
      perform public.command('walk.withdraw',jsonb_build_object('id',publication.id));
      return jsonb_build_object('id',publication.slot_id);
    end if;
  elsif action='admin.event.create' and actor_role='admin' then
    if exists(select 1 from public.walk_publications p where p.slot_id=(payload->>'slot_id')::uuid) then raise exception '遛狗师发布的时段不能转为其他活动'; end if;
  elsif action='admin.profile.update' and actor_role='admin' then
    perform 1 from public.profiles where id=(payload->>'id')::uuid for update;
    if exists(select 1 from public.walk_publications p join public.service_slots s on s.id=p.slot_id where p.walker_id=(payload->>'id')::uuid and p.status='published' and s.end_at>now()) and (payload->>'role'<>'walker' or not (payload->>'active')::boolean) then raise exception '请先撤回该人员未结束的已发布时段'; end if;
  elsif action='solo.book' then
    select * into slot from public.service_slots where id=(payload->>'slot_id')::uuid for update;
    select * into publication from public.walk_publications p where p.slot_id=slot.id and p.kind='solo';
    if publication.id is not null then
      if publication.status<>'published' or not exists(select 1 from public.profiles where id=publication.walker_id and role='walker' and active) then raise exception '该遛狗师时段已不可预约'; end if;
      -- Always use the published handoff location; the owner can add care notes.
      payload:=payload||jsonb_build_object('handoff',publication.data->>'location');
    end if;
    result:=public.command_v1(action,payload);
    if publication.id is not null then
      select * into booking from public.solo_bookings where id=(result->>'id')::uuid for update;
      if booking.status='requested' then
        update public.solo_bookings set status='confirmed',walker_id=publication.walker_id where id=booking.id;
        insert into public.walk_tasks(owner_id,dog_id,walker_id,solo_id) values(booking.owner_id,booking.dog_id,publication.walker_id,booking.id);
        perform public.notify(booking.owner_id,'遛狗师发布时段预约成功',booking.id);
        perform public.notify(publication.walker_id,'你发布的时段收到新预约',booking.id);
        insert into public.audit_logs(actor_id,action,resource_id,data) values(uid,'solo.publication.confirm',booking.id,jsonb_build_object('walker_id',publication.walker_id));
      end if;
    end if;
    return result;
  end if;
  return public.command_v1(action,payload);
end $$;
revoke execute on function public.command(text,jsonb),public.list_walk_activities() from public,anon;
grant execute on function public.command(text,jsonb),public.list_walk_activities() to authenticated;
