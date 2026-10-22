-- A driver who started driving to a stop can cancel that trip and go back to
-- the trip view: the stop is queued again, first in line. The customer's
-- "you're next" text isn't sent again when the trip restarts (texts go once
-- per kind per stop).
create or replace function public.cancel_trip(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status <> 'en_route' then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'queued', trip_started_at = null where id = v.id returning * into v;
  perform public.log_event(v.id, 'trip_cancelled');
  return v;
end $$;

revoke execute on function public.cancel_trip(uuid) from public, anon;
grant execute on function public.cancel_trip(uuid) to authenticated;
