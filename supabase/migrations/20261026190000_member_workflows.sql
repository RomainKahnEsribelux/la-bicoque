begin;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null check (role in ('member','admin')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz
);
alter table public.member_invitations enable row level security;
revoke all on public.member_invitations from public,anon,authenticated;
grant select on public.member_invitations to authenticated;
create policy invitations_admin_read on public.member_invitations for select to authenticated
using (public.require_verified_member() is not null and public.is_site_owner());

create table public.admin_history (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('member','admin','system')),
  entity text not null,
  entity_id text not null,
  operation text not null,
  details jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);
create index admin_history_created_idx on public.admin_history(created_at desc,id desc);
alter table public.admin_history enable row level security;
revoke all on public.admin_history from public,anon,authenticated;
grant select on public.admin_history to authenticated;
create policy history_admin_read on public.admin_history for select to authenticated
using (public.require_verified_member() is not null and public.is_site_owner());

alter table public.booking_requests add column paid_at timestamptz;
alter table public.booking_requests add column paid_by uuid references auth.users(id);
alter table public.email_outbox drop constraint email_outbox_state_check;
alter table public.email_outbox add constraint email_outbox_state_check
check (state in ('pending','sending','sent','failed','cancelled'));

create function public.record_family_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous jsonb := '{}'::jsonb; current_row jsonb := '{}'::jsonb; changed jsonb := '{}'::jsonb; key text;
begin
  if TG_OP <> 'INSERT' then previous := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then current_row := to_jsonb(new); end if;
  if previous = current_row then return null; end if;
  foreach key in array array['status','branch','stay_mode','approved_at','confirmed_at','conflict',
    'rate_cents','billing_ready','paid_at','paid_by','check_in','check_out','guest_count',
    'period','source_type','max_guests','start_year','role','accepted_at','cancelled_at'] loop
    if previous->key is distinct from current_row->key then
      changed := changed || jsonb_build_object(key,jsonb_build_object('before',previous->key,'after',current_row->key));
    end if;
  end loop;
  if previous->'transfer_instructions' is distinct from current_row->'transfer_instructions' then
    changed := changed || '{"transfer_instructions_changed":true}'::jsonb;
  end if;
  if TG_TABLE_NAME='member_profiles' then
    changed := changed || jsonb_build_object('name_changed',
      previous->'first_name' is distinct from current_row->'first_name'
      or previous->'last_name' is distinct from current_row->'last_name');
  end if;
  insert into public.admin_history(actor_id,actor_kind,entity,entity_id,operation,details,reason)
  values(auth.uid(),case when auth.uid() is null then 'system' when public.is_site_owner() then 'admin' else 'member' end,
    TG_TABLE_NAME,coalesce(current_row->>'id',previous->>'id',current_row->>'user_id',previous->>'user_id',
      current_row->>'start_year',previous->>'start_year',current_row->>'slug',previous->>'slug','settings'),
    TG_OP,changed,nullif(current_setting('family.action_reason',true),''));
  return null;
end $$;

create trigger booking_history after insert or update or delete on public.booking_requests
for each row execute function public.record_family_history();
create trigger block_history after insert or update or delete on public.occupied_periods
for each row execute function public.record_family_history();
create trigger settings_history after update on public.house_settings
for each row execute function public.record_family_history();
create trigger priority_history after insert or update or delete on public.family_priorities
for each row execute function public.record_family_history();
create trigger profile_history after update on public.member_profiles
for each row execute function public.record_family_history();
create trigger invitation_history after insert or update on public.member_invitations
for each row execute function public.record_family_history();
create trigger administrator_history after insert or delete on public.site_owners
for each row execute function public.record_family_history();

create or replace function public.provision_family_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    perform pg_catalog.pg_advisory_xact_lock(716204161);
    if exists(select 1 from public.admin_allowlist where email=lower(new.email))
      and not exists(select 1 from public.site_owners where user_id=new.id)
      and (select count(*) from public.site_owners)<2 then
      insert into public.site_owners(user_id) values(new.id);
    end if;
    update public.member_invitations set accepted_at=coalesce(accepted_at,now())
    where email=lower(new.email) and cancelled_at is null;
  end if;
  return new;
end $$;

create function public.owner_invite_member(p_email text,p_role text) returns uuid
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

create function public.owner_cancel_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation public.member_invitations;
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204161);
  select * into invitation from public.member_invitations where id=p_id for update;
  if not found or invitation.accepted_at is not null or invitation.cancelled_at is not null then
    raise exception 'invitation_not_cancellable';
  end if;
  if invitation.role='admin' then
    if exists(select 1 from public.site_owners o join auth.users u on u.id=o.user_id
      where lower(u.email)=invitation.email) then raise exception 'already_administrator'; end if;
    delete from public.admin_allowlist where email=invitation.email;
  end if;
  update public.member_invitations set cancelled_at=now() where id=p_id;
end $$;

