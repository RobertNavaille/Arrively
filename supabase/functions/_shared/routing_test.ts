// Run: npx deno@2.1.4 test --allow-env _shared/
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");
const { plan, remaining } = await import("./routing.ts");
import type { RouteRow, StopRow } from "./routing.ts";

function check(ok: boolean, msg: string) { if (!ok) throw new Error(msg); }
const NOW = Date.parse("2026-10-15T15:00:00Z") / 1000; // 11:00 am in New York
const route: RouteRow = { id: "r", org_id: "o", driver_id: "d", day: "2026-10-15", status: "active", etas_at: null };
const stop = (id: string, k: number, status = "queued", extra: Partial<StopRow> = {}): StopRow => ({
  id, position: k, status, lat: 41.82, lng: -71.41 + k * 0.01, service_minutes: 15,
  window_start: null, window_end: null, arrived_at: null, marked_at: null, ...extra,
});
const fresh = { lat: 41.82, lng: -71.42, recorded_at: new Date(NOW * 1000 - 60_000).toISOString() };

Deno.test("heading-to stop stays first; finished stops are left out", () => {
  const stops = [stop("done", 1, "completed", { marked_at: "2026-10-15T14:00:00Z" }), stop("b", 2), stop("next", 3, "en_route"), stop("c", 4)];
  const r = remaining({ route, stops, loc: fresh, tz: "America/New_York" }, NOW);
  check(r.seq.map((s) => s.id).join() === "next,b,c", `got ${r.seq.map((s) => s.id)}`);
  check(r.solverStops[0].fixed === true && !r.solverStops[1].fixed, "only the en-route stop is fixed");
  check(r.start === fresh && r.t0 === NOW, "a fresh location is the start");
});

Deno.test("at a stop: start there once the work is done", () => {
  const stops = [stop("here", 1, "arrived", { arrived_at: new Date(NOW * 1000 - 5 * 60_000).toISOString() }), stop("b", 2)];
  const r = remaining({ route, stops, loc: fresh, tz: "America/New_York" }, NOW);
  check(r.start === stops[0] && r.t0 === NOW + 10 * 60, "leaves 10 min from now (15 min job, 5 done)");
  check(r.seq.length === 1 && r.seq[0].id === "b", "the current stop isn't re-planned");
});

Deno.test("a future day plans from 8:00 local time with a free start", () => {
  const future = { ...route, day: "2026-10-20", status: "planned" };
  const r = remaining({ route: future, stops: [stop("a", 1, "scheduled")], loc: fresh, tz: "America/New_York" }, NOW);
  check(r.start === null, "no start location for a future day");
  check(new Date(r.t0 * 1000).toISOString() === "2026-10-20T12:00:00.000Z", `8 am EDT, got ${new Date(r.t0 * 1000).toISOString()}`);
});

Deno.test("plan calls the Matrix API and returns a better order", async () => {
  Deno.env.set("MAPBOX_TOKEN", "pk.test");
  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    urls.push(u);
    // Drive time = 60 s per 0.01 deg of longitude between points.
    const lngs = u.split("/driving/")[1].split("?")[0].split(";").map((c) => +c.split(",")[0]);
    const m = lngs.map((a) => lngs.map((b) => Math.round(Math.abs(a - b) * 6000)));
    return new Response(JSON.stringify({ code: "Ok", durations: m, distances: m.map((r) => r.map((v) => v * 10)) }));
  }) as typeof fetch;
  try {
    const stops = [stop("far", 1), stop("near", 2), stop("mid", 3)].map((s, i) => ({ ...s, lng: -71.41 + [5, 1, 3][i] * 0.01 }));
    const p = await plan({ route, stops, loc: fresh, tz: "America/New_York" }, NOW);
    if ("error" in p) throw new Error(p.error);
    check(urls.length === 1 && urls[0].includes("/directions-matrix/v1/mapbox/driving/-71.420000,41.820000;"), urls[0]);
    check(p.order.join() === "near,mid,far", `got ${p.order}`);
    check(p.drive_s < p.current.drive_s && !p.approximate, "should save time using real drive times");
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test("Mapbox down: straight-line estimates, marked approximate", async () => {
  Deno.env.delete("MAPBOX_TOKEN");
  const p = await plan({ route, stops: [stop("a", 1), stop("b", 2)], loc: fresh, tz: "America/New_York" }, NOW);
  if ("error" in p) throw new Error(p.error);
  check(p.approximate === true && Object.keys(p.etas).length === 2, "fallback should still give ETAs");
});

Deno.test("too many stops is refused with a clear message", async () => {
  const stops = Array.from({ length: 25 }, (_, i) => stop(`s${i}`, i + 1));
  const p = await plan({ route, stops, loc: fresh, tz: "America/New_York" }, NOW);
  check("error" in p && /up to 24 stops/.test(p.error ?? ""), "should explain the limit");
});

Deno.test("a location sent by the driver is the start, even for a future day", () => {
  const future = { ...route, day: "2026-10-20", status: "planned" };
  const here = { lat: 28.08, lng: -80.6 };
  const r = remaining({ route: future, stops: [stop("a", 1, "scheduled")], loc: null, tz: "America/New_York" }, NOW, here);
  check(r.start === here && r.startKind === "location", "starts where the driver is");
  const none = remaining({ route: future, stops: [stop("a", 1, "scheduled")], loc: null, tz: "America/New_York" }, NOW);
  check(none.start === null && none.startKind === "anywhere", "without a location, the best first stop");
});
