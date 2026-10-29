begin;

create table public.branch_managers (
  branch text primary key check (branch in ('max-leo','gustave','helene')),
  user_id uuid not null unique references public.member_profiles(user_id),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);
alter table public.branch_managers enable row level security;
revoke all on public.branch_managers from public,anon,authenticated;

create function public.can_manage_bookings() returns boolean language sql stable
security definer set search_path = '' as $$
  select public.is_verified_user() and (public.is_site_owner() or exists(
    select 1 from public.branch_managers where user_id=auth.uid()));
$$;
revoke all on function public.can_manage_bookings() from public,anon;
grant execute on function public.can_manage_bookings() to authenticated;

create function public.get_management_capabilities() returns jsonb language plpgsql stable
security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  return jsonb_build_object('general_admin',public.is_site_owner(),
    'manage_bookings',public.can_manage_bookings());
end $$;
revoke all on function public.get_management_capabilities() from public,anon;
grant execute on function public.get_management_capabilities() to authenticated;

create function public.check_branch_manager_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  if TG_TABLE_NAME='branch_managers' then
    perform 1 from public.member_profiles p join auth.users u on u.id=p.user_id
      where p.user_id=new.user_id and p.branch=new.branch and u.email_confirmed_at is not null
      for update of p;
    if not found then raise exception 'manager_branch_mismatch'; end if;
  elsif new.branch is distinct from old.branch and exists(
    select 1 from public.branch_managers where user_id=new.user_id) then
    raise exception 'remove_manager_before_branch_change';
  end if;
  return new;
end $$;
create trigger branch_manager_profile before insert or update on public.branch_managers
for each row execute function public.check_branch_manager_profile();
create trigger managed_profile_branch before update of branch on public.member_profiles
for each row execute function public.check_branch_manager_profile();
revoke all on function public.check_branch_manager_profile() from public,anon,authenticated;

