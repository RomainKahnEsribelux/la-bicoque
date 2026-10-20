create table public.site_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_owners enable row level security;
revoke all on public.site_owners from anon, authenticated;

create table public.house_settings (
  singleton boolean primary key default true check (singleton),
  max_guests integer check (max_guests is null or max_guests > 0),
  updated_at timestamptz not null default now()
);

insert into public.house_settings (singleton, max_guests) values (true, null);

alter table public.house_settings enable row level security;
revoke all on public.house_settings from anon, authenticated;

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  guest_first_name text not null check (char_length(btrim(guest_first_name)) between 1 and 80),
  guest_last_name text not null check (char_length(btrim(guest_last_name)) between 1 and 80),
  guest_email text not null,
  check_in date not null,
  check_out date not null,
  guest_count integer not null check (guest_count > 0),
  planned_arrival_time time not null,
  planned_departure_time time not null,
  guest_note text check (guest_note is null or char_length(guest_note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  check (
    extract(minute from planned_arrival_time) = 0
    and extract(second from planned_arrival_time) = 0
    and extract(minute from planned_departure_time) = 0
    and extract(second from planned_departure_time) = 0
  )
);

create index booking_requests_user_created_idx
  on public.booking_requests (user_id, created_at desc);

alter table public.booking_requests enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.booking_requests from anon, authenticated;
grant select on public.booking_requests to authenticated;

create function public.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_owners
    where user_id = (select auth.uid())
  );
$$;

create policy booking_requests_read_own_or_owner
  on public.booking_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_site_owner()));

