// Route planning and ETAs shared by the route-plan and route-etas functions.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { admin } from "./admin.ts";
import { legs, matrix, MATRIX_MAX } from "./mapbox.ts";
import { distanceM, evaluate, solve, SPEED, straightLineMatrix, type Point, type RouteOptions, type SolverStop, type TravelMode } from "./solver.ts";

export interface StopRow {
  id: string; position: number | null; status: string; lat: number; lng: number;
  service_minutes: number; window_start: string | null; window_end: string | null;
  arrived_at: string | null; marked_at: string | null;
}
export interface RouteRow {
  id: string; org_id: string; driver_id: string | null; day: string; status: string; etas_at: string | null;
  round_trip: boolean; avoid_highways: boolean; avoid_tolls: boolean; travel_mode: TravelMode;
}

const MODES: TravelMode[] = ["drive", "walk", "bike"];

/** The route's stored options. */
export const optionsOf = (r: RouteRow): RouteOptions => ({
  roundTrip: !!r.round_trip, avoidHighways: !!r.avoid_highways, avoidTolls: !!r.avoid_tolls,
  mode: MODES.includes(r.travel_mode) ? r.travel_mode : "drive",
});

/** Options the caller sent (Optimize route, before they're saved), if well formed. */
export function asOptions(v: unknown): RouteOptions | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    roundTrip: o.roundTrip === true, avoidHighways: o.avoidHighways === true, avoidTolls: o.avoidTolls === true,
    mode: MODES.includes(o.mode as TravelMode) ? o.mode as TravelMode : "drive",
  };
}

/** The most stops one optimization can sequence (one Matrix call, plus the start). */
export const MAX_STOPS = MATRIX_MAX - 1;
const FRESH_LOCATION_MS = 10 * 60 * 1000;
const UPCOMING = ["scheduled", "queued", "en_route", "arrived"];

