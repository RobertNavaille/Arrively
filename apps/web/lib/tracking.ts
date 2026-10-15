import { OFFLINE_DEMO } from './config';
import { supabase } from './supabase';

export type TrackStatus =
  | 'scheduled' | 'queued' | 'en_route' | 'arrived'
  | 'completed' | 'no_show' | 'skipped' | 'cancelled';

export interface LatLng { lat: number; lng: number }

/** What public.get_tracking(token) returns. */
export interface Tracking {
  expired?: boolean;
  business: { name: string; phone: string | null; logo_url: string | null };
  stop: {
    status: TrackStatus; address: string; lat: number; lng: number;
    window_start: string | null; window_end: string | null; eta: string | null;
    arrived_at: string | null; marked_at: string | null; notes: string | null;
  };
  stops_ahead: number;
  driver: { first_name: string; photo_url: string | null; vehicle: string | null } | null;
  driver_location: (LatLng & { heading: number | null; recorded_at: string }) | null;
  route_active: boolean;
  chat_open: boolean;
}

export async function fetchTracking(token: string): Promise<Tracking | null> {
  if (OFFLINE_DEMO || token.startsWith('demo')) return demoTracking(token);
  const { data, error } = await supabase().rpc('get_tracking', { p_token: token });
  if (error) throw new Error(error.message);
  return (data as Tracking) ?? null;
}

// ---------------------------------------------------------------------------
// Simulated visit for /t/demo: loops through every state in about 80 seconds,
// with the driver moving along a path. /t/demo-<state> pins one state.
// ---------------------------------------------------------------------------
const HOME = { lat: 41.8262, lng: -71.4031 };
const PATH: LatLng[] = [
  { lat: 41.8395, lng: -71.4232 }, { lat: 41.8372, lng: -71.4180 }, { lat: 41.8341, lng: -71.4142 },
  { lat: 41.8318, lng: -71.4098 }, { lat: 41.8296, lng: -71.4069 }, { lat: 41.8277, lng: -71.4046 }, HOME,
];

function along(t: number): LatLng {
  const x = Math.min(Math.max(t, 0), 1) * (PATH.length - 1);
  const i = Math.min(Math.floor(x), PATH.length - 2);
  const f = x - i;
  return { lat: PATH[i].lat + (PATH[i + 1].lat - PATH[i].lat) * f, lng: PATH[i].lng + (PATH[i + 1].lng - PATH[i].lng) * f };
}

function demoTracking(token: string): Tracking {
  const now = new Date();
  const windowStart = new Date(now); windowStart.setMinutes(0, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + 2 * 3600 * 1000);
  const pinned = token.replace(/^demo-?/, '');
  const phase = pinned || ['scheduled', 'queued3', 'queued1', 'en_route', 'en_route', 'arrived', 'completed'][Math.floor((Date.now() / 1000 % 84) / 12)];
  const t = (Date.now() / 1000 % 12) / 12;

  let status: TrackStatus = 'scheduled';
  let ahead = 0;
  let loc: LatLng | null = null;
  if (phase.startsWith('queued')) { status = 'queued'; ahead = Number(phase.slice(6)) || 3; loc = { lat: 41.8402 - t * 0.002, lng: -71.4251 + t * 0.001 }; }
  if (phase === 'en_route') { status = 'en_route'; loc = along(((Date.now() / 1000 % 84) - 36) / 24); }
  if (phase === 'arrived') { status = 'arrived'; loc = { lat: HOME.lat - 0.0002, lng: HOME.lng - 0.0003 }; }
  if (phase === 'completed') status = 'completed';

  const etaMin = status === 'en_route' && loc ? Math.max(1, Math.round(distanceM(loc, HOME) * 1.3 / 1609.34 / 25 * 60)) : null;
  return {
    business: { name: 'Acme Plumbing', phone: '+14015550100', logo_url: null },
    stop: {
      status, address: '42 Benefit St, Providence, RI 02903', lat: HOME.lat, lng: HOME.lng,
      window_start: windowStart.toISOString(), window_end: windowEnd.toISOString(),
      eta: etaMin ? new Date(Date.now() + etaMin * 60000).toISOString() : status === 'queued' ? new Date(Date.now() + (ahead * 25 + 8) * 60000).toISOString() : null,
      arrived_at: status === 'arrived' ? now.toISOString() : null,
      marked_at: status === 'completed' ? now.toISOString() : null, notes: 'Water heater inspection',
    },
    stops_ahead: ahead,
    driver: status === 'scheduled' ? null : { first_name: 'Bill', photo_url: null, vehicle: 'White Ford Transit · 7KQ 204' },
    driver_location: loc && status !== 'completed' ? { ...loc, heading: null, recorded_at: now.toISOString() } : null,
    route_active: status !== 'scheduled',
    chat_open: ['queued', 'en_route', 'arrived'].includes(status),
  };
}

export function distanceM(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function fmtTime(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}
