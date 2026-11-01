-- Public signup may select owner or walker. Admin remains operator-managed.
-- Applies to new registrations only; existing accounts retain their roles.
create or replace function public.on_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare signup_role text:=coalesce(new.raw_user_meta_data->>'signup_role','owner');
begin
  if coalesce(new.raw_user_meta_data->>'consent','')<>'true' then
    raise exception '请先同意服务条款与隐私说明';
  end if;
  if signup_role not in ('owner','walker') then
    raise exception '注册身份只能选择狗主人或遛狗师';
  end if;
  insert into public.profiles(id,display_name,role,active)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'DOGO 用户'),signup_role,true);
  return new;
end $$;
