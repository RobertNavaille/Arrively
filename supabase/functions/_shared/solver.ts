// Route sequencing for one driver (RTE-2). No imports, so the driver app and
// the web console can use the same file for their offline demos.
//
// Times are in seconds. Index 0 of the matrix is the start (the driver, or the
// stop they're at); index i + 1 is stops[i].

export interface SolverStop {
  id: string;
  serviceS: number;
  windowStart?: number | null; // epoch seconds
  windowEnd?: number | null;
  fixed?: boolean; // stays in front, in the given order (the stop the driver is heading to)
}

export interface Schedule {
  order: string[];
  driveS: number;
  waitS: number;
  lateS: number;
  finish: number; // epoch seconds when the last stop's work ends
  etas: Record<string, number>; // when work at each stop can begin
  late: string[]; // stops reached after their window ends
}

// Being late is far worse than driving further; waiting for a window to open
// costs a little so the order doesn't idle when it doesn't have to.
const LATE_WEIGHT = 20;
const WAIT_WEIGHT = 0.5;

export function evaluate(stops: SolverStop[], matrix: number[][], start: number, order: number[]): Schedule {
  let t = start, prev = 0, driveS = 0, waitS = 0, lateS = 0;
  const etas: Record<string, number> = {};
  const late: string[] = [];
  for (const i of order) {
    const s = stops[i];
    const leg = matrix[prev][i + 1];
    driveS += leg;
    t += leg;
    if (s.windowStart != null && t < s.windowStart) { waitS += s.windowStart - t; t = s.windowStart; }
    etas[s.id] = t;
    if (s.windowEnd != null && t > s.windowEnd) { lateS += t - s.windowEnd; late.push(s.id); }
    t += s.serviceS;
    prev = i + 1;
  }
  return { order: order.map((i) => stops[i].id), driveS, waitS, lateS, finish: t, etas, late };
}

const cost = (s: Schedule) => s.driveS + WAIT_WEIGHT * s.waitS + LATE_WEIGHT * s.lateS;

type Score = (tail: number[]) => number;

/** Fast cost of the fixed stops followed by `tail`; no allocation, for the search loops. */
function scorer(stops: SolverStop[], matrix: number[][], start: number, fixed: number[]): Score {
  let t0 = start, p0 = 0, c0 = 0;
  for (const i of fixed) {
    const s = stops[i];
    const leg = matrix[p0][i + 1];
    c0 += leg; t0 += leg;
    if (s.windowStart != null && t0 < s.windowStart) { c0 += WAIT_WEIGHT * (s.windowStart - t0); t0 = s.windowStart; }
    if (s.windowEnd != null && t0 > s.windowEnd) c0 += LATE_WEIGHT * (t0 - s.windowEnd);
    t0 += s.serviceS; p0 = i + 1;
  }
  return (tail) => {
    let t = t0, prev = p0, c = c0;
    for (let k = 0; k < tail.length; k++) {
      const i = tail[k], s = stops[i];
      const leg = matrix[prev][i + 1];
      c += leg; t += leg;
      if (s.windowStart != null && t < s.windowStart) { c += WAIT_WEIGHT * (s.windowStart - t); t = s.windowStart; }
      if (s.windowEnd != null && t > s.windowEnd) c += LATE_WEIGHT * (t - s.windowEnd);
      t += s.serviceS; prev = i + 1;
    }
    return c;
  };
}

/** Best order for the stops. Fixed stops stay first; the rest are sequenced. */
export function solve(stops: SolverStop[], matrix: number[][], start: number): Schedule {
  const fixed = stops.map((_, i) => i).filter((i) => stops[i].fixed);
  const free = stops.map((_, i) => i).filter((i) => !stops[i].fixed);
  const score = scorer(stops, matrix, start, fixed);
  const from = fixed.length ? fixed[fixed.length - 1] + 1 : 0;
  const tail = free.length <= 1 ? free : free.length <= 8 ? exact(free, score) : search(free, stops, matrix, from, score);
  return evaluate(stops, matrix, start, [...fixed, ...tail]);
}

