-- Drivers can also remove finished stops (done, no-show, skipped). Stops in
-- progress (en route, arrived) still can't be removed: the trip has to be
-- marked first. The stop is kept as 'cancelled' with a 'removed' event that
-- records what it was.
create or replace function public.remove_stop(p_stop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status in ('en_route', 'arrived') then
    raise exception 'Mark this stop before removing it.' using errcode = 'P0001';
  end if;
  if v.status = 'cancelled' then return; end if;
  update public.stops set status = 'cancelled' where id = v.id;
  perform public.log_event(v.id, 'removed', jsonb_build_object('was', v.status, 'marked_at', v.marked_at));
  -- An active route with nothing left to do is finished.
  if exists (select 1 from public.routes where id = v.route_id and status = 'active')
     and not exists (select 1 from public.stops where route_id = v.route_id
                     and status in ('scheduled', 'queued', 'en_route', 'arrived')) then
    update public.routes set status = 'completed', completed_at = now() where id = v.route_id;
  end if;
end $$;
