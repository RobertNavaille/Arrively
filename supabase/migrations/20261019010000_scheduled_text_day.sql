-- The "scheduled" text names the visit's day now that stops usually have no
-- time window (windows and time on site left the stop form), and no longer
-- lowercases day names.
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

  if p_kind = 'scheduled' then
    -- The visit's day (from its route), plus the window when there is one.
    select r.day into v_day from public.routes r where r.id = p_stop.route_id;
    v_window := case
      when p_stop.window_start is not null then
        to_char(p_stop.window_start at time zone v_org.timezone, 'Dy Mon FMDD, FMHH12:MI am')
          || ' – ' || to_char(p_stop.window_end at time zone v_org.timezone, 'FMHH12:MI am')
      when v_day is null or v_day = (now() at time zone v_org.timezone)::date then 'today'
      when v_day = (now() at time zone v_org.timezone)::date + 1 then 'tomorrow'
      else to_char(v_day, 'FMDay, Mon FMDD') end;
    v_body := v_org.name || ' via Arrively: your visit is scheduled for ' || v_window
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
