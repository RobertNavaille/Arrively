# Arrively — Product Requirements

> Status: Draft v0.2 · Owner: TBD · Last updated: 2026-10-10

## 1. Overview

Arrively delivers the "your driver is on the way" part of a ride-hailing experience as a product:

- A **live map** showing the rider where their driver is.
- A continuously updated **ETA**.
- **Proactive notifications** that get the rider ready before the driver arrives.

It ships in two forms:

1. **Standalone app**: a hosted, white-label product for smaller operators that don't have their own software.
2. **API and SDKs**: the tracking, ETA, and notification engine, exposed so companies can add it to their existing apps.

Both forms run on the same core platform. The standalone app is a client of the public API.

### 1.1 Launch focus (decided)

- **Target verticals:** two to start.
  - **Rideshare-type transport**: taxi, limo, car service, small rideshare fleets. A driver picks up a rider.
  - **Delivery and field services**: couriers, local delivery, plumbers, installers, cleaners. A driver or technician arrives at the customer.
- **Market:** United States only at launch.
- **SMS consent:** the operator collects consent from riders and customers. Arrively provides the required consent language, stores the consent record, and enforces opt-outs (CMP-2).
- **Booking:** not in the MVP. Lightweight booking for standalone operators is planned for P1/P2 (section 5.3).

### 1.2 Goals

- Riders are ready at the curb when the driver arrives, so drivers wait less and fewer pickups are missed.
- Fewer "where is my driver?" calls to dispatch.
- A small operator can go live in under one day with no engineering work.
- A developer can embed tracking and notifications in under one week.

### 1.3 Non-goals (initial release)

- Booking (planned for P1/P2, see section 5.3), pricing, payments, or driver–rider matching and dispatch optimization.
- Markets outside the United States.
- Healthcare and medical transport (HIPAA) use cases.
- Turn-by-turn navigation for drivers (we deep-link to Google Maps, Apple Maps, or Waze).
- In-app rider–driver chat. Masked calling and SMS are a candidate for P2.

### 1.4 Priority key

- **P0**: required for MVP
- **P1**: soon after launch
- **P2**: later or nice to have

---

## 2. Actors

| Actor | Description |
|---|---|
| **Rider / customer** | The person waiting for the arrival: a rider being picked up, or a customer waiting for a delivery or technician. Usually has no account and may not install anything. This document says "rider" for both. |
| **Driver** | Shares location while assigned to a trip. |
| **Operator admin** | The business owner or manager. Configures branding, notifications, users, and billing. |
| **Dispatcher** | Operator staff who create and assign trips and watch them live. |
| **Developer / integrator** | Engineer at an API customer who builds on the API and SDKs. |
| **Platform admin** | Arrively staff who manage tenants, support, and abuse. |

---

## 3. Core concepts

