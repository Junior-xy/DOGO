-- Expand the shipped defaults without overwriting custom operations settings.
update public.settings set data=jsonb_set(data,'{durations}','[15,30,45,60,90,120]'::jsonb)
where id='operations' and data->'durations'='[30,60]'::jsonb;

-- Demand discovery contains only explicitly public area/notes and basic dog facts.
-- Private handoff address and emergency contacts remain behind booking/task RLS.
create function public.list_walk_requests() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by start_at),'[]'::jsonb) from (
   select s.start_at, jsonb_build_object('id',b.id,'start_at',s.start_at,'end_at',s.end_at,
     'data',jsonb_build_object('title',b.data->'title','area',b.data->'area','duration',b.data->'duration',
       'public_notes',b.data->'public_notes','nickname',d.data->'nickname','breed',d.data->'breed','weight',d.data->'weight')) item
   from public.solo_bookings b join public.service_slots s on s.id=b.slot_id
   join public.dogs d on d.id=b.dog_id join public.profiles p on p.id=b.owner_id
   where public.current_role() in ('walker','admin') and b.data->>'source'='owner_request'
     and b.status='requested' and b.walker_id is null and s.status='open' and s.start_at>now() and p.active and p.role='owner'
 ) available;
$$;

alter function public.command(text,jsonb) rename to command_v2;
revoke execute on function public.command_v2(text,jsonb) from public,anon,authenticated;
create function public.command(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); actor_role text:=public.current_role();
 booking public.solo_bookings; slot public.service_slots;
 starts timestamptz; ends timestamptz; minutes int; dog uuid; new_slot uuid; result jsonb;
 title text:=trim(coalesce(payload->>'title','')); area text:=trim(coalesce(payload->>'area',''));
 handoff text:=trim(coalesce(payload->>'handoff','')); reason text:=trim(coalesce(payload->>'reason',''));
