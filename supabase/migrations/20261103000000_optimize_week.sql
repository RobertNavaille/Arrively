-- Optimize week: the driver's app regroups the week's stops into days and
-- applies the result in one go. Stops that change day tell their customer
-- (with consent) by a new "rescheduled" text.
alter type public.notification_kind add value if not exists 'rescheduled';

create or replace function public.queue_text(p_stop public.stops, p_kind public.notification_kind)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org public.orgs;
  v_driver text;
  v_body text;
  v_window text;
  v_day date;
begin
  if p_stop.customer_phone is null then return; end if;
  select * into v_org from public.orgs where id = p_stop.org_id;
  select public.first_name(p.name) into v_driver
    from public.routes r join public.profiles p on p.id = r.driver_id
    where r.id = p_stop.route_id;
  v_driver := coalesce(nullif(v_driver, ''), 'Your driver');

  if p_kind in ('scheduled', 'rescheduled') then
    -- The visit's day (from its route), plus the window when there is one.
    select r.day into v_day from public.routes r where r.id = p_stop.route_id;
    v_window := case
      when p_stop.window_start is not null then
        to_char(p_stop.window_start at time zone v_org.timezone, 'Dy Mon FMDD, FMHH12:MI am')
          || ' – ' || to_char(p_stop.window_end at time zone v_org.timezone, 'FMHH12:MI am')
      when v_day is null or v_day = (now() at time zone v_org.timezone)::date then 'today'
      when v_day = (now() at time zone v_org.timezone)::date + 1 then 'tomorrow'
      else to_char(v_day, 'FMDay, Mon FMDD') end;
    v_body := v_org.name || ' via Arrively: your visit '
      || case when p_kind = 'rescheduled' then 'has moved to ' else 'is scheduled for ' end || v_window
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

-- p_days: [{"day": "2026-11-04", "stops": ["<stop id>", ...]}, ...], each day's
-- stops in visiting order. Stops not yet started move to that day's route (made
-- if needed); then each day is put in the given order. Only the driver's own
-- stops, and only ones scheduled or queued, move.
create or replace function public.apply_week(p_days jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day jsonb; v_route uuid; v_target public.routes; v_stop public.stops; v_id uuid;
  v_ids uuid[]; v_moved int := 0; v_max int;
begin
  for v_day in select * from jsonb_array_elements(p_days) loop
    v_route := public.my_route_for((v_day->>'day')::date);
    select * into v_target from public.routes where id = v_route;
    v_ids := array(select (x #>> '{}')::uuid from jsonb_array_elements(v_day->'stops') x);
    foreach v_id in array v_ids loop
      select s.* into v_stop from public.stops s join public.routes r on r.id = s.route_id
       where s.id = v_id and r.driver_id = auth.uid();
      if not found then raise exception 'not your stop' using errcode = '42501'; end if;
      if v_stop.route_id = v_route or v_stop.status not in ('scheduled', 'queued') then continue; end if;
      select coalesce(max(position), 0) into v_max from public.stops where route_id = v_route;
      update public.stops
         set route_id = v_route, position = v_max + 1, eta = null,
             status = (case when v_target.status = 'active' then 'queued' else 'scheduled' end)::public.stop_status
       where id = v_id returning * into v_stop;
      perform public.log_event(v_id, 'moved_day', jsonb_build_object('day', v_target.day));
      -- Tell the customer their new day (each move sends a fresh text).
      delete from public.notifications where stop_id = v_id and kind = 'rescheduled';
      perform public.queue_text(v_stop, 'rescheduled');
      v_moved := v_moved + 1;
    end loop;
    perform public.reorder_route(v_route, v_ids);
  end loop;
  return v_moved;
end $$;

grant execute on function public.apply_week(jsonb) to authenticated;
