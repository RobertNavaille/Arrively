-- Arrively v1 schema: businesses, drivers, routes, stops, locations, texts, chat, calls.
-- Business rules (stop states, one trip at a time, arrival/departure detection,
-- which texts go out) live here so every client gets the same behavior (ARC-3).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'driver');
create type public.route_status as enum ('planned', 'active', 'completed');
create type public.stop_status as enum (
  'scheduled',  -- not on a started route yet
  'queued',     -- on an active route, other stops ahead
  'en_route',   -- the driver is heading here
  'arrived',    -- inside the stop's area
  'completed', 'no_show', 'skipped', 'cancelled'
);
create type public.notification_kind as enum ('scheduled', 'next', 'arrived', 'call_back', 'chat_unread');
create type public.notification_status as enum ('pending', 'sent', 'delivered', 'failed', 'suppressed');
create type public.message_sender as enum ('customer', 'driver', 'system');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,                        -- shown on the tracking page ("Call Acme Plumbing")
  logo_url text,
  timezone text not null default 'America/New_York',
  arrival_radius_m int not null default 75,
  drivers_can_add_stops boolean not null default true,
  extra_texts jsonb not null default '{}'::jsonb, -- optional texts the operator turned on
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  role public.user_role not null default 'driver',
  name text not null,
  phone text,
  photo_url text,
  vehicle text,                      -- "White Ford Transit · 7KQ 204"
  on_duty boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.profiles (org_id);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  driver_id uuid references public.profiles (id) on delete set null,
  day date not null,
  status public.route_status not null default 'planned',
  optimized_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (driver_id, day)
);
create index on public.routes (org_id, day);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  route_id uuid references public.routes (id) on delete set null,
  position int,                      -- order within the route, 1-based
  status public.stop_status not null default 'scheduled',
  customer_name text not null default 'New stop',
  customer_phone text,               -- E.164, e.g. +14015550100
  sms_consent_at timestamptz,        -- consent recorded by the operator (CMP-2)
  sms_consent_source text,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  window_start timestamptz,
  window_end timestamptz,
  service_minutes int not null default 20,
  notes text,
  tracking_token text not null unique default encode(gen_random_bytes(18), 'base64'),
  eta timestamptz,
  trip_started_at timestamptz,
  arrived_at timestamptz,
  marked_at timestamptz,
  departed_at timestamptz,           -- set when the driver leaves after marking (STP-10)
  marked_outside boolean not null default false,
  mark_reason text,
  created_by uuid references public.profiles (id),
  address_edited_by uuid references public.profiles (id),
  address_edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.stops (route_id, position);
create index on public.stops (org_id, status);

-- Tracking tokens must be URL-safe.
create or replace function public.url_token() returns text language sql volatile as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_')
$$;
alter table public.stops alter column tracking_token set default public.url_token();

-- Latest position per driver (what the tracking page reads) plus history.
create table public.driver_locations (
  driver_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading real,
  speed real,
  accuracy real,
  recorded_at timestamptz not null default now()
);

create table public.location_pings (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading real,
  speed real,
  accuracy real,
  recorded_at timestamptz not null default now()
);
create index on public.location_pings (driver_id, recorded_at desc);