- **Tenant (Organization)**: an operator or API customer. All data is isolated per tenant.
- **Trip type**: `pickup` (rider gets in the vehicle) or `visit` (driver or technician arrives at the customer's location for a delivery or service job). Type sets the default states, notification wording, and labels such as "driver" vs. "technician".
- **Trip**: one pickup or visit. It has a rider, a pickup location, an optional drop-off, an optional scheduled time, and an assigned driver and vehicle.
- **Trip states**: `scheduled → driver_assigned → en_route → arriving → arrived → in_progress → completed`, plus `cancelled` and `no_show`. For `visit` trips, `in_progress` means the job or hand-off is under way.
- **Location ping**: a timestamped driver position with lat/lng, accuracy, heading, and speed.
- **Tracking link**: a unique, expiring URL that shows the rider the live trip.
- **Notification rule**: a trigger (event or ETA threshold) with channel(s) and a message template.

---

## 4. Functional requirements: core platform (shared by both products)

### 4.1 Trip management

| ID | Requirement | Pri |
|---|---|---|
| TRP-1 | Create, read, update, and cancel trips with rider contact info, pickup address or coordinates, optional drop-off, optional scheduled pickup time, and tenant-defined metadata or external ID. | P0 |
| TRP-2 | Assign, reassign, or unassign a driver and vehicle. Reassignment updates the rider's view and notifies the rider. | P0 |
| TRP-3 | Enforce a defined state machine. Reject or flag invalid transitions. | P0 |
| TRP-4 | Detect `arrived` automatically with a geofence around pickup (configurable radius, default 75 m, plus a dwell time). Drivers can also mark it manually. | P0 |
| TRP-5 | Detect `arriving` automatically with an ETA threshold (default 2 min) or a distance threshold. | P0 |
| TRP-6 | Geocode addresses, validate them, and let the pickup pin be adjusted precisely (for example, a specific building entrance). | P0 |
| TRP-7 | Support pickup notes such as "Gate code 1234" or "North entrance". | P1 |
| TRP-8 | Support multi-stop trips and shared rides (several riders, each with their own ETA). | P2 |
| TRP-9 | Keep a full audit trail of state changes and notifications per trip. | P0 |
| TRP-10 | Support both trip types (`pickup` and `visit`), with type-specific default labels, notification templates, and arrival geofence radius. | P0 |
| TRP-11 | Support an **arrival window** (for example 2–4 PM) as well as an exact pickup time. The rider sees the window until a driver is en route, then the live ETA. | P0 |
| TRP-12 | For drivers with several jobs in a row (field services, delivery routes), show the rider their place in the queue ("You're next" or "2 stops before you") and an ETA that accounts for stops ahead. | P1 |

### 4.2 Driver location ingestion

| ID | Requirement | Pri |
|---|---|---|
| LOC-1 | Accept location pings from the Arrively driver app, from the mobile SDK, and through the REST/streaming API (for customers with their own driver apps or telematics). | P0 |
| LOC-2 | Default ping interval is 3–5 s while on an active trip. Interval adapts to speed and battery. No tracking when off-trip unless the operator turns it on. | P0 |
| LOC-3 | Filter out GPS jitter, inaccurate fixes, and impossible jumps. Snap to roads for display. | P1 |
| LOC-4 | Detect stale locations. If no ping arrives for more than 30 s (configurable), mark the driver as "last seen X ago" in every view. | P0 |
| LOC-5 | Buffer pings offline on the device and upload them on reconnect. Live views show only the latest point. | P1 |
| LOC-6 | Integrate with third-party telematics and fleet trackers (Samsara, Geotab, and similar) as a location source. | P2 |

### 4.3 ETA engine

| ID | Requirement | Pri |
|---|---|---|
| ETA-1 | Compute traffic-aware driving ETA from the driver's current position to pickup. | P0 |
| ETA-2 | Recompute on significant movement or at least every 30 s while en route. Throttle routing API calls to control cost. | P0 |
| ETA-3 | Smooth the displayed ETA so it doesn't flicker (hysteresis). Never show a negative ETA or "0 min" before arrival. | P0 |
| ETA-4 | Emit an `eta.changed` event when ETA moves past a configurable delta (for example ±3 min). | P0 |
| ETA-5 | Before a driver is en route on a scheduled trip, show the scheduled time or arrival window instead of a live ETA. | P0 |
| ETA-9 | For drivers with several stops ahead, add the estimated time for each earlier stop (operator-set default service time per job type) to the rider's ETA. | P1 |
| ETA-6 | Track ETA accuracy (predicted vs. actual arrival) per tenant for quality reporting. | P1 |
| ETA-7 | Fall back to straight-line distance × average speed if the routing provider is unavailable, and mark the ETA as approximate. | P1 |
| ETA-8 | Show an ETA to drop-off once the trip is in progress. | P2 |

### 4.4 Notifications

| ID | Requirement | Pri |
|---|---|---|
| NTF-1 | Channels: **SMS** (P0), **email** (P1), **web push** from the tracking page (P1), **native push** through the integrator's app (API customers, P1), **WhatsApp** (P2), **automated voice call** (P2, for accessibility). | — |
| NTF-2 | Default trigger set: trip confirmed or driver assigned (includes tracking link), driver en route, **"X minutes away"** (configurable, default 5 min), **arriving now** (default 1–2 min), **driver has arrived**, significant delay, driver changed, trip cancelled. | P0 |
| NTF-3 | Operators can turn each trigger on or off, set ETA thresholds, and choose channels per trigger. | P0 |
| NTF-4 | Message templates with variables (`{{driver_first_name}}`, `{{vehicle}}`, `{{plate}}`, `{{eta_minutes}}`, `{{tracking_url}}`, `{{company_name}}`), with per-locale versions. | P0 |
| NTF-5 | Each notification fires at most once per trip, guarded against ETA oscillation. Notifications that are no longer relevant are suppressed (for example, skip "5 min away" if the driver is already 1 min away). | P0 |
| NTF-6 | Waiting-time reminders after arrival ("Your driver has been waiting 3 minutes"), with the operator's no-show policy. | P1 |
| NTF-7 | Delivery status tracking (queued, sent, delivered, failed), with retry and channel fallback (for example push fails, so send SMS). | P0 |
| NTF-8 | Handle opt-out and opt-in (STOP/HELP/START keywords for SMS) and honor them across all tenants as the law requires. | P0 |
| NTF-9 | Quiet-hours and rate-limit protections so a rider never gets spammed. | P1 |
| NTF-10 | Two-way SMS. A rider reply (for example "I'll be 2 min") is forwarded to the driver and dispatcher. | P2 |
| NTF-12 | Separate default template sets for pickups ("Your driver is 5 minutes away") and visits ("Your technician is on the way", "Your delivery is arriving"), editable by the operator. | P0 |
| NTF-13 | "You're next" notification when a multi-stop driver finishes the job before the rider's. | P1 |
| NTF-11 | Custom sender identity: a dedicated number per tenant, a branded sender name where supported, and a custom email domain. | P1 |

### 4.5 Rider tracking experience (web, no install)

| ID | Requirement | Pri |
|---|---|---|
| RDR-1 | A mobile-first web page opened from the tracking link. Loads in under 2 s on 4G with no login or app install. | P0 |
| RDR-2 | Live map with the driver's vehicle marker (smoothly animated, rotated to heading), the pickup pin, and an optional route line. Bounds fit both points automatically. | P0 |
| RDR-3 | A prominent ETA ("Arriving in 4 min · 2:34 PM") plus a status label for each trip state. | P0 |
| RDR-4 | Driver card with first name, photo, vehicle make, model, and color, and license plate. Shown so the rider can verify the right car (pickups) or recognize the right person at the door (visits). Visits can show the company vehicle or uniform instead of a plate. | P0 |
| RDR-5 | Contact actions: call or text the driver or dispatch. Numbers are masked in P2. | P1 |
| RDR-6 | Show pickup notes, and let the rider adjust the pickup pin within a limited radius before the driver is en route (operator setting). | P2 |
| RDR-7 | Live updates over WebSocket or SSE, with a polling fallback. The page recovers automatically after network loss. | P0 |
| RDR-8 | Clear views for stale location, reassignment, cancellation, and the post-trip "completed" state. | P0 |
| RDR-9 | Operator branding: logo, colors, company name, support contact, and a custom domain (`track.acmecabs.com`). | P0 logo/colors · P1 domain |
| RDR-10 | Ask the rider to enable web push so they get later updates without SMS. | P1 |
| RDR-11 | Post-trip rating or feedback prompt. | P2 |
| RDR-13 | Delivery and visit instructions from the rider ("Leave at side door", "Dog in yard") before the driver arrives. | P1 |
| RDR-12 | Share the trip status with a friend or family member through a read-only link. | P2 |

---

## 5. Functional requirements: standalone app

For operators without their own software.

### 5.1 Operator console (web)

| ID | Requirement | Pri |
|---|---|---|
| OPS-1 | Self-serve signup, organization setup, and an onboarding wizard (branding, first driver, test trip) that gets an operator live in under 30 min. | P0 |
| OPS-2 | Create trips by hand, assign drivers, and send the tracking link. | P0 |
| OPS-3 | Bulk import trips from CSV, and handle recurring trips (for example daily shuttles). | P1 |
| OPS-4 | Live dispatch map of all active drivers and trips, with filters and a status list. | P0 |
| OPS-5 | Manage drivers and vehicles: invite drivers by SMS or email, upload photos, enter vehicle details, deactivate. | P0 |
| OPS-6 | Configure notifications: toggle triggers, set thresholds, edit templates, and preview them. | P0 |
| OPS-7 | Roles and permissions: Admin, Dispatcher, Viewer. | P0 |
| OPS-8 | Trip history and search, with the notification log for each trip. | P0 |
| OPS-9 | Reports: on-time pickup rate, average wait time, no-show rate, ETA accuracy, notification delivery rate. | P1 |
| OPS-10 | Billing and subscription management (plans, usage, invoices, SMS overage). | P0 |
| OPS-11 | Lightweight integrations: Zapier/Make, Google Calendar or iCal import, and an email-to-trip parser. | P2 |

### 5.2 Driver app

| ID | Requirement | Pri |
|---|---|---|
| DRV-1 | iOS and Android app (native or cross-platform such as React Native or Flutter) with reliable **background location**. A PWA alone is not enough because iOS limits background geolocation. | P0 |
| DRV-2 | Sign in with a phone number and OTP. List of assigned trips. Go on-duty and off-duty. | P0 |
| DRV-3 | Trip actions: Start (en route), Arrived, Picked up, Complete, No-show, each with a timestamp. | P0 |
| DRV-4 | One tap to open navigation in Google Maps, Apple Maps, or Waze. | P0 |
| DRV-5 | Location sharing only while on duty or on a trip, with a clear indicator. | P0 |
| DRV-6 | Push alerts to the driver for new or changed or cancelled trip assignments. | P0 |
| DRV-7 | Battery-aware tracking. Typical battery use on a 1-hour shift under 8%. | P1 |
| DRV-8 | Call or text the rider through masked numbers. | P2 |
| DRV-9 | A lightweight "web driver link" fallback for occasional drivers, with documented limitations (foreground only). | P1 |

---

### 5.3 Booking (post-MVP)

Not in the MVP. In the meantime, operators create trips manually, by CSV import, or through integrations.

| ID | Requirement | Pri |
|---|---|---|
| BKG-1 | A branded public booking form: the rider or customer enters pickup or service address, time or preferred window, and contact details, and accepts SMS consent. Creates a trip in `scheduled` state for the dispatcher to assign. | P1 |
| BKG-2 | Embeddable booking widget for the operator's website. | P2 |
| BKG-3 | Dispatcher approves or declines requests, and the rider is notified either way. | P1 |
| BKG-4 | Basic availability rules: business hours, service area, lead time. | P2 |

---

## 6. Functional requirements: API and SDK product

For companies with existing apps.

### 6.1 Public API

| ID | Requirement | Pri |
|---|---|---|
| API-1 | Versioned REST API (`/v1`) with an OpenAPI 3 spec covering Trips, Drivers, Vehicles, Locations, Notifications, Templates, Tracking Links, and Webhooks. | P0 |
| API-2 | Location ingestion endpoint that accepts single and batch pings. Optional high-throughput stream (WebSocket or gRPC) for large fleets. | P0 / P1 |
| API-3 | Authentication: secret API keys (server-side), publishable keys (client-side, restricted scope), and short-lived signed tokens for rider and driver SDK sessions. OAuth 2.0 for platform partners (P2). | P0 |
| API-4 | Test and live modes with separate keys and data, plus a location **simulator** that drives a fake driver along a route. | P0 |
| API-5 | Idempotency keys on all POST requests, consistent error format, cursor pagination. | P0 |
| API-6 | Per-key rate limits with standard headers. Documented quotas. | P0 |
| API-7 | Webhooks for trip state changes, `eta.changed`, `driver.arriving`, `driver.arrived`, `notification.sent/delivered/failed`, and `location.stale`, signed with HMAC and retried with backoff. Includes a delivery log and replay. | P0 |
| API-8 | "Notifications-only" mode. The integrator sends its own locations and ETAs, and Arrively handles notification logic and delivery. | P1 |
| API-9 | "Bring your own" options: the integrator's own SMS provider credentials, their own push credentials (APNs/FCM), and their own map provider key. | P1 |
| API-10 | Read-only ETA endpoint (`GET /v1/trips/{id}/eta`) for integrators who want to render their own UI. | P0 |

### 6.2 Embeddable UI and SDKs

| ID | Requirement | Pri |
|---|---|---|
| SDK-1 | **Hosted tracking page** (the same as RDR-*) usable by API customers with their branding, so no front-end work is required. | P0 |
| SDK-2 | **Web component / JS SDK** (`<arrively-tracker trip-token="...">`) that embeds the live map and ETA in any web page. React wrapper included. Themeable. | P0 |
| SDK-3 | **iOS (Swift) and Android (Kotlin) rider SDKs**: a drop-in map view and a headless data stream, so customers can add tracking to native apps. | P1 |
| SDK-4 | **Driver SDKs (iOS/Android)** that handle background location collection, batching, and battery optimization for customers' existing driver apps. | P1 |
| SDK-5 | React Native and Flutter wrappers. | P2 |
| SDK-6 | Server SDKs: Node.js and Python (P0); Ruby, Go, Java, PHP, .NET (P1–P2). | P0+ |
| SDK-7 | Developer portal: docs, quickstarts, API reference, interactive console, API key management, webhook tester, usage dashboard, changelog. | P0 |
| SDK-8 | Semantic versioning, a deprecation policy (at least 12 months' notice for breaking API changes), and status page. | P0 |

---

## 7. Cross-cutting requirements

### 7.1 Multi-tenancy and white-labeling

- MT-1 (P0): Strict tenant isolation in data storage, API keys, and logs. Every query is tenant-scoped.
- MT-2 (P0): Per-tenant branding (logo, colors, sender name, support contact, terms and privacy links).
- MT-3 (P1): Custom domains with automatic TLS.
- MT-4 (P1): Sub-accounts for resellers or franchises (one parent, many child operators).

### 7.2 Privacy and safety

- PRV-1 (P0): Tracking links use unguessable tokens (≥128 bits of entropy). They expire automatically after trip completion plus a short grace period (default 30 min).
- PRV-2 (P0): The rider sees the driver's location only during the active window (`driver_assigned`/`en_route` through `in_progress`). Never before assignment or after completion.
- PRV-3 (P0): Minimize exposed driver data: first name, photo, vehicle. Never the full name or personal phone number.
- PRV-4 (P0): No driver tracking off-duty. Drivers can see when they are being tracked.
- PRV-5 (P0): Configurable data retention. Raw location data is kept 30–90 days by default, then deleted or aggregated. Tooling for deletion and export requests (CCPA/CPRA and other US state privacy laws).
- PRV-6 (P1): Optional location obfuscation near the driver's start point, so a home address isn't revealed.
- PRV-7 (P1): Abuse controls: revoke links, block numbers, rate-limit link views.

### 7.3 Security

- SEC-1 (P0): TLS 1.2+ everywhere. Data encrypted at rest. Secrets in a managed vault.
- SEC-2 (P0): SSO or MFA for operator console users (MFA P0, SAML/OIDC SSO P1).
- SEC-3 (P0): Role-based access control. API key scopes. Audit logs of admin actions.
- SEC-4 (P0): OWASP Top 10 protections, dependency scanning, annual third-party pen test.
- SEC-5 (P1): SOC 2 Type II readiness.
- SEC-6: HIPAA-eligible configuration is out of scope while healthcare is not a target vertical.

### 7.4 Compliance (messaging and legal)

- CMP-1 (P0): US SMS compliance with TCPA and CTIA guidelines, A2P 10DLC brand and campaign registration per tenant (handled by Arrively during onboarding), and toll-free number verification. Messages are transactional only, never marketing.
- CMP-2 (P0): **The operator collects SMS consent.** Arrively provides:
  - Required consent language for operators to show wherever they take bookings (phone script, web form, booking app).
  - An API field and console checkbox to record consent (timestamp, source, wording version) on every trip. Without it, SMS isn't sent; email and the tracking link still work.
  - Opt-out enforcement (STOP/HELP/START) across all of that tenant's messages.
  - Terms that make the operator responsible for valid consent.
- CMP-5 (P1): The first SMS to a new phone number includes the company name and opt-out instructions.
- CMP-3 (P0): CCPA/CPRA and other US state privacy laws. A DPA available to customers and a sub-processor list. All data hosted in the US.
- CMP-4 (P0): Terms of service and acceptable-use policy that bar covert tracking.

### 7.5 Performance and scalability

- PERF-1 (P0): End-to-end location latency (driver device to rider screen) at p95 ≤ 3 s.
- PERF-2 (P0): Notification trigger to SMS hand-off to the provider at p95 ≤ 5 s.
- PERF-3 (P0): Tracking page first meaningful paint ≤ 2 s on mid-range mobile over 4G. JS bundle ≤ 200 KB gzipped, excluding map tiles.
- PERF-4 (P0): API p95 latency ≤ 200 ms for reads, ≤ 300 ms for writes, excluding external routing calls.
- PERF-5 (P1): Scale horizontally to 50k concurrently active trips and 20k location pings/s at launch, and to 10× without re-architecture.

### 7.6 Reliability

- REL-1 (P0): 99.9% monthly availability for the API, ingestion, and tracking pages. 99.95% target (P1).
- REL-2 (P0): Graceful degradation. If the map provider fails, show ETA and status without the map. If routing fails, use the approximate ETA. If the SMS provider fails, fail over to a secondary provider (P1).
- REL-3 (P0): No duplicate notifications under retries or failover (idempotent notification dispatch).
- REL-4 (P1): Multi-AZ deployment. Documented RPO ≤ 5 min and RTO ≤ 1 h.

### 7.7 Accessibility and localization

- A11Y-1 (P0): Rider tracking page and operator console meet **WCAG 2.2 AA**. ETA and status are exposed as text and through screen-reader live regions, not only on the map.
- A11Y-2 (P1): A high-contrast map theme and a "no-map" text-only view.
- L10N-1 (P0): All rider-facing text can be localized. Launch with US English and Spanish. Templates per locale. Imperial units (miles, feet), 12-hour times, all US time zones (including Alaska and Hawaii), and US address formats.
- L10N-2 (P2): More languages and non-US formats when expanding beyond the US.

### 7.8 Observability and support

- OBS-1 (P0): Structured logs, metrics, and tracing. Dashboards for ingestion lag, ETA error, notification delivery rate, and webhook failures.
- OBS-2 (P0): Alerts on SLO burn, provider outages, and per-tenant delivery failure spikes.
- OBS-3 (P1): Internal support tool to look up a trip by ID, phone number, or link and replay its timeline.

---

## 8. Third-party dependencies (to evaluate)

| Area | Candidates |
|---|---|
| Maps, geocoding, routing, traffic ETA | Google Maps Platform, Mapbox, HERE, TomTom (all have strong US coverage). Abstract behind an interface so providers can be switched. |
| SMS / voice / WhatsApp | Twilio, Vonage, MessageBird/Bird, Telnyx. Use at least two for failover. |
| Email | SendGrid, Postmark, Amazon SES |
| Push | APNs, FCM, Web Push (VAPID) |
| Billing | Stripe Billing (subscriptions and metered usage) |

Requirement DEP-1 (P0): Wrap every provider behind an internal adapter so it can be switched, and track per-tenant usage for cost attribution.

---

## 9. Packaging and pricing assumptions (to validate)

- **Standalone**: tiers per active driver per month, with included SMS and overage billing. Free trial.
- **API**: usage-based pricing per tracked trip plus per notification. Free developer tier in test mode.
- Both products share metering. Requirement BIL-1 (P0): accurate per-tenant metering of trips, location pings, routing calls, and messages.

---

## 10. Success metrics

| Metric | Target (first 6 months) |
|---|---|
| Driver wait time at pickup | −30% vs. operator baseline |
| No-show rate | −25% |
| "Where's my driver?" inbound calls | −50% |
| Tracking link open rate | ≥ 70% |
| ETA accuracy (arrival within ±2 min of the ETA shown 10 min out) | ≥ 85% |
| SMS delivery rate | ≥ 98% |
| Standalone time-to-first-live-trip | median < 1 day |
| API time-to-first-webhook | median < 1 hour |

---

## 11. Phasing

**MVP (P0)**
- Core trip, location, ETA, and notification engine
- SMS notifications
- Hosted, branded rider tracking page
- Operator console (manual trips, live map, drivers, notification settings, billing)
- Native driver app with background location
- REST API, webhooks, JS embed, Node/Python SDKs, developer portal, test mode and simulator

**Phase 2 (P1)**
- Email, web push, and native push
- Native rider and driver SDKs
- Custom domains
- Reports and ETA accuracy
- CSV and recurring trips
- Multi-stop queue position and "You're next" (TRP-12, NTF-13)
- Public booking form (BKG-1, BKG-3)
- SMS provider failover
- SSO
- Bring-your-own provider credentials
- SOC 2

**Phase 3 (P2)**
- Lightweight booking (BKG-*), starting in P1
- WhatsApp and voice
- Masked calling and two-way SMS
- Multi-stop and shared rides
- Telematics integrations
- Expansion beyond the US
- Reseller accounts
- Rider pickup-pin adjustment

---

## 12. Decisions

| Question | Decision |
|---|---|
| Target verticals | Rideshare-type transport, and delivery and field services. |
| Launch markets | United States only. |
| Who collects SMS consent | The operator. Arrively supplies the language, records consent, and enforces opt-outs. |
| Booking in the standalone app | Not in the MVP. Lightweight booking in P1/P2. |

## 13. Open questions

1. **Driver app strategy**: build a cross-platform native app (recommended), or start with a web-only driver link and accept its limits?
2. **Map provider**: Google offers the best traffic ETA. Mapbox costs less and is easier to style. Is the per-load cost acceptable at the target price points?
3. Should riders be able to **reply to or contact** drivers in the MVP, or only from P2?
4. **Proof of delivery or job completion** (photo, signature): in scope for delivery and field-service customers, or left to their own tools?
5. Of the two verticals, which one should **onboarding and default templates** favor first?
