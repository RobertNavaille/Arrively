// Road routes for the stop screens: the line on the map and the drive time
// shown to the driver follow real roads (Mapbox Directions, with traffic).
import { useEffect, useRef, useState } from 'react';
import { MAPBOX_TOKEN } from './config';
import { distanceM } from './geo';
import type { RouteOptions } from './routing';
import type { LatLng } from './types';

export interface RoadRoute { path: LatLng[]; durationS: number; distanceM: number }

/** The Mapbox profile for the route's travel mode (`traffic`: driving with live traffic), and what to avoid. */
function profileOf(o: RouteOptions, traffic: boolean) {
  return o.mode === 'walk' ? 'walking' : o.mode === 'bike' ? 'cycling' : traffic ? 'driving-traffic' : 'driving';
}
function paramsOf(o: RouteOptions) {
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, geometries: 'geojson', overview: 'full' });
  // Only the driving profiles take motorway and toll exclusions.
  const ex = (o.mode ?? 'drive') === 'drive' ? [o.avoidHighways && 'motorway', o.avoidTolls && 'toll'].filter(Boolean) : [];
  if (ex.length) params.set('exclude', ex.join(','));
  return params;
}
const optionsKey = (o: RouteOptions) => `${o.mode ?? 'drive'}${o.avoidHighways ? 'H' : ''}${o.avoidTolls ? 'T' : ''}${o.roundTrip ? 'R' : ''}`;

// Ask again only after the driver has moved this far, to keep requests down.
const REFETCH_AFTER_M = 150;

export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal, options: RouteOptions = {}): Promise<RoadRoute | null> {
  if (!MAPBOX_TOKEN) return null;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${profileOf(options, true)}/${coords}?${paramsOf(options)}`, { signal });
  if (!res.ok) throw new Error(`Directions failed (${res.status})`);
  const json = await res.json();
  const r = json.routes?.[0];
  if (!r) return null;
  return {
    path: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng })),
    durationS: r.duration,
    distanceM: r.distance,
  };
}

/** The road route from `from` to `to`, refreshed as the driver moves; null until known or without a Mapbox token. */
export function useRoadRoute(from: LatLng | null, to: LatLng | null, options: RouteOptions = {}): RoadRoute | null {
  const opts = optionsKey(options);
  const want = from && to && MAPBOX_TOKEN ? { from, to, opts } : null;
  return useLoaded(want && `${opts}|${keyOf([from!, to!])}`, want,
    (a, b) => a.opts === b.opts && a.to.lat === b.to.lat && a.to.lng === b.to.lng && distanceM(a.from, b.from) < REFETCH_AFTER_M,
    (w) => fetchRoadRoute(w.from, w.to, undefined, options));
}

// Directions takes at most 25 points per request; longer days are split into
// legs that share their end points.
const MAX_POINTS = 25;
const pathCache = new Map<string, RoadRoute>();

const keyOf = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

export async function fetchRoadPath(points: LatLng[], signal?: AbortSignal, options: RouteOptions = {}): Promise<RoadRoute | null> {
  if (!MAPBOX_TOKEN || points.length < 2) return null;
  const key = `${optionsKey(options)}|${keyOf(points)}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const out: RoadRoute = { path: [], durationS: 0, distanceM: 0 };
  for (let i = 0; i < points.length - 1; i += MAX_POINTS - 1) {
    const chunk = points.slice(i, i + MAX_POINTS);
    const coords = chunk.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${profileOf(options, false)}/${coords}?${paramsOf(options)}`, { signal });
    if (!res.ok) throw new Error(`Directions failed (${res.status})`);
    const r = (await res.json()).routes?.[0];
    if (!r) return null;
    out.path.push(...(r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng })));
    out.durationS += r.duration;
    out.distanceM += r.distance;
  }
  pathCache.set(key, out);
  return out;
}

/**
 * Road route through `stops` in order, starting at `start` when given (and, on
 * a round trip, back to it); null until known or without a token.
 */
export function useRoadPath(start: LatLng | null, stops: LatLng[], options: RouteOptions = {}): RoadRoute | null {
  const key = `${optionsKey(options)}|${keyOf(stops)}`;
  const pts = [...(start ? [start] : []), ...stops, ...(start && options.roundTrip && stops.length ? [start] : [])];
  const want = MAPBOX_TOKEN && pts.length >= 2 ? { start, key, pts } : null;
  return useLoaded(want && `${key}|${start ? keyOf([start]) : ''}`, want,
    (a, b) => a.key === b.key && (a.start && b.start ? distanceM(a.start, b.start) < REFETCH_AFTER_M : a.start === b.start),
    (w) => fetchRoadPath(w.pts, undefined, options));
}

// Retries after a failed request (network blip, rate limit), then gives up until
// something changes, the browser comes back online or the page is shown again.
const RETRY_MS = [1000, 3000, 8000, 20000, 45000];

/**
 * Loads what `want` describes and keeps the last result. Asks again when `want`
 * changes, unless `same(last, want)` says the last one still serves (the driver
 * moved only a little). A request is never cancelled part way: a newer one just
 * replaces it, so a moving driver can't keep the route from ever arriving.
 * Failures (and empty answers) are retried with backoff.
 */
function useLoaded<W, T>(key: string | null, want: W | null, same: (a: W, b: W) => boolean, load: (w: W) => Promise<T | null>): T | null {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const last = useRef<{ want: W; state: 'pending' | 'ok' | 'failed'; tries: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Back online, or back to the page: try again if the last request failed.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const again = () => { if (last.current?.state === 'failed') { last.current.tries = 0; setTick((t) => t + 1); } };
    const shown = () => { if (document.visibilityState === 'visible') again(); };
    window.addEventListener('online', again);
    document.addEventListener?.('visibilitychange', shown);
    return () => { window.removeEventListener('online', again); document.removeEventListener?.('visibilitychange', shown); };
  }, []);

  useEffect(() => {
    if (want == null) return;
    const prev = last.current;
    const sameWant = !!prev && same(prev.want, want);
    if (sameWant && prev!.state !== 'failed') return;
    const req = { want, state: 'pending' as 'pending' | 'ok' | 'failed', tries: sameWant ? prev!.tries : 0 };
    last.current = req;
    load(want)
      .then((r) => {
        if (!r) throw new Error('no route');
        if (!alive.current || last.current !== req) return;
        req.state = 'ok';
        setData(r);
      })
      .catch(() => {
        if (!alive.current || last.current !== req) return;
        req.state = 'failed';
        // Until it loads, the map keeps the last route it had, or straight lines.
        if (req.tries < RETRY_MS.length) {
          const wait = RETRY_MS[req.tries++];
          setTimeout(() => { if (alive.current && last.current === req) setTick((t) => t + 1); }, wait);
        }
      });
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
