-- Drivers (and admins) can remove a stop they haven't started. The stop is
-- kept as 'cancelled' for the record; finished and in-progress stops can't be
-- removed.
create or replace function public.remove_stop(p_stop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status not in ('scheduled', 'queued') then
    raise exception 'Only stops you haven''t started can be removed.' using errcode = 'P0001';
  end if;
  update public.stops set status = 'cancelled' where id = v.id;
  perform public.log_event(v.id, 'removed', '{}'::jsonb);
  -- An active route with nothing left to do is finished.
  if exists (select 1 from public.routes where id = v.route_id and status = 'active')
     and not exists (select 1 from public.stops where route_id = v.route_id
                     and status in ('scheduled', 'queued', 'en_route', 'arrived')) then
    update public.routes set status = 'completed', completed_at = now() where id = v.route_id;
  end if;
end $$;
revoke execute on function public.remove_stop(uuid) from public, anon;
grant execute on function public.remove_stop(uuid) to authenticated;