create function public.get_branch_directory()
returns table(branch text,user_id uuid,first_name text,last_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  return query select m.branch,m.user_id,p.first_name,p.last_name from public.branch_managers m
    join public.member_profiles p on p.user_id=m.user_id order by m.branch;
end $$;
revoke all on function public.get_branch_directory() from public,anon;
grant execute on function public.get_branch_directory() to authenticated;

create function public.get_management_members()
returns table(user_id uuid,first_name text,last_name text,branch text,email text,
  general_admin boolean,managed_branch text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_bookings() then raise exception 'manager_required'; end if;
  return query select u.id,coalesce(p.first_name,''),coalesce(p.last_name,''),
    p.branch,u.email::text,exists(select 1 from public.site_owners o where o.user_id=u.id),m.branch
    from auth.users u left join public.member_profiles p on p.user_id=u.id
    left join public.branch_managers m on m.user_id=u.id
    where u.email_confirmed_at is not null order by p.last_name nulls last,u.id;
end $$;
revoke all on function public.get_management_members() from public,anon;
grant execute on function public.get_management_members() to authenticated;

create function public.set_branch_manager(p_branch text,p_user_id uuid,p_expected_user_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_holder uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  if not public.can_manage_bookings() then raise exception 'manager_required'; end if;
  if p_branch is null or p_branch not in ('max-leo','gustave','helene') then raise exception 'invalid_branch'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'action_reason_required'; end if;
  select user_id into current_holder from public.branch_managers where branch=p_branch;
  if current_holder is distinct from p_expected_user_id then raise exception 'role_assignment_changed'; end if;
  perform set_config('family.action_reason',btrim(p_reason),true);
  if p_user_id is null then
    delete from public.branch_managers where branch=p_branch;
  else
    insert into public.branch_managers(branch,user_id,assigned_by) values(p_branch,p_user_id,auth.uid())
    on conflict(branch) do update set user_id=excluded.user_id,assigned_by=excluded.assigned_by,assigned_at=now();
  end if;
  perform set_config('family.action_reason','',true);
end $$;

create function public.set_general_administrator(p_user_id uuid,p_enabled boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_email text; has_general_role boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if p_enabled is null then raise exception 'invalid_role'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'action_reason_required'; end if;
  select lower(email) into target_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if not found then raise exception 'verified_member_required'; end if;
  select exists(select 1 from public.site_owners where user_id=p_user_id) into has_general_role;
  if has_general_role=p_enabled then raise exception 'role_assignment_changed'; end if;
  perform set_config('family.action_reason',btrim(p_reason),true);
  if p_enabled then
    if (select count(*) from public.site_owners)>=2 or
      ((select count(*) from (select email from public.admin_allowlist union
        select lower(u.email) from public.site_owners o join auth.users u on u.id=o.user_id) slots)>=2
        and not exists(select 1 from public.admin_allowlist where email=target_email)) then
      raise exception 'administrator_slots_full';
    end if;
    insert into public.admin_allowlist(email) values(target_email) on conflict do nothing;
    insert into public.site_owners(user_id) values(p_user_id);
  else
    if (select count(*) from public.site_owners)<=1 then raise exception 'last_administrator_required'; end if;
    delete from public.site_owners where user_id=p_user_id;
    delete from public.admin_allowlist where email=target_email;
    update public.member_invitations set cancelled_at=now()
      where email=target_email and role='admin' and cancelled_at is null;
  end if;
  perform set_config('family.action_reason','',true);
end $$;
revoke all on function public.set_branch_manager(text,uuid,uuid,text),
  public.set_general_administrator(uuid,boolean,text) from public,anon;
grant execute on function public.set_branch_manager(text,uuid,uuid,text),
  public.set_general_administrator(uuid,boolean,text) to authenticated;

-- Change only the business operations, never the meaning of general administrator.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.owner_confirm_booking(uuid)','public.owner_reject_booking(uuid)',
    'public.owner_add_block(date,date,text)','public.owner_remove_block(uuid)',
    'public.owner_list_occupied_periods()','public.owner_set_house_capacity(integer)',
    'public.owner_save_family_settings(integer,text,integer,text)',
    'public.owner_get_family_settings()','public.owner_validate_booking_rate(uuid,integer)',
    'public.owner_set_booking_paid(uuid,boolean,text)','public.cancel_family_booking(uuid,text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('public.is_site_owner()' in definition)=0 then raise exception 'expected_permission_guard_missing: %',signature; end if;
    execute replace(definition,'public.is_site_owner()','public.can_manage_bookings()');
  end loop;
end $$;

drop policy booking_requests_read_own_or_owner on public.booking_requests;
create policy booking_requests_read_own_or_owner on public.booking_requests for select to authenticated
using(public.require_verified_member() is not null and (user_id=auth.uid() or public.can_manage_bookings()));
drop policy profiles_read on public.member_profiles;
create policy profiles_read on public.member_profiles for select to authenticated
using(public.require_verified_member()=user_id or public.can_manage_bookings());
drop policy history_admin_read on public.admin_history;
create policy history_admin_read on public.admin_history for select to authenticated
using(public.can_manage_bookings());
drop policy occupied_periods_read_owner on public.occupied_periods;
create policy occupied_periods_read_owner on public.occupied_periods for select to authenticated
using(public.can_manage_bookings());
create trigger branch_manager_history after insert or update or delete on public.branch_managers
for each row execute function public.record_family_history();

-- Preserve the existing invitation implementation behind a strictly checked wrapper.
alter function public.owner_invite_member(text,text) rename to internal_owner_invite_member;
revoke all on function public.internal_owner_invite_member(text,text) from public,anon,authenticated;
create function public.owner_invite_member(p_email text,p_role text,p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; target text := lower(btrim(p_email));
begin
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  if not public.can_manage_bookings() then raise exception 'manager_required'; end if;
  if p_role='admin' or public.is_site_owner() then
    if not public.is_site_owner() then raise exception 'owner_required'; end if;
    if p_role='admin' and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 500) then raise exception 'action_reason_required'; end if;
    perform set_config('family.action_reason',coalesce(btrim(p_reason),''),true);
    result := public.internal_owner_invite_member(p_email,p_role);
    perform set_config('family.action_reason','',true);
    return result;
  end if;
  if p_role is distinct from 'member' then raise exception 'invalid_invitation_role'; end if;
  if target is null or char_length(target)>254 or target !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_invitation_email'; end if;
  if exists(select 1 from public.member_invitations where email=target and cancelled_at is null) then raise exception 'invitation_already_exists'; end if;
  insert into public.member_invitations(email,role,invited_by,accepted_at)
  values(target,'member',auth.uid(),case when exists(select 1 from auth.users where lower(email)=target and email_confirmed_at is not null) then now() end)
  on conflict(email) do update set role='member',invited_by=excluded.invited_by,created_at=now(),accepted_at=excluded.accepted_at,cancelled_at=null
  returning id into result;
  return result;
end $$;
revoke all on function public.owner_invite_member(text,text,text) from public,anon;
grant execute on function public.owner_invite_member(text,text,text) to authenticated;
drop policy invitations_admin_read on public.member_invitations;
create policy invitations_admin_read on public.member_invitations for select to authenticated
using(public.can_manage_bookings() and (role='member' or public.is_site_owner()));

alter function public.owner_cancel_invitation(uuid) rename to internal_owner_cancel_invitation;
revoke all on function public.internal_owner_cancel_invitation(uuid) from public,anon,authenticated;
create function public.owner_cancel_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  if not public.can_manage_bookings() then raise exception 'manager_required'; end if;
  if public.is_site_owner() then
    perform public.internal_owner_cancel_invitation(p_id);
    return;
  end if;
  update public.member_invitations set cancelled_at=now()
    where id=p_id and role='member' and accepted_at is null and cancelled_at is null;
  if not found then raise exception 'invitation_not_cancellable'; end if;
end $$;
revoke all on function public.owner_cancel_invitation(uuid) from public,anon;
grant execute on function public.owner_cancel_invitation(uuid) to authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.record_family_history()'::regprocedure) into definition;
  definition := replace(definition,'when public.is_site_owner() then',
    'when TG_TABLE_NAME in (''site_owners'',''branch_managers'') and TG_OP in (''UPDATE'',''DELETE'') and previous->>''user_id''=auth.uid()::text then ''admin'' when public.can_manage_bookings() then');
  definition := replace(definition,'if TG_TABLE_NAME=''member_profiles'' then',
    'if TG_TABLE_NAME=''branch_managers'' then
       changed := changed || jsonb_build_object(''user_id'',jsonb_build_object(''before'',previous->''user_id'',''after'',current_row->''user_id''));
     end if;
     if TG_TABLE_NAME=''member_profiles'' then');
  execute definition;
end $$;

create table public.public_contacts (
  slug text primary key,
  display_name text not null,
  email text,
  sort_order integer not null default 0
);
alter table public.public_contacts enable row level security;
revoke all on public.public_contacts from public,anon,authenticated;
grant select on public.public_contacts to anon,authenticated;
create policy contacts_public_read on public.public_contacts for select to anon,authenticated using(true);

commit;
