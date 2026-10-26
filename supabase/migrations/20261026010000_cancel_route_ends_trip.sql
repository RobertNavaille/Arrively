-- Cancel route ends the trip, not just the drive to one stop: the route is no
-- longer under way (the app's "Trip in progress" bar goes, customers stop
-- seeing the driver's location and arrival detection pauses), and the stops
-- not yet done go back to scheduled. Stops already marked stay marked.
-- Start trip (start_route / start_trip) picks it up again later.
create or replace function public.cancel_trip(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status not in ('en_route', 'arrived', 'queued', 'scheduled') then
    raise exception 'stop is %', v.status using errcode = 'P0001';
  end if;
  if v.status in ('en_route', 'arrived') then
    update public.stops set status = 'scheduled', trip_started_at = null, arrived_at = null where id = v.id returning * into v;
    perform public.log_event(v.id, 'trip_cancelled');
  end if;
  update public.stops set status = 'scheduled' where route_id = v.route_id and status = 'queued';
  update public.routes set status = 'planned' where id = v.route_id and status = 'active';
  select * into v from public.stops where id = v.id;
  return v;
end $$;