function exact(free: number[], score: Score): number[] {
  // Heap's algorithm over every order; 8! = 40,320 evaluations at most.
  const a = [...free];
  let best = [...a], bestC = score(a);
  const c = new Array(a.length).fill(0);
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      const v = score(a);
      if (v < bestC) { bestC = v; best = [...a]; }
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return best;
}

// Several starting orders, each improved by local search. Shuffled restarts
// help most when windows make the search rugged.
const RESTARTS = 12;

function search(free: number[], stops: SolverStop[], matrix: number[][], from: number, score: Score): number[] {
  const seeds = [free, nearest(free, matrix, from), byWindow(free, stops, matrix, from)];
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let k = 0; k < RESTARTS; k++) {
    const a = [...free];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    seeds.push(a);
  }
  let best: number[] = free, bestC = Infinity;
  for (const s0 of seeds) {
    const [order, c] = improve(s0, score);
    if (c < bestC) { bestC = c; best = order; }
  }
  return best;
}

function nearest(free: number[], matrix: number[][], from: number): number[] {
  const left = new Set(free);
  const out: number[] = [];
  let at = from;
  while (left.size) {
    let pick = -1;
    for (const i of left) if (pick < 0 || matrix[at][i + 1] < matrix[at][pick + 1]) pick = i;
    out.push(pick);
    left.delete(pick);
    at = pick + 1;
  }
  return out;
}

function byWindow(free: number[], stops: SolverStop[], matrix: number[][], from: number): number[] {
  const end = (i: number) => stops[i].windowEnd ?? Infinity;
  const timed = free.filter((i) => end(i) !== Infinity).sort((a, b) => end(a) - end(b));
  const open = nearest(free.filter((i) => end(i) === Infinity), matrix, timed.length ? timed[timed.length - 1] + 1 : from);
  return [...timed, ...open];
}

/** Or-opt (move a run of 1–3 stops) and 2-opt (reverse a run) until nothing improves. */
function improve(seed: number[], score: Score): [number[], number] {
  let order = [...seed];
  let best = score(order);
  const n = order.length;
  const cand = new Array<number>(n);
  let better = true;
  while (better) {
    better = false;
    for (let len = 1; len <= 3 && !better; len++) {
      for (let i = 0; i + len <= n && !better; i++) {
        for (let j = 0; j <= n - len && !better; j++) {
          if (j === i) continue;
          // Remove order[i..i+len) and reinsert it so it starts at index j.
          let w = 0;
          for (let k = 0; k < n; k++) {
            if (w === j) for (let q = 0; q < len; q++) cand[w++] = order[i + q];
            if (k >= i && k < i + len) continue;
            cand[w++] = order[k];
          }
          if (w === j) for (let q = 0; q < len; q++) cand[w++] = order[i + q];
          const v = score(cand);
          if (v < best - 1e-6) { order = [...cand]; best = v; better = true; }
        }
      }
    }
    for (let i = 0; i < n - 1 && !better; i++) {
      for (let j = i + 1; j < n && !better; j++) {
        for (let k = 0; k < n; k++) cand[k] = k < i || k > j ? order[k] : order[i + j - k];
        const v = score(cand);
        if (v < best - 1e-6) { order = [...cand]; best = v; better = true; }
      }
    }
  }
  return [order, best];
}

/** Exposed for tests: local search alone, without the exact path for small routes. */
export function _localSearch(stops: SolverStop[], matrix: number[][], start: number): Schedule {
  const all = stops.map((_, i) => i);
  return evaluate(stops, matrix, start, search(all, stops, matrix, 0, scorer(stops, matrix, start, [])));
}
export const _cost = cost;

// ---------------------------------------------------------------------------
// Straight-line estimates: the offline demos, and the fallback when Mapbox is
// unavailable (ETA-8). Roads are ~1.3x longer than a straight line; 25 mph.
// ---------------------------------------------------------------------------
export interface Point { lat: number; lng: number }

