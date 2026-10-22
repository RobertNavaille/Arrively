-- A driver who tapped Arrived by mistake (or was marked arrived passing by)
-- can go back to being on the way. Texts are sent once per kind per stop, so
-- this doesn't re-send "you're next", and arriving again doesn't re-send
-- "has arrived".
create or replace function public.undo_arrived(p_stop uuid) returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  if v.status <> 'arrived' then raise exception 'stop is %', v.status using errcode = 'P0001'; end if;
  update public.stops set status = 'en_route', arrived_at = null where id = v.id returning * into v;
  perform public.log_event(v.id, 'arrival_undone');
  return v;
end $$;

revoke execute on function public.undo_arrived(uuid) from public, anon;
grant execute on function public.undo_arrived(uuid) to authenticated;
