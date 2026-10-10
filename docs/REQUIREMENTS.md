# Arrively — Product Requirements

> Status: Draft v0.4 · Owner: TBD · Last updated: 2026-10-10

## 1. Overview

Arrively covers one part of a service visit: **the driver getting to the customer**. It gives the business three things:

- A **live map** that shows the customer where the driver is.
- A continuously updated **ETA**.
- **Proactive notifications** that get the customer ready before the driver arrives.

For drivers with several stops, Arrively also **optimizes the order of stops** and tells each customer how many stops are ahead of them ("2 stops before you", "You're next").

The experience ends when the driver arrives and the stop is completed. Anything after that, such as riding to a destination, doing the service work, or handing over a delivery, is out of scope.

It ships in two forms:

1. **Standalone app**: a hosted, white-label product for smaller operators that don't have their own software.
2. **API and SDKs**: the routing, tracking, ETA, and notification engine, exposed so companies can add it to their existing apps.

Both forms run on the same core platform. The standalone app is a client of the public API.

### 1.1 Launch focus (decided)

- **Target verticals:**
  - **Delivery and field services**: couriers, local delivery, plumbers, installers, cleaners.
  - **Rideshare-type transport**: taxi, limo, car service. Only the trip to the customer's pickup location is covered.
- **Market:** United States only at launch.
- **SMS consent:** the operator collects consent from customers. Arrively provides the required consent language, stores the consent record, and enforces opt-outs (CMP-2).
- **Booking:** not in the MVP. Lightweight booking for standalone operators is planned for P1/P2 (section 5.3).
- **Multi-stop routes:** route optimization for the driver and stop position for the customer are part of the MVP (section 4.2).

### 1.2 Goals

- Customers are ready when the driver arrives, so drivers wait less and fewer visits are missed.
- Drivers with many stops spend less time driving.
- Fewer "where is my driver?" calls to the business.
- A small operator can go live in under one day with no engineering work.
- A developer can embed tracking and notifications in under one week.

### 1.3 Non-goals (initial release)

- Anything after arrival: riding to a destination, drop-off ETAs, job management, invoicing, proof of delivery.
- Booking (planned for P1/P2, see section 5.3), pricing, and payments.
- Splitting stops automatically across several drivers (planned for P2, RTE-10).
- Markets outside the United States.
- Healthcare and medical transport (HIPAA) use cases.
- Turn-by-turn navigation for drivers. The driver app shows the optimized route and deep-links each leg to Google Maps, Apple Maps, or Waze.
- In-app customer–driver chat. Masked calling and SMS are a candidate for P2.

### 1.4 Priority key

- **P0**: required for MVP
- **P1**: soon after launch
- **P2**: later or nice to have

---

## 2. Actors

| Actor | Description |
|---|---|
| **Customer** | The person waiting for the driver: a delivery recipient, a homeowner expecting a technician, or someone waiting to be picked up. Usually has no account and may not install anything. |
| **Driver** | The person traveling to the customer: a driver, courier, or technician. Shares location while on duty. The operator can choose which word customers see (OPS-12). |
| **Operator admin** | The business owner or manager. Configures branding, notifications, drivers, and billing. Adds stops and assigns them to drivers. |
| **Developer / integrator** | Engineer at an API customer who builds on the API and SDKs. |
| **Platform admin** | Arrively staff who manage tenants, support, and abuse. |

---

## 3. Core concepts

- **Tenant (Organization)**: an operator or API customer. All data is isolated per tenant.
- **Stop**: one arrival at one customer. It has customer contact info, an address, an optional exact time or arrival window, an estimated time on site, notes, and tenant-defined metadata.
- **Route**: a driver's ordered list of stops for a shift or day, with a start location and an optional end location. A route with one stop is the simple case (for example a single taxi pickup).
- **Stop states**: `scheduled → queued → en_route → arriving → arrived → completed`, plus `cancelled`, `skipped`, and `no_show`.
  - `queued`: on an active route, with other stops ahead of it.
  - `en_route`: the driver is heading to this stop next.
  - `completed`: the driver marked the stop done. Tracking ends here.