export function distanceM(a: Point, b: Point): number {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function straightLineMatrix(points: Point[]): number[][] {
  return points.map((a) => points.map((b) => (distanceM(a, b) * 1.3) / 11.176));
}


// ---------------------------------------------------------------------------
// Whole-route planning on straight-line times, for the offline demos (driver
// app and console). Mirrors remaining()/plan() in routing.ts, in the device's
// time zone.
// ---------------------------------------------------------------------------
export interface PlanStop {
  id: string; position: number | null; status: string; lat: number; lng: number; service_minutes: number;
  window_start: string | null; window_end: string | null; arrived_at: string | null;
}
export interface PlanSummary { order: string[]; drive_s: number; distance_m: number; late: string[]; finish: string }
export interface RoutePlan extends PlanSummary {
  etas: Record<string, string>; current: PlanSummary; approximate: boolean;
  /** Where the plan starts: the driver's location, the stop they're at, their last stop, or the best first stop. */
  start?: "location" | "current_stop" | "last_stop" | "anywhere";
}

const UPCOMING = ["scheduled", "queued", "en_route", "arrived"];
const isoOf = (t: number) => new Date(t * 1000).toISOString();
const secOf = (s: string | null) => (s ? Date.parse(s) / 1000 : null);

function localProblem(stops: PlanStop[], day: string, from: Point | null, now: number) {
  const left = stops.filter((s) => UPCOMING.includes(s.status)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const at = left.find((s) => s.status === "arrived");
  const heading = left.find((s) => s.status === "en_route");
  const rest = left.filter((s) => s !== at && s !== heading);
  const seq = heading ? [heading, ...rest] : rest;
  const morning = new Date(`${day}T08:00:00`);
  const future = morning.toDateString() !== new Date(now * 1000).toDateString() && morning.getTime() / 1000 > now;
  // Start where the driver is, on any day; without a location, at the best first stop.
  let start: Point | null = from;
  let t0 = future ? morning.getTime() / 1000 : now;
  if (at) { start = at; t0 = Math.max(now, (secOf(at.arrived_at) ?? now) + at.service_minutes * 60); }
  const solverStops: SolverStop[] = seq.map((s) => ({
    id: s.id, serviceS: s.service_minutes * 60, windowStart: secOf(s.window_start), windowEnd: secOf(s.window_end), fixed: s === heading,
  }));
  const pts = start ? [start, ...seq] : seq;
  let m = straightLineMatrix(pts);
  if (!start) m = [new Array(m.length + 1).fill(0), ...m.map((r) => [0, ...r])];
  const dist = m.map((r) => r.map((v) => v * 11.176)); // back to meters at 25 mph
  return { solverStops, m, dist, t0, startKind: (at ? 'current_stop' : from ? 'location' : 'anywhere') as RoutePlan['start'] };
}

function distanceAlong(dist: number[][], order: number[]) {
  let d = 0, prev = 0;
  for (const i of order) { d += dist[prev][i + 1]; prev = i + 1; }
  return Math.round(d);
}

export function straightLinePlan(stops: PlanStop[], day: string, from: Point | null, now = Date.now() / 1000): RoutePlan {
  const { solverStops, m, dist, t0, startKind } = localProblem(stops, day, from, now);
  const all = solverStops.map((_, i) => i);
  const cur = evaluate(solverStops, m, t0, all);
  const best = solve(solverStops, m, t0);
  const idx = new Map(solverStops.map((s, i) => [s.id, i]));
  return {
    order: best.order, late: best.late, drive_s: Math.round(best.driveS), finish: isoOf(best.finish),
    distance_m: distanceAlong(dist, best.order.map((id) => idx.get(id)!)),
    etas: Object.fromEntries(Object.entries(best.etas).map(([k, v]) => [k, isoOf(v)])),
    current: { order: cur.order, late: cur.late, drive_s: Math.round(cur.driveS), finish: isoOf(cur.finish), distance_m: distanceAlong(dist, all) },
    approximate: true,
    start: startKind,
  };
}

/** ETAs for the stops left, in route order. */
export function straightLineEtas(stops: PlanStop[], day: string, from: Point | null, now = Date.now() / 1000) {
  const { solverStops, m, t0 } = localProblem(stops, day, from, now);
  const s = evaluate(solverStops, m, t0, solverStops.map((_, i) => i));
  return { etas: Object.fromEntries(Object.entries(s.etas).map(([k, v]) => [k, isoOf(v)])), drive_s: Math.round(s.driveS) };
}
