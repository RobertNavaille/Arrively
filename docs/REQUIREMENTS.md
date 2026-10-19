# Arrively — Product Requirements

> Status: Draft v0.14 · Owner: TBD · Last updated: 2026-10-19

## 1. Overview

Arrively covers one part of a service visit: **the driver getting to the customer**. It gives the business three things:

- A **live map** that shows the customer where the driver is.
- A continuously updated **ETA**.
- **Proactive notifications** that get the customer ready before the driver arrives.

For drivers with several stops, Arrively also **optimizes the order of stops** and tells each customer how many stops are ahead of them ("2 stops before you", "You're next").

The experience ends when the driver arrives and the stop is completed. Anything after that, such as riding to a destination, doing the service work, or handing over a delivery, is out of scope.

It ships in two forms, one at a time:

1. **Standalone app (v1, the MVP)**: a single **Arrively-branded** app for smaller operators that don't have their own software. It is not white-label: every business signs up to the same hosted Arrively product, drivers use the same Arrively driver app from the app stores, and customers get Arrively tracking pages and texts. Each business appears inside the product by name (and optional logo) so customers know who is coming. There are no separate per-business instances, custom apps, or custom domains.
2. **API and SDKs (v2, Phase 2)**: the routing, tracking, ETA, and notification engine, exposed so companies can add it to their existing apps under their own brand.

Both forms run on the same core platform. In v1, the standalone app is built entirely on the same API that will become the public API in v2. **v1 exists to validate the UX and behavior** (stop states, ETAs, notification timing, marking every stop, route optimization) with real businesses before that API and the SDKs are released to developers. See section 6.0.

### 1.1 Launch focus (decided)

- **Target verticals:**
  - **Delivery and field services**: couriers, local delivery, plumbers, installers, cleaners.
  - **Rideshare-type transport**: taxi, limo, car service. Only the trip to the customer's pickup location is covered.
- **Market:** United States only at launch.
- **SMS consent:** the operator collects consent from customers. Arrively provides the required consent language, stores the consent record, and enforces opt-outs (CMP-2).
- **Booking:** not in the MVP. Lightweight booking for standalone operators is planned for P1/P2 (section 5.3).
- **Product order:** v1 is the standalone app only. The public API and SDKs come in v2 (section 6).
- **Multi-stop routes:** route optimization for the driver and stop position for the customer are part of the MVP (section 4.2).

### 1.2 Goals

- Customers are ready when the driver arrives, so drivers wait less and fewer visits are missed.
- Drivers with many stops spend less time driving.
- Fewer "where is my driver?" calls to the business.
- A small operator can go live in under one day with no engineering work.
- (v2) A developer can embed tracking and notifications in under one week.

### 1.3 Non-goals (initial release)

- Anything after arrival: riding to a destination, drop-off ETAs, job management, invoicing, proof of delivery.
- Booking (planned for P1/P2, see section 5.3), pricing, and payments.
- Splitting stops automatically across several drivers (planned for P2, RTE-10).
- Markets outside the United States.
- Healthcare and medical transport (HIPAA) use cases.
- Turn-by-turn navigation for drivers. The driver app shows the whole day and deep-links the current stop to Google Maps, Apple Maps, or Waze (section 5.2.1).

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
| **Operator admin** | The business owner or manager. Configures business profile (name, logo, support phone), notifications, drivers, and billing. Adds stops and assigns them to drivers. |
| **Developer / integrator** (v2) | Engineer at an API customer who builds on the API and SDKs. |
| **Platform admin** | Arrively staff who manage tenants, support, and abuse. |

---

## 3. Core concepts

