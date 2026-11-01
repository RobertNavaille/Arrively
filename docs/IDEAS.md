# Arrively: ideas and change requests

A running list of ideas and requested changes. **This file is the hand-off.** Another chat picks up items from here, builds them, and marks them shipped.

**Status key:** 💡 Idea · 🔍 Exploring · ✅ Ready to build · 🚧 In progress · ✔️ Shipped · ❌ Dropped

Several items have a **reference commit** on branch `claude/vibrant-goldberg-dpzfzh`. That's a working draft of the change, later reverted on that branch so the branch leaves the app unchanged. To use one, look at it with `git show <hash>` or cherry-pick it onto your branch. The commits were type-checked but not tested on a device.

## Requests

| # | Request | Screen | Status | Added | Reference commit |
|---|---------|--------|--------|-------|------------------|
| 1 | Remove the "Mark this stop to start your next trip." caption | Driver · Arrived | ✔️ | 2026-10-31 | `5732716` |
| 2 | More space above the "Arrived" heading | Driver · Arrived | ✔️ | 2026-10-31 | `5734c51` |
| 3 | "Complete stop" button: no checkmark, label "Stop Complete" | Driver · Arrived | ✔️ | 2026-10-31 | `074bf58` |
| 4 | Restyle My Day to match the trip view (type sizes, no divider lines) | Driver · My Day | ✔️ | 2026-10-31 | `c8a3206` + `02dd0ca` |
| 5 | Show the driver's comments from completing a stop on its details screen | Driver · Stop details | ✔️ | 2026-10-31 | `341db9b` |
| 6 | Call and text back to the large buttons | Driver · On route | ✔️ | 2026-10-31 | `d0ea5c7` |
| 7 | Arrived: job details only at full height, replacing the Arrived UI | Driver · Arrived | ✔️ | 2026-10-31 | — |
| 8 | Native Swift (SwiftUI) iPhone driver app, replacing the React Native / Expo one | Driver · all | 🔍 | 2026-11-01 | — |

## Details

### #1: Remove the caption under the Arrived buttons
`apps/driver/app/trip.tsx`, in the `phase === 'arrived'` block: delete the caption `Mark this stop to start your next trip.` under the Complete stop and Continue route buttons.

### #2: More space above the "Arrived" heading
`apps/driver/app/trip.tsx`, `arrivedInfo`: the "Arrived" heading sits 10px below the "At stop since…" pill (`marginTop: 6` plus the column's gap of 4). Raise its `marginTop` to `space[3]` (12px), for 16px in total.

### #3: "Stop Complete" button
`apps/driver/app/trip.tsx`, the Arrived screen's primary button: drop `icon="check"` and change the label from "Complete stop" to "Stop Complete". It still opens the "How did it go?" form.

### #4: My Day styled like the trip view
The screen labeled "My day" in the v1 mockups, `apps/driver/app/index.tsx`. Make it match the trip sheet: larger type and no divider lines.
- **Header:** the weekday in `type.title` at 22/30 (like the trip's stop heading). The date underneath at 15/22 in `inkMuted`.
- **Stop count** ("6 stops"): 22/30 semibold. The side note ("Order is set when you start the trip") in `type.body`, gray. More space above it (24px) and below it (16px).
- **Stop rows:** no markers and no left accent bar, just the name and the street.
  - Name: 18/26 semibold, gray once the stop is done.
  - Street (with notes after it): 15/22 gray. Show `address.split(',')[0]` like the trip list does, not the full address.
  - Rows are separated by spacing only, 20px below each row.
- **Divider lines removed:** under the week strip, between stops, above the footer (Start trip), around the search field, and between search results. The search dropdown keeps its outline.
- **Open question (still open):** with no markers, nothing shows the next stop while a trip is running (screen readers still say "next"). One option is to show its name in blue, as the trip view does for reordered stops. Shipped without an indicator, pending a decision.

### #5: Driver's comments on the stop details screen
The comments typed in the "How did it go?" form are already saved, as the stop's `mark_reason` (`backend.markStop`, then the `mark_stop` RPC). The details screen (`apps/driver/app/stop/[id].tsx`) shows them only as "Reason", and hides them when the stop was marked away from its location.

The change, for any marked stop:
- Show `mark_reason` under the title "Comments" (icon `lines`), including stops marked away from the stop.
- Hide the stand-ins the app saves when the driver typed nothing: "Skipped" and "Marked away from the stop".
- Note: deferring a stop uses the same field for its reason, but a deferred stop is not done, so its reason won't show here.

### #6: On route: large call and text buttons
`apps/driver/app/trip.tsx`, `phase === 'onroute'`, in the row beside the minutes and miles: remove `size="compact"` from the call and text `IconButton`s so they go back to the default 56px. Before 2133e36 they were the default size.

The copies in the phone-number row, which show once the sheet is pulled up, stay compact (40px). If those change too, update the comment on `IconButton`'s `size` prop in `apps/driver/src/ui/components.tsx`.

### #7: Arrived: job details only when the sheet is fully open
`apps/driver/app/trip.tsx`, `phase === 'arrived'`. Today `arrivedInfo` shows everything at once: the "At stop since…" pill, "Arrived", the name and street, the XL call and text buttons, then the full job details (`jobDetails()`), then Stop Complete and Continue route.

**The change:**
- **Resting sheet:** the Arrived UI without the job details: the pill, "Arrived", name and street, call and text, Stop Complete, and Continue route.
- **Sheet pulled up to full height** (`sheetOpen`): the Arrived UI disappears and only the job details show: person, phone, address, time window, and notes.
- **Existing pattern to follow:** the On route screen already does this. Its details render only when `sheetOpen` (the `phase === 'onroute' && current && sheetOpen` block), with call and text moving into the phone row via `jobDetails(contact)`.

**Decided (built):** at full height, Stop Complete (filling the row) and Continue route are pinned in a bar at the bottom, and call and text sit in the phone row (compact). The sheet now rests with the shorter card just in view.

**Open questions (answered):**
- At full height, should Stop Complete stay reachable? For example, it could be pinned at the bottom the way On route pins Arrived and Cancel when the sheet is open. Or should the driver pull the sheet back down to act?
- Should call and text move into the phone row at full height, as on On route?
- The resting height may need re-tuning once the details are gone, since the card is much shorter.

### #8: Native Swift driver app
The owner wants to move the iPhone driver app to native Swift "sooner rather than later". For now the React Native / Expo app ships to TestFlight via EAS (`apps/driver/eas.json`).

**What carries over:** everything on the server. The app talks to Supabase RPCs (`mark_stop`, `start_trip`, `add_stop`, `update_stop_details`, `set_share_trip`, …) and edge functions (`route-plan`, `route-etas`); a Swift app calls the same ones with supabase-swift. The design tokens (`apps/driver/src/ui/theme.ts`, the design system artifact) and the mockups define the screens.

**What gets rebuilt:** every screen (My Day, the trip sheet with Optimize route, on the way, arrived and the complete-stop form, stop details, add / edit stop), maps (MapKit or the Mapbox Maps SDK), background location (Core Location), and calling / texting / directions hand-off.

**Open questions:**
- Keep the web driver app (and an Android app) alongside, or iPhone-only?
- Apple Maps (MapKit) or Mapbox for the maps; turn-by-turn later via the Mapbox Navigation SDK?
- Rebuild everything at once, or screen by screen?

**Keep the move cheap meanwhile:** put new business rules on the server (RPCs / edge functions), not in the React Native app, so the Swift app inherits them.

