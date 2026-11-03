-- Remove dogs from active use while retaining linked service and assessment history.
alter table public.dogs add column deleted_at timestamptz;
create or replace function public.owns_dog(d uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dogs where id=d and owner_id=auth.uid() and deleted_at is null) and public.is_active()
$$;
create function public.delete_dog(p_dog_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dog public.dogs;
begin
 if auth.uid() is null or public.current_role() is distinct from 'owner' then raise exception '需要主人权限'; end if;
 select * into dog from public.dogs where id=p_dog_id and owner_id=auth.uid() for update;
 if dog.id is null then raise exception '无权删除此狗狗档案'; end if;
 if dog.deleted_at is not null then return jsonb_build_object('id',dog.id); end if;
 if exists(select 1 from public.solo_bookings where dog_id=dog.id and status not in ('completed','cancelled'))
 or exists(select 1 from public.pack_event_bookings where dog_id=dog.id and status not in ('completed','cancelled'))
 or exists(select 1 from public.walk_tasks where dog_id=dog.id and status not in ('reported','cancelled'))
 then raise exception '狗狗还有未完成的订单或服务，请先处理订单后再删除'; end if;
 update public.dogs set deleted_at=now() where id=dog.id;
 update public.pack_applications set status='rejected',data=data||jsonb_build_object('reason','主人删除狗狗档案')
   where dog_id=dog.id and status in ('submitted','safety_review','intro_scheduled','needs_more_info');
 insert into public.audit_logs(actor_id,action,resource_id) values(auth.uid(),'dog.delete',dog.id);
 return jsonb_build_object('id',dog.id);
end $$;
revoke execute on function public.delete_dog(uuid) from public,anon;
grant execute on function public.delete_dog(uuid) to authenticated;

-- Serializes new bookings with removal so a stale client cannot book an archived dog.
create function public.require_live_dog() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.dogs where id=new.dog_id and deleted_at is null for update;
 if not found then raise exception '狗狗档案已删除或不可用'; end if;
 return new;
end $$;
revoke execute on function public.require_live_dog() from public,anon,authenticated;
create trigger solo_live_dog before insert on public.solo_bookings for each row execute function public.require_live_dog();
create trigger pack_live_dog before insert on public.pack_event_bookings for each row execute function public.require_live_dog();
create trigger application_live_dog before insert on public.pack_applications for each row execute function public.require_live_dog();
