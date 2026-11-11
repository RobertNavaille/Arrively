import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Place } from './mapbox';
import { SPEED } from './routing';
import { dayKey, distanceM } from './geo';
import { isDone, type LatLng, type Route, type Stop } from './types';

/**
 * Optimize the week: regroup the week's stops into days by area, so each day's
 * stops sit near each other and fit inside the driver's hours. Runs on the
 * phone with straight-line estimates (no map requests); each day's exact road
 * route is still worked out when its trip starts.
 */

export interface WeekOptions {
  /** Work hours, in minutes after midnight (8:00 AM is 480). */
  start: number;
  end: number;
  /** Which days of the week are work days, Sunday first. */
  days: boolean[];
  /** Where each day starts; null is wherever the driver is. */
  startPlace: Place | null;
  /** Most stops in a day; 0 is no limit. */
  maxStops: number;
  avoidHighways: boolean;
  avoidTolls: boolean;
}

export const DEFAULT_WEEK_OPTIONS: WeekOptions = {
  start: 8 * 60, end: 17 * 60, days: [false, true, true, true, true, true, false],
  startPlace: null, maxStops: 0, avoidHighways: false, avoidTolls: false,
};

const KEY = 'arrively.weekOptions';

/** The driver's options from last time (kept on the phone). */
export async function loadWeekOptions(): Promise<WeekOptions> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_WEEK_OPTIONS, ...saved };
  } catch { /* defaults */ }
  return DEFAULT_WEEK_OPTIONS;
}
export async function saveWeekOptions(o: WeekOptions) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(o)); } catch { /* used for now anyway */ }
}

/** "8:00 AM" */
export function fmtClock(min: number) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** "7 h 10 min", "45 min" */
export function fmtHours(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

export interface PlanDay {
  day: string;
  /** In visiting order. */
  stops: Stop[];
  /** Driving plus time on site, minutes. */
  minutes: number;
  /** Doesn't fit inside the hours even after regrouping. */
  over: boolean;
}
export interface WeekPlan {
  days: PlanDay[];
  /** Stop id → the day it moves from. */
  movedFrom: Record<string, string>;
  /** Driving before and after, minutes and meters (estimates). */
  before: { minutes: number; meters: number };
  after: { minutes: number; meters: number };
}

const ROAD = 1.3; // straight line to road distance
const SERVICE_DEFAULT = 20;

/** The days the options cover: the week (Sunday to Saturday) of `today`, or the next. */
export function weekDays(today: Date, week: 0 | 1): string[] {
  const sun = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + week * 7, 12);
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i, 12)));
}

/**
 * A stop that may move: not started or done, and not on a completed day. Today
 * and later, only from days whose trip hasn't started; earlier this week, the
 * jobs left undone (even on a day whose trip was started) move to a day ahead.
 */
function movable(s: Stop, r: Route, todayKey: string) {
  if (r.status === 'completed' || (s.status !== 'scheduled' && s.status !== 'queued')) return false;
  return r.day < todayKey || r.status !== 'active';
}
const dowOf = (k: string) => new Date(`${k}T12:00:00`).getDay();

