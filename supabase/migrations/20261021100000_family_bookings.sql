begin;

create function public.family_today() returns date language sql stable
set search_path = '' as $$ select (now() at time zone 'Europe/Brussels')::date $$;

create function public.family_year(p_date date) returns integer language sql immutable
set search_path = '' as $$
  select extract(year from p_date)::integer - case when extract(month from p_date) < 7 then 1 else 0 end
$$;

create function public.require_verified_member() returns uuid language plpgsql stable
security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception using errcode = '42501', message = 'verified_email_required';
  end if;
  return auth.uid();
end $$;

create table public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  branch text not null check (branch in ('max-leo', 'gustave', 'helene'))
);
alter table public.member_profiles enable row level security;
revoke all on public.member_profiles from anon, authenticated;
grant select on public.member_profiles to authenticated;
create policy profiles_read on public.member_profiles for select to authenticated
using (public.require_verified_member() = user_id or public.is_site_owner());

create function public.save_my_profile(p_first_name text, p_last_name text, p_branch text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_verified_member();
begin
  if exists (select 1 from public.member_profiles where user_id = uid and branch <> p_branch) then
    raise exception 'branch_change_requires_admin';
  end if;
  insert into public.member_profiles values (uid, btrim(p_first_name), btrim(p_last_name), p_branch)
  on conflict (user_id) do update set first_name = excluded.first_name, last_name = excluded.last_name;
end $$;

create function public.owner_update_member_profile(p_user_id uuid, p_first_name text, p_last_name text, p_branch text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  update public.member_profiles set first_name=btrim(p_first_name), last_name=btrim(p_last_name), branch=p_branch
  where user_id=p_user_id;
  if not found then raise exception 'profile_not_found'; end if;
end $$;

-- Only trusted SQL administrators can edit this list, never signup metadata.
create table public.admin_allowlist (email text primary key check (email=lower(email)));
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from public, anon, authenticated;
revoke all on function public.claim_site_owner() from authenticated;
create function public.provision_family_admin() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and exists (
    select 1 from public.admin_allowlist where email=lower(new.email)
  ) then
    perform pg_catalog.pg_advisory_xact_lock(716204161);
    if not exists(select 1 from public.site_owners where user_id=new.id)
      and (select count(*) from public.site_owners) < 2 then
      insert into public.site_owners(user_id) values(new.id);
    end if;
  end if;
  return new;
end $$;
create trigger provision_family_admin after insert or update of email_confirmed_at on auth.users
for each row execute function public.provision_family_admin();

alter table public.house_settings add column rate_cents integer check (rate_cents > 0);
alter table public.house_settings add column transfer_instructions text check (char_length(transfer_instructions) <= 2000);
alter table public.house_settings add constraint house_capacity_limit check (max_guests <= 30);
update public.house_settings set max_guests=30;
create table public.family_priorities (
  start_year integer primary key check (start_year between 2000 and 2200),
  branch text not null check (branch in ('max-leo','gustave','helene'))
);
insert into public.family_priorities values (2026,'helene');
alter table public.family_priorities enable row level security;
revoke all on public.family_priorities from anon, authenticated;
grant select on public.family_priorities to authenticated;
create policy priorities_read on public.family_priorities for select to authenticated
using (public.require_verified_member() is not null);

alter table public.booking_requests drop constraint booking_requests_status_check;
alter table public.booking_requests add constraint booking_requests_status_check
check (status in ('pending','approved','confirmed','rejected','cancelled'));
alter table public.booking_requests add column branch text check (branch in ('max-leo','gustave','helene'));
alter table public.booking_requests add column stay_mode text not null default 'exclusive' check (stay_mode in ('open','exclusive'));
alter table public.booking_requests add column approved_at timestamptz;
alter table public.booking_requests add column approved_by uuid references auth.users(id);
alter table public.booking_requests add column confirmed_at timestamptz;
alter table public.booking_requests add column conflict boolean not null default false;
alter table public.booking_requests add column rate_cents integer check (rate_cents > 0);
alter table public.booking_requests add column billing_ready boolean not null default false;
drop policy booking_requests_read_own_or_owner on public.booking_requests;
create policy booking_requests_read_own_or_owner on public.booking_requests for select to authenticated
using (public.require_verified_member() is not null and (user_id=auth.uid() or public.is_site_owner()));

alter table public.occupied_periods drop constraint occupied_periods_period_excl;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text unique not null,
  kind text not null check (kind in ('confirmation','payment','admin_alert')),
  booking_id uuid references public.booking_requests(id),
  recipient text not null,
  payload jsonb not null,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  retry_window_started_at timestamptz not null default now(),
  locked_at timestamptz,
  delivery_token uuid,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
grant select on public.email_outbox to authenticated;
create policy outbox_admin_read on public.email_outbox for select to authenticated
using (public.require_verified_member() is not null and public.is_site_owner());

create function public.alert_family_admins(p_key text, p_booking uuid, p_message text)
returns void language sql security definer set search_path = '' as $$
  insert into public.email_outbox(event_key,kind,booking_id,recipient,payload)
  select p_key||':'||u.id, 'admin_alert',p_booking,u.email,jsonb_build_object('message',p_message)
  from public.site_owners o join auth.users u on u.id=o.user_id
  where u.email_confirmed_at is not null
  on conflict(event_key) do nothing;
$$;

create function public.family_period_available(p_start date,p_end date,p_count integer,p_mode text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.occupied_periods o left join public.booking_requests b on b.id=o.booking_id
    where o.period && daterange(p_start,p_end,'[)')
      and (o.source_type='owner_block' or p_mode='exclusive' or b.stay_mode='exclusive')
  ) and not exists (
    select 1 from generate_series(0,p_end-p_start-1) d
    where p_count + coalesce((
      select sum(b.guest_count) from public.occupied_periods o
      join public.booking_requests b on b.id=o.booking_id
      where o.period @> (p_start+d) and b.status='confirmed'
    ),0) > (select max_guests from public.house_settings where singleton)
  );
$$;

drop function public.submit_booking_request(text,text,date,date,integer,time,time,text);
create function public.submit_booking_request(
  p_guest_first_name text, p_guest_last_name text, p_check_in date, p_check_out date,
  p_guest_count integer, p_planned_arrival_time time, p_planned_departure_time time,
  p_guest_note text default null, p_stay_mode text default 'exclusive'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid:=public.require_verified_member(); profile public.member_profiles; request_id uuid;
begin
  select * into profile from public.member_profiles where user_id=uid;
  if not found then raise exception 'profile_required'; end if;
  if p_check_in is null or p_check_out is null or p_check_in < public.family_today()
    or p_check_out <= p_check_in or p_check_out > (public.family_today()+interval '6 months')::date then
    raise exception 'stay_outside_six_months';
  end if;
  if p_guest_count is null or p_guest_count < 1 or p_guest_count > 30 then raise exception 'invalid_guest_count'; end if;
  if p_stay_mode is null or p_stay_mode not in ('open','exclusive') then raise exception 'invalid_stay_mode'; end if;
  if not public.family_period_available(p_check_in,p_check_out,p_guest_count,p_stay_mode) then
    raise exception 'occupied_dates_conflict';
  end if;
  insert into public.booking_requests(user_id,guest_first_name,guest_last_name,guest_email,branch,
    check_in,check_out,guest_count,planned_arrival_time,planned_departure_time,guest_note,stay_mode)
  values(uid,btrim(p_guest_first_name),btrim(p_guest_last_name),(select email from auth.users where id=uid),
    profile.branch,p_check_in,p_check_out,p_guest_count,p_planned_arrival_time,p_planned_departure_time,
    nullif(btrim(p_guest_note),''),p_stay_mode) returning id into request_id;
  return request_id;
end $$;

create function public.confirm_family_request(p_id uuid) returns boolean language plpgsql
security definer set search_path = '' as $$
declare b public.booking_requests; priority text;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  select * into b from public.booking_requests where id=p_id for update;
  if not found or b.status <> 'approved' then return false; end if;
  if b.check_in < public.family_today() then
    perform public.alert_family_admins('expired:'||b.id,b.id,'Demande approuvee dont la date est passee : traitement manuel requis.');
    return false;
  end if;
  select branch into priority from public.family_priorities where start_year=public.family_year(b.check_in);
  if priority is null or b.branch is null then
    perform public.alert_family_admins('priority:'||b.id,b.id,'Branche ou priorite annuelle manquante.');
    return false;
  end if;
  if b.branch<>priority and public.family_today() < b.check_in-21 then return false; end if;
  if not public.family_period_available(b.check_in,b.check_out,b.guest_count,b.stay_mode) then
    update public.booking_requests set conflict=true,updated_at=now() where id=b.id;
    perform public.alert_family_admins('conflict:'||b.id,b.id,'Conflit de dates ou capacite : demande non confirmee.');
    return false;
  end if;
  insert into public.occupied_periods(period,source_type,booking_id,created_by)
  values(daterange(b.check_in,b.check_out,'[)'),'booking',b.id,b.approved_by);
  update public.booking_requests set status='confirmed',confirmed_at=now(),conflict=false,updated_at=now(),
    rate_cents=(select rate_cents from public.house_settings where singleton),
    billing_ready=(select rate_cents is not null from public.house_settings where singleton) where id=b.id;
  insert into public.email_outbox(event_key,kind,booking_id,recipient,payload)
  values('confirmation:'||b.id,'confirmation',b.id,b.guest_email,
    jsonb_build_object('name',b.guest_first_name,'check_in',b.check_in,'check_out',b.check_out,
      'guests',b.guest_count,'stay_mode',b.stay_mode))
  on conflict(event_key) do nothing;
  return true;
end $$;

create or replace function public.owner_confirm_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.booking_requests;
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  select * into b from public.booking_requests where id=p_booking_id for update;
  if not found then raise exception 'booking_request_not_found'; end if;
  if b.status not in ('pending','approved') then raise exception 'booking_request_not_pending'; end if;
  if b.check_in < public.family_today() then raise exception 'invalid_stay_dates'; end if;
  if b.branch is null then raise exception 'profile_required'; end if;
  if not exists(select 1 from public.family_priorities where start_year=public.family_year(b.check_in)) then
    raise exception 'priority_not_configured';
  end if;
  update public.booking_requests set status='approved', approved_at=coalesce(approved_at,now()),
    approved_by=coalesce(approved_by,auth.uid()),updated_at=now() where id=b.id;
  -- Process all eligible approvals in the same stable order, even during manual actions.
  perform public.process_family_bookings();
end $$;

create or replace function public.owner_reject_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  update public.booking_requests set status='rejected',updated_at=now()
  where id=p_booking_id and status in ('pending','approved');
  if not found then raise exception 'booking_request_not_pending'; end if;
end $$;

create or replace function public.owner_add_block(p_start_date date,p_end_date date,p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare block_id uuid;
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if p_start_date is null or p_end_date is null or p_start_date<public.family_today() or p_end_date<=p_start_date then
    raise exception 'invalid_block_dates'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  if exists(select 1 from public.occupied_periods where period && daterange(p_start_date,p_end_date,'[)')) then
    raise exception 'occupied_dates_conflict'; end if;
  insert into public.occupied_periods(period,source_type,note,created_by)
  values(daterange(p_start_date,p_end_date,'[)'),'owner_block',nullif(btrim(p_note),''),auth.uid()) returning id into block_id;
  return block_id;
end $$;

create or replace function public.owner_set_house_capacity(p_max_guests integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if p_max_guests is distinct from 30 then raise exception 'house_capacity_fixed_at_30'; end if;
  update public.house_settings set max_guests=30,updated_at=now() where singleton;
end $$;

drop function public.get_occupied_dates();
create function public.get_occupied_dates()
returns table(start_date date,end_date date,guest_name text,guest_count integer,stay_mode text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  return query select lower(o.period),upper(o.period),
    case when b.id is not null then b.guest_first_name||' '||b.guest_last_name else null end,
    coalesce(b.guest_count,30),coalesce(b.stay_mode,'exclusive')
  from public.occupied_periods o left join public.booking_requests b on b.id=o.booking_id
  order by lower(o.period),o.id;
end $$;

create function public.owner_save_family_settings(p_year integer,p_branch text,p_rate_cents integer,p_transfer text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  insert into public.family_priorities values(p_year,p_branch)
  on conflict(start_year) do update set branch=excluded.branch;
  update public.house_settings set rate_cents=p_rate_cents,
    transfer_instructions=nullif(btrim(p_transfer),''),updated_at=now() where singleton;
  perform public.process_family_bookings();
end $$;

create function public.owner_get_family_settings() returns jsonb language plpgsql stable
security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  return (select to_jsonb(s) from public.house_settings s where singleton);
end $$;

create function public.owner_validate_booking_rate(p_id uuid,p_rate_cents integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if p_rate_cents is null or p_rate_cents<=0 then raise exception 'invalid_rate'; end if;
  update public.booking_requests set rate_cents=p_rate_cents,billing_ready=true,updated_at=now()
  where id=p_id and status='confirmed' and not billing_ready;
  if not found then raise exception 'booking_rate_already_validated'; end if;
end $$;

create function public.process_family_bookings() returns void language plpgsql
security definer set search_path = '' as $$
declare b public.booking_requests; instructions text;
begin
  perform pg_catalog.pg_advisory_xact_lock(716204162);
  for b in select * from public.booking_requests where status='approved' order by approved_at,id loop
    perform public.confirm_family_request(b.id);
  end loop;
  select transfer_instructions into instructions from public.house_settings where singleton;
  for b in select * from public.booking_requests
    where status='confirmed' and check_out<public.family_today() and confirmed_at is not null loop
    if not b.billing_ready or b.rate_cents is null or instructions is null then
      perform public.alert_family_admins('billing:'||b.id,b.id,'Tarif du sejour ou instructions de virement a valider avant envoi.');
    else
      insert into public.email_outbox(event_key,kind,booking_id,recipient,payload)
      values('payment:'||b.id,'payment',b.id,b.guest_email,jsonb_build_object(
        'name',b.guest_first_name,'check_in',b.check_in,'check_out',b.check_out,
        'guests',b.guest_count,'nights',b.check_out-b.check_in,'rate_cents',b.rate_cents,
        'amount_cents',b.guest_count::bigint*(b.check_out-b.check_in)*b.rate_cents,
        'transfer',instructions))
      on conflict(event_key) do nothing;
    end if;
  end loop;
end $$;

create function public.claim_family_emails() returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  return query with batch as (
    select id from public.email_outbox
    where ((state in ('pending','failed') and next_attempt_at<=now())
      or (state='sending' and locked_at<now()-interval '10 minutes'))
      and attempts<8
      and retry_window_started_at>now()-interval '23 hours'
    order by created_at,id for update skip locked limit 5
  )
  update public.email_outbox e set state='sending',locked_at=now(),delivery_token=gen_random_uuid(),
    attempts=e.attempts+1 from batch where e.id=batch.id returning e.*;
end $$;

create function public.owner_retry_family_email(p_id uuid,p_delivery_checked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_verified_member();
  if not public.is_site_owner() then raise exception 'owner_required'; end if;
  if p_delivery_checked is distinct from true then raise exception 'email_delivery_check_required'; end if;
  update public.email_outbox set state='pending',attempts=0,next_attempt_at=now(),
    retry_window_started_at=now(),locked_at=null,delivery_token=null,
    last_error='Nouvel envoi autorise par un admin apres verification du fournisseur.'
  where id=p_id and (state='failed' or (
    state in ('pending','sending') and retry_window_started_at<now()-interval '23 hours'
  ));
  if not found then raise exception 'email_not_retryable'; end if;
end $$;

create function public.finish_family_email(p_id uuid,p_token uuid,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.email_outbox set state=case when p_error is null then 'sent' else 'failed' end,
    sent_at=case when p_error is null then now() else null end,last_error=left(p_error,1000),
    next_attempt_at=now()+interval '15 minutes',locked_at=null,delivery_token=null
  where id=p_id and delivery_token=p_token and state='sending';
  if not found then raise exception 'email_delivery_lease_lost'; end if;
end $$;

-- Internal workers use service-role RPCs; authenticated members cannot invoke them.
revoke all on function public.alert_family_admins(text,uuid,text),
  public.family_period_available(date,date,integer,text),public.confirm_family_request(uuid),
  public.process_family_bookings(),public.claim_family_emails(),public.finish_family_email(uuid,uuid,text),
  public.provision_family_admin() from public,anon,authenticated;
grant execute on function public.process_family_bookings(),public.claim_family_emails(),
  public.finish_family_email(uuid,uuid,text) to service_role;

revoke all on function public.save_my_profile(text,text,text),
  public.owner_update_member_profile(uuid,text,text,text),public.require_verified_member(),
  public.submit_booking_request(text,text,date,date,integer,time,time,text,text),
  public.get_occupied_dates(),public.owner_save_family_settings(integer,text,integer,text),
  public.owner_get_family_settings(),public.owner_validate_booking_rate(uuid,integer),
  public.owner_retry_family_email(uuid,boolean)
  from public,anon;
grant execute on function public.save_my_profile(text,text,text),
  public.owner_update_member_profile(uuid,text,text,text),public.require_verified_member(),
  public.submit_booking_request(text,text,date,date,integer,time,time,text,text),
  public.get_occupied_dates(),public.owner_save_family_settings(integer,text,integer,text),
  public.owner_get_family_settings(),public.owner_validate_booking_rate(uuid,integer),
  public.owner_retry_family_email(uuid,boolean) to authenticated;

commit;