- **Stop position**: where a stop sits in the remaining route, expressed as stops ahead, such as "2 stops before you" or "You're next".
- **Location ping**: a timestamped driver position with lat/lng, accuracy, heading, and speed.
- **Tracking link**: a unique, expiring URL that shows the customer their stop live.
- **Notification rule**: a trigger (event, ETA threshold, or stops-ahead threshold) with channel(s) and a message template.

---

## 4. Functional requirements: core platform (shared by both products)

### 4.1 Stop management

| ID | Requirement | Pri |
|---|---|---|
| STP-1 | Create, read, update, and cancel stops with customer contact info, address or coordinates, optional exact time or arrival window, estimated time on site, notes, and tenant-defined metadata or external ID. | P0 |
| STP-2 | Assign, reassign, or unassign a stop to a driver or route. Reassignment updates the customer's view and notifies the customer. | P0 |
| STP-3 | Enforce the stop state machine. Reject or flag invalid transitions. | P0 |
| STP-4 | Detect `arrived` automatically with a geofence around the stop (configurable radius, default 250 ft, plus a dwell time). Drivers can also mark it manually. | P0 |
| STP-5 | Detect `arriving` automatically with an ETA threshold (default 2 min) or a distance threshold. | P0 |
| STP-6 | Geocode addresses, validate them, and let the pin be adjusted precisely (for example, a building entrance or side gate). | P0 |
| STP-7 | Support arrival windows (for example 2–4 PM) as well as exact times. | P0 |
| STP-8 | Stop notes for the driver, such as "Gate code 1234" or "Dog in yard". | P1 |
| STP-9 | Keep a full audit trail of state changes and notifications per stop. | P0 |

### 4.2 Route optimization (multi-stop)