export function planWeek({ routes, today, from, options, pins }: {
  /** The driver's routes for the week (any day missing has no stops). */
  routes: Route[];
  today: Date;
  /** Where each day starts: the driver, else the week's stops' middle. */
  from: LatLng | null;
  options: WeekOptions;
  /** Stops the driver pinned in the review: stop id → the day it stays on. */
  pins: Map<string, string>;
}): WeekPlan {
  const todayKey = dayKey(today);
  // This week, or next week once this week has no work days left.
  const thisWeek = weekDays(today, 0);
  const left = thisWeek.some((k) => options.days[dowOf(k)] && k >= todayKey);
  const planKeys = weekDays(today, left ? 0 : 1);
  // Plus the days already past this week, whose undone jobs move ahead (never earlier weeks).
  const keys = [...thisWeek.filter((k) => k < todayKey && !planKeys.includes(k)), ...planKeys];
  // Even days, driving; no lunch break.
  const spread = 'even' as 'even' | 'fewer';
  const routeOn = new Map(routes.filter((r) => keys.includes(r.day)).map((r) => [r.day, r]));
  const speed = SPEED.drive;
  // Each day ends back where it started.
  const roundTrip = true;
  const capacity = Math.max(60, options.end - options.start);
  const cap = options.maxStops > 0 ? options.maxStops : Infinity;

  const allStops = [...routeOn.values()].flatMap((r) => r.stops.filter((s) => s.status !== 'cancelled'));
  const origin: LatLng = from ?? centroid(allStops) ?? { lat: 0, lng: 0 };
  const travelMin = (a: LatLng, b: LatLng) => (distanceM(a, b) * ROAD) / speed / 60;
  const service = (s: Stop) => (s.service_minutes || SERVICE_DEFAULT);
  // A day's cost: driving from the start through its stops (and back), plus time on site.
  const costOf = (stops: Stop[]) => {
    if (!stops.length) return { minutes: 0, meters: 0 };
    let m = 0, at: LatLng = origin, meters = 0;
    for (const s of stops) { const d = distanceM(at, s) * ROAD; meters += d; m += d / speed / 60 + service(s); at = s; }
    if (roundTrip) { const d = distanceM(at, origin) * ROAD; meters += d; m += d / speed / 60; }
    return { minutes: m, meters };
  };
  const order = (stops: Stop[]) => twoOpt(nearestFirst(stops, origin, travelMin), origin, travelMin, roundTrip);

  // Before: the week as it is, in its current order.
  const before = { minutes: 0, meters: 0 };
  for (const k of keys) {
    const r = routeOn.get(k);
    const st = r ? r.stops.filter((s) => !isDone(s) && s.status !== 'cancelled') : [];
    const c = costOf(st);
    before.minutes += c.minutes; before.meters += c.meters;
  }

  // Days that can take stops: work days, today or later, whose trip hasn't started.
  const targets = planKeys.filter((k) => options.days[dowOf(k)] && k >= todayKey && routeOn.get(k)?.status !== 'active');
  // Stops that stay where they are, and the ones to regroup.
  const fixed = new Map<string, Stop[]>(keys.map((k) => [k, []]));
  const moving: { stop: Stop; was: string }[] = [];
  const pinnedMoves: { stop: Stop; was: string }[] = [];
  for (const k of keys) {
    const r = routeOn.get(k);
    if (!r) continue;
    for (const s of r.stops) {
      if (s.status === 'cancelled') continue;
      const pin = pins.get(s.id);
      if (pin && movable(s, r, todayKey) && fixed.has(pin)) { fixed.get(pin)!.push(s); if (pin !== k) pinnedMoves.push({ stop: s, was: k }); }
      else if (targets.length && movable(s, r, todayKey)) moving.push({ stop: s, was: k });
      else fixed.get(k)!.push(s);
    }
  }

  const work = (stops: Stop[]) => costOf(order(stops)).minutes;
  let groups: Map<string, Stop[]> = new Map(keys.map((k) => [k, [...fixed.get(k)!]]));
  if (moving.length && targets.length) {
    const totalWork = moving.reduce((n, m) => n + service(m.stop), 0) + targets.reduce((n, k) => n + work(fixed.get(k)!), 0);
    const tryWith = (k: number) => assign(k);
    // Sweep: stops in order of their direction from the start, cut into k runs of about equal work.
    const swept = [...moving].sort((a, b) => angle(origin, a.stop) - angle(origin, b.stop));
    const assign = (k: number) => {
      const use = pickDays(k);
      let bestCost = Infinity, best: Map<string, Stop[]> | null = null;
      // Every rotation of the sweep (where the first run starts), keeping the cheapest.
      for (let rot = 0; rot < Math.min(swept.length, 24); rot++) {
        const seq = [...swept.slice(rot), ...swept.slice(0, rot)];
        const runs: { stop: Stop; was: string }[][] = Array.from({ length: use.length }, () => []);
        const target = seq.reduce((n, m) => n + service(m.stop) + 15, 0) / use.length;
        let g = 0, load = 0;
        for (const m of seq) {
          if (g < use.length - 1 && runs[g].length && (load >= target || runs[g].length + fixed.get(use[g])!.length >= cap)) { g++; load = 0; }
          runs[g].push(m); load += service(m.stop) + 15;
        }
        // Each run goes to the day it shares the most stops with, so fewer stops change day.
        const map = matchRuns(runs, use);
        const out = new Map<string, Stop[]>(keys.map((key) => [key, [...fixed.get(key)!]]));
        runs.forEach((run, i) => out.get(map[i])!.push(...run.map((m) => m.stop)));
        const c = [...out.values()].reduce((n, st) => n + work(st), 0)
          + runs.reduce((n, run, i) => n + run.filter((m) => m.was !== map[i]).length * 2, 0); // a small cost per stop moved
        if (c < bestCost) { bestCost = c; best = out; }
      }
      return best!;
    };
    // Which k days to fill: for "fewer", the days that already have the most stops.
    const pickDays = (k: number) => {
      if (k >= targets.length) return targets;
      const ranked = [...targets].sort((a, b) => (routeOn.get(b)?.stops.length ?? 0) - (routeOn.get(a)?.stops.length ?? 0) || a.localeCompare(b));
      return ranked.slice(0, k).sort();
    };
    let k = spread === 'even' ? targets.length : Math.min(targets.length, Math.max(1, Math.ceil(totalWork / capacity)));
    groups = tryWith(k);
    while (spread === 'fewer' && k < targets.length && [...groups.values()].some((st) => work(st) > capacity || st.length > cap)) {
      k++; groups = tryWith(k);
    }
    // Even: no day gets much more than its share of the work or the stops.
    const share = [...groups.values()].reduce((n, st) => n + work(st), 0) / Math.max(1, targets.length);
    const stopShare = Math.ceil(([...groups.values()].reduce((n, st) => n + st.length, 0)) / Math.max(1, targets.length)) + 1;
    const dayLimit = spread === 'even' ? Math.min(capacity, Math.max(share * 1.25, share + 45)) : capacity;
    groups = improve(groups, new Set(moving.map((m) => m.stop.id)), targets, work, dayLimit,
      spread === 'even' ? Math.min(cap, stopShare) : cap);
    if (spread === 'even') groups = balance(groups, new Set(moving.map((m) => m.stop.id)), targets, cap, origin);
  }

  const days: PlanDay[] = keys.map((k) => {
    const done = groups.get(k)!.filter((s) => isDone(s) || !moving.some((m) => m.stop.id === s.id) && routeOn.get(k)?.status === 'active');
    const rest = groups.get(k)!.filter((s) => !done.includes(s));
    // Started or finished stops keep their place ahead of the rest.
    const stops = routeOn.get(k)?.status === 'active' || done.length ? [...done, ...rest] : order(rest);
    const minutes = costOf(stops.filter((s) => !isDone(s))).minutes;
    return { day: k, stops, minutes, over: minutes > capacity || stops.length > cap };
  });
  const movedFrom: Record<string, string> = {};
  for (const m of [...moving, ...pinnedMoves]) {
    const now = days.find((d) => d.stops.some((s) => s.id === m.stop.id));
    if (now && now.day !== m.was) movedFrom[m.stop.id] = m.was;
  }
  const after = days.reduce((acc, d) => {
    const c = costOf(d.stops.filter((s) => !isDone(s)));
    return { minutes: acc.minutes + c.minutes, meters: acc.meters + c.meters };
  }, { minutes: 0, meters: 0 });
  return { days, movedFrom, before, after };
}

