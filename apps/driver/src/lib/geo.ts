import type { LatLng, Stop } from './types';

/** Compass bearing from a to b: degrees clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const miles = (m: number) => m / 1609.34;

/** Rough drive time until Mapbox Directions is wired in: road factor 1.3, 25 mph average. */
export function estimateDriveMin(m: number): number {
  return Math.max(1, Math.round(((m * 1.3) / 1609.34 / 25) * 60));
}

export function routeTotals(stops: Stop[], from?: LatLng | null) {
  let meters = 0;
  let prev: LatLng | null = from ?? null;
  for (const s of stops) {
    if (prev) meters += distanceM(prev, s);
    prev = s;
  }
  const driveMin = estimateDriveMin(meters);
  const serviceMin = stops.reduce((t, s) => t + (s.service_minutes ?? 20), 0);
  return { meters, driveMin, serviceMin };
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** A phone number as people write it: (401) 555-0142 for US numbers, as stored otherwise. */
export function fmtPhone(p: string): string {
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

export function fmtWindow(s: Pick<Stop, 'window_start' | 'window_end'>): string {
  if (!s.window_start) return '';
  if (!s.window_end) return fmtTime(s.window_start);
  return `${fmtTime(s.window_start)} – ${fmtTime(s.window_end)}`;
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The part of a route still ahead of the driver: from the point on it nearest
 * to them (their position projected onto the closest segment) to its end. As
 * they drive, what's behind them drops off. Distances use a flat projection
 * around the driver, plenty for a few kilometres.
 */
export function pathAhead(path: LatLng[], at: LatLng): LatLng[] {
  if (path.length < 2) return path;
  const k = Math.cos((at.lat * Math.PI) / 180);
  const xy = (p: LatLng) => ({ x: (p.lng - at.lng) * k, y: p.lat - at.lat });
  let best = { i: 0, t: 0, d: Infinity };
  for (let i = 0; i < path.length - 1; i++) {
    const a = xy(path[i]), b = xy(path[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    // The driver is the origin; project it onto segment a→b.
    const t = len ? Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / len)) : 0;
    const d = (a.x + t * dx) ** 2 + (a.y + t * dy) ** 2;
    if (d < best.d) best = { i, t, d };
  }
  const a = path[best.i], b = path[best.i + 1];
  const onRoute = { lat: a.lat + (b.lat - a.lat) * best.t, lng: a.lng + (b.lng - a.lng) * best.t };
  return [onRoute, ...path.slice(best.i + 1)];
}
