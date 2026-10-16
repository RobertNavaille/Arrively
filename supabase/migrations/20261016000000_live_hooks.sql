-- Hooks for a live Supabase project: Realtime for the apps, and sending each
-- queued text to the notify edge function as soon as it's inserted.
--
-- The notify URL and its shared secret live in Supabase Vault, not in this file:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify', 'notify_url');
--   select vault.create_secret('<same value as the NOTIFY_SECRET function secret>', 'notify_secret');
-- Without them (or outside Supabase, as in the tests) inserts work and texts
-- wait for the notify sweep instead.

do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available here; texts will be sent by the notify sweep';
end $$;

-- Live updates for the driver app, the console and the tracking page.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['driver_locations', 'stops', 'routes', 'messages'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.send_queued_text() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return new; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url,
          jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(new)),
          jsonb_build_object('Content-Type', 'application/json', 'x-arrively-secret', v_secret);
  return new;
end $$;
revoke execute on function public.send_queued_text() from public, anon, authenticated;

drop trigger if exists notifications_send on public.notifications;
create trigger notifications_send after insert on public.notifications
  for each row when (new.status = 'pending') execute function public.send_queued_text();