| ID | Requirement | Pri |
|---|---|---|
| RTE-1 | Build a route for one driver from a set of stops, with a start location (depot, driver's current position, or an address) and an optional end location. | P0 |
| RTE-2 | **Optimize the stop order** to minimize total drive time, using traffic-aware travel times. Respect each stop's arrival window and time on site. | P0 |
| RTE-3 | Let the driver pin stops (for example "must be first", "must be last", or "fixed position") before optimizing. | P1 |
| RTE-4 | Show the result before it's accepted: the ordered stop list, the route on a map, total drive time and distance, per-stop ETAs, time saved compared with the original order, and any windows that can't be met. | P0 |
| RTE-5 | The driver can reorder stops by hand or skip a stop. All affected customers' positions and ETAs update. | P0 |
| RTE-6 | **Re-optimize** when a stop is added, cancelled, or running late. The next stop the driver is heading to and any stop whose customer got an "on the way" message stay in place, so customers aren't told one thing and then shown another. | P1 |
| RTE-7 | Handle at least 100 stops per route. Optimization returns in under 10 s for 50 stops. | P0 |
| RTE-8 | Planned routes for a future day, so customers can be told their window ahead of time. | P1 |
| RTE-9 | Driver breaks and shift end time as route constraints. | P2 |
| RTE-10 | Distribute a pool of stops across several drivers (vehicle routing), with optional capacity limits. | P2 |

### 4.3 Driver location ingestion

| ID | Requirement | Pri |
|---|---|---|
| LOC-1 | Accept location pings from the Arrively driver app, from the driver SDK, and through the REST/streaming API (for customers with their own driver apps or telematics). | P0 |
| LOC-2 | Default ping interval is 3–5 s while on an active route. Interval adapts to speed and battery. No tracking when off duty. | P0 |
| LOC-3 | Filter out GPS jitter, inaccurate fixes, and impossible jumps. Snap to roads for display. | P1 |
| LOC-4 | Detect stale locations. If no ping arrives for more than 30 s (configurable), mark the driver as "last seen X ago" in every view. | P0 |
| LOC-5 | Buffer pings offline on the device and upload them on reconnect. Live views show only the latest point. | P1 |
| LOC-6 | Integrate with third-party telematics and fleet trackers (Samsara, Geotab, and similar) as a location source. | P2 |

### 4.4 ETA engine

| ID | Requirement | Pri |
|---|---|---|
| ETA-1 | Compute a traffic-aware ETA for every remaining stop on a route: drive time for each leg plus time on site for each stop ahead. | P0 |
| ETA-2 | Recompute on significant movement, on stop completion, or at least every 30 s. Throttle routing API calls to control cost. | P0 |
| ETA-3 | Smooth the displayed ETA so it doesn't flicker (hysteresis). Never show a negative ETA or "0 min" before arrival. | P0 |
| ETA-4 | Emit an `eta.changed` event when a stop's ETA moves past a configurable delta (for example ±10 min while queued, ±3 min while en route). | P0 |
| ETA-5 | While a stop is `scheduled` (route not started), show its arrival window instead of a live ETA. | P0 |
| ETA-6 | Learn actual time on site per driver and job type to improve ETAs for queued stops. | P1 |
| ETA-7 | Track ETA accuracy (predicted vs. actual arrival) per tenant for quality reporting. | P1 |
| ETA-8 | Fall back to straight-line distance × average speed if the routing provider is unavailable, and mark the ETA as approximate. | P1 |

### 4.5 Notifications

| ID | Requirement | Pri |
|---|---|---|
| NTF-1 | Channels: **SMS** (P0), **email** (P1), **web push** from the tracking page (P1), **native push** through the integrator's app (API customers, P1), **WhatsApp** (P2), **automated voice call** (P2, for accessibility). | — |
| NTF-2 | Default triggers: stop scheduled (window and tracking link), route started ("There are 3 stops before yours"), **"N stops before you"** (configurable, default 2), **"You're next"**, **"X minutes away"** (configurable, default 10 min), **arriving now** (default 2 min), **driver has arrived**, significant delay, driver changed, stop cancelled or rescheduled. | P0 |
| NTF-3 | Operators can turn each trigger on or off, set thresholds, and choose channels per trigger. | P0 |
| NTF-4 | Message templates with variables (`{{driver_first_name}}`, `{{vehicle}}`, `{{eta_minutes}}`, `{{arrival_window}}`, `{{stops_ahead}}`, `{{tracking_url}}`, `{{company_name}}`), with English and Spanish versions. | P0 |
| NTF-5 | Each notification fires at most once per stop, guarded against ETA oscillation and route reordering. Notifications that are no longer relevant are suppressed (for example, skip "2 stops before you" if the customer is already next). | P0 |
| NTF-6 | Waiting reminders after arrival ("Your driver has been waiting 3 minutes"), with the operator's no-show policy. | P1 |
| NTF-7 | Delivery status tracking (queued, sent, delivered, failed), with retry and channel fallback (for example push fails, so send SMS). | P0 |
| NTF-8 | Handle opt-out and opt-in (STOP/HELP/START keywords for SMS) and honor them as the law requires. | P0 |
| NTF-9 | Quiet hours and rate limits so a customer never gets spammed, even on long routes with many reorderings. | P1 |
| NTF-10 | Custom sender identity: a dedicated number per tenant, a branded sender name where supported, and a custom email domain. | P1 |
| NTF-11 | Two-way SMS. A customer reply (for example "Running 5 min late") is forwarded to the driver and the operator. | P2 |

### 4.6 Customer tracking experience (web, no install)

| ID | Requirement | Pri |
|---|---|---|
| CUS-1 | A mobile-first web page opened from the tracking link. Loads in under 2 s on 4G with no login or app install. | P0 |
| CUS-2 | A prominent ETA ("Arriving in 12 min · 2:34 PM") or arrival window, plus a plain-language status for each stop state. | P0 |
| CUS-3 | **Stops ahead**: "3 stops before you", "1 stop before you", or "You're next". The total number of stops on the route is never shown. | P0 |
| CUS-4 | Live map showing the driver (smoothly animated marker, rotated to heading) and the customer's own pin, with an optional route line. Bounds fit both points automatically. | P0 |
| CUS-5 | **The driver is visible, other stops are not.** From the moment the route starts, the map shows the driver's live location and the number of stops ahead. It never shows other stops: no pins, no addresses, and no route line through them. Once this stop is `en_route`, a route line from the driver to the customer's pin can appear. | P0 |
| CUS-6 | Driver card with first name, photo, vehicle or uniform description, and plate when relevant, so the customer recognizes the right person. | P0 |
| CUS-7 | Live updates over WebSocket or SSE, with a polling fallback. The page recovers automatically after network loss. | P0 |
| CUS-8 | Clear views for stale location, reassignment, delay, cancellation, and the "completed" state. | P0 |
| CUS-9 | Operator branding: logo, colors, company name, support contact, and a custom domain (`track.acmeplumbing.com`). | P0 logo/colors · P1 domain |
| CUS-10 | Contact actions: call or text the driver or the business. Numbers are masked in P2. | P1 |
| CUS-11 | The customer can add access instructions ("Leave at side door", "Dog in yard") before the driver arrives. | P1 |
| CUS-12 | Ask the customer to enable web push so they get later updates without SMS. | P1 |
| CUS-13 | The customer can say they're not available, and the driver and operator are alerted to skip or reschedule. | P2 |
| CUS-14 | Short feedback prompt after the stop is completed. | P2 |

---

## 5. Functional requirements: standalone app

For operators without their own software.

### 5.1 Operator console (web)

| ID | Requirement | Pri |
|---|---|---|
| OPS-1 | Self-serve signup, organization setup, and an onboarding wizard (branding, first driver, test route) that gets an operator live in under 30 min. | P0 |
| OPS-2 | Create stops by hand and assign them to a driver. The driver optimizes the order in the app (DRV-4). Tracking links go out automatically. | P0 |
| OPS-3 | Import stops from CSV and assign them to a driver in one step. Recurring stops (for example weekly service). | P0 import · P1 recurring |
| OPS-4 | Live map of all active drivers and routes for the operator, showing each driver's progress ("5 of 12 done, 20 min behind"), with filters. | P0 |
| OPS-5 | Manage drivers and vehicles: invite drivers by SMS or email, upload photos, enter vehicle details, deactivate. | P0 |
| OPS-6 | Configure notifications: toggle triggers, set thresholds, edit templates, and preview them. | P0 |
| OPS-7 | Roles and permissions: Admin and Driver. Additional office roles are out of scope for now. | P0 |
| OPS-8 | Route and stop history with search, including the notification log for each stop. | P0 |
| OPS-9 | Reports: on-time arrival rate, average driver wait at the door, no-show rate, ETA accuracy, drive time saved by optimization, notification delivery rate. | P1 |
| OPS-10 | Billing and subscription management (plans, usage, invoices, SMS overage). | P0 |
| OPS-11 | Lightweight integrations: Zapier/Make, Google Calendar or iCal import, and an email-to-stop parser. | P2 |
| OPS-12 | Industry presets that set default wording ("driver", "technician", "courier"), notification templates, and arrival radius. | P0 |

### 5.2 Driver app

| ID | Requirement | Pri |
|---|---|---|
| DRV-1 | iOS and Android app (native or cross-platform such as React Native or Flutter) with reliable **background location**. A PWA alone is not enough because iOS limits background geolocation. | P0 |
| DRV-2 | Sign in with a phone number and OTP. Go on duty and off duty. | P0 |
| DRV-3 | **Route view**: the optimized stop list in order, the whole route on a map, total stops, stops remaining, total drive time and distance, and ETA for each stop. | P0 |
| DRV-4 | **The driver optimizes the route**, and can reorder stops by hand or skip a stop (RTE-2, RTE-5). | P0 |
| DRV-5 | Stop actions: Start route, Arrived, Completed, No-show, Skip, each with a timestamp. Completing a stop moves to the next one and notifies the following customers. | P0 |
| DRV-6 | One tap to open navigation to the next stop in Google Maps, Apple Maps, or Waze. | P0 |
| DRV-7 | Location sharing only while on duty, with a clear indicator. | P0 |
| DRV-8 | Push alerts to the driver when the operator adds, changes, or cancels stops, or a customer cancels. | P0 |
| DRV-9 | Battery-aware tracking. Typical battery use on a 1-hour shift under 8%. | P1 |
| DRV-10 | A lightweight "web driver link" fallback for occasional drivers, with documented limitations (foreground only). | P1 |
| DRV-12 | Owner-operators can create their own stops in the driver app, with no console needed. | P1 |
| DRV-11 | Call or text the customer through masked numbers. | P2 |

### 5.3 Booking (post-MVP)

Not in the MVP. In the meantime, operators create stops manually, by CSV import, or through integrations.

| ID | Requirement | Pri |
|---|---|---|
| BKG-1 | A branded public booking form: the customer enters an address, preferred window, and contact details, and accepts SMS consent. Creates a `scheduled` stop for the operator to assign. | P1 |
| BKG-2 | The operator approves or declines requests, and the customer is notified either way. | P1 |
| BKG-3 | Embeddable booking widget for the operator's website. | P2 |
| BKG-4 | Basic availability rules: business hours, service area, lead time. | P2 |

---

## 6. Functional requirements: API and SDK product

For companies with existing apps.

### 6.1 Public API

| ID | Requirement | Pri |
|---|---|---|
| API-1 | Versioned REST API (`/v1`) with an OpenAPI 3 spec covering Stops, Routes, Drivers, Vehicles, Locations, Notifications, Templates, Tracking Links, and Webhooks. | P0 |
| API-2 | Route optimization endpoint (`POST /v1/routes/{id}/optimize`), usable on its own or with tracking. Integrators can also supply their own stop order. | P0 |
| API-3 | Location ingestion endpoint that accepts single and batch pings. Optional high-throughput stream (WebSocket or gRPC) for large fleets. | P0 / P1 |
| API-4 | Authentication: secret API keys (server-side), publishable keys (client-side, restricted scope), and short-lived signed tokens for customer and driver SDK sessions. OAuth 2.0 for platform partners (P2). | P0 |
| API-5 | Test and live modes with separate keys and data, plus a **simulator** that drives a fake driver along a route and completes stops. | P0 |
| API-6 | Idempotency keys on all POST requests, consistent error format, cursor pagination. | P0 |
| API-7 | Per-key rate limits with standard headers. Documented quotas. | P0 |
| API-8 | Webhooks for stop state changes, `route.started`, `route.reordered`, `route.completed`, `eta.changed`, `stop.position_changed`, `notification.sent/delivered/failed`, and `location.stale`, signed with HMAC and retried with backoff. Includes a delivery log and replay. | P0 |
| API-9 | Read-only endpoint (`GET /v1/stops/{id}/status`) returning ETA, state, and stop position, for integrators who render their own UI. | P0 |
| API-10 | "Notifications-only" mode. The integrator sends its own locations, order, and ETAs, and Arrively handles notification logic and delivery. | P1 |
| API-11 | "Bring your own" options: the integrator's own SMS provider credentials, their own push credentials (APNs/FCM), and their own map provider key. | P1 |

### 6.2 Embeddable UI and SDKs

| ID | Requirement | Pri |
|---|---|---|
| SDK-1 | **Hosted tracking page** (the same as CUS-*) usable by API customers with their branding, so no front-end work is required. | P0 |
| SDK-2 | **Web component / JS SDK** (`<arrively-tracker stop-token="...">`) that embeds the map, ETA, and stop position in any web page. React wrapper included. Themeable. | P0 |
| SDK-3 | **iOS (Swift) and Android (Kotlin) customer SDKs**: a drop-in tracking view and a headless data stream, so customers can add tracking to native apps. | P1 |
| SDK-4 | **Driver SDKs (iOS/Android)** that handle background location, route display, and stop actions for customers' existing driver apps. | P1 |
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

- PRV-1 (P0): Tracking links use unguessable tokens (≥128 bits of entropy). They expire automatically after the stop is completed plus a short grace period (default 30 min).
- PRV-2 (P0): A customer sees the driver's live location only from route start until their own stop is completed. Never before the route starts and never after (see CUS-5). Customers can see where the driver is while the driver is at another stop. That trade-off is accepted (section 12).
- PRV-3 (P0): A customer never sees any other customer's name, address, or position on the map. The number of stops ahead is the only information shared about other stops.
- PRV-4 (P0): Minimize exposed driver data: first name, photo, vehicle. Never the full name or personal phone number.
- PRV-5 (P0): No driver tracking off duty. Drivers can see when they are being tracked.
- PRV-6 (P0): Configurable data retention. Raw location data is kept 30–90 days by default, then deleted or aggregated. Tooling for deletion and export requests (CCPA/CPRA and other US state privacy laws).
- PRV-7 (P1): Optional location obfuscation near the driver's start point, so a home address isn't revealed.
- PRV-8 (P1): Abuse controls: revoke links, block numbers, rate-limit link views.

### 7.3 Security

- SEC-1 (P0): TLS 1.2+ everywhere. Data encrypted at rest. Secrets in a managed vault.
- SEC-2 (P0): MFA for operator console users (P0). SAML/OIDC SSO (P1).
- SEC-3 (P0): Role-based access control. API key scopes. Audit logs of admin actions.
- SEC-4 (P0): OWASP Top 10 protections, dependency scanning, annual third-party pen test.
- SEC-5 (P1): SOC 2 Type II readiness.

### 7.4 Compliance (messaging and legal)

- CMP-1 (P0): US SMS compliance with TCPA and CTIA guidelines, A2P 10DLC brand and campaign registration per tenant (handled by Arrively during onboarding), and toll-free number verification. Messages are transactional only, never marketing.
- CMP-2 (P0): **The operator collects SMS consent.** Arrively provides:
  - Required consent language for operators to use wherever they take orders or appointments (phone script, web form, their own app).
  - An API field and console checkbox to record consent (timestamp, source, wording version) on every stop. Without it, SMS isn't sent; email and the tracking link still work.
  - Opt-out enforcement (STOP/HELP/START) across all of that tenant's messages.
  - Terms that make the operator responsible for valid consent.
- CMP-3 (P0): CCPA/CPRA and other US state privacy laws. A DPA available to customers and a sub-processor list. All data hosted in the US.
- CMP-4 (P0): Terms of service and acceptable-use policy that bar covert tracking.
- CMP-5 (P1): The first SMS to a new phone number includes the company name and opt-out instructions.

### 7.5 Performance and scalability

- PERF-1 (P0): End-to-end location latency (driver device to customer screen) at p95 ≤ 3 s.
- PERF-2 (P0): Notification trigger to SMS hand-off to the provider at p95 ≤ 5 s.
- PERF-3 (P0): Tracking page first meaningful paint ≤ 2 s on mid-range mobile over 4G. JS bundle ≤ 200 KB gzipped, excluding map tiles.
- PERF-4 (P0): API p95 latency ≤ 200 ms for reads, ≤ 300 ms for writes, excluding external routing and optimization calls.
- PERF-5 (P0): Route optimization returns in under 10 s for 50 stops, and under 30 s for 100 stops.
- PERF-6 (P1): Scale horizontally to 10k concurrently active routes, 200k active stops, and 20k location pings/s at launch, and to 10× without re-architecture.

### 7.6 Reliability

- REL-1 (P0): 99.9% monthly availability for the API, ingestion, and tracking pages. 99.95% target (P1).
- REL-2 (P0): Graceful degradation.
  - If the map provider fails, show ETA, stop position, and status without the map.
  - If routing fails, use the approximate ETA.
  - If optimization fails, keep the current stop order and tell the driver.
  - If the SMS provider fails, fail over to a secondary provider (P1).
- REL-3 (P0): No duplicate notifications under retries or failover (idempotent notification dispatch).
- REL-4 (P1): Multi-AZ deployment. Documented RPO ≤ 5 min and RTO ≤ 1 h.

### 7.7 Accessibility and localization

- A11Y-1 (P0): Customer tracking page, operator console, and driver app meet **WCAG 2.2 AA**. ETA, stop position, and status are exposed as text and through screen-reader live regions, not only on the map.
- A11Y-2 (P1): A high-contrast map theme and a "no-map" text-only view.
- L10N-1 (P0): All customer-facing text can be localized. Launch with US English and Spanish. Imperial units (miles, feet), 12-hour times, all US time zones (including Alaska and Hawaii), and US address formats.
- L10N-2 (P2): More languages and non-US formats when expanding beyond the US.

### 7.8 Observability and support

- OBS-1 (P0): Structured logs, metrics, and tracing. Dashboards for ingestion lag, ETA error, optimization time, notification delivery rate, and webhook failures.
- OBS-2 (P0): Alerts on SLO burn, provider outages, and per-tenant delivery failure spikes.
- OBS-3 (P1): Internal support tool to look up a stop or route by ID, phone number, or link and replay its timeline.

---

## 8. Third-party dependencies (to evaluate)

| Area | Candidates |
|---|---|
| Maps, geocoding, routing, traffic ETA | Google Maps Platform, Mapbox, HERE, TomTom (all have strong US coverage). |
| Route optimization | Google Route Optimization API, Mapbox Optimization API, HERE Tour Planning, or self-hosted (Google OR-Tools, VROOM) with a commercial travel-time matrix. |
| SMS / voice / WhatsApp | Twilio, Vonage, Bird, Telnyx. Use at least two for failover. |
| Email | SendGrid, Postmark, Amazon SES |
| Push | APNs, FCM, Web Push (VAPID) |
| Billing | Stripe Billing (subscriptions and metered usage) |

Requirement DEP-1 (P0): Wrap every provider behind an internal adapter so it can be switched, and track per-tenant usage for cost attribution.

---

## 9. Packaging and pricing assumptions (to validate)

- **Standalone**: tiers per active driver per month, with included SMS and overage billing. Free trial.
- **API**: usage-based pricing per tracked stop, per optimization run, and per notification. Free developer tier in test mode.
- Both products share metering. Requirement BIL-1 (P0): accurate per-tenant metering of stops, optimizations, location pings, routing calls, and messages.

---

## 10. Success metrics

| Metric | Target (first 6 months) |
|---|---|
| Driver wait time at the customer's door or curb | −30% vs. operator baseline |
| No-show / missed-visit rate | −25% |
| Drive time per route with optimization | −15% vs. the operator's manual order |
| "Where's my driver?" inbound calls | −50% |
| Tracking link open rate | ≥ 70% |
| ETA accuracy (arrival within ±2 min of the ETA shown 10 min out) | ≥ 85% |
| SMS delivery rate | ≥ 98% |
| Standalone time-to-first-live-route | median < 1 day |
| API time-to-first-webhook | median < 1 hour |

---

## 11. Phasing

**MVP (P0)**
- Core stop, route, location, ETA, and notification engine
- Single-driver route optimization, with manual reordering and skipping
- SMS notifications, including stops ahead ("2 stops before you", "You're next")
- Hosted, branded customer tracking page with live driver location, stops ahead, and privacy rules
- Operator console (manual and CSV stops, assigning to drivers, live map, drivers, notification settings, billing)
- Native driver app with route optimization, route view, and background location
- REST API (including optimization), webhooks, JS embed, Node/Python SDKs, developer portal, test mode and simulator

**Phase 2 (P1)**
- Automatic re-optimization when stops change, and pinned stops
- Planned routes for future days
- Email, web push, and native push
- Native customer and driver SDKs
- Custom domains
- Reports, ETA accuracy, and learned time on site
- Recurring stops
- Public booking form (BKG-1, BKG-2)
- SMS provider failover
- SSO
- Bring-your-own provider credentials
- SOC 2

**Phase 3 (P2)**
- Multi-driver stop distribution and capacity limits
- Driver breaks and shift constraints
- Booking widget and availability rules
- WhatsApp and voice
- Masked calling and two-way SMS
- Telematics integrations
- Reseller accounts
- Office roles (for example a dispatcher)
- Expansion beyond the US

---

## 12. Decisions

| Question | Decision |
|---|---|
| Scope of the experience | Strictly the driver getting to the customer. Nothing after arrival. |
| Target verticals | Delivery and field services, plus rideshare-type pickups. |
| Launch markets | United States only. |
| Who collects SMS consent | The operator. Arrively supplies the language, records consent, and enforces opt-outs. |
| Booking in the standalone app | Not in the MVP. Lightweight booking in P1/P2. |
| Multi-stop routes | Route optimization for the driver and stops ahead for the customer are in the MVP. |
| Stop count shown to customers | Only the stops ahead of them. Never the route total. |
| Map before the customer is next | Show the driver's live location and the stops ahead. Never show where other stops are. |
| Who optimizes routes | The driver. The operator admin adds and assigns stops. No dispatcher role for now. |

## 13. Open questions

1. **Driver app strategy**: build a cross-platform native app (recommended), or start with a web-only driver link and accept its limits?
2. **Map and optimization provider**: Google offers the best traffic ETA and has an optimization API. Mapbox costs less and is easier to style. Self-hosted optimization lowers per-run cost but needs engineering. Is the per-use cost acceptable at the target price points?
3. Should customers be able to **reply to or contact** drivers in the MVP, or only from P2?
4. Of the two verticals, which one should **onboarding and default templates** favor first?
5. **Driver at another stop**: should the live map add a mitigation, such as freezing the marker or showing a "Driver is at another stop" banner while the driver is parked at a stop ahead? Otherwise customers can see where other customers are.