create table public.occupied_periods (
  id uuid primary key default gen_random_uuid(),
  period daterange not null,
  source_type text not null check (source_type in ('booking', 'owner_block')),
  booking_id uuid unique references public.booking_requests (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  check (
    (source_type = 'booking' and booking_id is not null and note is null)
    or (source_type = 'owner_block' and booking_id is null)
  ),
  exclude using gist (period with &&)
);

alter table public.occupied_periods enable row level security;
revoke all on public.occupied_periods from anon, authenticated;

create policy occupied_periods_read_owner
  on public.occupied_periods for select to authenticated
  using ((select public.is_site_owner()));

create function public.claim_site_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_user_count bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(716204161);

  if exists (select 1 from public.site_owners) then
    raise exception using errcode = 'P0001', message = 'owner_already_claimed';
  end if;

  select count(*) into auth_user_count from auth.users;

  if auth_user_count <> 1
    or not exists (select 1 from auth.users where id = (select auth.uid())) then
    raise exception using errcode = 'P0001', message = 'owner_claim_requires_single_user';
  end if;

  insert into public.site_owners (user_id) values ((select auth.uid()));
end;
$$;

create function public.get_booking_capacity()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select max_guests from public.house_settings where singleton;
$$;

create function public.get_occupied_dates()
returns table (start_date date, end_date date, guest_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(o.period),
    upper(o.period),
    case
      when o.source_type = 'booking' then btrim(b.guest_first_name || ' ' || b.guest_last_name)
      else null
    end
  from public.occupied_periods as o
  left join public.booking_requests as b
    on b.id = o.booking_id and b.status = 'confirmed'
  where o.source_type = 'owner_block' or b.id is not null
  order by lower(o.period);
$$;

create function public.submit_booking_request(
  p_guest_first_name text,
  p_guest_last_name text,
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_planned_arrival_time time,
  p_planned_departure_time time,
  p_guest_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_user_email text := (select auth.jwt() ->> 'email');
  capacity integer;
  request_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if current_user_email is null or current_user_email = '' then
    raise exception using errcode = 'P0001', message = 'account_email_required';
  end if;

  if p_guest_first_name is null or char_length(btrim(p_guest_first_name)) not between 1 and 80
    or p_guest_last_name is null or char_length(btrim(p_guest_last_name)) not between 1 and 80 then
    raise exception using errcode = 'P0001', message = 'invalid_guest_name';
  end if;

  if p_check_in is null or p_check_out is null or p_check_in < current_date
    or p_check_out <= p_check_in then
    raise exception using errcode = 'P0001', message = 'invalid_stay_dates';
  end if;

  if p_guest_count is null or p_guest_count <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_guest_count';
  end if;

  if p_planned_arrival_time is null or p_planned_departure_time is null then
    raise exception using errcode = 'P0001', message = 'arrival_and_departure_times_required';
  end if;

  if extract(minute from p_planned_arrival_time) <> 0
    or extract(second from p_planned_arrival_time) <> 0
    or extract(minute from p_planned_departure_time) <> 0
    or extract(second from p_planned_departure_time) <> 0 then
    raise exception using errcode = 'P0001', message = 'booking_times_must_be_on_hour';
  end if;

  if p_guest_note is not null and char_length(p_guest_note) > 1000 then
    raise exception using errcode = 'P0001', message = 'guest_note_too_long';
  end if;

  select max_guests into capacity
  from public.house_settings
  where singleton;

  if capacity is null then
    raise exception using errcode = 'P0001', message = 'house_capacity_not_configured';
  end if;

  if p_guest_count > capacity then
    raise exception using errcode = 'P0001', message = 'guest_count_exceeds_capacity';
  end if;

  if exists (
    select 1 from public.occupied_periods
    where period && daterange(p_check_in, p_check_out, '[)')
  ) then
    raise exception using errcode = 'P0001', message = 'occupied_dates_conflict';
  end if;

  insert into public.booking_requests (
    user_id, guest_first_name, guest_last_name, guest_email, check_in, check_out, guest_count,
    planned_arrival_time, planned_departure_time, guest_note
  )
  values (
    current_user_id, btrim(p_guest_first_name), btrim(p_guest_last_name),
    current_user_email, p_check_in, p_check_out, p_guest_count,
    p_planned_arrival_time, p_planned_departure_time, nullif(btrim(p_guest_note), '')
  )
  returning id into request_id;

  return request_id;
end;
$$;

create function public.owner_set_house_capacity(p_max_guests integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;
  if p_max_guests is null or p_max_guests <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_house_capacity';
  end if;

  update public.house_settings
  set max_guests = p_max_guests, updated_at = now()
  where singleton;
end;
$$;

create function public.owner_confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.booking_requests%rowtype;
  capacity integer;
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;

  select * into request_row
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'booking_request_not_found';
  end if;
  if request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'booking_request_not_pending';
  end if;

  select max_guests into capacity
  from public.house_settings
  where singleton;

  if capacity is null then
    raise exception using errcode = 'P0001', message = 'house_capacity_not_configured';
  end if;
  if request_row.guest_count > capacity then
    raise exception using errcode = 'P0001', message = 'guest_count_exceeds_capacity';
  end if;

  insert into public.occupied_periods (period, source_type, booking_id, created_by)
  values (
    daterange(request_row.check_in, request_row.check_out, '[)'),
    'booking',
    request_row.id,
    (select auth.uid())
  );

  update public.booking_requests
  set status = 'confirmed', updated_at = now()
  where id = request_row.id;
exception
  when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'occupied_dates_conflict';
end;
$$;

create function public.owner_reject_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_status text;
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;

  select status into request_status
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'booking_request_not_found';
  end if;
  if request_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'booking_request_not_pending';
  end if;

  update public.booking_requests
  set status = 'rejected', updated_at = now()
  where id = p_booking_id;
end;
$$;

create function public.owner_add_block(
  p_start_date date,
  p_end_date date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  block_id uuid;
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;
  if p_start_date is null or p_end_date is null
    or p_start_date < current_date or p_end_date <= p_start_date then
    raise exception using errcode = 'P0001', message = 'invalid_block_dates';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception using errcode = 'P0001', message = 'block_note_too_long';
  end if;

  insert into public.occupied_periods (period, source_type, note, created_by)
  values (
    daterange(p_start_date, p_end_date, '[)'),
    'owner_block',
    nullif(btrim(p_note), ''),
    (select auth.uid())
  )
  returning id into block_id;

  return block_id;
exception
  when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'occupied_dates_conflict';
end;
$$;

create function public.owner_remove_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;

  delete from public.occupied_periods
  where id = p_block_id and source_type = 'owner_block';

  if not found then
    raise exception using errcode = 'P0001', message = 'owner_block_not_found';
  end if;
end;
$$;

create function public.owner_list_occupied_periods()
returns table (
  id uuid,
  start_date date,
  end_date date,
  source_type text,
  note text,
  booking_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_site_owner()) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;

  return query
  select o.id, lower(o.period), upper(o.period), o.source_type, o.note, o.booking_id
  from public.occupied_periods as o
  order by lower(o.period);
end;
$$;

revoke all on function public.is_site_owner() from public, anon;
revoke all on function public.claim_site_owner() from public, anon;
revoke all on function public.get_booking_capacity() from public, anon;
revoke all on function public.get_occupied_dates() from public, anon;
revoke all on function public.submit_booking_request(text, text, date, date, integer, time, time, text) from public, anon;
revoke all on function public.owner_set_house_capacity(integer) from public, anon;
revoke all on function public.owner_confirm_booking(uuid) from public, anon;
revoke all on function public.owner_reject_booking(uuid) from public, anon;
revoke all on function public.owner_add_block(date, date, text) from public, anon;
revoke all on function public.owner_remove_block(uuid) from public, anon;
revoke all on function public.owner_list_occupied_periods() from public, anon;

grant execute on function public.is_site_owner() to authenticated;
grant execute on function public.claim_site_owner() to authenticated;
grant execute on function public.get_booking_capacity() to authenticated;
grant execute on function public.get_occupied_dates() to authenticated;
grant execute on function public.submit_booking_request(text, text, date, date, integer, time, time, text) to authenticated;
grant execute on function public.owner_set_house_capacity(integer) to authenticated;
grant execute on function public.owner_confirm_booking(uuid) to authenticated;
grant execute on function public.owner_reject_booking(uuid) to authenticated;
grant execute on function public.owner_add_block(date, date, text) to authenticated;
grant execute on function public.owner_remove_block(uuid) to authenticated;
grant execute on function public.owner_list_occupied_periods() to authenticated;
