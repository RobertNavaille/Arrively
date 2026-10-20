// Road routes for the stop screens: the line on the map and the drive time
// shown to the driver follow real roads (Mapbox Directions, with traffic).
import { useEffect, useRef, useState } from 'react';
import { MAPBOX_TOKEN } from './config';
import { distanceM } from './geo';
import type { LatLng } from './types';

export interface RoadRoute { path: LatLng[]; durationS: number; distanceM: number }

// Ask again only after the driver has moved this far, to keep requests down.
const REFETCH_AFTER_M = 150;

export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RoadRoute | null> {
  if (!MAPBOX_TOKEN) return null;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, geometries: 'geojson', overview: 'full' });
  const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?${params}`, { signal });
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
export function useRoadRoute(from: LatLng | null, to: LatLng | null): RoadRoute | null {
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const asked = useRef<{ from: LatLng; to: LatLng } | null>(null);
  useEffect(() => {
    if (!from || !to || !MAPBOX_TOKEN) return;
    const last = asked.current;
    if (last && last.to.lat === to.lat && last.to.lng === to.lng && distanceM(last.from, from) < REFETCH_AFTER_M) return;
    asked.current = { from, to };
    const ctrl = new AbortController();
    fetchRoadRoute(from, to, ctrl.signal).then(setRoute).catch(() => { /* keep the last route, or the straight line */ });
    return () => ctrl.abort();
  }, [from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
}
