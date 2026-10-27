-- Route options the driver picks in Optimize route (round trip, avoid highways,
-- avoid tolls, travel mode). route-plan saves them with the order; route-plan
-- and route-etas plan and time the route with them; the app reads them.
alter table public.routes
  add column if not exists round_trip boolean not null default false,
  add column if not exists avoid_highways boolean not null default false,
  add column if not exists avoid_tolls boolean not null default false,
  add column if not exists travel_mode text not null default 'drive'
    check (travel_mode in ('drive', 'walk', 'bike'));