- **Tenant (Organization)**: an operator or API customer. All data is isolated per tenant.
- **Stop**: one arrival at one customer. It has customer contact info, an address, an optional exact time or arrival window, an estimated time on site, notes, and tenant-defined metadata.
- **Route**: a driver's ordered list of stops for a shift or day, with a start location and an optional end location. A route with one stop is the simple case (for example a single taxi pickup).
- **Stop states**: `scheduled → queued → en_route → arriving → arrived → completed`, plus `cancelled`, `skipped`, and `no_show`.
  - `queued`: on an active route, with other stops ahead of it.
  - `en_route`: the driver has left the previous stop (or started the route) and is heading to this stop.
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
| STP-1 | Create, read, update, and cancel stops with customer contact info, address or coordinates, notes, and tenant-defined metadata or external ID. Arrival windows and time on site are **not** entered in v1 (owner decision, 2026-10-19); ETAs assume 20 minutes per stop. | P0 |
| STP-2 | Assign, reassign, or unassign a stop to a driver or route. Reassignment updates the customer's view and notifies the customer. | P0 |
| STP-3 | Enforce the stop state machine. Reject or flag invalid transitions. | P0 |
| STP-4 | Detect `arrived` automatically with a geofence around the stop (configurable radius, default 250 ft, plus a dwell time). Drivers can also mark it manually. | P0 |
| STP-5 | Detect `arriving` automatically with an ETA threshold (default 2 min) or a distance threshold. | P0 |
| STP-6 | Geocode addresses, validate them, and let the pin be adjusted precisely (for example, a building entrance or side gate). | P0 |
| STP-7 | Support arrival windows (for example 2–4 PM) as well as exact times. | P0 |
| STP-8 | Stop notes for the driver, such as "Gate code 1234" or "Dog in yard". | P1 |
| STP-9 | Keep a full audit trail of state changes and notifications per stop. | P0 |
| STP-10 | **Departure detection**: a stop counts as left when the driver exits its geofence after marking it completed, skipped, or no-show. Only then does the next stop become `en_route` and every later customer's stops-ahead count drop by one. Marking a stop completed while still parked there changes nothing for other customers. | P0 |

### 4.2 Route optimization (multi-stop)

| ID | Requirement | Pri |
|---|---|---|
| RTE-1 | Build a route for one driver from a set of stops, with a start location (depot, driver's current position, or an address) and an optional end location. | P0 |
| RTE-2 | **Optimize the stop order** to minimize total drive time, using traffic-aware travel times. Respect each stop's arrival window and time on site. | P0 |
| RTE-3 | Let the operator admin pin stops (for example "must be first", "must be last", or "fixed position") before optimizing. | P1 |
| RTE-4 | Show the result before it's accepted: the ordered stop list, the route on a map, total drive time and distance, per-stop ETAs, time saved, and any windows that can't be met. The operator admin sees it in the console and the driver in the day view (DRV-3). | P0 |
| RTE-5 | The operator admin can reorder stops by hand in the console, and the driver can in the app before starting the route. Once the route has started, the driver can skip or defer the current stop (DRV-17). All affected customers' positions and ETAs update. | P0 |
| RTE-6 | **Re-optimize** when a stop is added, cancelled, or running late. The next stop the driver is heading to and any stop whose customer got an "on the way" message stay in place, so customers aren't told one thing and then shown another. | P1 |
| RTE-7 | **MVP:** Arrively sequences stops itself, using drive times from one Mapbox Matrix request. Matrix takes 25 coordinates on the `driving` profile (checked 2026-10), so one optimization covers up to 24 stops left plus the driver's position. The app says so clearly when a route has more. (Mapbox's Optimization API v1 was ruled out: it caps at 12 coordinates and ignores arrival windows; v2 handles windows but is a sign-up beta.) **P1:** split larger routes across several Matrix requests, or a self-hosted optimizer (VROOM or OR-Tools) on Matrix travel times, to reach at least 100 stops in under 10 s for 50. | P0 / P1 |
| RTE-8 | Planned routes for a future day, so customers can be told their window ahead of time. | P1 |
| RTE-9 | Driver breaks and shift end time as route constraints. | P2 |
| RTE-10 | Distribute a pool of stops across several drivers (vehicle routing), with optional capacity limits. | P2 |

### 4.3 Driver location ingestion