begin
 if uid is null or actor_role is null then raise exception '请登录有效账户'; end if;
 if action='request.publish' then
   if actor_role<>'owner' then raise exception '只有主人可以发布遛狗需求'; end if;
   dog:=(payload->>'dog_id')::uuid;
   perform 1 from public.dogs where id=dog and owner_id=uid for update;
   if not found then raise exception '请选择自己的狗狗'; end if;
   starts:=(payload->>'start_at')::timestamptz; minutes:=(payload->>'duration')::int;
   if starts is null or starts<=now() then raise exception '请选择未来的开始时间'; end if;
   if not exists(select 1 from public.settings s,jsonb_array_elements_text(s.data->'durations') d where s.id='operations' and d.value=minutes::text) then raise exception '请选择有效的散步时长'; end if;
   if title='' or area='' or handoff='' then raise exception '请填写需求标题、公开区域和详细交接地点'; end if;
   ends:=starts+make_interval(mins=>minutes);
   select b.* into booking from public.solo_bookings b join public.service_slots s on s.id=b.slot_id
     where b.dog_id=dog and b.data->>'source'='owner_request' and b.status<>'cancelled'
       and s.start_at=starts and b.data->>'duration'=minutes::text and b.data->>'title'=title
       and b.data->>'area'=area and b.data->>'handoff'=handoff and coalesce(b.data->>'public_notes','')=coalesce(payload->>'public_notes','');
   if booking.id is not null then return jsonb_build_object('id',booking.id); end if;
   if exists(select 1 from public.solo_bookings b join public.service_slots s on s.id=b.slot_id where b.dog_id=dog and b.status<>'cancelled' and s.start_at<ends and s.end_at>starts)
      or exists(select 1 from public.pack_event_bookings b join public.pack_events e on e.id=b.event_id join public.service_slots s on s.id=e.slot_id where b.dog_id=dog and b.status<>'cancelled' and s.start_at<ends and s.end_at>starts) then raise exception '狗狗在这个时间已有需求或预约'; end if;
   insert into public.service_slots(start_at,end_at,capacity,data) values(starts,ends,1,jsonb_build_object('source','owner_request','label',area)) returning id into new_slot;
   insert into public.solo_bookings(owner_id,dog_id,slot_id,data) values(uid,dog,new_slot,
     jsonb_build_object('source','owner_request','title',title,'area',area,'duration',minutes,'handoff',handoff,'public_notes',coalesce(payload->>'public_notes',''))) returning * into booking;
   insert into public.audit_logs(actor_id,action,resource_id) values(uid,action,booking.id);
   return jsonb_build_object('id',booking.id);
 elsif action='request.claim' then
   if actor_role<>'walker' then raise exception '只有已审核的遛狗师可以接单'; end if;
   -- One booking row serializes competing claims, owner cancellation and admin assignment.
   select * into booking from public.solo_bookings where id=(payload->>'id')::uuid for update;
   if booking.id is null or booking.data->>'source' is distinct from 'owner_request' then raise exception '需求不存在'; end if;
   if booking.walker_id=uid and booking.status in ('confirmed','in_progress','completed') then return jsonb_build_object('id',booking.id); end if;
   select * into slot from public.service_slots where id=booking.slot_id;
   if booking.status<>'requested' or booking.walker_id is not null or slot.status<>'open' or slot.start_at<=now() then raise exception '需求已被接单、取消或过期，请刷新列表'; end if;
   if not exists(select 1 from public.profiles where id=booking.owner_id and role='owner' and active) then raise exception '主人账号已不可用'; end if;
   perform public.reserve_walker(uid,slot.id,booking.id,null);
   update public.solo_bookings set status='confirmed',walker_id=uid where id=booking.id;
   insert into public.walk_tasks(owner_id,dog_id,walker_id,solo_id,status,data)
     values(booking.owner_id,booking.dog_id,uid,booking.id,'accepted',jsonb_build_object('accepted_at',now()));
   perform public.notify(booking.owner_id,'你的遛狗需求已被接单',booking.id);
   perform public.notify(uid,'接单成功，请查看任务交接资料',booking.id);
   insert into public.audit_logs(actor_id,action,resource_id) values(uid,action,booking.id);
   return jsonb_build_object('id',booking.id);
 elsif action='solo.cancel' then
   select * into booking from public.solo_bookings where id=(payload->>'id')::uuid for update;
   if booking.data->>'source'='owner_request' then
     if not (booking.owner_id=uid or actor_role='admin') then raise exception '无权取消'; end if;
     if reason='' then raise exception '请填写取消原因'; end if;
     if booking.status='cancelled' then return jsonb_build_object('id',booking.id); end if;
     if booking.status='requested' then
       update public.solo_bookings set status='cancelled',data=data||jsonb_build_object('cancel_reason',reason,'cancelled_at',now()) where id=booking.id;
       insert into public.audit_logs(actor_id,action,resource_id) values(uid,'request.withdraw',booking.id);
       perform public.notify(booking.owner_id,'遛狗需求已撤回',booking.id);
       result:=jsonb_build_object('id',booking.id);
     else result:=public.command_v2(action,payload); end if;
     update public.service_slots set status='closed' where id=booking.slot_id;
     return result;
   end if;
 elsif action in ('solo.book','admin.event.create','admin.slot.close') then
   select * into slot from public.service_slots where id=(case when action='admin.slot.close' then payload->>'id' else payload->>'slot_id' end)::uuid;
   if slot.data->>'source'='owner_request' then raise exception '主人需求仅支持遛狗师接单；如需关闭，请在订单中取消需求'; end if;
 elsif action='admin.solo.confirm' and actor_role='admin' then
   select * into booking from public.solo_bookings where id=(payload->>'id')::uuid for update;
   if booking.data->>'source'='owner_request' then
     select * into slot from public.service_slots where id=booking.slot_id;
     if slot.status<>'open' or slot.start_at<=now() or not exists(select 1 from public.profiles where id=booking.owner_id and role='owner' and active) then raise exception '需求已过期或不可用'; end if;
   end if;
 end if;
 return public.command_v2(action,payload);
end $$;
revoke execute on function public.command(text,jsonb),public.list_walk_requests() from public,anon;
grant execute on function public.command(text,jsonb),public.list_walk_requests() to authenticated;

-- The assigned walker can revisit the agreed time and notes in the task brief.
alter function public.task_brief(uuid) rename to task_brief_v1;
revoke execute on function public.task_brief_v1(uuid) from public,anon,authenticated;
create function public.task_brief(task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; details jsonb;
begin
 result:=public.task_brief_v1(task);
 select jsonb_build_object('start_at',s.start_at,'end_at',s.end_at,'duration',b.data->'duration',
   'title',b.data->'title','notes',coalesce(b.data->'public_notes',b.data->'notes')) into details
 from public.walk_tasks t left join public.solo_bookings b on b.id=t.solo_id
 left join public.pack_event_bookings pb on pb.id=t.pack_booking_id
 left join public.pack_events e on e.id=pb.event_id
 left join public.service_slots s on s.id=coalesce(b.slot_id,e.slot_id) where t.id=task;
 return result||coalesce(details,'{}'::jsonb);
end $$;
revoke execute on function public.task_brief(uuid) from public,anon;
grant execute on function public.task_brief(uuid) to authenticated;
