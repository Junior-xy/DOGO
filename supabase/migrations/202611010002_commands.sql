create function public.command(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); role_name text:=public.current_role(); rid uuid; dog uuid; slot public.service_slots; booking public.solo_bookings; application public.pack_applications; event public.pack_events; pack public.packs; member public.pack_memberships; task public.walk_tasks; session public.assessment_sessions; definition public.questionnaire_definitions; target text; prior text; details jsonb; reason text; n int; duration int; stamp text:=now()::text;
begin
 if uid is null or role_name is null then raise exception '请登录有效账户'; end if;
 rid:=nullif(payload->>'id','')::uuid; dog:=nullif(payload->>'dog_id','')::uuid; target:=payload->>'status'; reason:=trim(coalesce(payload->>'reason',''));
 if action like 'admin.%' and role_name<>'admin' then raise exception '需要管理员权限'; end if;
 case action
 when 'dog.save' then
  if role_name<>'owner' then raise exception '需要主人权限'; end if;
  details:=payload->'data';
  if coalesce(length(trim(details->>'nickname')),0)=0 or not coalesce((details->>'weight')::numeric>0,false) or not coalesce((details->>'age')::numeric>=0,false) or coalesce(length(trim(details->>'emergency_name')),0)=0 or coalesce(length(trim(details->>'emergency_phone')),0)<6 then raise exception '请填写昵称、有效年龄体重和紧急联系人'; end if;
  if rid is null then insert into public.dogs(owner_id,data) values(uid,details) returning id into rid;
  else if not public.owns_dog(rid) then raise exception '无权编辑档案'; end if; update public.dogs set data=details where id=rid; end if;
 when 'assessment.save' then
  if not public.owns_dog(dog) then raise exception '无权访问狗狗'; end if;
  if rid is null then
   select * into definition from public.questionnaire_definitions where active order by version desc limit 1;
   if definition.id is null then raise exception '原始问卷尚未发布，请联系运营'; end if;
   insert into public.assessment_sessions(owner_id,dog_id,definition_id,data) values(uid,dog,definition.id,payload->'data') returning id into rid;
  else
   select * into session from public.assessment_sessions where id=rid for update;
   if session.owner_id<>uid or session.dog_id<>dog or session.status<>'draft' or session.id is null then raise exception '无法修改此测评'; end if;
   update public.assessment_sessions set data=payload->'data' where id=rid;
  end if;
 when 'assessment.submit' then
  select * into session from public.assessment_sessions where id=rid for update;
  if session.id is null or session.owner_id<>uid then raise exception '无权提交测评'; end if;
  if session.status='submitted' then return jsonb_build_object('id',rid); end if;
  select * into strict definition from public.questionnaire_definitions where id=session.definition_id;
  for details in select * from jsonb_array_elements(definition.data->'questions') loop
   if not (session.data->'answers' ? (details->>'code')) or coalesce(length(trim(session.data->'answers'->>(details->>'code'))),0)=0 then raise exception '请完成全部题目；未观察的核心题可选 X'; end if;
   if details->>'code' like 'D%' and jsonb_typeof(session.data->'answers'->(details->>'code')) not in ('number','string') then raise exception '无效答案'; end if;
  end loop;
  if coalesce(length(trim(session.data->>'relationship')),0)=0 then raise exception '请填写照顾者关系'; end if;
  insert into public.assessment_scores(id,owner_id,data) values(rid,uid,public.ti_score(session.data->'answers'));
  update public.assessment_sessions set status='submitted',submitted_at=now() where id=rid;
  -- Situational answers stay distinct from the numeric score; all need human interpretation.
  insert into public.behavior_incidents(owner_id,dog_id,data) values(uid,session.dog_id,jsonb_build_object('assessment_id',rid,'source','Dogo Ti 情境核实','situations',(select jsonb_object_agg(key,value) from jsonb_each(session.data->'answers') where key like 'S%'),'description','情境回答需人工核实，未知信息不视为安全'));
 when 'solo.book' then
  if not public.owns_dog(dog) then raise exception '无权预约'; end if;
  select * into slot from public.service_slots where id=(payload->>'slot_id')::uuid for update;
  if slot.id is null or slot.status<>'open' or slot.start_at<=now() or exists(select 1 from public.pack_events where slot_id=slot.id) then raise exception '时段不可预约'; end if;
  duration:=(payload->>'duration')::int;
  if not exists(select 1 from public.settings s,jsonb_array_elements_text(s.data->'durations') x where s.id='operations' and x.value=duration::text) or duration>extract(epoch from(slot.end_at-slot.start_at))/60 then raise exception '无效服务时长'; end if;
  if coalesce(length(trim(payload->>'handoff')),0)=0 then raise exception '请填写交接点'; end if;
  select id into rid from public.solo_bookings where dog_id=dog and slot_id=slot.id and status<>'cancelled';
  if rid is not null then return jsonb_build_object('id',rid); end if;
  if (select count(*) from public.solo_bookings where slot_id=slot.id and status<>'cancelled')>=slot.capacity then raise exception '时段名额已满'; end if;
  insert into public.solo_bookings(owner_id,dog_id,slot_id,data) values(uid,dog,slot.id,jsonb_build_object('duration',duration,'handoff',payload->>'handoff','notes',payload->>'notes')) returning id into rid;
 when 'admin.solo.confirm' then
  select * into booking from public.solo_bookings where id=rid for update;
  if booking.id is null or booking.status<>'requested' then raise exception '订单状态已变更'; end if;
  perform public.reserve_walker((payload->>'walker_id')::uuid,booking.slot_id,rid,null);
  update public.solo_bookings set status='confirmed',walker_id=(payload->>'walker_id')::uuid where id=rid;
  insert into public.walk_tasks(owner_id,dog_id,walker_id,solo_id) values(booking.owner_id,booking.dog_id,(payload->>'walker_id')::uuid,rid);
  perform public.notify(booking.owner_id,'Solo 预约已确认',rid); perform public.notify((payload->>'walker_id')::uuid,'收到新的 Solo 任务',rid);
 when 'solo.cancel' then
  select * into booking from public.solo_bookings where id=rid for update;
  if booking.id is null or not (booking.owner_id=uid or role_name='admin') then raise exception '无权取消'; end if;
  if booking.status not in ('requested','confirmed') or reason='' then raise exception '当前不可取消或缺少原因'; end if;
  select * into slot from public.service_slots where id=booking.slot_id;
  if role_name<>'admin' and slot.start_at<now()+make_interval(hours=>(select (data->>'cancel_hours')::int from public.settings where id='operations')) then raise exception '已超过自助取消时限，请联系运营'; end if;
  update public.solo_bookings set status='cancelled',data=data||jsonb_build_object('cancel_reason',reason,'cancelled_at',stamp) where id=rid;
  update public.walk_tasks set status='cancelled' where solo_id=rid;
  delete from public.walker_reservations where solo_id=rid;
  perform public.notify(booking.owner_id,'Solo 预约已取消',rid);
  if booking.walker_id is not null then perform public.notify(booking.walker_id,'Solo 任务已取消',rid); end if;
 when 'pack.apply' then
  if not public.owns_dog(dog) then raise exception '无权申请'; end if;
  select * into pack from public.packs where id=(payload->>'pack_id')::uuid and status='open';
  if pack.id is null then raise exception 'Pack 暂不接受申请'; end if;
  insert into public.pack_applications(owner_id,dog_id,pack_id,data) values(uid,dog,pack.id,jsonb_build_object('notes',payload->>'notes')) returning id into rid;
 when 'admin.pack.review' then
  select * into application from public.pack_applications where id=rid for update;
  if application.id is null or reason='' then raise exception '申请不存在或未填写审核理由'; end if;
  prior:=application.status;
  if not ((prior in ('submitted','needs_more_info') and target='safety_review') or (prior='safety_review' and target in ('intro_scheduled','approved','rejected','needs_more_info')) or (prior='intro_scheduled' and target in ('approved','rejected','needs_more_info'))) then raise exception '无效审核状态迁移'; end if;
  if target='intro_scheduled' then
   if (payload->>'scheduled_at')::timestamptz is null or (payload->>'scheduled_at')::timestamptz<=now() then raise exception '请设置未来首见时间'; end if;
   insert into public.intro_meetings(application_id,owner_id,data) values(rid,application.owner_id,jsonb_build_object('scheduled_at',payload->>'scheduled_at','observer_id',uid,'dog_id',application.dog_id));
  end if;
  if target='approved' then
   if coalesce(payload->>'safety_checked','false')<>'true' then raise exception '必须人工核实情境、行为、健康和牵引条件'; end if;
   if prior='intro_scheduled' and not exists(select 1 from public.intro_meetings where application_id=rid and coalesce(data->>'outcome','')<>'') then raise exception '请先记录首次见面结果'; end if;
   insert into public.pack_memberships(owner_id,dog_id,pack_id,application_id) values(application.owner_id,application.dog_id,application.pack_id,rid);
  end if;
  update public.pack_applications set status=target,data=data||jsonb_build_object('review_reason',reason,'reviewer_id',uid,'reviewed_at',stamp,'safety_checked',payload->'safety_checked') where id=rid;
  perform public.notify(application.owner_id,'Pack 审核更新：'||target,rid);
 when 'admin.intro.record' then
  if coalesce(length(trim(payload->>'outcome')),0)=0 or coalesce(length(trim(payload->>'observations')),0)=0 then raise exception '请填写互动观察与处理建议'; end if;
  update public.intro_meetings set data=data||jsonb_build_object('outcome',payload->>'outcome','observations',payload->>'observations','recorded_at',stamp,'observer_id',uid) where id=rid and coalesce(data->>'outcome','')='' returning data into details;
  if not found then raise exception '首见不存在或结果已归档'; end if;
 when 'pack.book' then
  if not public.owns_dog(dog) then raise exception '无权报名'; end if;
  select * into event from public.pack_events where id=(payload->>'event_id')::uuid for update;
  if event.id is null or event.status<>'open' then raise exception '活动未开放'; end if;
  select * into slot from public.service_slots where id=event.slot_id;
  if slot.start_at<=now() or slot.status<>'open' then raise exception '活动已结束或关闭'; end if;
  select * into pack from public.packs where id=event.pack_id;
  if pack.status<>'open' then raise exception 'Pack 已关闭'; end if;
  select * into member from public.pack_memberships where dog_id=dog and pack_id=event.pack_id;
  if member.id is null then raise exception '请先通过对应 Pack 人工审核'; end if;
  select id into rid from public.pack_event_bookings where event_id=event.id and membership_id=member.id;
  if rid is not null then return jsonb_build_object('id',rid); end if;
  if (select count(*) from public.pack_event_bookings where event_id=event.id and status<>'cancelled')>=least(event.capacity,pack.capacity) then raise exception '活动名额已满'; end if;
  insert into public.pack_event_bookings(owner_id,dog_id,event_id,membership_id) values(uid,dog,event.id,member.id) returning id into rid;
  insert into public.walk_tasks(owner_id,dog_id,walker_id,pack_booking_id) values(uid,dog,pack.lead_walker_id,rid);
  perform public.notify(uid,'Pack 活动报名成功',rid); perform public.notify(pack.lead_walker_id,'Pack 新增参与狗狗',rid);
 when 'handoff.confirm' then
  select * into task from public.walk_tasks where id=rid for update;
  if task.id is null or task.owner_id<>uid or task.status not in ('accepted','picked_up','walking','returned') or target not in ('picked_up','returned') then raise exception '当前无法确认交接'; end if;
  if target='picked_up' and task.status not in ('accepted','picked_up') then raise exception '接狗确认时机无效'; end if;
  if target='returned' and task.status not in ('walking','returned') then raise exception '归还确认时机无效'; end if;
  insert into public.handoff_records(task_id,owner_id,walker_id,action,actor_id,data) values(rid,task.owner_id,task.walker_id,target,uid,jsonb_build_object('notes',payload->>'notes')) on conflict do nothing;
 when 'task.advance' then
  select * into task from public.walk_tasks where id=rid for update;
  if task.id is null or task.walker_id<>uid or role_name<>'walker' then raise exception '只能操作分配给自己的任务'; end if;
  prior:=task.status;
  if not ((prior='assigned' and target='accepted') or (prior='accepted' and target='picked_up') or (prior='picked_up' and target='walking') or (prior='walking' and target='returned')) then raise exception '无效任务状态迁移'; end if;
  if target in ('picked_up','returned') then
   if coalesce(length(trim(payload->>'notes')),0)=0 then raise exception '请填写交接记录'; end if;
   if not exists(select 1 from public.handoff_records h where h.task_id=rid and h.action=target and h.actor_id=task.owner_id) then raise exception '请等待主人确认交接'; end if;
   insert into public.handoff_records(task_id,owner_id,walker_id,action,actor_id,data) values(rid,task.owner_id,uid,target,uid,jsonb_build_object('notes',payload->>'notes'));
  end if;
  update public.walk_tasks set status=target,data=data||jsonb_build_object(target||'_at',stamp) where id=rid;
  if target='walking' then
   update public.solo_bookings set status='in_progress' where id=task.solo_id;
   update public.pack_event_bookings set status='in_progress' where id=task.pack_booking_id;
  end if;
 when 'task.report' then
  select * into task from public.walk_tasks where id=rid for update;
  if task.id is null or task.walker_id<>uid or role_name<>'walker' or task.status<>'returned' then raise exception '归还后由负责遛狗师提交报告'; end if;
  if coalesce(length(trim(payload->>'summary')),0)<5 then raise exception '请填写至少五个字的服务报告'; end if;
  insert into public.walk_reports(task_id,owner_id,walker_id,data) values(rid,task.owner_id,uid,jsonb_build_object('summary',payload->>'summary','observations',payload->>'observations','actual_start_at',task.data->>'walking_at','actual_end_at',task.data->>'returned_at'));
  update public.walk_tasks set status='reported',data=data||jsonb_build_object('reported_at',stamp) where id=rid;
  update public.solo_bookings set status='completed' where id=task.solo_id;
  update public.pack_event_bookings set status='completed' where id=task.pack_booking_id;
  perform public.notify(task.owner_id,'散步完成，服务报告已送达',rid);
 when 'report.correct' then
  if coalesce(length(trim(payload->>'reason')),0)=0 then raise exception '更正必须说明原因'; end if;
  insert into public.report_corrections(report_id,owner_id,walker_id,data) select id,owner_id,walker_id,jsonb_build_object('reason',payload->>'reason','summary',payload->>'summary','actor_id',uid) from public.walk_reports where id=rid and (walker_id=uid or role_name='admin');
  if not found then raise exception '无权更正'; end if;
 when 'incident.create' then
  select * into task from public.walk_tasks where id=rid;
  if task.id is null or not (task.walker_id=uid or task.owner_id=uid) then raise exception '无权登记事件'; end if;
  if coalesce(length(trim(payload->>'description')),0)=0 then raise exception '请填写事件经过'; end if;
  insert into public.behavior_incidents(owner_id,dog_id,task_id,data) values(task.owner_id,task.dog_id,rid,jsonb_build_object('description',payload->>'description','actor_id',uid)) returning id into rid;
  perform public.notify(task.owner_id,'服务异常已登记，运营将跟进',rid);
 when 'admin.incident.resolve' then
  if target not in ('under_review','resolved') or reason='' then raise exception '请填写处理结论'; end if;
  update public.behavior_incidents set status=target,data=data||jsonb_build_object('resolution',reason,'reviewer_id',uid,'reviewed_at',stamp) where id=rid and ((status='open' and target='under_review') or (status='under_review' and target='resolved'));
  if not found then raise exception '无效异常处理状态'; end if;
 when 'notification.read' then
  update public.notifications set read_at=now() where id=rid and owner_id=uid;
 when 'privacy.request' then
  if payload->>'kind' not in ('export','delete') then raise exception '无效请求'; end if;
  insert into public.privacy_requests(owner_id,data) values(uid,jsonb_build_object('kind',payload->>'kind','reason',reason)) returning id into rid;
 when 'admin.profile.update' then
  if rid=uid then raise exception '不能修改自己的管理权限'; end if;
  if payload->>'role' not in ('owner','walker','admin') or reason='' then raise exception '请填写角色和审核理由'; end if;
  if exists(select 1 from public.walk_tasks where walker_id=rid and status not in ('reported','cancelled')) then raise exception '请先完成该人员的未结束任务'; end if;
  update public.profiles set role=payload->>'role',active=(payload->>'active')::boolean where id=rid;
 when 'admin.slot.create' then
  if (payload->>'start_at')::timestamptz<=now() then raise exception '请发布未来时段'; end if;
  insert into public.service_slots(start_at,end_at,capacity,data) values((payload->>'start_at')::timestamptz,(payload->>'end_at')::timestamptz,(payload->>'capacity')::int,jsonb_build_object('label',payload->>'label')) returning id into rid;
 when 'admin.slot.close' then
  update public.service_slots set status='closed' where id=rid;
 when 'admin.pack.create' then
  if not exists(select 1 from public.profiles where id=(payload->>'walker_id')::uuid and role='walker' and active) then raise exception '请选择已审核遛狗师'; end if;
  if coalesce(length(trim(payload->>'name')),0)=0 or coalesce(length(trim(payload->>'location')),0)=0 then raise exception '请填写名称和地点'; end if;
  insert into public.packs(name,location,capacity,lead_walker_id,data) values(payload->>'name',payload->>'location',(payload->>'capacity')::int,(payload->>'walker_id')::uuid,jsonb_build_object('description',payload->>'description','requirements',payload->>'requirements')) returning id into rid;
 when 'admin.event.create' then
  select * into pack from public.packs where id=(payload->>'pack_id')::uuid;
  select * into slot from public.service_slots where id=(payload->>'slot_id')::uuid for update;
  if slot.id is null or slot.status<>'open' or slot.start_at<=now() or exists(select 1 from public.solo_bookings where slot_id=slot.id and status<>'cancelled') then raise exception '时段已占用或关闭'; end if;
  insert into public.pack_events(pack_id,slot_id,capacity) values(pack.id,slot.id,pack.capacity) returning id into rid;
  perform public.reserve_walker(pack.lead_walker_id,slot.id,null,rid);
 when 'admin.settings.save' then
  details:=payload->'data';
  if not coalesce((details->>'cancel_hours')::int>=0,false) or jsonb_array_length(details->'durations')=0 then raise exception '无效运营设置'; end if;
  for target in select jsonb_array_elements_text(details->'durations') loop if target::int<=0 then raise exception '时长必须大于零'; end if; end loop;
  update public.settings set data=details where id='operations'; rid:=null;
 when 'admin.questionnaire.publish' then
  details:=payload->'data';
  if coalesce(length(details->>'version'),0)=0 or jsonb_array_length(details->'questions')<>57 then raise exception '需要完整版本和57道原始题目'; end if;
  for target in select 'B'||generate_series(1,6) union all select 'D'||generate_series(1,45) union all select 'S'||generate_series(1,6) loop
   select count(*) into n from jsonb_array_elements(details->'questions') q where q->>'code'=target and coalesce(length(trim(q->>'text')),0)>0;
   if n<>1 then raise exception '题号缺失、重复或题干为空：%',target; end if;
  end loop;
  update public.questionnaire_definitions set active=false;
  insert into public.questionnaire_definitions(version,data,active) values(details->>'version',details,true) returning id into rid;
 when 'admin.privacy.resolve' then
  if reason='' then raise exception '请填写办理说明'; end if;
  update public.privacy_requests set status='resolved',data=data||jsonb_build_object('resolution',reason,'resolved_at',stamp) where id=rid;
 else raise exception '未知操作';
 end case;
 insert into public.audit_logs(actor_id,action,resource_id,data) values(uid,action,rid,jsonb_strip_nulls(jsonb_build_object('from_status',prior,'to_status',target,'reason',nullif(reason,''))));
 return jsonb_build_object('id',rid);
end $$;

-- Deny anonymous execution and private helper invocation (including notify/reserve_walker).
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.current_role(),public.is_admin(),public.is_active(),public.owns_dog(uuid),public.command(text,jsonb),public.task_brief(uuid) to authenticated;
