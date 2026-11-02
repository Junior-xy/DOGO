-- Immutable PawStyle history; existing questionnaire drafts are retained unchanged.
create table public.pawstyle_results (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles,
 dog_id uuid not null references public.dogs,
 response_id uuid not null references public.pawstyle_responses,
 response_revision integer not null,
 raw_answers jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 unique(response_id,response_revision)
);
alter table public.pawstyle_results enable row level security;
create policy read_own_pawstyle_results on public.pawstyle_results for select to authenticated
 using(owner_id=auth.uid() and public.owns_dog(dog_id));
revoke all on public.pawstyle_results from anon,authenticated;
grant select on public.pawstyle_results to authenticated;

-- Server equivalent of the supplied mean-strict-v1 reference; parity tested in Vitest.
create function public.score_pawstyle_core(answers jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
 definitions jsonb:=$facets$[{"key": "fear_humans", "factor": "F1", "label": "对人恐惧", "items": ["D1", "D6", "D27"]}, {"key": "fear_nonsocial", "factor": "F1", "label": "非社交恐惧", "items": ["D3", "D11", "D22"]}, {"key": "fear_dogs", "factor": "F1", "label": "对狗恐惧", "items": ["D13", "D21", "D42"]}, {"key": "fear_handling", "factor": "F1", "label": "被处理恐惧", "items": ["D16", "D35", "D44"]}, {"key": "aggression_general", "factor": "F2", "label": "一般情境攻击行为", "items": ["D7", "D18", "D40"]}, {"key": "aggression_contextual", "factor": "F2", "label": "特定情境攻击行为", "items": ["D25", "D30", "D36"]}, {"key": "excitability", "factor": "F3", "label": "兴奋性", "items": ["D15", "D31", "D41"]}, {"key": "play_orientation", "factor": "F3", "label": "玩耍倾向", "items": ["D9", "D17", "D33"]}, {"key": "engagement", "factor": "F3", "label": "主动投入", "items": ["D4", "D14", "D24"]}, {"key": "companionship", "factor": "F3", "label": "亲近陪伴", "items": ["D20", "D26", "D37"]}, {"key": "trainability", "factor": "F4", "label": "可训练性", "items": ["D29", "D38", "D43"]}, {"key": "controllability", "factor": "F4", "label": "可控制性", "items": ["D5", "D10", "D32"]}, {"key": "aggression_dogs", "factor": "F5", "label": "对狗攻击", "items": ["D2", "D19", "D34"]}, {"key": "predatory_chasing", "factor": "F5", "label": "追逐／捕猎倾向", "items": ["D8", "D23", "D39"]}, {"key": "dominance_related", "factor": "F5", "label": "支配相关行为", "items": ["D12", "D28", "D45"]}]$facets$;
 labels jsonb:=$labels${"F1": "恐惧倾向", "F2": "对人的攻击行为倾向", "F3": "活动与兴奋倾向", "F4": "训练回应", "F5": "对动物的攻击行为倾向"}$labels$;
 styles jsonb:=$styles${"EP": {"nickname": "Spark", "titleZh": "热情玩伴型", "descriptionZh": "较容易兴奋，对问卷所描述的玩耍兴趣较强。", "image": "/images/pawstyle/EP_Spark.png", "sourceCaption": "Energetic / Adventurous"}, "CP": {"nickname": "Sunny", "titleZh": "平和玩伴型", "descriptionZh": "表现较平缓，对问卷所描述的玩耍兴趣较强。", "image": "/images/pawstyle/CP_Sunny.png", "sourceCaption": "Friendly / Social"}, "EL": {"nickname": "Scout", "titleZh": "活跃观察型", "descriptionZh": "较容易兴奋，对问卷所描述的玩耍兴趣较弱。", "image": "/images/pawstyle/EL_Scout.png", "sourceCaption": "Smart / Curious"}, "CL": {"nickname": "Cloud", "titleZh": "悠然观察型", "descriptionZh": "表现较平缓，对问卷所描述的玩耍兴趣较弱。", "image": "/images/pawstyle/CL_Cloud.png", "sourceCaption": "Calm / Gentle"}}$styles$;
 reverse_ids text[]:=array['D1','D4','D9','D10','D11','D18','D19','D22','D26','D28','D29','D34','D38','D41'];
 scored jsonb:='{}'; missing jsonb:='[]'; facets jsonb:='{}'; factors jsonb:='{}';
 qid text; raw jsonb; val double precision; definition jsonb; f text; vals double precision[];
 total integer; valid integer; e double precision; p double precision; code text; meta jsonb;
 style jsonb; tags jsonb; axes jsonb:='[]';
begin
 if jsonb_typeof(answers)<>'object' then raise exception '答案格式无效'; end if;
 for i in 1..45 loop
  qid:='D'||i; raw:=answers->qid;
  if raw is null or raw='null' or raw='"X"' then val:=null; missing:=missing||to_jsonb(qid);
  else
   if jsonb_typeof(raw)<>'number' then raise exception '核心题答案无效: %',qid; end if;
   val:=(raw#>>'{}')::double precision;
   if val<1 or val>5 or val<>floor(val) then raise exception '核心题答案无效: %',qid; end if;
   if qid=any(reverse_ids) then val:=6-val; end if;
  end if;
  scored:=scored||jsonb_build_object(qid,val);
 end loop;
 for definition in select * from jsonb_array_elements(definitions) loop
  select array_agg((scored->>item)::double precision) filter(where scored->>item is not null)
    into vals from jsonb_array_elements_text(definition->'items') item;
  valid:=coalesce(array_length(vals,1),0); val:=null;
  if valid=3 then select sum(v)/3 into val from unnest(vals) v; end if;
  facets:=facets||jsonb_build_object(definition->>'key',jsonb_build_object('label',definition->>'label','factor',definition->>'factor','value',val,'validItems',valid,'totalItems',3));
 end loop;
 for f in select jsonb_object_keys(labels) loop
  select count(*),count(*) filter(where item->>'value' is not null),sum((item->>'value')::double precision)
   into total,valid,val from jsonb_each(facets) as a(k,item) where item->>'factor'=f;
  if total=valid then val:=val/total; else val:=null; end if;
  factors:=factors||jsonb_build_object(f,jsonb_build_object('label',labels->>f,'value',val,'percent0to100',(val-1)/4*100,'validFacets',valid,'totalFacets',total));
 end loop;
 e:=(facets->'excitability'->>'value')::double precision; p:=(facets->'play_orientation'->>'value')::double precision;
 if e is null or p is null then
  style:=jsonb_build_object('status','pending','code',null,'label','风格待补充','nickname',null,'image',null,
   'description','兴奋性或玩耍倾向存在未观察或未作答的题目，请补充后查看完整风格。','nearBoundary',false,'nearBoundaryAxes','[]'::jsonb,'tags','[]'::jsonb);
 elsif e=3 or p=3 then
  tags:=jsonb_build_array(case when e=3 then '兴奋性为中间倾向' when e>3 then '较容易兴奋' else '表现较平缓' end,
    case when p=3 then '玩耍倾向为中间倾向' when p>3 then '玩耍兴趣较强' else '玩耍兴趣较弱' end);
  if e=3 then axes:=axes||'"E"'::jsonb; end if; if p=3 then axes:=axes||'"P"'::jsonb; end if;
  style:=jsonb_build_object('status','mixed','code',null,'label','混合倾向','nickname',null,'image',null,
   'description',(tags->>0)||'，'||(tags->>1)||'。','nearBoundary',true,'nearBoundaryAxes',axes,'tags',tags);
 else
  code:=case when e>3 then case when p>3 then 'EP' else 'EL' end else case when p>3 then 'CP' else 'CL' end end;
  meta:=styles->code;
  if e between 2.5 and 3.5 then axes:=axes||'"E"'::jsonb; end if; if p between 2.5 and 3.5 then axes:=axes||'"P"'::jsonb; end if;
  tags:=jsonb_build_array(case when e>3 then '较容易兴奋' else '表现较平缓' end,case when p>3 then '玩耍兴趣较强' else '玩耍兴趣较弱' end);
  if jsonb_array_length(axes)>0 then tags:=tags||'"接近分界，倾向轻微"'::jsonb; end if;
  style:=jsonb_build_object('status','classified','code',code,'label',code||' '||(meta->>'titleZh'),'nickname',meta->>'nickname','image',meta->>'image','description',meta->>'descriptionZh',
    'nearBoundary',jsonb_array_length(axes)>0,'nearBoundaryAxes',axes,'tags',tags);
 end if;
 return jsonb_build_object('versions',jsonb_build_object('questionnaire','DOGO-DPQ-CN5-v0.1','profile','DOGO-4style-v2','scoring','mean-strict-v1'),
  'scoredItems',scored,'facets',facets,'factors',factors,'E',e,'P',p,'style',style,'answeredCore',45-jsonb_array_length(missing),
  'coreTotal',45,'missingCoreIds',missing,'coreComplete',jsonb_array_length(missing)=0);
end $$;
revoke execute on function public.score_pawstyle_core(jsonb) from public,anon,authenticated;

create function public.submit_pawstyle(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 draft public.pawstyle_responses; rid uuid; core jsonb; computed jsonb;
begin
 select * into draft from public.pawstyle_responses where id=(payload->>'response_id')::uuid for update;
 if draft.id is null or draft.owner_id<>auth.uid() or auth.uid() is null or not public.owns_dog(draft.dog_id) then raise exception '无权访问问卷结果'; end if;
 if draft.revision is distinct from (payload->>'expected_revision')::integer then raise exception '草稿已经更新，请重新保存后查看结果'; end if;
 if draft.version<>'DOGO-DPQ-CN5-v0.1' then raise exception '不支持此问卷版本的计分'; end if;
 select id into rid from public.pawstyle_results where response_id=draft.id and response_revision=draft.revision;
 if rid is not null then return jsonb_build_object('id',rid); end if;
 select coalesce(jsonb_object_agg(k,v->'value'),'{}'::jsonb) into core from jsonb_each(draft.answers) a(k,v) where k ~ '^D[0-9]+$';
 computed:=public.score_pawstyle_core(core);
 insert into public.pawstyle_results(owner_id,dog_id,response_id,response_revision,raw_answers,result)
 values(draft.owner_id,draft.dog_id,draft.id,draft.revision,draft.answers,computed) returning id into rid;
 insert into public.audit_logs(actor_id,action,resource_id) values(auth.uid(),'pawstyle.submit',rid);
 return jsonb_build_object('id',rid);
end $$;
revoke execute on function public.submit_pawstyle(jsonb) from public,anon;
grant execute on function public.submit_pawstyle(jsonb) to authenticated;
