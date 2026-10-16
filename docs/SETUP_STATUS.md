# Setup status

Where the live (non-demo) setup stands. Update as steps are finished.

## Supabase project `plbdslinaqlnuacfrcds`

- [x] Project created (URL `https://plbdslinaqlnuacfrcds.supabase.co`, publishable key in the apps' `.env.example`).
- [x] Schema created by pasting `supabase/migrations/20261015000000_init.sql` into the SQL editor (so use `migration repair --status applied 20261015000000`, not `db push`).
- [x] First business created and the owner invited.
- [x] Edge functions deployed (all five; notify, sms-inbound and send-sms-hook without JWT checks, per `supabase/config.toml`). Done with the CLI `--use-api` and the owner's token as a network secret for `api.supabase.com`.
- [x] `20261016000000_live_hooks.sql` applied: pg_net, Realtime on driver_locations/stops/routes/messages, and a trigger that posts each pending notification to `notify`. `NOTIFY_SECRET` set as a function secret and, with `notify_url`, in Vault. Migration history recorded in `supabase_migrations.schema_migrations`.
- [x] Owner entered TEXTMAGIC_USERNAME, TEXTMAGIC_API_KEY, TEXTMAGIC_FROM (a toll-free 833 number: needs TextMagic toll-free verification before US carriers deliver reliably) and MAPBOX_TOKEN in the dashboard. Still to add: SMS_WEBHOOK_SECRET (owner picks it, with the TextMagic URLs) and TRACKING_BASE_URL (after Vercel). Never paste secrets into chat.
- [x] Phone sign-in enabled via the Management API with the Send SMS hook → `send-sms-hook`; SEND_SMS_HOOK_SECRET generated and set in both places (never shown); code expiry 600 s.
- [ ] TextMagic inbound and delivery URLs → `sms-inbound?secret=…`.

The owner asked to go one step at a time, in plain language.

## After Supabase

- [ ] Console and tracking page on Vercel (root `apps/web`), then set `TRACKING_BASE_URL` and `app.tracking_base_url`.
- [ ] Driver app on TestFlight.
