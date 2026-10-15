-- End-to-end check of the stop loop against plain Postgres (see run_tests.sh).
-- Fails loudly (ON_ERROR_STOP) on the first broken expectation.
\set ON_ERROR_STOP 1
-- Supabase grants table access to authenticated by default; RLS does the rest.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

create or replace function pg_temp.expect(cond boolean, what text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok: %', what; end $$;

-- Fixtures (as superuser).
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000d2');
insert into public.orgs (id, name, phone) values ('00000000-0000-0000-0000-0000000000a1', 'Acme Plumbing', '+14015550100');
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Other Co');
insert into public.profiles (id, org_id, role, name, vehicle) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'admin', 'Owner Olivia', null),
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'driver', 'Bill Brien', 'White Ford Transit · 7KQ 204'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 'driver', 'Eve Outsider', null);
insert into public.routes (id, org_id, driver_id, day) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', current_date);
-- Three stops ~1 km apart in Providence; stop 2 has no consent.
insert into public.stops (id, org_id, route_id, position, customer_name, customer_phone, sms_consent_at, address, lat, lng, window_start, window_end) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 1, 'Michael B', '+14015550111', now(), '150 Union St', 41.8240, -71.4128, now(), now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 2, 'Grace L', '+14015550112', null, '9 Planet St', 41.8330, -71.4050, null, null),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 3, 'Sam K', '+14015550113', now(), '42 Benefit St', 41.8420, -71.3970, null, null);

select pg_temp.expect((select count(*) from notifications where kind = 'scheduled' and status = 'pending') = 2, 'scheduled texts queued for consenting customers');
select pg_temp.expect(not exists (select 1 from notifications where stop_id = '00000000-0000-0000-0000-000000000052' and kind = 'scheduled' and status = 'pending'), 'no consent → no scheduled text');
select pg_temp.expect((select body from notifications where stop_id = '00000000-0000-0000-0000-000000000051' and kind = 'scheduled') like 'Acme Plumbing via Arrively: your visit is scheduled%Track it here: %', 'scheduled text has the link');

-- ---- As the driver --------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);

select pg_temp.expect((select count(*) from stops) = 3, 'driver sees every stop on their route');
select public.start_trip('00000000-0000-0000-0000-000000000051');
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000051') = 'en_route', 'stop 1 en route');
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000052') = 'queued', 'other stops queued');

do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-000000000052');
  raise exception 'FAILED: second trip should be refused';
exception when sqlstate 'P0001' then raise notice 'ok: one trip at a time enforced';
end $$;

-- Driving: far away, then inside the radius → arrived automatically.
select public.report_location(41.8150, -71.4200);
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000051') = 'en_route', 'still en route when far away');
select public.report_location(41.82403, -71.41285);
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000051') = 'arrived', 'arrival detected by geofence');

-- Away-from-stop marking needs a reason.
do $$ begin
  perform public.mark_stop('00000000-0000-0000-0000-000000000051', 'completed', null, 41.80, -71.40);
  raise exception 'FAILED: marking far away without a reason should be refused';
exception when sqlstate 'P0001' then raise notice 'ok: far-away mark needs a reason';
end $$;
select public.mark_stop('00000000-0000-0000-0000-000000000051', 'completed', null, 41.82403, -71.41285);
select pg_temp.expect((select departed_at is null from stops where id = '00000000-0000-0000-0000-000000000051'), 'completed at the stop, not departed yet');

reset role;
-- Customer view for stop 3 before departure: stop 1 still counts as ahead.
select pg_temp.expect(((public.get_tracking((select tracking_token from stops where id = '00000000-0000-0000-0000-000000000053')))->>'stops_ahead')::int = 2, 'stops ahead unchanged until the driver leaves');
set role authenticated;

-- Drive away from stop 1 → departed, and stop 2's trip starts automatically.
select public.report_location(41.8290, -71.4090);
select pg_temp.expect((select departed_at is not null from stops where id = '00000000-0000-0000-0000-000000000051'), 'departure detected');
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000052') = 'en_route', 'next trip auto-started on departure');

reset role;
select pg_temp.expect(((public.get_tracking((select tracking_token from stops where id = '00000000-0000-0000-0000-000000000053')))->>'stops_ahead')::int = 1, 'stops ahead drops after departure');
select pg_temp.expect((public.get_tracking((select tracking_token from stops where id = '00000000-0000-0000-0000-000000000053')))->'driver_location' is not null, 'queued customer sees the driver');
select pg_temp.expect(not ((public.get_tracking((select tracking_token from stops where id = '00000000-0000-0000-0000-000000000053')))::text like '%Grace%'), 'other customers are not exposed');
select pg_temp.expect((select status from notifications where stop_id = '00000000-0000-0000-0000-000000000052' and kind = 'next') = 'suppressed', 'no-consent customer gets no "next" text');
select pg_temp.expect((select count(*) from notifications where stop_id = '00000000-0000-0000-0000-000000000051' and kind in ('next', 'arrived')) = 2, 'stop 1 got next + arrived');
select pg_temp.expect((select body from notifications where stop_id = '00000000-0000-0000-0000-000000000051' and kind = 'next') like '%Track live: %', '"You''re next" text includes the link');
set role authenticated;

