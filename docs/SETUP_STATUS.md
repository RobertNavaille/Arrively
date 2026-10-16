# Setup status

Where the live (non-demo) setup stands. Update as steps are finished.

## Supabase project `plbdslinaqlnuacfrcds`

- [x] Project created (URL `https://plbdslinaqlnuacfrcds.supabase.co`, publishable key in the apps' `.env.example`).
- [x] Schema created by pasting `supabase/migrations/20261015000000_init.sql` into the SQL editor (so use `migration repair --status applied 20261015000000`, not `db push`).
- [x] First business created and the owner invited.
- [ ] Edge functions deployed. Plan: Claude deploys them from a cloud session with the network allowing `api.supabase.com` and `plbdslinaqlnuacfrcds.supabase.co`, using the `SUPABASE_ACCESS_TOKEN` environment variable.
- [ ] Secrets entered by the owner in the dashboard (Edge Functions → Secrets): TEXTMAGIC_USERNAME, TEXTMAGIC_API_KEY, TEXTMAGIC_FROM, MAPBOX_TOKEN, NOTIFY_SECRET, SMS_WEBHOOK_SECRET, later SEND_SMS_HOOK_SECRET and TRACKING_BASE_URL. Never paste secrets into chat.
- [ ] Phone sign-in enabled and the Send SMS hook pointed at `send-sms-hook`.
- [ ] Database webhook on `notifications` INSERT → `notify` with header `x-arrively-secret`.
- [ ] TextMagic inbound and delivery URLs → `sms-inbound?secret=…`.
- [ ] Realtime publication: `driver_locations`, `stops`, `messages`.

The owner asked to go one step at a time, in plain language.

## After Supabase

- [ ] Console and tracking page on Vercel (root `apps/web`), then set `TRACKING_BASE_URL` and `app.tracking_base_url`.
- [ ] Driver app on TestFlight.
