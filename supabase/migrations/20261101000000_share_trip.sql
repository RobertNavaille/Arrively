-- Share trip (driver app): when on, starting the trip to a stop opens the driver's
-- own Messages app with a text to the customer and their live tracking link.
alter table public.stops add column if not exists share_trip boolean not null default true;

create or replace function public.set_share_trip(p_stop uuid, p_on boolean)
returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops;
begin
  v := public.assert_driver_of(p_stop);
  update public.stops set share_trip = coalesce(p_on, true) where id = v.id returning * into v;
  perform public.log_event(v.id, 'share_trip', jsonb_build_object('on', v.share_trip));
  return v;
end $$;

revoke execute on function public.set_share_trip(uuid, boolean) from public, anon;
grant execute on function public.set_share_trip(uuid, boolean) to authenticated;
