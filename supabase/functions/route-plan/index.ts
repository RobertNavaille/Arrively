// Optimizes a route's stop order (RTE-2, RTE-4).
//
//   POST { route_id, from? }                 → the proposed order next to the current one
//   POST { route_id, apply: [ids], from? }   → saves that order, then refreshes ETAs
//
// `from` ({ lat, lng }) is where the driver is now; planning starts there.
//
// Called by the route's driver or a business admin; their own sign-in decides
// access. Secret MAPBOX_TOKEN.

import { admin, cors, json, withCors } from "../_shared/admin.ts";
import { asCaller, asPoint, loadRoute, plan, refreshEtas } from "../_shared/routing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return withCors(json({ error: "POST only" }, 405));
  const { route_id, apply, from: rawFrom } = await req.json().catch(() => ({}));
  const from = asPoint(rawFrom);
  if (typeof route_id !== "string") return withCors(json({ error: "route_id is required" }, 400));

  const caller = asCaller(req);
  const loaded = await loadRoute(caller, route_id);
  if (!loaded) return withCors(json({ error: "Route not found" }, 404));

  try {
    if (Array.isArray(apply)) {
      // reorder_route checks the caller may change this route and only moves upcoming stops.
      const { error } = await caller.rpc("reorder_route", { p_route: route_id, p_stop_ids: apply });
      if (error) return withCors(json({ error: error.message }, 403));
      await admin.from("routes").update({ optimized_at: new Date().toISOString() }).eq("id", route_id);
      const fresh = await loadRoute(caller, route_id);
      return withCors(json({ ok: true, etas: await refreshEtas(fresh!, undefined, from) }));
    }
    const result = await plan(loaded, undefined, from);
    return withCors(json(result, "error" in result ? 422 : 200));
  } catch (e) {
    console.error(e);
    return withCors(json({ error: e instanceof Error ? e.message : String(e) }, 502));
  }
});

