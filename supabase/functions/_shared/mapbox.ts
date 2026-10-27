// Mapbox routing calls used by route-plan and route-etas.
// Secret MAPBOX_TOKEN: a Mapbox token with no URL restriction (server use).
//
// Limits (checked 2026-10): Matrix takes 25 coordinates on the driving profile
// (10 with traffic); Directions takes 25 waypoints per request.

import type { Point, RouteOptions } from "./solver.ts";

const BASE = "https://api.mapbox.com";
export const MATRIX_MAX = 25;
const DIRECTIONS_MAX = 25;

function token() {
  const t = Deno.env.get("MAPBOX_TOKEN");
  if (!t) throw new Error("MAPBOX_TOKEN is not set");
  return t;
}

// The driver's travel mode as a Mapbox profile. Directions uses traffic when driving.
const MATRIX_PROFILE = { drive: "driving", walk: "walking", bike: "cycling" } as const;
const DIRECTIONS_PROFILE = { drive: "driving-traffic", walk: "walking", bike: "cycling" } as const;

/** Mapbox's `exclude` for the driver's avoid options; only the driving profiles take motorway and toll. */
export function exclusions(o: RouteOptions): string | null {
  if ((o.mode ?? "drive") !== "drive") return null;
  const ex = [o.avoidHighways && "motorway", o.avoidTolls && "toll"].filter(Boolean);
  return ex.length ? ex.join(",") : null;
}

const coords = (pts: Point[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");

/**
 * Travel times and distances between every pair of points (seconds, meters).
 * Avoid options are asked for, but if Matrix turns them down the times come
 * back without them (`avoided` false): the order is then planned on ordinary
 * roads and only the route itself (Directions) avoids them.
 */
export async function matrix(pts: Point[], o: RouteOptions = {}): Promise<{ durations: number[][]; distances: number[][]; avoided: boolean }> {
  if (pts.length > MATRIX_MAX) throw new Error(`Matrix takes at most ${MATRIX_MAX} points`);
  const base = `${BASE}/directions-matrix/v1/mapbox/${MATRIX_PROFILE[o.mode ?? "drive"]}/${coords(pts)}?annotations=duration,distance&access_token=${token()}`;
  const ex = exclusions(o);
  let res = await fetch(ex ? `${base}&exclude=${ex}` : base);
  let avoided = !!ex;
  if (ex && res.status === 422) {
    console.warn("Matrix declined exclude; planning without it", await res.text());
    res = await fetch(base);
    avoided = false;
  }
  if (!res.ok) throw new Error(`Mapbox Matrix ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.code !== "Ok") throw new Error(`Mapbox Matrix: ${j.code} ${j.message ?? ""}`);
  // Unreachable pairs come back null; treat them as very far rather than free.
  const fix = (m: (number | null)[][]) => m.map((row) => row.map((v) => (v == null ? 1e6 : v)));
  return { durations: fix(j.durations), distances: fix(j.distances), avoided };
}

/** Travel time (traffic-aware when driving) and distance for each leg of pts[0] → pts[1] → … */
export async function legs(pts: Point[], o: RouteOptions = {}): Promise<{ durations: number[]; distances: number[] }> {
  const ex = exclusions(o);
  const durations: number[] = [], distances: number[] = [];
  // Requests share an endpoint so the legs join up.
  for (let i = 0; i < pts.length - 1; i += DIRECTIONS_MAX - 1) {
    const chunk = pts.slice(i, i + DIRECTIONS_MAX);
    const url = `${BASE}/directions/v5/mapbox/${DIRECTIONS_PROFILE[o.mode ?? "drive"]}/${coords(chunk)}?overview=false${ex ? `&exclude=${ex}` : ""}&access_token=${token()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
    const j = await res.json();
    if (j.code !== "Ok" || !j.routes?.length) throw new Error(`Mapbox Directions: ${j.code} ${j.message ?? ""}`);
    for (const l of j.routes[0].legs) { durations.push(l.duration); distances.push(l.distance); }
  }
  return { durations, distances };
}
