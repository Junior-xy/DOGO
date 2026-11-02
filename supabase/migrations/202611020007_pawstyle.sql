-- PawStyle answers only: deliberately separate from legacy scoring sessions.
create table public.pawstyle_questionnaires (
 version text primary key, data jsonb not null
);
create table public.pawstyle_responses (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles,
 dog_id uuid not null references public.dogs,
 version text not null references public.pawstyle_questionnaires,
 answers jsonb not null default '{}',
 position integer not null default 0,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 unique(owner_id,dog_id,version)
);
alter table public.pawstyle_questionnaires enable row level security;
alter table public.pawstyle_responses enable row level security;
create policy read_pawstyle_questions on public.pawstyle_questionnaires for select to authenticated using(public.is_active());
create policy read_own_pawstyle on public.pawstyle_responses for select to authenticated using(owner_id=auth.uid() and public.owns_dog(dog_id));
revoke all on public.pawstyle_questionnaires,public.pawstyle_responses from anon,authenticated;
grant select on public.pawstyle_questionnaires,public.pawstyle_responses to authenticated;
insert into public.pawstyle_questionnaires(version,data) values ('DOGO-DPQ-CN5-v0.1',$pawstyle${
  "questionnaireName": "DOGO PawStyle",
  "version": "DOGO-DPQ-CN5-v0.1",
  "coreOptions": [
    {
      "value": 1,
      "label": "很不同意"
    },
    {
      "value": 2,
      "label": "比较不同意"
    },
    {
      "value": 3,
      "label": "一半符合一半不符合"
    },
    {
      "value": 4,
      "label": "比较同意"
    },
    {
      "value": 5,
      "label": "很同意"
    },
    {
      "value": "X",
      "label": "没观察过或不适用"
    }
  ],
  "sections": [
    {
      "id": "B",
      "title": "观察背景题",
      "questions": [
        {
          "id": "B1",
          "type": "single",
          "question": "你与它共同生活或持续照顾多久？",
          "options": [
            "少于1个月",
            "1–3个月",
            "4–6个月",
            "7–12个月",
            "超过1年"
          ]
        },
        {
          "id": "B2",
          "type": "single",
          "question": "最近一个月，每周有几天直接照顾它？",
          "options": [
            "少于1天",
            "1–2天",
            "3–4天",
            "5–7天"
          ]
        },
        {
          "id": "B3",
          "type": "multiple",
          "question": "你观察过哪些情境？",
          "options": [
            "在家休息",
            "熟悉路线",
            "陌生地方",
            "熟悉狗",
            "陌生狗",
            "陌生人",
            "训练互动",
            "看诊或美容"
          ]
        },
        {
          "id": "B4",
          "type": "single",
          "question": "描述它的行为时，你能想到具体例子吗？",
          "options": [
            "多数没有观察过",
            "只有大致印象",
            "多数题能想到例子",
            "能想到不同时间的多个例子"
          ]
        },
        {
          "id": "B5",
          "type": "multiple",
          "question": "它已学会哪些提示？",
          "options": [
            "召回",
            "等待或停留",
            "放下或不碰",
            "其他",
            "尚未教过",
            "不确定"
          ],
          "allowOtherText": true
        },
        {
          "id": "B6",
          "type": "single_with_text",
          "question": "最近是否有身体不适、用药变化、搬家、换照顾者、发情或明显受惊等变化？",
          "options": [
            "没有",
            "有，请说明",
            "不确定"
          ],
          "allowTextFor": [
            "有，请说明"
          ]
        }
      ]
    },
    {
      "id": "D",
      "title": "核心行为题",
      "type": "single",
      "optionsRef": "coreOptions",
      "questions": [
        {
          "id": "D1",
          "question": "与人打招呼时，它表现放松。"
        },
        {
          "id": "D2",
          "question": "它会对其他狗表现出攻击行为。"
        },
        {
          "id": "D3",
          "question": "它容易焦虑不安。"
        },
        {
          "id": "D4",
          "question": "它显得无精打采、缺少活力。"
        },
        {
          "id": "D5",
          "question": "在不牵绳时，叫它回来，它会立即回来。"
        },
        {
          "id": "D6",
          "question": "它比较胆怯。"
        },
        {
          "id": "D7",
          "question": "它会对不熟悉的人表现出攻击行为。"
        },
        {
          "id": "D8",
          "question": "它喜欢追逐松鼠、鸟或其他小动物。"
        },
        {
          "id": "D9",
          "question": "它在玩耍时很快就失去兴趣。"
        },
        {
          "id": "D10",
          "question": "门或院门打开时，它很容易迅速溜出去。"
        },
        {
          "id": "D11",
          "question": "它表现自信。"
        },
        {
          "id": "D12",
          "question": "与其他狗相处时，它表现得较占主导地位。"
        },
        {
          "id": "D13",
          "question": "它会回避其他狗。"
        },
        {
          "id": "D14",
          "question": "它会持续完成一项活动直到结束，例如从漏食玩具中取食或拆咬玩具。"
        },
        {
          "id": "D15",
          "question": "它活泼喧闹，容易表现得兴奋。"
        },
        {
          "id": "D16",
          "question": "去看兽医时，它表现害怕。"
        },
        {
          "id": "D17",
          "question": "它喜欢玩玩具。"
        },
        {
          "id": "D18",
          "question": "它对不熟悉的人表现友好。"
        },
        {
          "id": "D19",
          "question": "它喜欢和其他狗玩耍。"
        },
        {
          "id": "D20",
          "question": "它会寻求人类的陪伴。"
        },
        {
          "id": "D21",
          "question": "与其他狗打招呼时，它表现出顺从姿态，例如翻身露腹、避开目光或舔嘴唇。"
        },
        {
          "id": "D22",
          "question": "它容易适应新的情境和环境。"
        },
        {
          "id": "D23",
          "question": "它喜欢追逐自行车、慢跑者或滑板使用者。"
        },
        {
          "id": "D24",
          "question": "它有好奇心。"
        },
        {
          "id": "D25",
          "question": "当它觉得受到人的威胁时，例如被逼到角落或有人伸手去抓项圈，它会表现出攻击行为。"
        },
        {
          "id": "D26",
          "question": "它表现得比较疏离。"
        },
        {
          "id": "D27",
          "question": "它面对不熟悉的人时表现害怕。"
        },
        {
          "id": "D28",
          "question": "它愿意与其他狗分享玩具。"
        },
        {
          "id": "D29",
          "question": "它对纠正或制止提示的回应比较慢。"
        },
        {
          "id": "D30",
          "question": "去看兽医时，它会表现出攻击行为。"
        },
        {
          "id": "D31",
          "question": "它总想找活动做。"
        },
        {
          "id": "D32",
          "question": "被告知不要碰时，它会放下或不再碰食物、物品。"
        },
        {
          "id": "D33",
          "question": "它会叼回物品，例如球、玩具或树枝。"
        },
        {
          "id": "D34",
          "question": "它对其他狗表现友好。"
        },
        {
          "id": "D35",
          "question": "被限制活动或固定身体时，它表现害怕。"
        },
        {
          "id": "D36",
          "question": "它会以攻击行为护住自己想要的物品，例如拿走的东西、零食或食盆。"
        },
        {
          "id": "D37",
          "question": "它喜欢表达亲近和依恋。"
        },
        {
          "id": "D38",
          "question": "它会忽略指令。"
        },
        {
          "id": "D39",
          "question": "它会对猫表现出攻击行为。"
        },
        {
          "id": "D40",
          "question": "紧张或害怕时，它会表现出攻击行为。"
        },
        {
          "id": "D41",
          "question": "它通常比较平静。"
        },
        {
          "id": "D42",
          "question": "它面对其他狗时表现害怕。"
        },
        {
          "id": "D43",
          "question": "在有干扰的情境中，例如嘈杂、繁忙或有其他狗的地方，它仍能专注于一项任务。"
        },
        {
          "id": "D44",
          "question": "美容护理时，例如剪指甲、梳毛、洗澡或清理耳朵，它表现害怕。"
        },
        {
          "id": "D45",
          "question": "与其他狗相处时，例如同住或打招呼时，它表现得强势，或会强行挤占对方的空间。"
        }
      ]
    },
    {
      "id": "S",
      "title": "补充情境选择题",
      "questions": [
        {
          "id": "S1",
          "type": "single",
          "question": "过去三个月，它是否咬向或咬到过人或动物？",
          "options": [
            "从未观察到",
            "咬向但未接触",
            "接触但未见伤口",
            "造成伤口",
            "不清楚"
          ],
          "note": "可按对象分别记录"
        },
        {
          "id": "S2",
          "type": "single",
          "question": "它是否会在食物、玩具、休息处或主人附近，对靠近的人或狗吼叫、龇牙、扑冲或咬？",
          "options": [
            "有",
            "有机会观察但没有",
            "未观察"
          ],
          "allowText": true,
          "textPrompt": "请写对象和场景"
        },
        {
          "id": "S3",
          "type": "multiple",
          "question": "与什么样的狗相处更不自在？",
          "options": [
            "突然靠近",
            "持续追逐",
            "强烈身体接触",
            "多只同时出现",
            "特定体型或个体",
            "未发现",
            "不确定"
          ]
        },
        {
          "id": "S4",
          "type": "single",
          "question": "有没有试图冲出门、挣脱装备或追逐道路上的人和动物？",
          "options": [
            "有",
            "有机会观察但没有",
            "不确定"
          ],
          "allowText": true,
          "textPrompt": "写最近一次情境"
        },
        {
          "id": "S5",
          "type": "single",
          "question": "离开主人、由其他人牵走时通常如何？",
          "options": [
            "能继续活动",
            "明显犹豫",
            "持续紧张或挣扎",
            "未观察"
          ],
          "allowText": true,
          "textPrompt": "请说明是否有疼痛或活动限制"
        }
      ]
    }
  ]
}$pawstyle$::jsonb);