| ID | Requirement | Pri |
|---|---|---|
| LOC-1 | Accept location pings from the Arrively driver app (P0). In v2, also from the driver SDK and through the public API, for customers with their own driver apps or telematics (P1). | P0 / P1 |
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
| NTF-2 | Default texts (three per stop): **stop scheduled** (arrival window and tracking link), **"You're next"** (sent when the driver leaves the previous stop, STP-10, and includes the tracking link), and **driver has arrived**. Everything else (stops ahead, minutes away, delays) updates live on the tracking page. Operators can turn on extra texts: route started, "N stops before you", "X minutes away", arriving now, significant delay, driver changed, cancelled or rescheduled. | P0 |
| NTF-3 | Operators can turn each trigger on or off, set thresholds, and choose channels per trigger. | P0 |
| NTF-4 | Message templates with variables (`{{driver_first_name}}`, `{{vehicle}}`, `{{eta_minutes}}`, `{{arrival_window}}`, `{{stops_ahead}}`, `{{tracking_url}}`, `{{company_name}}`), with English and Spanish versions. | P0 |
| NTF-5 | Each notification fires at most once per stop, guarded against ETA oscillation and route reordering. Notifications that are no longer relevant are suppressed (for example, skip "2 stops before you" if the customer is already next). | P0 |
| NTF-6 | Waiting reminders after arrival ("Your driver has been waiting 3 minutes"), with the operator's no-show policy. | P1 |
| NTF-7 | Delivery status tracking (queued, sent, delivered, failed), with retry and channel fallback (for example push fails, so send SMS). | P0 |
| NTF-8 | Handle opt-out and opt-in (STOP/HELP/START keywords for SMS) and honor them as the law requires. | P0 |
| NTF-9 | Quiet hours and rate limits so a customer never gets spammed, even on long routes with many reorderings. | P1 |
| NTF-10 | Standalone messages come from Arrively's numbers and email domain and always name the business ("Acme Plumbing via Arrively"). In v2, API customers can use their own sender numbers and email domain (API-11). | P0 / P2 |
| NTF-11 | A customer who replies to a text gets an automatic answer pointing them to the chat on their tracking page, and the reply is shown to the driver and the operator. | P1 |

### 4.6 In-app chat and calling

Customers and drivers reach each other inside Arrively, not through phone numbers. This keeps both sides' numbers private and avoids per-text and per-minute phone costs. Masked phone numbers were dropped from v1.