create function public.owner_list_administrators()
returns table(user_id uuid,email text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  return query select o.user_id,u.email::text,o.created_at
    from public.site_owners o join auth.users u on u.id=o.user_id order by o.created_at;
end $$;

create function public.cancel_family_booking(p_id uuid,p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_verified_member(); b public.booking_requests; owner boolean := public.is_site_owner();
  admin_action boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  select * into b from public.booking_requests where id=p_id for update;
  if not found or (b.user_id<>uid and not owner) then raise exception 'booking_request_not_found'; end if;
  if b.status='cancelled' then return; end if;
  if b.status not in ('pending','approved','confirmed') then raise exception 'booking_not_cancellable'; end if;
  if not owner and b.check_in<=public.family_today() then raise exception 'cancellation_requires_admin'; end if;
  admin_action := owner and (b.user_id<>uid or b.check_in<=public.family_today() or p_reason is not null);
  if admin_action and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 500) then
    raise exception 'action_reason_required'; end if;
  perform set_config('family.action_reason',case when admin_action then btrim(p_reason) else 'Annulation par le demandeur' end,true);
  delete from public.occupied_periods where booking_id=b.id;
  update public.booking_requests set status='cancelled',conflict=false,updated_at=now() where id=b.id;
  update public.email_outbox set state='cancelled',locked_at=null,delivery_token=null,last_error='Sejour annule.'
    where booking_id=b.id and state in ('pending','failed','sending');
  perform set_config('family.action_reason','',true);
  perform public.process_family_bookings();
end $$;

create function public.owner_set_booking_paid(p_id uuid,p_paid boolean,p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.booking_requests;
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  select * into b from public.booking_requests where id=p_id for update;
  if not found or b.status<>'confirmed' or not b.billing_ready or b.rate_cents is null then
    raise exception 'payment_amount_not_ready'; end if;
  if p_paid is null then raise exception 'invalid_payment_status'; end if;
  if (b.paid_at is not null)=p_paid then return; end if;
  if not p_paid and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 500) then
    raise exception 'action_reason_required'; end if;
  perform set_config('family.action_reason',case when p_paid then 'Paiement total recu' else btrim(p_reason) end,true);
  update public.booking_requests set paid_at=case when p_paid then now() end,
    paid_by=case when p_paid then auth.uid() end,updated_at=now() where id=b.id;
  if p_paid then
    update public.email_outbox set state='cancelled',locked_at=null,delivery_token=null,last_error='Paiement recu.'
    where booking_id=b.id and kind='payment' and state in ('pending','failed','sending');
  end if;
  perform set_config('family.action_reason','',true);
end $$;

create function public.get_my_stays() returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_verified_member();
begin
  return query select to_jsonb(b) || jsonb_build_object(
    'amount_cents',case when b.status='confirmed' and b.billing_ready then
      b.guest_count::bigint*(b.check_out-b.check_in)*b.rate_cents end,
    'transfer_instructions',case when b.status='confirmed' and b.billing_ready then
      (select transfer_instructions from public.house_settings where singleton) end)
    from public.booking_requests b where b.user_id=uid order by b.created_at desc,b.id;
end $$;

create or replace function public.process_family_bookings() returns void language plpgsql
security definer set search_path = '' as $$
declare b public.booking_requests; instructions text;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  for b in select * from public.booking_requests where status='approved' order by approved_at,id loop
    perform public.confirm_family_request(b.id);
  end loop;
  select transfer_instructions into instructions from public.house_settings where singleton;
  for b in select * from public.booking_requests
    where status='confirmed' and paid_at is null and check_out<public.family_today() and confirmed_at is not null loop
    if not b.billing_ready or b.rate_cents is null or instructions is null then
      perform public.alert_family_admins('billing:'||b.id,b.id,'Tarif du sejour ou instructions de virement a valider avant envoi.');
    else
      insert into public.email_outbox(event_key,kind,booking_id,recipient,payload)
      values('payment:'||b.id,'payment',b.id,b.guest_email,jsonb_build_object(
        'name',b.guest_first_name,'check_in',b.check_in,'check_out',b.check_out,
        'guests',b.guest_count,'nights',b.check_out-b.check_in,'rate_cents',b.rate_cents,
        'amount_cents',b.guest_count::bigint*(b.check_out-b.check_in)*b.rate_cents,'transfer',instructions))
      on conflict(event_key) do update set payload=excluded.payload,state='pending',attempts=0,
        next_attempt_at=now(),retry_window_started_at=now(),last_error=null
      where public.email_outbox.state='cancelled';
    end if;
  end loop;
end $$;

create table public.practical_guides (
  slug text primary key,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);
alter table public.practical_guides enable row level security;
revoke all on public.practical_guides from public,anon,authenticated;
grant select on public.practical_guides to authenticated;
create policy guides_verified_read on public.practical_guides for select to authenticated
using (public.is_verified_user());

revoke all on function public.record_family_history() from public,anon,authenticated;
revoke all on function public.owner_invite_member(text,text),public.owner_cancel_invitation(uuid),
  public.owner_list_administrators(),public.cancel_family_booking(uuid,text),
  public.owner_set_booking_paid(uuid,boolean,text),public.get_my_stays() from public,anon;
grant execute on function public.owner_invite_member(text,text),public.owner_cancel_invitation(uuid),
  public.owner_list_administrators(),public.cancel_family_booking(uuid,text),
  public.owner_set_booking_paid(uuid,boolean,text),public.get_my_stays() to authenticated;

commit;
