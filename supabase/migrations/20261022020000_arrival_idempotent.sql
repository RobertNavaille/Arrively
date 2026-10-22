-- The driver's taps can land just after the server already moved the stop
-- (arrival is also detected from location): don't fail when it's already
-- where the tap would put it.
--   Arrived when already arrived: nothing to do.
--   Continue route when already on the way: nothing to do.
--   Cancel route once arrival was detected: still goes back to the trip view.
create or replace function public.mark_arrived(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status = 'arrived' then return v; end if;
  if v.status <> 'en_route' then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'arrived', arrived_at = now() where id = v.id returning * into v;
  perform public.log_event(v.id, 'arrived', jsonb_build_object('manual', true));
  return v;
end $$;

create or replace function public.undo_arrived(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status = 'en_route' then return v; end if;
  if v.status <> 'arrived' then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'en_route', arrived_at = null where id = v.id returning * into v;
  perform public.log_event(v.id, 'arrival_undone');
  return v;
end $$;

create or replace function public.cancel_trip(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status = 'queued' then return v; end if;
  if v.status not in ('en_route', 'arrived') then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'queued', trip_started_at = null, arrived_at = null where id = v.id returning * into v;
  perform public.log_event(v.id, 'trip_cancelled');
  return v;
end $$;