create table public.stop_events (
  id bigint generated always as identity primary key,
  stop_id uuid not null references public.stops (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index on public.stop_events (stop_id, created_at);

create table public.notifications (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  stop_id uuid not null references public.stops (id) on delete cascade,
  kind public.notification_kind not null,
  to_phone text not null,
  body text not null,
  status public.notification_status not null default 'pending',
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (stop_id, kind)             -- each text at most once per stop (NTF-5)
);
create index on public.notifications (status, created_at);

create table public.sms_opt_outs (
  phone text primary key,
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  stop_id uuid not null references public.stops (id) on delete cascade,
  sender public.message_sender not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.messages (stop_id, created_at);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.stops (id) on delete cascade,
  initiator public.message_sender not null,
  room text not null,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Great-circle distance in meters.
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.first_name(full_name text) returns text
language sql immutable as $$ select split_part(coalesce(full_name, ''), ' ', 1) $$;

create or replace function public.log_event(p_stop uuid, p_type text, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.stop_events (stop_id, type, data, actor) values (p_stop, p_type, p_data, auth.uid())
$$;

-- The base URL of the tracking page, set per environment:
--   alter database postgres set app.tracking_base_url = 'https://arrively.vercel.app/t/';
create or replace function public.tracking_url(p_token text) returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.tracking_base_url', true), ''), 'https://arrively.app/t/') || p_token
$$;

-- ---------------------------------------------------------------------------
-- Texts (NTF-2): three by default. Rows are queued here and sent by the
-- `notify` edge function, which a database webhook calls on insert.
-- ---------------------------------------------------------------------------
create or replace function public.queue_text(p_stop public.stops, p_kind public.notification_kind)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org public.orgs;
  v_driver text;
  v_body text;
  v_window text;
begin
  if p_stop.customer_phone is null then return; end if;
  select * into v_org from public.orgs where id = p_stop.org_id;
  select public.first_name(p.name) into v_driver
    from public.routes r join public.profiles p on p.id = r.driver_id
    where r.id = p_stop.route_id;
  v_driver := coalesce(nullif(v_driver, ''), 'Your driver');

  if p_kind = 'scheduled' then
    v_window := case when p_stop.window_start is null then 'today'
      else to_char(p_stop.window_start at time zone v_org.timezone, 'Dy Mon FMDD, FMHH12:MI am')
        || ' – ' || to_char(p_stop.window_end at time zone v_org.timezone, 'FMHH12:MI am') end;
    v_body := v_org.name || ' via Arrively: your visit is scheduled for ' || lower(v_window)
      || '. Track it here: ' || public.tracking_url(p_stop.tracking_token) || ' Reply STOP to opt out.';
  elsif p_kind = 'next' then
    v_body := v_org.name || ': you''re next. ' || v_driver || ' is on the way'
      || coalesce(' and should arrive around ' || lower(to_char(p_stop.eta at time zone v_org.timezone, 'FMHH12:MI am')), '')
      || '. Track live: ' || public.tracking_url(p_stop.tracking_token);
  elsif p_kind = 'arrived' then
    v_body := v_org.name || ': ' || v_driver || ' has arrived.';
  elsif p_kind = 'call_back' then
    v_body := v_org.name || ': ' || v_driver || ' tried to call you. Tap to call back: '
      || public.tracking_url(p_stop.tracking_token);
  elsif p_kind = 'chat_unread' then
    v_body := v_org.name || ': ' || v_driver || ' sent you a message. Read it here: '
      || public.tracking_url(p_stop.tracking_token);
  end if;

  insert into public.notifications (org_id, stop_id, kind, to_phone, body, status)
  values (
    p_stop.org_id, p_stop.id, p_kind, p_stop.customer_phone, v_body,
    case
      when p_stop.sms_consent_at is null then 'suppressed'
      when exists (select 1 from public.sms_opt_outs o where o.phone = p_stop.customer_phone) then 'suppressed'
      else 'pending'
    end::public.notification_status
  )
  on conflict (stop_id, kind) do nothing;
end $$;

create or replace function public.stops_texts_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Scheduled: once the stop has a phone, consent and a route.
  if new.route_id is not null and new.customer_phone is not null and new.sms_consent_at is not null
     and new.status not in ('cancelled') then
    perform public.queue_text(new, 'scheduled');
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'en_route' then perform public.queue_text(new, 'next'); end if;
    if new.status = 'arrived' then perform public.queue_text(new, 'arrived'); end if;
  end if;
  return new;
end $$;

create trigger stops_texts after insert or update on public.stops
for each row execute function public.stops_texts_trigger();

-- ---------------------------------------------------------------------------
-- Driver actions (RPCs). Clients never update stop status directly.
-- ---------------------------------------------------------------------------
create or replace function public.assert_driver_of(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  select s.* into v from public.stops s join public.routes r on r.id = s.route_id
   where s.id = p_stop and (r.driver_id = auth.uid() or (public.is_admin() and s.org_id = public.my_org()));
  if not found then raise exception 'not your stop' using errcode = '42501'; end if;
  return v;
end $$;

-- Start the day: route becomes active, its stops queued.
create or replace function public.start_route(p_route uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.routes set status = 'active', started_at = coalesce(started_at, now())
   where id = p_route and driver_id = auth.uid() and status <> 'completed';
  if not found then raise exception 'not your route' using errcode = '42501'; end if;
  update public.stops set status = 'queued'
   where route_id = p_route and status = 'scheduled';
end $$;

-- One trip at a time (DRV-15/16): the next trip starts only when no other
-- stop on the route is en route or arrived-but-unmarked.
create or replace function public.start_trip(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops; v_busy int;
begin
  v := public.assert_driver_of(p_stop);
  if v.status not in ('queued', 'scheduled') then
    raise exception 'stop is %', v.status using errcode = 'P0001';
  end if;
  select count(*) into v_busy from public.stops
   where route_id = v.route_id and id <> v.id and status in ('en_route', 'arrived');
  if v_busy > 0 then
    raise exception 'mark your current stop before starting the next trip' using errcode = 'P0001';
  end if;
  update public.routes set status = 'active', started_at = coalesce(started_at, now())
   where id = v.route_id and status = 'planned';
  update public.stops set status = 'queued' where route_id = v.route_id and status = 'scheduled' and id <> v.id;
  update public.stops set status = 'en_route', trip_started_at = now() where id = v.id returning * into v;
  perform public.log_event(v.id, 'trip_started');
  return v;
end $$;

create or replace function public.mark_arrived(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status <> 'en_route' then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'arrived', arrived_at = now() where id = v.id returning * into v;
  perform public.log_event(v.id, 'arrived', jsonb_build_object('manual', true));
  return v;
end $$;

-- Complete / no-show / skip / defer. Complete and no-show away from the stop
-- need a reason and are flagged (DRV-18). Defer moves the stop to the end.
create or replace function public.mark_stop(
  p_stop uuid, p_outcome text, p_reason text default null,
  p_lat float8 default null, p_lng float8 default null
) returns public.stops
language plpgsql security definer set search_path = public as $$
declare
  v public.stops; v_radius int; v_dist float8; v_outside boolean := false; v_max int;
begin
  v := public.assert_driver_of(p_stop);
  if v.status not in ('en_route', 'arrived', 'queued') then
    raise exception 'stop is already %', v.status using errcode = 'P0001';
  end if;
  select arrival_radius_m into v_radius from public.orgs where id = v.org_id;
  if p_lat is not null then
    v_dist := public.distance_m(p_lat, p_lng, v.lat, v.lng);
    v_outside := v_dist > v_radius * 2;
  end if;

  if p_outcome in ('completed', 'no_show') then
    if v_outside and coalesce(p_reason, '') = '' then
      raise exception 'you are away from the stop; add a reason' using errcode = 'P0001';
    end if;
    update public.stops set
      status = p_outcome::public.stop_status, marked_at = now(), mark_reason = p_reason,
      marked_outside = v_outside,
      departed_at = case when v_outside then now() else null end
    where id = v.id returning * into v;
  elsif p_outcome = 'skipped' then
    if coalesce(p_reason, '') = '' then raise exception 'a reason is required' using errcode = 'P0001'; end if;
    update public.stops set status = 'skipped', marked_at = now(), mark_reason = p_reason,
      departed_at = case when status = 'arrived' and not v_outside then null else now() end
    where id = v.id returning * into v;
  elsif p_outcome = 'deferred' then
    if coalesce(p_reason, '') = '' then raise exception 'a reason is required' using errcode = 'P0001'; end if;
    select coalesce(max(position), 0) into v_max from public.stops where route_id = v.route_id;
    update public.stops set status = 'queued', position = v_max + 1, mark_reason = p_reason,
      trip_started_at = null, arrived_at = null
    where id = v.id returning * into v;
  else
    raise exception 'unknown outcome %', p_outcome using errcode = 'P0001';
  end if;

  perform public.log_event(v.id, 'marked', jsonb_build_object(
    'outcome', p_outcome, 'reason', p_reason, 'outside', v_outside, 'distance_m', v_dist));

  -- Route complete when nothing is left to do.
  if not exists (select 1 from public.stops where route_id = v.route_id
                 and status in ('scheduled', 'queued', 'en_route', 'arrived')) then
    update public.routes set status = 'completed', completed_at = now() where id = v.route_id;
  end if;
  return v;
end $$;

-- Driver adds a stop to one of their routes (DRV-24).
create or replace function public.add_stop(
  p_route uuid, p_address text, p_lat float8, p_lng float8,
  p_customer_name text default null, p_customer_phone text default null, p_notes text default null
) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops; v_route public.routes; v_allowed boolean; v_max int;
begin
  select * into v_route from public.routes where id = p_route;
  if not found or not (v_route.driver_id = auth.uid() or (public.is_admin() and v_route.org_id = public.my_org())) then
    raise exception 'not your route' using errcode = '42501';
  end if;
  select drivers_can_add_stops into v_allowed from public.orgs where id = v_route.org_id;
  if not public.is_admin() and not v_allowed then
    raise exception 'adding stops is turned off for drivers' using errcode = '42501';
  end if;
  select coalesce(max(position), 0) into v_max from public.stops where route_id = p_route;
  -- Adding to a finished route reopens it.
  if v_route.status = 'completed' then
    update public.routes set status = 'active', completed_at = null where id = p_route returning * into v_route;
  end if;
  insert into public.stops (org_id, route_id, position, status, customer_name, customer_phone, address, lat, lng, notes, created_by)
  values (v_route.org_id, p_route, v_max + 1,
          (case when v_route.status = 'active' then 'queued' else 'scheduled' end)::public.stop_status,
          coalesce(nullif(p_customer_name, ''), 'New stop'), p_customer_phone, p_address, p_lat, p_lng, p_notes, auth.uid())
  returning * into v;
  perform public.log_event(v.id, 'added');
  return v;
end $$;

-- Driver corrects an address or moves the pin (DRV-23).
create or replace function public.update_stop_address(p_stop uuid, p_address text, p_lat float8, p_lng float8)
returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops; v_old text;
begin
  v := public.assert_driver_of(p_stop);
  v_old := v.address;
  update public.stops set address = p_address, lat = p_lat, lng = p_lng,
    address_edited_by = auth.uid(), address_edited_at = now()
  where id = v.id returning * into v;
  perform public.log_event(v.id, 'address_edited', jsonb_build_object('from', v_old, 'to', p_address));
  return v;
end $$;

-- Set the order of a route's stops (after optimization or a manual reorder).
create or replace function public.reorder_route(p_route uuid, p_stop_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_route public.routes; v_ids uuid[]; v_slots int[]; i int;
begin
  select * into v_route from public.routes where id = p_route;
  if not found or not (v_route.driver_id = auth.uid() or (public.is_admin() and v_route.org_id = public.my_org())) then
    raise exception 'not your route' using errcode = '42501';
  end if;
  -- Only upcoming stops move. They take the slots upcoming stops already hold,
  -- so finished and in-progress stops keep their place.
  select array_agg(x.id order by x.ord) into v_ids
    from unnest(p_stop_ids) with ordinality as x(id, ord)
    join public.stops s on s.id = x.id and s.route_id = p_route and s.status in ('scheduled', 'queued');
  select array_agg(position order by position) into v_slots
    from public.stops where id = any(v_ids);
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    update public.stops set position = v_slots[i] where id = v_ids[i];
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Location: the app sends pings; arrival and departure are detected here.
-- ---------------------------------------------------------------------------
create or replace function public.report_location(
  p_lat float8, p_lng float8, p_heading real default null, p_speed real default null,
  p_accuracy real default null, p_recorded_at timestamptz default now()
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid := auth.uid(); v_route public.routes; v_radius int; s public.stops; v_next public.stops;
begin
  if v_driver is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.location_pings (driver_id, lat, lng, heading, speed, accuracy, recorded_at)
  values (v_driver, p_lat, p_lng, p_heading, p_speed, p_accuracy, p_recorded_at);
  insert into public.driver_locations (driver_id, lat, lng, heading, speed, accuracy, recorded_at)
  values (v_driver, p_lat, p_lng, p_heading, p_speed, p_accuracy, p_recorded_at)
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading,
    speed = excluded.speed, accuracy = excluded.accuracy, recorded_at = excluded.recorded_at
  where public.driver_locations.recorded_at <= excluded.recorded_at;

  select * into v_route from public.routes
   where driver_id = v_driver and status = 'active' order by day desc limit 1;
  if not found then return; end if;
  select arrival_radius_m into v_radius from public.orgs where id = v_route.org_id;

  -- Arrival: the en-route stop is inside its radius.
  for s in select * from public.stops where route_id = v_route.id and status = 'en_route' loop
    if public.distance_m(p_lat, p_lng, s.lat, s.lng) <= v_radius then
      update public.stops set status = 'arrived', arrived_at = now() where id = s.id;
      perform public.log_event(s.id, 'arrived', jsonb_build_object('manual', false));
    end if;
  end loop;

  -- Departure: a marked stop the driver has now left (STP-10). Leaving also
  -- starts the trip to the next stop if the driver didn't tap Start trip.
  for s in select * from public.stops where route_id = v_route.id
           and status in ('completed', 'no_show', 'skipped') and departed_at is null loop
    if public.distance_m(p_lat, p_lng, s.lat, s.lng) > v_radius * 1.5 then
      update public.stops set departed_at = now() where id = s.id;
      perform public.log_event(s.id, 'departed');
      if not exists (select 1 from public.stops where route_id = v_route.id and status in ('en_route', 'arrived')) then
        select * into v_next from public.stops where route_id = v_route.id and status = 'queued'
         order by position limit 1;
        if found then
          update public.stops set status = 'en_route', trip_started_at = now() where id = v_next.id;
          perform public.log_event(v_next.id, 'trip_started', jsonb_build_object('auto', true));
        end if;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Customer tracking page (no sign-in): everything goes through the token.
-- Privacy (PRV-2/3): driver location only while the route is active and this
-- stop isn't finished; other stops appear only as a count.
-- ---------------------------------------------------------------------------
create or replace function public.get_tracking(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.stops; r public.routes; o public.orgs; d public.profiles; loc public.driver_locations;
  v_ahead int; v_show_driver boolean; v_active boolean;
begin
  select * into s from public.stops where tracking_token = p_token;
  if not found then return null; end if;
  -- Links expire 30 minutes after the stop is finished (PRV-1).
  if s.marked_at is not null and s.marked_at < now() - interval '30 minutes' then
    return jsonb_build_object('expired', true);
  end if;
  select * into o from public.orgs where id = s.org_id;
  select * into r from public.routes where id = s.route_id;
  select * into d from public.profiles where id = r.driver_id;
  select * into loc from public.driver_locations where driver_id = r.driver_id;

  v_active := r.status = 'active';
  -- Stops ahead count only drops once the driver has left a stop.
  select count(*) into v_ahead from public.stops x
   where x.route_id = s.route_id and x.position < s.position
     and x.status not in ('cancelled')
     and not (x.status in ('completed', 'no_show', 'skipped') and x.departed_at is not null);
  v_show_driver := v_active and s.status in ('queued', 'en_route', 'arrived') and loc.driver_id is not null;

  return jsonb_build_object(
    'business', jsonb_build_object('name', o.name, 'phone', o.phone, 'logo_url', o.logo_url),
    'stop', jsonb_build_object(
      'status', s.status, 'address', s.address, 'lat', s.lat, 'lng', s.lng,
      'window_start', s.window_start, 'window_end', s.window_end, 'eta', s.eta,
      'arrived_at', s.arrived_at, 'marked_at', s.marked_at, 'notes', s.notes),
    'stops_ahead', case when s.status in ('queued') then v_ahead else 0 end,
    'driver', case when d.id is null then null else jsonb_build_object(
      'first_name', public.first_name(d.name), 'photo_url', d.photo_url, 'vehicle', d.vehicle) end,
    'driver_location', case when v_show_driver then jsonb_build_object(
      'lat', loc.lat, 'lng', loc.lng, 'heading', loc.heading, 'recorded_at', loc.recorded_at) else null end,
    'route_active', v_active,
    'chat_open', s.status in ('queued', 'en_route', 'arrived')
      or (s.marked_at is not null and s.marked_at > now() - interval '30 minutes')
  );
end $$;

-- Customer chat through the token (MSG-1/2).
create or replace function public.customer_messages(p_token text) returns setof public.messages
language sql stable security definer set search_path = public as $$
  select m.* from public.messages m join public.stops s on s.id = m.stop_id
   where s.tracking_token = p_token order by m.created_at
$$;

create or replace function public.customer_send_message(p_token text, p_body text) returns public.messages
language plpgsql security definer set search_path = public as $$
declare s public.stops; m public.messages; v_open boolean;
begin
  select * into s from public.stops where tracking_token = p_token;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  v_open := s.status in ('queued', 'en_route', 'arrived')
    or (s.marked_at is not null and s.marked_at > now() - interval '30 minutes');
  if not v_open then raise exception 'chat is closed for this visit' using errcode = 'P0001'; end if;
  insert into public.messages (stop_id, sender, body) values (s.id, 'customer', p_body) returning * into m;
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.stops enable row level security;
alter table public.driver_locations enable row level security;
alter table public.location_pings enable row level security;
alter table public.stop_events enable row level security;
alter table public.notifications enable row level security;
alter table public.sms_opt_outs enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;

create policy "members read their org" on public.orgs for select using (id = public.my_org());
create policy "admins update their org" on public.orgs for update using (id = public.my_org() and public.is_admin());

create policy "members read org profiles" on public.profiles for select using (org_id = public.my_org());
create policy "admins manage profiles" on public.profiles for all
  using (org_id = public.my_org() and public.is_admin()) with check (org_id = public.my_org() and public.is_admin());
create policy "users update own profile" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and org_id = public.my_org() and role = (select role from public.profiles where id = auth.uid()));

create policy "admins manage routes" on public.routes for all
  using (org_id = public.my_org() and public.is_admin()) with check (org_id = public.my_org() and public.is_admin());
create policy "drivers read own routes" on public.routes for select using (driver_id = auth.uid());

create policy "admins manage stops" on public.stops for all
  using (org_id = public.my_org() and public.is_admin()) with check (org_id = public.my_org() and public.is_admin());
-- Drivers see every stop on their routes (DRV-14); changes go through the RPCs.
create policy "drivers read own stops" on public.stops for select
  using (exists (select 1 from public.routes r where r.id = route_id and r.driver_id = auth.uid()));

create policy "org reads driver locations" on public.driver_locations for select
  using (exists (select 1 from public.profiles p where p.id = driver_id and p.org_id = public.my_org()));
create policy "admins read pings" on public.location_pings for select
  using (public.is_admin() and exists (select 1 from public.profiles p where p.id = driver_id and p.org_id = public.my_org()));

create policy "admins read events" on public.stop_events for select
  using (public.is_admin() and exists (select 1 from public.stops s where s.id = stop_id and s.org_id = public.my_org()));
create policy "admins read notifications" on public.notifications for select
  using (public.is_admin() and org_id = public.my_org());

create policy "staff read messages" on public.messages for select using (exists (
  select 1 from public.stops s left join public.routes r on r.id = s.route_id
   where s.id = stop_id and (r.driver_id = auth.uid() or (public.is_admin() and s.org_id = public.my_org()))));
create policy "drivers send messages" on public.messages for insert with check (
  sender = 'driver' and exists (select 1 from public.stops s join public.routes r on r.id = s.route_id
   where s.id = stop_id and r.driver_id = auth.uid()));
create policy "staff mark messages read" on public.messages for update using (exists (
  select 1 from public.stops s left join public.routes r on r.id = s.route_id
   where s.id = stop_id and (r.driver_id = auth.uid() or (public.is_admin() and s.org_id = public.my_org()))));

create policy "staff read calls" on public.calls for select using (exists (
  select 1 from public.stops s left join public.routes r on r.id = s.route_id
   where s.id = stop_id and (r.driver_id = auth.uid() or (public.is_admin() and s.org_id = public.my_org()))));

-- Anonymous customers only reach data through the token functions above.
revoke all on all tables in schema public from anon;
grant execute on function public.get_tracking(text), public.customer_messages(text),
  public.customer_send_message(text, text) to anon, authenticated;
revoke execute on function public.queue_text(public.stops, public.notification_kind) from public, anon, authenticated;
revoke execute on function public.log_event(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.assert_driver_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invites: an operator invites a driver by phone; when that phone signs in for
-- the first time, their profile is created in the right business.
-- ---------------------------------------------------------------------------
create table public.invites (
  phone text primary key,              -- E.164
  org_id uuid not null references public.orgs (id) on delete cascade,
  role public.user_role not null default 'driver',
  name text not null,
  vehicle text,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
create policy "admins manage invites" on public.invites for all
  using (org_id = public.my_org() and public.is_admin()) with check (org_id = public.my_org() and public.is_admin());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.invites;
begin
  select * into v from public.invites
   where phone = '+' || ltrim(coalesce(new.phone, ''), '+');
  if found then
    insert into public.profiles (id, org_id, role, name, phone, vehicle)
    values (new.id, v.org_id, v.role, v.name, v.phone, v.vehicle)
    on conflict (id) do nothing;
    delete from public.invites where phone = v.phone;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Demo helper: builds today's route of stops around the driver's position, so
-- the app can be tried anywhere. Pass a phone to receive the customer texts.
-- ---------------------------------------------------------------------------
create or replace function public.create_demo_day(
  p_lat float8, p_lng float8, p_stop_count int default 6, p_customer_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org(); v_route uuid; i int; v_angle float8; v_km float8;
  names text[] := array['Michael B', 'Grace L', 'Dev P', 'Ana R', 'Sam K', 'Jo F', 'Max D', 'Nia H', 'Lena O', 'Owen M'];
  jobs text[] := array['New key', 'Leak repair', 'Thermostat', 'Drop-off', 'Water heater', 'Garbage disposal', 'Sump pump', 'Inspection', 'Drain cleaning', 'Faucet repair'];
begin
  if v_org is null then raise exception 'sign in first' using errcode = '42501'; end if;
  delete from public.stops where route_id in (select id from public.routes where driver_id = auth.uid() and day = current_date);
  delete from public.routes where driver_id = auth.uid() and day = current_date;
  insert into public.routes (org_id, driver_id, day) values (v_org, auth.uid(), current_date) returning id into v_route;
  for i in 1 .. least(greatest(p_stop_count, 1), 10) loop
    v_angle := radians(i * 360.0 / p_stop_count);
    v_km := 0.8 + i * 0.35;
    insert into public.stops (org_id, route_id, position, customer_name, customer_phone, sms_consent_at, sms_consent_source,
                              address, lat, lng, window_start, window_end, notes)
    values (v_org, v_route, i, names[i], p_customer_phone,
            case when p_customer_phone is not null then now() end,
            case when p_customer_phone is not null then 'demo' end,
            'Demo stop ' || i, p_lat + (v_km / 111.0) * cos(v_angle),
            p_lng + (v_km / (111.0 * cos(radians(p_lat)))) * sin(v_angle),
            date_trunc('hour', now()) + make_interval(hours => i - 1),
            date_trunc('hour', now()) + make_interval(hours => i + 1),
            jobs[i]);
  end loop;
  return v_route;
end $$;

-- A driver's route for a day, created if it doesn't exist yet (so a driver
-- can add a stop to a day with nothing planned).
create or replace function public.my_route_for(p_day date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; v_org uuid := public.my_org();
begin
  if v_org is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select id into v from public.routes where driver_id = auth.uid() and day = p_day;
  if v is null then
    insert into public.routes (org_id, driver_id, day) values (v_org, auth.uid(), p_day) returning id into v;
  end if;
  return v;
end $$;
