begin;

create or replace function public.owner_invite_member(p_email text,p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target text := lower(btrim(p_email)); invitation_id uuid; target_user uuid;
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if target is null or char_length(target)>254 or target !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'invalid_invitation_email'; end if;
  if p_role is null or p_role not in ('member','admin') then raise exception 'invalid_invitation_role'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  if exists(select 1 from public.member_invitations where email=target and cancelled_at is null
    and not (role='member' and p_role='admin')) then
    raise exception 'invitation_already_exists';
  end if;
  if p_role='admin' then
    if exists(select 1 from public.site_owners o join auth.users u on u.id=o.user_id where lower(u.email)=target)
      then raise exception 'already_administrator'; end if;
    if (select count(*) from public.site_owners)>=2 then raise exception 'administrator_slots_full'; end if;
    if (select count(*) from (
      select email from public.admin_allowlist
      union select lower(u.email) from public.site_owners o join auth.users u on u.id=o.user_id
    ) slots) >= 2 and not exists(select 1 from public.admin_allowlist where email=target)
      then raise exception 'administrator_slots_full'; end if;
    insert into public.admin_allowlist(email) values(target) on conflict do nothing;
  end if;
  select id into target_user from auth.users where lower(email)=target and email_confirmed_at is not null;
  insert into public.member_invitations(email,role,invited_by,accepted_at)
  values(target,p_role,auth.uid(),case when target_user is not null then now() end)
  on conflict(email) do update set role=excluded.role,invited_by=excluded.invited_by,
    created_at=now(),accepted_at=excluded.accepted_at,cancelled_at=null
  returning id into invitation_id;
  if target_user is not null and p_role='admin' then
    insert into public.site_owners(user_id) values(target_user) on conflict do nothing;
  end if;
  return invitation_id;
end $$;

commit;
