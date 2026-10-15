# Arrively v1 — Build plan

The goal is a working end-to-end demo: a real driver app on iPhone (TestFlight), a real customer tracking page, real texts, chat and in-app calls, and an owner console.

## Architecture

```
apps/driver     Expo (React Native) driver app → iOS via EAS Build + TestFlight
apps/web        Next.js on Vercel
                  /t/[token]   customer tracking page (chat, calls)
                  /console     owner console
supabase/       Postgres schema, row-level security, edge functions
                  migrations/  tables, policies, triggers
                  functions/   notify (TextMagic), sms-inbound, send-otp (auth hook),
                               optimize (Mapbox), eta, livekit-token
packages/design Shared tokens from the Arrively design system
```

Every app talks to Supabase only through its API, realtime channels and edge functions (ARC-1), so the same rules apply to every client. Business rules live in the database and functions (ARC-3):
- stop states
- one trip at a time
- departure detection
- notification triggers

## Third-party services

| Service | Used for | Owner action |
|---|---|---|
| Supabase | Database, driver sign-in, realtime (locations, chat), edge functions | Create a project; share the URL, anon key and service-role key (as secrets, never in chat) |
| Mapbox | Maps, address search, directions/ETA, optimization | Public token (apps) and a secret token (server, iOS SDK download) |
| TextMagic | Customer texts, driver sign-in codes, inbound replies and STOP | API username and key; a sending number; **start US 10DLC registration now** (it can take days to weeks) |
| LiveKit Cloud | In-app voice calls | Create a project; API key and secret |
| Vercel | Hosting `apps/web` | Connect the GitHub repo |
| Apple Developer + Expo (EAS) | iOS builds, TestFlight, VoIP push (CallKit) | Expo account; App Store Connect app record; push key |

## Milestones

1. **Foundations**
   - Monorepo, Supabase schema and row-level security, and seed data for a demo business, driver and day of stops.
   - Driver sign-in by text code (Supabase phone auth with a custom SMS hook that sends through TextMagic).
2. **Driver app core**
   - Screens: My day (swipe between days, map and list), Next stop, On route, Arrived, Skip or defer, Add a stop.
   - Background location (expo-location) streamed to Supabase.
   - Arrival and departure detection (geofence), plus the one-trip-at-a-time rule enforced on the server.
3. **Customer tracking page**
   - A token link with a live driver marker over Supabase Realtime.
   - Stops ahead, ETA, arrival window, driver card, and the privacy rules (no other stops shown).
4. **Texts**
   - Three default texts (scheduled with link, You're next with link, Arrived) sent through TextMagic from database events.
   - Consent check, STOP/START handling via TextMagic's inbound webhook, and a delivery log.
5. **Owner console**
   - Add stops (form and CSV), assign drivers, a live map of drivers, notification settings, stop history.
6. **Routing**
   - Mapbox Optimization for stop order (capped at its stop limit), and Mapbox Directions for ETAs to each stop, including time on site.
7. **Chat**
   - Customer ↔ driver chat over Supabase Realtime, a push notification to the driver, and a fallback text for an unread message.
8. **In-app calls**
   - A LiveKit room per call, CallKit with VoIP push on the driver's iPhone, and WebRTC on the tracking page.
9. **Ship the demo**
   - EAS build to TestFlight, `apps/web` deployed to Vercel, an end-to-end test drive.

Each milestone ends with something you can try. Milestones 1–4 together already give the core demo: a driver drives, and the customer watches and gets texts.

## Notes and limits

- **Mapbox in the driver app:** `@rnmapbox/maps` needs a custom Expo dev build, so the app won't run in the Expo Go preview app. Testers install it from TestFlight.
- **Background location:** iOS asks the driver for "Always" location permission. The App Store reviewer needs a clear reason for it, which we'll write.
- **Text costs:** each stop costs about three texts by default. Chat replaces two-way texting.
- **Calls:** the driver's phone rings even when the app is closed (CallKit). The customer's browser rings only while the tracking page is open, so otherwise a "tap to call back" text goes out instead.
