# Supabase backend

## Setup (once per environment)

1. Create a Supabase project. Then link and push the schema:
   ```sh
   npx supabase@2 login
   npx supabase@2 link --project-ref plbdslinaqlnuacfrcds
   npx supabase@2 db push
   ```
   If you created the schema by pasting `migrations/20261015000000_init.sql` into the SQL editor instead, don't run `db push`; mark it as applied so later migrations start from there:
   ```sh
   npx supabase@2 migration repair --status applied 20261015000000
   ```
2. Set the tracking page address used in texts. Run this in the SQL editor:
   ```sql
   insert into app_settings values ('tracking_base_url', 'https://<your-vercel-app>/t/')
     on conflict (key) do update set value = excluded.value;
   ```
3. Set the edge function secrets and deploy the functions:
   ```sh
   npx supabase@2 secrets set TEXTMAGIC_USERNAME=... TEXTMAGIC_API_KEY=... TEXTMAGIC_FROM=+1... \
     NOTIFY_SECRET=$(openssl rand -hex 24) SMS_WEBHOOK_SECRET=$(openssl rand -hex 24) \
     TRACKING_BASE_URL=https://<your-vercel-app>/t/ SEND_SMS_HOOK_SECRET='v1,whsec_...' \
     MAPBOX_TOKEN=sk.or.pk...
   npx supabase@2 functions deploy notify --no-verify-jwt
   npx supabase@2 functions deploy sms-inbound --no-verify-jwt
   npx supabase@2 functions deploy send-sms-hook --no-verify-jwt
   npx supabase@2 functions deploy route-plan
   npx supabase@2 functions deploy route-etas
   ```
   `MAPBOX_TOKEN` is used only on the server, for drive times and ETAs. Use a token without a URL restriction (the apps' public tokens are usually restricted). `route-plan` and `route-etas` check the caller's sign-in, so they keep JWT verification on.
4. **Driver sign-in by text:**
   - Under Authentication → Providers, enable Phone.
   - Under Authentication → Hooks, add a "Send SMS" hook that points to `send-sms-hook`.
   - Copy the hook's secret into `SEND_SMS_HOOK_SECRET`.
5. **Sending texts:**
   - Under Database → Webhooks, add a webhook on INSERT into `public.notifications`.
   - Point it at the `notify` function, with the header `x-arrively-secret: <NOTIFY_SECRET>`.
   - Optional: add a cron job (Integrations → Cron) that calls `notify` every minute with the same header, so failed sends are retried.
6. **TextMagic:**
   - Set both the inbound message URL and the delivery receipt URL to `https://plbdslinaqlnuacfrcds.supabase.co/functions/v1/sms-inbound?secret=<SMS_WEBHOOK_SECRET>`.
   - Register for US 10DLC through TextMagic before texting real customers.
7. **Realtime:** enable Realtime on `driver_locations`, `stops` and `messages`.
8. **Create the first business and invite yourself.** Use the SQL editor:
   ```sql
   insert into orgs (name, phone) values ('Acme Plumbing', '+14015550100') returning id;
   insert into invites (phone, org_id, role, name) values ('+1YOURNUMBER', '<org id>', 'admin', 'Your Name');
   insert into invites (phone, org_id, role, name, vehicle) values ('+1DRIVERNUMBER', '<org id>', 'driver', 'Bill Brien', 'White Ford Transit');
   ```
   The first time each phone signs in, its profile is created in that business.
9. **Demo day:** in the driver app, "Create demo day" calls `create_demo_day(lat, lng, 6, '+1YOURNUMBER')`. It builds today's route around you and sends the customer texts to your own phone.

## Tests

The schema and the stop rules are tested against plain Postgres 16. A stub stands in for Supabase's auth schema.

```sh
PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/run_tests.sh
```

The route solver and the routing functions have Deno tests (Mapbox is mocked):

```sh
cd supabase/functions && npx deno@2.1.4 test --allow-env _shared/
```
