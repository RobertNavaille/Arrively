-- Per-environment settings that Supabase doesn't let us store as database
-- parameters (ALTER DATABASE ... SET needs superuser there).
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security; -- no policies: only definer functions read it

-- The tracking page address used in texts:
--   insert into app_settings values ('tracking_base_url', 'https://<your-vercel-app>/t/')
--     on conflict (key) do update set value = excluded.value;
create or replace function public.tracking_url(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(value, '') from public.app_settings where key = 'tracking_base_url'),
    nullif(current_setting('app.tracking_base_url', true), ''),
    'https://arrively.app/t/') || p_token
$$;