/** A client acting as the caller, so row-level security decides what they can reach. */
export function asCaller(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

/** Loads a route the caller can see (their own, or any in their business if admin). */
export async function loadRoute(caller: SupabaseClient, routeId: string) {
  const { data: route } = await caller.from("routes").select("id, org_id, driver_id, day, status, etas_at, round_trip, avoid_highways, avoid_tolls, travel_mode").eq("id", routeId).maybeSingle();
  if (!route) return null;
  const [{ data: stops }, { data: loc }, { data: org }] = await Promise.all([
    admin.from("stops").select("id, position, status, lat, lng, service_minutes, window_start, window_end, arrived_at, marked_at")
      .eq("route_id", routeId).order("position"),
    route.driver_id
      ? admin.from("driver_locations").select("lat, lng, recorded_at").eq("driver_id", route.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("orgs").select("timezone").eq("id", route.org_id).single(),
  ]);
  return { route: route as RouteRow, stops: (stops ?? []) as StopRow[], loc: loc as (Point & { recorded_at: string }) | null, tz: org?.timezone ?? "America/New_York" };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadRoute>>>;

/** 08:00 on `day` in the business's time zone, as epoch seconds. */
function morning(day: string, tz: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 8, 0);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return (guess - (shown - guess)) / 1000;
}

const sec = (iso: string | null) => (iso ? Date.parse(iso) / 1000 : null);

/**
 * What's left to drive. The stop the driver is at sets the start; the stop
 * they're heading to stays first (RTE-6); the rest follow in route order.
 * With no known start, `start` is null and the first stop costs no driving.
 */
export type StartKind = "location" | "current_stop" | "last_stop" | "anywhere";

/** A lat/lng the caller sent, if it's a real coordinate. */
export function asPoint(v: unknown): Point | null {
  const p = v as Point | null;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    ? { lat: p.lat, lng: p.lng } : null;
}

/**
 * `from` is where the driver is right now, sent by the driver app; when given,
 * planning starts there on any day. Otherwise the last reported location is used
 * if it's fresh and the route is today's.
 */
export function remaining({ route, stops, loc, tz }: Loaded, nowS: number, from: Point | null = null) {
  const left = stops.filter((s) => UPCOMING.includes(s.status));
  const at = left.find((s) => s.status === "arrived");
  const heading = left.find((s) => s.status === "en_route");
  const rest = left.filter((s) => s !== at && s !== heading);
  const seq = heading ? [heading, ...rest] : rest;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(nowS * 1000));
  let start: Point | null = null;
  let startKind: StartKind = "anywhere";
  let t0 = route.day > today ? morning(route.day, tz) : nowS;
  if (at) {
    start = at; startKind = "current_stop";
    t0 = Math.max(nowS, (sec(at.arrived_at) ?? nowS) + at.service_minutes * 60);
  } else if (from) {
    start = from; startKind = "location";
  } else if (loc && route.day === today && nowS * 1000 - Date.parse(loc.recorded_at) < FRESH_LOCATION_MS) {
    start = loc; startKind = "location";
  } else if (route.status === "active") {
    const last = stops.filter((s) => s.marked_at).sort((a, b) => (b.marked_at! > a.marked_at! ? 1 : -1))[0];
    start = last ?? null; startKind = last ? "last_stop" : "anywhere";
  }
  const solverStops: SolverStop[] = seq.map((s) => ({
    id: s.id, serviceS: s.service_minutes * 60, windowStart: sec(s.window_start), windowEnd: sec(s.window_end), fixed: s === heading,
  }));
  return { seq, start, startKind, t0, solverStops };
}

/** Matrix for [start, ...stops]; a missing start is a free starting point (zero row and column). */
async function travelMatrix(start: Point | null, seq: Point[], o: RouteOptions) {
  const pts = start ? [start, ...seq] : seq;
  let approximate = false, avoided = false;
  let durations: number[][], distances: number[][];
  try {
    ({ durations, distances, avoided } = pts.length > 1 ? await matrix(pts, o) : { durations: [[0]], distances: [[0]], avoided: false });
  } catch (e) {
    console.error("matrix failed, using straight-line estimates", e);
    approximate = true;
    durations = straightLineMatrix(pts, SPEED[o.mode ?? "drive"]);
    distances = pts.map((a) => pts.map((b) => distanceM(a, b) * 1.3));
  }
  if (!start) {
    const pad = (m: number[][]) => [new Array(m.length + 1).fill(0), ...m.map((row) => [0, ...row])];
    durations = pad(durations); distances = pad(distances);
  }
  return { durations, distances, approximate, avoided };
}

const distanceOf = (distances: number[][], order: number[], back = false) => {
  let d = 0, prev = 0;
  for (const i of order) { d += distances[prev][i + 1]; prev = i + 1; }
  if (back && order.length) d += distances[prev][0];
  return Math.round(d);
};
const iso = (t: number) => new Date(t * 1000).toISOString();

/**
 * The best order for what's left, next to the current order (RTE-4). `options`
 * are the ones being tried in Optimize route; otherwise the route's own.
 */
export async function plan(loaded: Loaded, nowS = Date.now() / 1000, from: Point | null = null, options: RouteOptions | null = null) {
  const o = options ?? optionsOf(loaded.route);
  const back = !!o.roundTrip;
  const { seq, start, startKind, t0, solverStops } = remaining(loaded, nowS, from);
  if (seq.length > MAX_STOPS) {
    return { error: `Optimizing works on up to ${MAX_STOPS} stops at a time. This route has ${seq.length} left.` };
  }
  const { durations, distances, approximate, avoided } = await travelMatrix(start, seq, o);
  const current = evaluate(solverStops, durations, t0, solverStops.map((_, i) => i), back);
  const best = solve(solverStops, durations, t0, back);
  const idx = new Map(solverStops.map((s, i) => [s.id, i]));
  return {
    order: best.order,
    etas: Object.fromEntries(Object.entries(best.etas).map(([k, v]) => [k, iso(v)])),
    late: best.late,
    drive_s: Math.round(best.driveS),
    distance_m: distanceOf(distances, best.order.map((id) => idx.get(id)!), back),
    finish: iso(best.finish),
    current: {
      order: current.order, drive_s: Math.round(current.driveS), late: current.late, finish: iso(current.finish),
      distance_m: distanceOf(distances, solverStops.map((_, i) => i), back),
    },
    approximate,
    start: startKind,
    // Lets the app re-solve around the stops the driver locks, without asking again.
    problem: { stops: solverStops, durations: durations.map((r) => r.map(Math.round)), t0: Math.round(t0), roundTrip: back },
    options: o,
    // Whether the order itself was planned around highways / tolls (Matrix may not take them).
    avoided,
  };
}

/** Traffic-aware ETAs for every stop left, in route order (ETA-1), written to the stops. */
export async function refreshEtas(loaded: Loaded, nowS = Date.now() / 1000, from: Point | null = null) {
  const { seq, start, t0, solverStops } = remaining(loaded, nowS, from);
  const o = optionsOf(loaded.route);
  if (!seq.length) return { updated: 0 };
  const pts: Point[] = start ? [start, ...seq] : seq;
  let into: number[]; // drive time into each stop
  let approximate = false;
  try {
    into = pts.length > 1 ? (await legs(pts, o)).durations : [];
  } catch (e) {
    console.error("directions failed, using straight-line estimates", e);
    approximate = true;
    into = pts.slice(1).map((p, i) => straightLineMatrix([pts[i], p], SPEED[o.mode ?? "drive"])[0][1]);
  }
  if (!start) into = [0, ...into];
  // A chain matrix: row k holds the leg from the k-th point to the next.
  const n = seq.length;
  const chain = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  into.forEach((d, k) => { chain[k][k + 1] = d; });
  const s = evaluate(solverStops, chain, t0, solverStops.map((_, i) => i));
  const etas = Object.fromEntries(Object.entries(s.etas).map(([k, v]) => [k, iso(v)]));
  const { data, error } = await admin.rpc("set_etas", {
    p_route: loaded.route.id, p_etas: etas, p_approx: approximate, p_drive_s: Math.round(s.driveS),
  });
  if (error) throw new Error(error.message);
  return { updated: data as number, approximate, drive_s: Math.round(s.driveS), finish: iso(s.finish) };
}
