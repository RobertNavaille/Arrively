// Recomputes traffic-aware ETAs for the stops left on a route (ETA-1, ETA-2).
//
//   POST { route_id?, force? }
//
// The driver app calls this after each location report (at most once a
// minute) and right after a stop changes; the console after it edits a route.
// Without route_id it uses the caller's active route. Calls within 45 s of the
// last refresh are skipped unless force is set, to keep routing costs down.
// Secret MAPBOX_TOKEN.

import { cors, json, withCors } from "../_shared/admin.ts";
import { asCaller, loadRoute, refreshEtas } from "../_shared/routing.ts";

const MIN_INTERVAL_MS = 45_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return withCors(json({ error: "POST only" }, 405));
  const body = await req.json().catch(() => ({}));
  const caller = asCaller(req);

  let routeId: string | undefined = body.route_id;
  if (!routeId) {
    const { data: user } = await caller.auth.getUser();
    if (!user.user) return withCors(json({ error: "Sign in first" }, 401));
    const { data } = await caller.from("routes").select("id").eq("driver_id", user.user.id).eq("status", "active")
      .order("day", { ascending: false }).limit(1).maybeSingle();
    if (!data) return withCors(json({ skipped: "no active route" }));
    routeId = data.id;
  }

  const loaded = await loadRoute(caller, routeId!);
  if (!loaded) return withCors(json({ error: "Route not found" }, 404));
  const last = loaded.route.etas_at ? Date.parse(loaded.route.etas_at) : 0;
  if (!body.force && Date.now() - last < MIN_INTERVAL_MS) return withCors(json({ skipped: "too soon" }));

  try {
    return withCors(json(await refreshEtas(loaded)));
  } catch (e) {
    console.error(e);
    return withCors(json({ error: e instanceof Error ? e.message : String(e) }, 502));
  }
});

