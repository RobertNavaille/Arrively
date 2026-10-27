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
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const asked = useRef<{ from: LatLng; to: LatLng; opts: string } | null>(null);
  const opts = optionsKey(options);
  useEffect(() => {
    if (!from || !to || !MAPBOX_TOKEN) return;
    const last = asked.current;
    if (last && last.opts === opts && last.to.lat === to.lat && last.to.lng === to.lng && distanceM(last.from, from) < REFETCH_AFTER_M) return;
    asked.current = { from, to, opts };
    const ctrl = new AbortController();
    fetchRoadRoute(from, to, ctrl.signal, options).then(setRoute).catch(() => { /* keep the last route, or the straight line */ });
    return () => ctrl.abort();
  }, [from?.lat, from?.lng, to?.lat, to?.lng, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
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
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const asked = useRef<{ start: LatLng | null; key: string } | null>(null);
  const key = `${optionsKey(options)}|${keyOf(stops)}`;
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    const last = asked.current;
    const sameStart = last && (last.start && start ? distanceM(last.start, start) < REFETCH_AFTER_M : last.start === start);
    if (last && last.key === key && sameStart) return;
    asked.current = { start, key };
    const pts = [...(start ? [start] : []), ...stops, ...(start && options.roundTrip && stops.length ? [start] : [])];
    if (pts.length < 2) { setRoute(null); return; }
    const ctrl = new AbortController();
    fetchRoadPath(pts, ctrl.signal, options).then(setRoute).catch(() => { /* keep the last route, or the straight line */ });
    return () => ctrl.abort();
  }, [key, start?.lat, start?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
}