/** Move single stops to another day while that makes the week cheaper and fits. */
function improve(groups: Map<string, Stop[]>, canMove: Set<string>, targets: string[], work: (s: Stop[]) => number, capacity: number, cap: number) {
  const g = new Map([...groups].map(([k, v]) => [k, [...v]]));
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const from of targets) {
      for (const s of [...g.get(from)!]) {
        if (!canMove.has(s.id)) continue;
        const a = g.get(from)!;
        const aWithout = a.filter((x) => x.id !== s.id);
        const base = work(a) - work(aWithout);
        let best: string | null = null, bestGain = 0.5;
        for (const to of targets) {
          if (to === from) continue;
          const b = g.get(to)!;
          if (b.length + 1 > cap) continue;
          const bWith = [...b, s];
          const wb = work(bWith);
          if (wb > capacity && work(b) <= capacity) continue;
          const gain = base - (wb - work(b));
          if (gain > bestGain) { bestGain = gain; best = to; }
        }
        if (best) { g.set(from, aWithout); g.get(best)!.push(s); changed = true; }
      }
    }
    if (!changed) break;
  }
  return g;
}

/**
 * Even days: while the busiest day has two or more stops more than the
 * lightest, move to the lightest the busy day's stop nearest to it.
 */
function balance(groups: Map<string, Stop[]>, canMove: Set<string>, targets: string[], cap: number, origin: LatLng) {
  const g = new Map([...groups].map(([k, v]) => [k, [...v]]));
  for (let guard = 0; guard < 100; guard++) {
    const byCount = [...targets].sort((a, b) => g.get(b)!.length - g.get(a)!.length);
    const heavy = byCount[0], light = byCount[byCount.length - 1];
    if (g.get(heavy)!.length - g.get(light)!.length < 2 || g.get(light)!.length + 1 > cap) break;
    const lightStops = g.get(light)!;
    const near = (s: Stop) => (lightStops.length ? Math.min(...lightStops.map((x) => distanceM(s, x))) : distanceM(s, origin));
    const candidates = g.get(heavy)!.filter((s) => canMove.has(s.id));
    if (!candidates.length) break;
    const pick = candidates.reduce((a, b) => (near(b) < near(a) ? b : a));
    g.set(heavy, g.get(heavy)!.filter((s) => s.id !== pick.id));
    lightStops.push(pick);
  }
  return g;
}

