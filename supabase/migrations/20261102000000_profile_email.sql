-- Drivers' contact email, edited on the app's Settings screen. Sign-in stays by
-- phone (texted code); this is contact information, not a login.
alter table public.profiles add column if not exists email text
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
