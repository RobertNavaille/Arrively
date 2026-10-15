// Mapbox routing calls used by route-plan and route-etas.
// Secret MAPBOX_TOKEN: a Mapbox token with no URL restriction (server use).
//
// Limits (checked 2026-10): Matrix takes 25 coordinates on the driving profile
// (10 with traffic); Directions takes 25 waypoints per request.

import type { Point } from "./solver.ts";

const BASE = "https://api.mapbox.com";
export const MATRIX_MAX = 25;
const DIRECTIONS_MAX = 25;

function token() {
  const t = Deno.env.get("MAPBOX_TOKEN");
  if (!t) throw new Error("MAPBOX_TOKEN is not set");
  return t;
}

const coords = (pts: Point[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");

/** Drive times and distances between every pair of points (seconds, meters). */
export async function matrix(pts: Point[]): Promise<{ durations: number[][]; distances: number[][] }> {
  if (pts.length > MATRIX_MAX) throw new Error(`Matrix takes at most ${MATRIX_MAX} points`);
  const url = `${BASE}/directions-matrix/v1/mapbox/driving/${coords(pts)}?annotations=duration,distance&access_token=${token()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Matrix ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.code !== "Ok") throw new Error(`Mapbox Matrix: ${j.code} ${j.message ?? ""}`);
  // Unreachable pairs come back null; treat them as very far rather than free.
  const fix = (m: (number | null)[][]) => m.map((row) => row.map((v) => (v == null ? 1e6 : v)));
  return { durations: fix(j.durations), distances: fix(j.distances) };
}

/** Traffic-aware drive time and distance for each leg of pts[0] → pts[1] → … */
export async function legs(pts: Point[]): Promise<{ durations: number[]; distances: number[] }> {
  const durations: number[] = [], distances: number[] = [];
  // Requests share an endpoint so the legs join up.
  for (let i = 0; i < pts.length - 1; i += DIRECTIONS_MAX - 1) {
    const chunk = pts.slice(i, i + DIRECTIONS_MAX);
    const url = `${BASE}/directions/v5/mapbox/driving-traffic/${coords(chunk)}?overview=false&access_token=${token()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
    const j = await res.json();
    if (j.code !== "Ok" || !j.routes?.length) throw new Error(`Mapbox Directions: ${j.code} ${j.message ?? ""}`);
    for (const l of j.routes[0].legs) { durations.push(l.duration); distances.push(l.distance); }
  }
  return { durations, distances };
}