| ID | Requirement | Pri |
|---|---|---|
| MSG-1 | **Chat** between the customer (on the tracking page) and the driver (in the app) for each active stop, delivered in real time. The operator admin can read the thread in the console. | P0 |
| MSG-2 | Chat is open only while the stop is active (route started through completed, plus 30 min). After that the thread is read-only and the page shows the business's phone number. | P0 |
| MSG-3 | The driver gets a push notification for each new customer message. The customer sees new messages while the page is open; if a driver message is unread for 2 minutes, one text with the link is sent (it counts toward the operator's text usage). | P0 |
| CALL-1 | **In-app voice calls** over the internet (WebRTC, LiveKit). The customer taps Call on the tracking page and the driver's phone rings through the iOS call screen (CallKit), even in the background. | P0 |
| CALL-2 | The driver can call the customer from the stop screen. It rings on the tracking page if it's open; otherwise the customer gets one text: "Bill tried to call you. Tap to call back." | P0 |
| CALL-3 | Log call metadata (time, duration, who called) per stop. No recordings. | P0 |
| CALL-4 | The tracking page always offers "Call Acme Plumbing", which dials the business's main number with the phone app. | P0 |

### 4.7 Customer tracking experience (web, no install)

| ID | Requirement | Pri |
|---|---|---|
| CUS-1 | A mobile-first web page opened from the tracking link. Loads in under 2 s on 4G with no login or app install. | P0 |
| CUS-2 | A prominent ETA ("Arriving in 12 min · 2:34 PM") or arrival window, plus a plain-language status for each stop state. | P0 |
| CUS-3 | **Stops ahead**: "3 stops before you", "1 stop before you", or "You're next". The total number of stops on the route is never shown. The count changes only when the driver leaves a stop and starts driving to the next one (STP-10), not when the driver arrives at it or marks it done. | P0 |
| CUS-4 | Live map showing the driver (smoothly animated marker, rotated to heading) and the customer's own pin, with an optional route line. Bounds fit both points automatically. | P0 |
| CUS-5 | **The driver is visible, other stops are not.** From the moment the route starts, the map shows the driver's live location and the number of stops ahead. It never shows other stops: no pins, no addresses, and no route line through them. Once this stop is `en_route`, a route line from the driver to the customer's pin can appear. While the driver is at another stop, the marker simply appears stopped. Nothing on the page says the driver is at a stop. | P0 |
| CUS-6 | Driver card with first name, photo, vehicle or uniform description, and plate when relevant, so the customer recognizes the right person. | P0 |
| CUS-7 | Live updates over WebSocket or SSE, with a polling fallback. The page recovers automatically after network loss. | P0 |
| CUS-8 | Clear views for stale location, reassignment, delay, cancellation, and the "completed" state. | P0 |
| CUS-9 | Standalone tracking pages are Arrively-branded and served from Arrively's domain. They show the business's name, optional logo, and support phone inside Arrively's design. No custom colors or domains. | P0 |
| CUS-10 | Contact actions: chat with the driver and call the driver in the app (MSG-1, CALL-1), plus a button to call the business. No phone numbers are exchanged. | P0 |
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
| OPS-1 | Self-serve signup, organization setup, and an onboarding wizard (business profile, first driver, test route) that gets an operator live in under 30 min. | P0 |
| OPS-2 | Create stops by hand and assign them to a driver. The driver runs optimization in the app (DRV-4), and the operator admin can also optimize and reorder in the console. Tracking links go out automatically. | P0 |
| OPS-3 | Import stops from CSV and assign them to a driver in one step. Recurring stops (for example weekly service). | P0 import · P1 recurring |
| OPS-4 | Live map of all active drivers and routes for the operator, showing each driver's progress ("5 of 12 done, 20 min behind"), with filters. | P0 |
| OPS-5 | Manage drivers and vehicles: invite drivers by SMS or email, upload photos, enter vehicle details, deactivate. | P0 |
| OPS-6 | Configure notifications: toggle triggers, set thresholds, edit templates, and preview them. | P0 |
| OPS-7 | Roles and permissions: Admin and Driver. Additional office roles are out of scope for now. | P0 |
| OPS-8 | Route and stop history with search, including the notification log for each stop. | P0 |
| OPS-9 | Reports: on-time arrival rate, average driver wait at the door, no-show rate, ETA accuracy, drive time saved by optimization, notification delivery rate. | P1 |
| OPS-10 | Billing and subscription management (plans, usage, invoices, SMS overage). | P0 |
| OPS-11 | Lightweight integrations: Zapier/Make, Google Calendar or iCal import, and an email-to-stop parser. | P2 |
| OPS-12 | Industry presets that set default wording ("driver", "technician", "courier"), notification templates, and arrival radius. Both launch verticals ship with full presets: **Delivery and field services** and **Rideshare-type pickups**. Onboarding asks which one fits the business and applies it. | P0 |

### 5.2 Driver app

| ID | Requirement | Pri |
|---|---|---|
| DRV-1 | iOS and Android app with reliable **background location**, built in **React Native** for the MVP while the product is validated. A web app alone is not enough because iOS limits background location. Keep location, routing, and stop logic in shared modules with clean interfaces so the move to native (DRV-13) is a rewrite of the UI, not the business logic. | P0 |
| DRV-2 | Sign in with a phone number and OTP. Go on duty and off duty. | P0 |
| DRV-3 | **Day view**: swipe sideways between days. Each day shows every stop on a map (numbered in route order) and in a list (customer, address, window, status), with total stops, total drive time and the expected finish time. Past days show what was completed or skipped; future days show planned routes. | P0 |
| DRV-4 | **The driver runs route optimization** before starting the route (RTE-2) and sees the result in the day view (RTE-4). | P0 |
| DRV-5 | Stop actions: Start route, Start trip, Arrived, Completed, No-show, Skip or defer, each with a timestamp and the driver's location. Customer notifications follow departure (STP-10). | P0 |
| DRV-6 | One tap to open navigation to the **current** stop in Google Maps, Apple Maps, or Waze. | P0 |
| DRV-7 | Location sharing only while on duty, with a clear indicator. | P0 |
| DRV-8 | Push alerts to the driver when the operator adds, changes, or cancels stops, or a customer cancels. | P0 |
| DRV-9 | Battery-aware tracking. Typical battery use on a 1-hour shift under 8%. | P1 |
| DRV-10 | A lightweight "web driver link" fallback for occasional drivers, with documented limitations (foreground only). | P1 |
| DRV-13 | **Fully native driver apps** (Swift for iOS, Kotlin for Android) replace the cross-platform app once the product is validated, for better battery use, location reliability, and platform features. The native driver SDKs (SDK-4) share this code. | P2 |
| DRV-12 | Owner-operators can run their whole business from the driver app (add stops, edit customers, manage the route), with no console needed. | P1 |
| DRV-11 | Chat with and call the customer in the app from the stop screen (MSG-1, CALL-2). | P0 |

#### 5.2.1 Marking every stop

The goal is that every stop is marked consistently and reliably. The driver can see the whole day, but works through it one trip at a time: the next trip can't start until the current stop is marked.

| ID | Requirement | Pri |
|---|---|---|
| DRV-14 | **Full visibility.** The driver can see every stop on their routes (customer first name, address, window, notes) in the day view and open any stop's details. | P0 |
| DRV-15 | **One trip at a time.** The driver works on one current stop. Start trip for the next stop is available only after the current stop is marked Completed, No-show, or Skipped or deferred. | P0 |
| DRV-16 | **Enforced on the server.** The platform refuses to start a trip while the driver's current stop is unmarked, whatever the app shows. In v2, the driver SDK and public API follow the same rule. | P0 |
| DRV-23 | **Address correction.** The driver can correct a stop's address or move its pin (for example to a side entrance) from the stop's details. The change is saved with who made it and when, the operator admin is notified, and the customer's ETA and tracking page update. | P0 |
| DRV-24 | **Add a stop from the day view.** A search bar above the map autocompletes addresses (Mapbox Search). Picking one adds the stop to the day being viewed and prompts to re-optimize. Customer name, phone and texting consent can be added after; the customer gets no texts until a phone number and consent are recorded (CMP-2). The operator admin is notified and can turn off driver-added stops in settings. | P0 |
| DRV-17 | **Skip and defer need a reason.** The driver can skip the current stop (it's removed from today's route) or defer it (it moves to the end), choosing from a short reason list (for example "Customer not home", "Access blocked", "Out of time"). The operator admin is notified. | P0 |
| DRV-18 | **Location check when marking.** Completed and No-show must be marked inside the stop's geofence (STP-4). Marking from outside needs a reason and is flagged to the operator admin. | P0 |
| DRV-19 | **Unmarked-stop reminder.** If the driver arrives at a stop and then leaves its geofence without marking it, the app sends a notification and keeps prompting until the stop is marked. | P0 |
| DRV-20 | **Undo window.** A mark can be undone within 60 s, in case of a wrong tap. After that, only the operator admin can correct it in the console, which keeps an audit record. | P1 |
| DRV-21 | **Offline marking.** The app can record a mark without a connection and sync it later, so the next trip can start offline. | P1 |
| DRV-22 | Owner-operators can reorder their own route at any time, even after it has started. | P1 |

### 5.3 Booking (post-MVP)

Not in the MVP. In the meantime, operators create stops manually, by CSV import, or through integrations.

| ID | Requirement | Pri |
|---|---|---|
| BKG-1 | An Arrively-hosted public booking page for each business: the customer enters an address, preferred window, and contact details, and accepts SMS consent. Creates a `scheduled` stop for the operator to assign. | P1 |
| BKG-2 | The operator approves or declines requests, and the customer is notified either way. | P1 |
| BKG-3 | Embeddable booking widget for the operator's website. | P2 |
| BKG-4 | Basic availability rules: business hours, service area, lead time. | P2 |

---

## 6. Functional requirements: API and SDK product (v2)

For companies with existing apps. **Not part of v1.** The core of this section ships in Phase 2 (P1), and the extras in Phase 3 (P2). v1 still builds on an internal API that follows API-1, API-4, API-6, and API-8's design, so it can be opened up later without a rewrite.

### 6.0 Building v1 on the future API

| ID | Requirement | Pri |
|---|---|---|
| ARC-1 | **One API, no shortcuts.** The driver app, operator console, and customer tracking page use only API endpoints and real-time channels. None of them reads the database directly or uses private back doors. | P0 |
| ARC-2 | **Every app action is an API operation.** Anything a driver or operator can do in v1 (create a stop, optimize, mark a stop, skip with a reason, record consent) is a documented API operation, even before the documentation is public. | P0 |
| ARC-3 | **Rules live on the server.** Stop states, departure detection, the one-trip-at-a-time rule, notification triggers, and privacy rules are enforced by the platform, not by the apps. API customers in v2 then get the same behavior automatically. | P0 |
| ARC-4 | **Free to change during v1.** Until the public launch, the API can change without a deprecation policy, because Arrively's own apps are its only clients. Every change is recorded so the v2 docs and changelog start accurate. | P0 |
| ARC-5 | **Measure the behavior being validated**: notification timing vs. actual arrival, ETA accuracy, how often drivers skip, defer, or mark from outside the stop, unmarked-stop reminders, tracking-link opens, and customer use of chat and in-app calls. | P0 |
| ARC-6 | **Release gate for v2.** The API and SDKs are released only when: (a) the stop state machine and notification rules have gone 8+ weeks without a breaking change, (b) the v1 success metrics (section 10) are being met, and (c) at least one pilot API customer has built on it in test mode. The exact thresholds can be set later. | P0 |

### 6.1 Public API

| ID | Requirement | Pri |
|---|---|---|
| API-1 | Versioned REST API (`/v1`) with an OpenAPI 3 spec covering Stops, Routes, Drivers, Vehicles, Locations, Notifications, Templates, Tracking Links, and Webhooks. | P1 |
| API-2 | Route optimization endpoint (`POST /v1/routes/{id}/optimize`), usable on its own or with tracking. Integrators can also supply their own stop order. | P1 |
| API-3 | Location ingestion endpoint that accepts single and batch pings. Optional high-throughput stream (WebSocket or gRPC) for large fleets. | P1 / P2 |
| API-4 | Authentication: secret API keys (server-side), publishable keys (client-side, restricted scope), and short-lived signed tokens for customer and driver SDK sessions. OAuth 2.0 for platform partners (P2). | P1 |
| API-5 | Test and live modes with separate keys and data, plus a **simulator** that drives a fake driver along a route and completes stops. | P1 |
| API-6 | Idempotency keys on all POST requests, consistent error format, cursor pagination. | P1 |
| API-7 | Per-key rate limits with standard headers. Documented quotas. | P1 |
| API-8 | Webhooks for stop state changes, `route.started`, `route.reordered`, `route.completed`, `eta.changed`, `stop.position_changed`, `notification.sent/delivered/failed`, and `location.stale`, signed with HMAC and retried with backoff. Includes a delivery log and replay. | P1 |
| API-9 | Read-only endpoint (`GET /v1/stops/{id}/status`) returning ETA, state, and stop position, for integrators who render their own UI. | P1 |
| API-10 | "Notifications-only" mode. The integrator sends its own locations, order, and ETAs, and Arrively handles notification logic and delivery. | P2 |
| API-11 | "Bring your own" options: the integrator's own SMS provider credentials, their own push credentials (APNs/FCM), and their own map provider key. | P2 |

### 6.2 Embeddable UI and SDKs

| ID | Requirement | Pri |
|---|---|---|
| SDK-1 | **Hosted tracking page** (the same as CUS-*) that API customers can theme with their own logo, colors, and domain, so no front-end work is required. Custom branding is available only to API customers. | P1 logo/colors · P2 domain |
| SDK-2 | **Web component / JS SDK** (`<arrively-tracker stop-token="...">`) that embeds the map, ETA, and stop position in any web page. React wrapper included. Themeable. | P1 |
| SDK-3 | **iOS (Swift) and Android (Kotlin) customer SDKs**: a drop-in tracking view and a headless data stream, so customers can add tracking to native apps. | P2 |
| SDK-4 | **Native driver SDKs (Swift/Kotlin)** that handle background location, stop display (including the one-trip-at-a-time rule, DRV-15–DRV-16), and stop actions for customers' existing driver apps. | P2 |
| SDK-5 | React Native and Flutter wrappers. | P2 |
| SDK-6 | Server SDKs: Node.js and Python (P1); Ruby, Go, Java, PHP, .NET (P2). | P1+ |
| SDK-7 | Developer portal: docs, quickstarts, API reference, interactive console, API key management, webhook tester, usage dashboard, changelog. | P1 |
| SDK-8 | Semantic versioning, a deprecation policy (at least 12 months' notice for breaking API changes), and status page. | P1 |

---

## 7. Cross-cutting requirements

### 7.1 Multi-tenancy and branding

- MT-1 (P0): One shared, multi-tenant platform for all businesses. No per-customer deployments. Strict tenant isolation in data storage, API keys, and logs. Every query is tenant-scoped.
- MT-2 (P0): Standalone businesses get an Arrively-branded experience with their business name, optional logo, and support contact. Full custom branding (colors, sender name, terms and privacy links) is for API customers only, from v2.
- MT-3 (P2): Custom domains with automatic TLS for API customers' hosted tracking pages.
- MT-4 (P2): Multi-location businesses: one parent account with several locations sharing billing.

### 7.2 Privacy and safety

- PRV-1 (P0): Tracking links use unguessable tokens (≥128 bits of entropy). They expire automatically after the stop is completed plus a short grace period (default 30 min).
- PRV-2 (P0): A customer sees the driver's live location only from route start until their own stop is completed. Never before the route starts and never after (see CUS-5). While the driver is at another stop, customers see only a stationary marker. Nothing labels it as a stop, and the stops-ahead count doesn't change until the driver leaves (CUS-3, CUS-5).
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
- PERF-4 (P0): Internal API (public API from v2) p95 latency ≤ 200 ms for reads, ≤ 300 ms for writes, excluding external routing and optimization calls.
- PERF-5: Route optimization returns in under 5 s for MVP routes of up to 24 stops (P0). With the self-hosted optimizer, under 10 s for 50 stops and under 30 s for 100 stops (P1).
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
- UI-1 (P0): All three v1 surfaces (driver app, operator console, customer tracking page) follow the shared design direction in [DESIGN.md](DESIGN.md).
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
| Maps, geocoding, routing, traffic ETA | **Mapbox (decided)**: Maps SDKs and GL JS for the map, Search/Geocoding, Directions with traffic, and Matrix for travel times between stops. |
| Route optimization | **Arrively's own solver on Mapbox Matrix drive times.** It respects arrival windows and time on site, and keeps the stop the driver is heading to first. Exact for up to 8 stops; local search above that (within 1% of optimal in tests). MVP cap: 24 stops left per optimization (RTE-7). In P1, larger routes use several Matrix requests or a self-hosted solver (VROOM or Google OR-Tools). ETAs use Mapbox Directions with traffic. |
| In-app chat and voice | **Supabase Realtime** for chat; **LiveKit** (WebRTC, cloud or self-hosted) for voice, with CallKit and VoIP push on iOS. |
| SMS | **TextMagic (decided)**: notification texts, inbound replies and STOP handling via its API and webhooks, and the one-time sign-in codes for drivers (through Supabase's custom SMS hook). US 10DLC registration through TextMagic. A second provider for failover is P1. |
| Email | SendGrid, Postmark, Amazon SES |
| Push | APNs, FCM, Web Push (VAPID) |
| Billing | Stripe Billing (subscriptions and metered usage) |

Requirement DEP-1 (P0): Wrap every provider behind an internal adapter so it can be switched, and track per-tenant usage for cost attribution.

---

## 9. Packaging and pricing assumptions (to validate)

- **Standalone**: tiers per active driver per month, with included SMS and overage billing. Free trial.
- **API (v2)**: usage-based pricing per tracked stop, per optimization run, and per notification. Free developer tier in test mode.
- Both products share metering. Requirement BIL-1 (P0): accurate per-tenant metering of stops, optimizations, location pings, routing calls, text messages, and voice call minutes.

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
| API time-to-first-webhook (after v2 launch) | median < 1 hour |

---

## 11. Phasing

**MVP (P0)**
- Core stop, route, location, ETA, and notification engine
- Single-driver route optimization (driver runs it; operator admin can reorder in the console), with skip and defer
- SMS notifications, including stops ahead ("2 stops before you", "You're next")
- Arrively-branded customer tracking page with live driver location, stops ahead, and privacy rules
- Operator console (manual and CSV stops, assigning to drivers, live map, drivers, notification settings, billing)
- Cross-platform driver app with a swipeable day view (map and list), adding stops by address search, route optimization, address correction, one trip at a time, location check when marking, and background location
- In-app chat and voice calls between customer and driver
- Industry presets for both delivery/field services and rideshare-type pickups
- Mapbox for maps, routing and traffic-aware ETAs, with Arrively's own window-aware stop ordering
- The future public API, used only by Arrively's own apps for now (ARC-1 to ARC-5)

**Phase 2 (P1)**
- Routing:
  - Routes over 24 stops per optimization (100+ stops)
  - Automatic re-optimization when stops change
  - Pinned stops
  - Planned routes for future days
  - Recurring stops
- Driver app:
  - 60-second undo for a wrong tap
  - Offline marking
  - Owner-operators can create their own stops and reorder a started route
  - Web driver link for occasional drivers
  - Battery-aware tracking
- Customer experience:
  - Access instructions from the customer
  - Driver-waiting reminders
  - Web push opt-in
  - High-contrast and text-only views
- Channels: email, web push, and native push
- **Public API and SDKs (v2 launch):**
  - REST API, including stand-alone route optimization
  - Webhooks and a status endpoint
  - Test mode and simulator
  - Hosted tracking page that API customers can brand with their logo and colors
  - Embeddable web widget, with a React version
  - Node and Python libraries
  - Developer portal
  - Versioning policy and status page
- ETA quality: GPS cleanup, offline location buffering, learned time on site, fallback ETA, ETA accuracy tracking
- Reports for the operator
- Public booking page with approve or decline (BKG-1, BKG-2)
- Platform:
  - SMS provider failover
  - Quiet hours and rate limits
  - Abuse controls
  - Driver start-point obfuscation
  - SSO
  - SOC 2
  - Multi-AZ deployment
  - Internal support tool
  - Scale targets

**Phase 3 (P2)**
- API extras:
  - Native customer and driver SDKs
  - Chat and calls through the API
  - Notifications-only mode
  - Bring-your-own provider credentials
  - Custom domains
  - Location streaming for large fleets
- Multi-driver stop distribution and capacity limits
- Driver breaks and shift constraints
- Booking widget and availability rules
- WhatsApp and voice
- Two-way replies to notification texts
- Fully native driver apps (Swift/Kotlin)
- Telematics integrations
- Multi-location business accounts
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
| Driver app | React Native for the MVP while validating the product. Fully native (Swift/Kotlin) later. |
| Backend and hosting | Supabase (Postgres, auth, realtime, edge functions). Customer page and console on Vercel. |
| Default customer texts | Three per stop: scheduled (with link), You're next (with link), Arrived. |
| Map and routing provider | Mapbox for maps, drive times (Matrix) and traffic ETAs (Directions). Arrively orders the stops itself so arrival windows are respected, which the Optimization API v1 can't do. One optimization covers up to 24 stops left; bigger routes come in P1. |
| Driver at another stop | The marker just appears stopped, with no label. The stops-ahead count drops only when the driver leaves that stop and heads to the next. |
| Customer–driver contact | In-app chat and in-app voice calls (LiveKit). No masked phone numbers. The tracking page also offers a button to call the business. |
| Which vertical to set up first | Both. Each ships with its own preset, and onboarding asks which fits. |
| Product order | v1 is the standalone app only. It runs on the same API that becomes public in v2, and is used to validate UX and behavior before the API and SDKs launch. API extras follow in Phase 3. |
| Standalone branding | One Arrively-branded, multi-tenant product. Not white-label, no per-business instances. Custom branding is for API customers only, from v2. |
| Who optimizes routes | The driver runs optimization and can reorder before starting. The operator admin adds, assigns, and can reorder stops. No dispatcher role for now. |
| Arrival windows and time on site | Not part of v1: the stop form and CSV import don't ask for them, and customers are told the day, not a window. ETAs assume 20 minutes on site per stop. The data model and the route solver still support windows if they come back. |
| Driver navigation | Deep-link to Google Maps, Apple Maps, or Waze for the current stop. The driver sees the whole day (swipeable day view with map and list) and can correct addresses. The earlier one-address-at-a-time rule was dropped; reliable marking now comes from one trip at a time (DRV-15). |

## 13. Open questions

None at the moment.