-- Skip stop 2, defer nothing; finish stop 3.
select public.mark_stop('00000000-0000-0000-0000-000000000052', 'skipped', 'Customer not home', 41.8330, -71.4050);
select public.report_location(41.8360, -71.4020);
select public.start_trip('00000000-0000-0000-0000-000000000053');
select public.mark_arrived('00000000-0000-0000-0000-000000000053');
select public.mark_stop('00000000-0000-0000-0000-000000000053', 'completed', null, 41.8420, -71.3970);
select pg_temp.expect((select status from routes where id = '00000000-0000-0000-0000-0000000000f1') = 'completed', 'route completes when every stop is marked');

-- Driver adds a stop and fixes an address.
select (public.add_stop('00000000-0000-0000-0000-0000000000f1', '12 Waterman St', 41.826, -71.400)).position as new_pos \gset
select pg_temp.expect(:new_pos = 4, 'added stop goes to the end');
select public.update_stop_address('00000000-0000-0000-0000-000000000053', '42 Benefit St, side door', 41.8421, -71.3971);
select pg_temp.expect((select address_edited_by = auth.uid() from stops where id = '00000000-0000-0000-0000-000000000053'), 'address edit recorded');

-- Driver can't change stop status directly.
update stops set status = 'completed' where id = '00000000-0000-0000-0000-000000000052';
reset role;
select pg_temp.expect((select status from stops where id = '00000000-0000-0000-0000-000000000052') = 'skipped', 'direct status update has no effect (RLS)');

-- ---- Another business's driver -----------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false);
select pg_temp.expect((select count(*) from stops) = 0, 'other business sees no stops');
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-000000000051');
  raise exception 'FAILED: outsider should be refused';
exception when sqlstate '42501' then raise notice 'ok: outsider refused';
end $$;

-- ---- Customer chat via token (anonymous) --------------------------------
reset role;
select tracking_token as tok from stops where id = '00000000-0000-0000-0000-000000000053' \gset
set role anon;
select public.customer_send_message(:'tok', 'Gate code is 1234');
select pg_temp.expect((select count(*) from public.customer_messages(:'tok')) = 1, 'customer can chat through the token');
do $$ begin
  perform count(*) from public.stops;
  raise exception 'FAILED: anon should not read stops';
exception when insufficient_privilege then raise notice 'ok: anon cannot read tables';
end $$;
reset role;
select 'ALL TESTS PASSED' as result;

-- ---- Invites -------------------------------------------------------------
insert into public.invites (phone, org_id, name) values ('+14015559999', '00000000-0000-0000-0000-0000000000a1', 'New Driver');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000e1', '14015559999');
select pg_temp.expect((select org_id = '00000000-0000-0000-0000-0000000000a1' from profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'invited phone gets a profile on first sign-in');
select 'INVITES PASSED' as result;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.create_demo_day(41.82, -71.41, 6) is not null as made;
select pg_temp.expect((select count(*) from stops s join routes r on r.id = s.route_id where r.day = current_date and r.driver_id = auth.uid()) = 6, 'demo day has 6 stops');
reset role;
select 'DEMO PASSED' as result;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select pg_temp.expect(public.my_route_for(current_date + 3) = public.my_route_for(current_date + 3), 'my_route_for is stable');
reset role;
select 'ROUTE_FOR PASSED' as result;

-- ---- Reorder keeps finished stops in place ---------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select id as rt from routes where driver_id = auth.uid() and day = current_date \gset
select public.start_route(:'rt');
select public.start_trip((select id from stops where route_id = :'rt' order by position limit 1));
select public.mark_stop((select id from stops where route_id = :'rt' order by position limit 1), 'completed', null, null, null);
select id as first_done from stops where route_id = :'rt' and status = 'completed' \gset
-- Ask for the reverse order; the finished stop must stay first.
select public.reorder_route(:'rt', (select array_agg(id order by position desc) from stops where route_id = :'rt'));
select pg_temp.expect((select id from stops where route_id = :'rt' order by position limit 1) = :'first_done', 'finished stop keeps its place on reorder');
select pg_temp.expect((select count(distinct position) from stops where route_id = :'rt') = 6, 'positions stay unique after reorder');
reset role;
select 'REORDER PASSED' as result;
