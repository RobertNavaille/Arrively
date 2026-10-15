// Route optimization and ETAs. Online, the route-plan and route-etas edge
// functions do the work; the offline demo runs the same solver on the phone
// with straight-line drive times.
import { evaluate, solve, straightLineMatrix, type SolverStop } from '../../../../supabase/functions/_shared/solver';
import type { LatLng, Route, Stop } from './types';

export interface PlanSummary { order: string[]; drive_s: number; distance_m: number; late: string[]; finish: string }
export interface RoutePlan extends PlanSummary {
  etas: Record<string, string>;
  current: PlanSummary;
  approximate: boolean;
}

const UPCOMING = ['scheduled', 'queued', 'en_route', 'arrived'];
const iso = (t: number) => new Date(t * 1000).toISOString();
const sec = (s: string | null) => (s ? Date.parse(s) / 1000 : null);

/** Mirrors remaining() in supabase/functions/_shared/routing.ts, in the phone's time zone. */
function remaining(route: Route, from: LatLng | null, now = Date.now() / 1000) {
  const left = route.stops.filter((s) => UPCOMING.includes(s.status)).sort((a, b) => a.position - b.position);
  const at = left.find((s) => s.status === 'arrived');
  const heading = left.find((s) => s.status === 'en_route');
  const rest = left.filter((s) => s !== at && s !== heading);
  const seq: Stop[] = heading ? [heading, ...rest] : rest;
  const day = new Date(`${route.day}T08:00:00`);
  const isFuture = day.getTime() / 1000 > now && new Date(now * 1000).toDateString() !== day.toDateString();
  let start: LatLng | null = isFuture ? null : from;
  let t0 = isFuture ? day.getTime() / 1000 : now;
  if (at) { start = at; t0 = Math.max(now, (sec(at.arrived_at) ?? now) + at.service_minutes * 60); }
  const stops: SolverStop[] = seq.map((s) => ({
    id: s.id, serviceS: s.service_minutes * 60, windowStart: sec(s.window_start), windowEnd: sec(s.window_end), fixed: s === heading,
  }));
  const pts = start ? [start, ...seq] : seq;
  let m = straightLineMatrix(pts);
  if (!start) m = [new Array(m.length + 1).fill(0), ...m.map((r) => [0, ...r])];
  const dist = m.map((r) => r.map((v) => v * 11.176)); // back to meters at 25 mph
  return { stops, m, dist, t0 };
}

const distanceOf = (dist: number[][], order: number[]) => {
  let d = 0, prev = 0;
  for (const i of order) { d += dist[prev][i + 1]; prev = i + 1; }
  return Math.round(d);
};

export function localPlan(route: Route, from: LatLng | null): RoutePlan {
  const { stops, m, dist, t0 } = remaining(route, from);
  const cur = evaluate(stops, m, t0, stops.map((_, i) => i));
  const best = solve(stops, m, t0);
  const idx = new Map(stops.map((s, i) => [s.id, i]));
  return {
    order: best.order, late: best.late, drive_s: Math.round(best.driveS), finish: iso(best.finish),
    distance_m: distanceOf(dist, best.order.map((id) => idx.get(id)!)),
    etas: Object.fromEntries(Object.entries(best.etas).map(([k, v]) => [k, iso(v)])),
    current: {
      order: cur.order, late: cur.late, drive_s: Math.round(cur.driveS), finish: iso(cur.finish),
      distance_m: distanceOf(dist, stops.map((_, i) => i)),
    },
    approximate: true,
  };
}

/** ETAs for the stops left, in route order. */
export function localEtas(route: Route, from: LatLng | null): { etas: Record<string, string>; drive_s: number } {
  const { stops, m, t0 } = remaining(route, from);
  const s = evaluate(stops, m, t0, stops.map((_, i) => i));
  return { etas: Object.fromEntries(Object.entries(s.etas).map(([k, v]) => [k, iso(v)])), drive_s: Math.round(s.driveS) };
}