function matchRuns(runs: { stop: Stop; was: string }[][], days: string[]) {
  const map: string[] = new Array(runs.length);
  const pairs: { r: number; d: string; n: number }[] = [];
  runs.forEach((run, r) => days.forEach((d) => pairs.push({ r, d, n: run.filter((m) => m.was === d).length })));
  pairs.sort((a, b) => b.n - a.n || a.d.localeCompare(b.d));
  const usedR = new Set<number>(), usedD = new Set<string>();
  for (const p of pairs) {
    if (usedR.has(p.r) || usedD.has(p.d)) continue;
    map[p.r] = p.d; usedR.add(p.r); usedD.add(p.d);
  }
  return map;
}

function nearestFirst(stops: Stop[], start: LatLng, t: (a: LatLng, b: LatLng) => number) {
  const left = [...stops], out: Stop[] = [];
  let at: LatLng = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (t(at, left[i]) < t(at, left[bi])) bi = i;
    at = left[bi]; out.push(left.splice(bi, 1)[0]);
  }
  return out;
}

function twoOpt(stops: Stop[], start: LatLng, t: (a: LatLng, b: LatLng) => number, back: boolean) {
  const route = [...stops];
  const len = (r: Stop[]) => {
    let n = 0, at: LatLng = start;
    for (const s of r) { n += t(at, s); at = s; }
    return n + (back ? t(at, start) : 0);
  };
  let best = len(route), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const next = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        const l = len(next);
        if (l + 1e-6 < best) { route.splice(0, route.length, ...next); best = l; improved = true; }
      }
    }
  }
  return route;
}

function angle(o: LatLng, p: LatLng) {
  return Math.atan2(p.lat - o.lat, (p.lng - o.lng) * Math.cos((o.lat * Math.PI) / 180));
}
function centroid(stops: LatLng[]): LatLng | null {
  if (!stops.length) return null;
  return { lat: stops.reduce((n, s) => n + s.lat, 0) / stops.length, lng: stops.reduce((n, s) => n + s.lng, 0) / stops.length };
}

// Optimize week just saved a new week: the Schedule shows today when it comes back on screen.
let justOptimized = false;
export function markWeekOptimized() { justOptimized = true; }
export function takeWeekOptimized() { const v = justOptimized; justOptimized = false; return v; }