create function public.save_pawstyle(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<save_pawstyle>>
declare
 uid uuid:=auth.uid(); dog uuid:=(payload->>'dog_id')::uuid;
 definition jsonb; answers jsonb:=payload->'answers'; entry record; question jsonb; section jsonb;
 options jsonb; selected_value jsonb; item jsonb; mode text; allow_text boolean; n integer;
 position integer:=(payload->>'position')::integer;
 expected integer:=(payload->>'expected_revision')::integer;
 saved public.pawstyle_responses;
begin
 if uid is null or not public.owns_dog(dog) then raise exception '无权访问狗狗问卷'; end if;
 select data into definition from public.pawstyle_questionnaires where version=payload->>'version';
 if definition is null then raise exception '问卷版本不存在'; end if;
 select sum(jsonb_array_length(s->'questions')) into n from jsonb_array_elements(definition->'sections') s;
 if position is null or position<0 or position>=n or expected is null or expected<0 then raise exception '问卷位置或修订号无效'; end if;
 if answers is null or jsonb_typeof(answers)<>'object' or octet_length(answers::text)>100000 then raise exception '答案格式无效'; end if;
 for entry in select * from jsonb_each(answers) loop
   select q,s into question,section from jsonb_array_elements(definition->'sections') s,
     lateral jsonb_array_elements(s->'questions') q where q->>'id'=entry.key;
   if question is null then raise exception '未知题目 ID: %',entry.key; end if;
   if jsonb_typeof(entry.value)<>'object' or not (entry.value ? 'value') then raise exception '答案格式无效: %',entry.key; end if;
   if exists(select 1 from jsonb_object_keys(entry.value) k where k not in ('value','text')) then raise exception '答案包含未知字段'; end if;
   mode:=coalesce(question->>'type',section->>'type');
   if section->>'optionsRef'='coreOptions' then
     select jsonb_agg(o->'value') into options from jsonb_array_elements(definition->'coreOptions') o;
   else options:=question->'options'; end if;
   selected_value:=entry.value->'value';
   if mode='multiple' then
     if jsonb_typeof(selected_value)<>'array' then raise exception '多选答案必须为数组: %',entry.key; end if;
     if (select count(distinct v) from jsonb_array_elements(selected_value) v)<>jsonb_array_length(selected_value) then raise exception '选项不可重复'; end if;
     for item in select * from jsonb_array_elements(selected_value) loop
       if not exists(select 1 from jsonb_array_elements(options) o where o=item) then raise exception '选项无效: %',entry.key; end if;
     end loop;
   else
     if not (selected_value='null'::jsonb and coalesce((question->>'allowText')::boolean,false)) and not exists(select 1 from jsonb_array_elements(options) o where o=selected_value) then raise exception '选项无效: %',entry.key; end if;
   end if;
   allow_text:=coalesce((question->>'allowText')::boolean,false)
     or (coalesce((question->>'allowOtherText')::boolean,false) and (selected_value='"其他"'::jsonb or (jsonb_typeof(selected_value)='array' and selected_value @> '["其他"]'::jsonb)))
     or exists(select 1 from jsonb_array_elements(coalesce(question->'allowTextFor','[]')) v where v=selected_value);
   if entry.value ? 'text' then
     if not allow_text or jsonb_typeof(entry.value->'text')<>'string' or length(entry.value->>'text')>2000 then raise exception '补充文字无效: %',entry.key; end if;
   end if;
 end loop;
 -- Lock the dog to serialize first inserts and reject stale cross-device overwrites.
 perform 1 from public.dogs where id=dog for update;
 select * into saved from public.pawstyle_responses where owner_id=uid and dog_id=dog and version=payload->>'version';
 if coalesce(saved.revision,0)<>expected then raise exception '账号已有更新的草稿，请保留本机答案并重新进入后核对'; end if;
 if saved.id is null then
   insert into public.pawstyle_responses(owner_id,dog_id,version,answers,position)
   values(uid,dog,payload->>'version',answers,position) returning * into saved;
 else
   update public.pawstyle_responses set answers=save_pawstyle.answers,position=save_pawstyle.position,
     revision=revision+1,updated_at=now() where id=saved.id returning * into saved;
 end if;
 insert into public.audit_logs(actor_id,action,resource_id) values(uid,'pawstyle.save',saved.id);
 return jsonb_build_object('id',saved.id,'revision',saved.revision);
end $$;
revoke execute on function public.save_pawstyle(jsonb) from public,anon;
grant execute on function public.save_pawstyle(jsonb) to authenticated;
