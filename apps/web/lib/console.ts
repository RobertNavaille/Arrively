import { straightLineEtas, straightLinePlan, type RoutePlan } from '../../../supabase/functions/_shared/solver';
import { MAPBOX_TOKEN, OFFLINE_DEMO } from './config';
import { supabase } from './supabase';

export interface Org { id: string; name: string; phone: string | null; drivers_can_add_stops: boolean; arrival_radius_m: number }
export interface Driver { id: string; name: string; phone: string | null; vehicle: string | null; role: 'admin' | 'driver' }
export interface Invite { phone: string; name: string; vehicle: string | null; role: 'admin' | 'driver' }
export interface ConsoleStop {
  id: string; route_id: string | null; position: number | null; status: string; customer_name: string;
  customer_phone: string | null; sms_consent_at: string | null; address: string; lat: number; lng: number;
  window_start: string | null; window_end: string | null; service_minutes: number; notes: string | null;
  marked_at: string | null; mark_reason: string | null; marked_outside: boolean; tracking_token: string;
  eta: string | null; eta_approx: boolean; arrived_at: string | null;
}
export interface ConsoleRoute { id: string; day: string; status: string; driver_id: string | null; drive_s: number | null; stops: ConsoleStop[] }
export type { RoutePlan } from '../../../supabase/functions/_shared/solver';

/** Calls an edge function and surfaces its { error } message. */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((j) => j?.error).catch(() => null) : null;
    throw new Error(msg ?? error.message);
  }
  return data as T;
}
// After the console changes a route, its customers' ETAs are refreshed.
const refreshEtas = (routeId: string) => { invoke('route-etas', { route_id: routeId, force: true }).catch((e) => console.warn('ETA refresh failed', e)); };
export interface DriverLocation { driver_id: string; lat: number; lng: number; recorded_at: string }
export interface Place { id: string; name: string; detail: string; lat: number; lng: number }
export interface NewStop {
  day: string; driver_id: string; customer_name: string; customer_phone: string; address: string; lat: number; lng: number;
  notes: string; consent: boolean;
}

export function e164(input: string): string {
  const d = input.replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `+1${d}`;
  return `+${d}`;
}

// ---------------------------------------------------------------------------
// Supabase-backed console API (admins only; row-level security enforces it).
// ---------------------------------------------------------------------------
export const api = {
  async signedIn() {
    if (OFFLINE_DEMO) return demo.signedIn;
    const { data } = await supabase().auth.getSession();
    return !!data.session;
  },
  async sendCode(phone: string) {
    if (OFFLINE_DEMO) return;
    const { error } = await supabase().auth.signInWithOtp({ phone: e164(phone) });
    if (error) throw new Error(error.message);
  },
  async verify(phone: string, token: string) {
    if (OFFLINE_DEMO) { demo.signedIn = true; return; }
    const { error } = await supabase().auth.verifyOtp({ phone: e164(phone), token, type: 'sms' });
    if (error) throw new Error(error.message);
  },
  async signOut() {
    if (OFFLINE_DEMO) { demo.signedIn = false; return; }
    await supabase().auth.signOut();
  },
  async me(): Promise<{ org: Org; role: string; name: string }> {
    if (OFFLINE_DEMO) return { org: demo.org, role: 'admin', name: 'Olivia Owner' };
    const { data: u } = await supabase().auth.getUser();
    const { data, error } = await supabase().from('profiles')
      .select('name, role, orgs(id, name, phone, drivers_can_add_stops, arrival_radius_m)').eq('id', u.user?.id ?? '').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("This phone number isn't part of a business yet.");
    const org = (data as unknown as { orgs: Org }).orgs;
    return { org, role: data.role, name: data.name };
  },
  async drivers(): Promise<{ drivers: Driver[]; invites: Invite[] }> {
    if (OFFLINE_DEMO) return { drivers: demo.drivers, invites: demo.invites };
    const [p, i] = await Promise.all([
      supabase().from('profiles').select('id,name,phone,vehicle,role').order('name'),
      supabase().from('invites').select('phone,name,vehicle,role').order('created_at'),
    ]);
    if (p.error) throw new Error(p.error.message);
    return { drivers: (p.data ?? []) as Driver[], invites: (i.data ?? []) as Invite[] };
  },
  async invite(orgId: string, inv: Invite) {
    if (OFFLINE_DEMO) { demo.invites.push({ ...inv, phone: e164(inv.phone) }); return; }
    const { error } = await supabase().from('invites').upsert({ ...inv, phone: e164(inv.phone), org_id: orgId });
    if (error) throw new Error(error.message);
  },
  async routes(day: string): Promise<ConsoleRoute[]> {
    if (OFFLINE_DEMO) return demo.withEtas(demo.routes.filter((r) => r.day === day));
    const { data, error } = await supabase().from('routes').select('id,day,status,driver_id,drive_s,stops(*)').eq('day', day);
    if (error) throw new Error(error.message);
    return ((data ?? []) as ConsoleRoute[]).map((r) => ({ ...r, stops: [...r.stops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) }));
  },
  async locations(): Promise<DriverLocation[]> {
    if (OFFLINE_DEMO) return demo.locations();
    const { data, error } = await supabase().from('driver_locations').select('driver_id,lat,lng,recorded_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as DriverLocation[];
  },
  async addStop(orgId: string, s: NewStop) {
    if (OFFLINE_DEMO) { demo.addStop(s); return; }
    const sb = supabase();
    let { data: route } = await sb.from('routes').select('id').eq('driver_id', s.driver_id).eq('day', s.day).maybeSingle();
    if (!route) {
      const r = await sb.from('routes').insert({ org_id: orgId, driver_id: s.driver_id, day: s.day }).select('id').single();
      if (r.error) throw new Error(r.error.message);
      route = r.data;
    }
    const { data: last } = await sb.from('stops').select('position').eq('route_id', route!.id).order('position', { ascending: false }).limit(1).maybeSingle();
    const { error } = await sb.from('stops').insert({
      org_id: orgId, route_id: route!.id, position: (last?.position ?? 0) + 1,
      customer_name: s.customer_name || 'Customer', customer_phone: s.customer_phone ? e164(s.customer_phone) : null,
      sms_consent_at: s.consent && s.customer_phone ? new Date().toISOString() : null,
      sms_consent_source: s.consent ? 'console' : null,
      address: s.address, lat: s.lat, lng: s.lng, notes: s.notes || null,
    });
    if (error) throw new Error(error.message);
    refreshEtas(route!.id);
  },
  async cancelStop(id: string) {
    if (OFFLINE_DEMO) { demo.cancel(id); return; }
    const { data, error } = await supabase().from('stops').update({ status: 'cancelled' }).eq('id', id).select('route_id').single();
    if (error) throw new Error(error.message);
    if (data?.route_id) refreshEtas(data.route_id);
  },
  async reorder(routeId: string, ids: string[]) {
    if (OFFLINE_DEMO) { demo.reorder(routeId, ids); return; }
    const { error } = await supabase().rpc('reorder_route', { p_route: routeId, p_stop_ids: ids });
    if (error) throw new Error(error.message);
    refreshEtas(routeId);
  },
  /** The best order for a route's stops left, next to the current order (RTE-4). */
  async plan(route: ConsoleRoute, driverAt: DriverLocation | null): Promise<RoutePlan> {
    if (OFFLINE_DEMO) return straightLinePlan(route.stops, route.day, driverAt);
    return invoke<RoutePlan>('route-plan', { route_id: route.id });
  },
  async applyPlan(routeId: string, order: string[]) {
    if (OFFLINE_DEMO) { demo.applyPlan(routeId, order); return; }
    await invoke('route-plan', { route_id: routeId, apply: order });
  },
  async saveOrg(org: Org) {
    if (OFFLINE_DEMO) { demo.org = org; return; }
    const { error } = await supabase().from('orgs').update({
      name: org.name, phone: org.phone ? e164(org.phone) : null, drivers_can_add_stops: org.drivers_can_add_stops,
    }).eq('id', org.id);
    if (error) throw new Error(error.message);
  },
};

export async function searchAddress(q: string): Promise<Place[]> {
  if (!q.trim()) return [];
  if (!MAPBOX_TOKEN) {
    if (!OFFLINE_DEMO) throw new Error('Address search needs NEXT_PUBLIC_MAPBOX_TOKEN.');
    return SAMPLE_PLACES.filter((p) => `${p.name} ${p.detail}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
  }
  // Geocoding v6 has no POIs ("poi" makes it reject the request); bias results toward the user.
  const params = new URLSearchParams({ q, access_token: MAPBOX_TOKEN, autocomplete: 'true', country: 'us', limit: '5', types: 'address', proximity: 'ip' });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const json = await res.json();
  return (json.features ?? []).map((f: { id: string; properties: { name?: string; full_address?: string; place_formatted?: string }; geometry: { coordinates: [number, number] } }) => ({
    id: f.id, name: f.properties?.name ?? f.properties?.full_address ?? 'Address', detail: f.properties?.place_formatted ?? '',
    lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
  }));
}

const SAMPLE_PLACES: Place[] = [
  { id: 'a', name: '12 Waterman St', detail: 'Providence, RI 02906', lat: 41.8268, lng: -71.4003 },
  { id: 'b', name: '120 Westminster St', detail: 'Providence, RI 02903', lat: 41.8243, lng: -71.4119 },
  { id: 'c', name: '215 Thayer St', detail: 'Providence, RI 02906', lat: 41.8269, lng: -71.4006 },
  { id: 'd', name: '48 Wickenden St', detail: 'Providence, RI 02903', lat: 41.8197, lng: -71.4012 },
  { id: 'e', name: '300 Hope St', detail: 'Providence, RI 02906', lat: 41.8338, lng: -71.3943 },
];

// ---------------------------------------------------------------------------
// Offline demo data for the console.
// ---------------------------------------------------------------------------
const today = new Date();
const dk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let n = 1;
function demoStops(routeId: string, base: { lat: number; lng: number }, names: string[], done: number): ConsoleStop[] {
  return names.map((name, i) => {
    const start = new Date(today); start.setHours(9 + i, 0, 0, 0);
    return {
      id: `d${n++}`, route_id: routeId, position: i + 1,
      status: i < done ? 'completed' : i === done ? 'en_route' : 'queued',
      customer_name: name, customer_phone: '+1401555' + String(1000 + i), sms_consent_at: i % 3 ? today.toISOString() : null,
      address: ['150 Union St', '9 Planet St', '77 Hope St', '18 Wickenden St', '42 Benefit St', '3 Arnold St', '110 Ives St', '27 Governor St'][i % 8],
      lat: base.lat + Math.cos(i * 2.4) * 0.01 * (1 + (i % 3) / 2), lng: base.lng + Math.sin(i * 2.4) * 0.012 * (1 + (i % 3) / 2), // scattered, so Optimize has work
      window_start: null, window_end: null, service_minutes: 20,
      notes: ['New key', 'Leak repair', 'Thermostat', 'Drop-off', 'Water heater'][i % 5],
      marked_at: i < done ? start.toISOString() : null, mark_reason: null, marked_outside: false, tracking_token: `demo-${i}`,
      eta: null, eta_approx: true, arrived_at: null,
    };
  });
}
const demo = {
  signedIn: false,
  org: { id: 'org', name: 'Acme Plumbing', phone: '+14015550100', drivers_can_add_stops: true, arrival_radius_m: 75 } as Org,
  drivers: [
    { id: 'bill', name: 'Bill Brien', phone: '+14015550201', vehicle: 'White Ford Transit · 7KQ 204', role: 'driver' },
    { id: 'jada', name: 'Jada Simmons', phone: '+14015550202', vehicle: 'Gray Ram ProMaster', role: 'driver' },
    { id: 'olivia', name: 'Olivia Owner', phone: '+14015550100', vehicle: null, role: 'admin' },
  ] as Driver[],
  invites: [{ phone: '+14015550203', name: 'Marco Ruiz', vehicle: null, role: 'driver' }] as Invite[],
  routes: [] as ConsoleRoute[],
  locations(): DriverLocation[] {
    const t = Date.now() / 60000;
    return [
      { driver_id: 'bill', lat: 41.826 + Math.sin(t) * 0.004, lng: -71.41 + Math.cos(t) * 0.004, recorded_at: new Date().toISOString() },
      { driver_id: 'jada', lat: 41.834, lng: -71.398, recorded_at: new Date(Date.now() - 180000).toISOString() },
    ];
  },
  addStop(s: NewStop) {
    let r = this.routes.find((x) => x.driver_id === s.driver_id && x.day === s.day);
    if (!r) { r = { id: `r${n++}`, day: s.day, status: 'planned', driver_id: s.driver_id, drive_s: null, stops: [] }; this.routes.push(r); }
    r.stops.push({
      id: `d${n++}`, route_id: r.id, position: r.stops.length + 1, status: 'scheduled', customer_name: s.customer_name || 'Customer',
      customer_phone: s.customer_phone ? e164(s.customer_phone) : null, sms_consent_at: s.consent ? new Date().toISOString() : null,
      address: s.address, lat: s.lat, lng: s.lng, window_start: null, window_end: null, service_minutes: 20,
      notes: s.notes || null, marked_at: null, mark_reason: null, marked_outside: false, tracking_token: `demo-x${n}`,
      eta: null, eta_approx: true, arrived_at: null,
    });
  },
  cancel(id: string) { for (const r of this.routes) { const s = r.stops.find((x) => x.id === id); if (s) s.status = 'cancelled'; } },
  reorder(routeId: string, ids: string[]) {
    const r = this.routes.find((x) => x.id === routeId); if (!r) return;
    r.stops.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).forEach((s, i) => { s.position = i + 1; });
  },
  applyPlan(routeId: string, order: string[]) {
    const r = this.routes.find((x) => x.id === routeId); if (!r) return;
    // Same rule as reorder_route: upcoming stops take the slots upcoming stops hold.
    const movable = order.map((id) => r.stops.find((s) => s.id === id)).filter((s): s is ConsoleStop => !!s && (s.status === 'scheduled' || s.status === 'queued'));
    const slots = movable.map((s) => s.position ?? 0).sort((a, b) => a - b);
    movable.forEach((s, i) => { s.position = slots[i]; });
    r.stops.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  },
  /** Straight-line ETAs, recomputed whenever the console reads routes. */
  withEtas(routes: ConsoleRoute[]) {
    const locs = this.locations();
    for (const r of routes) {
      if (r.status === 'completed') continue;
      const at = locs.find((l) => l.driver_id === r.driver_id) ?? null;
      const { etas, drive_s } = straightLineEtas(r.stops, r.day, at);
      r.drive_s = drive_s;
      for (const s of r.stops) s.eta = etas[s.id] ?? null;
    }
    return routes;
  },
};
demo.routes = [
  { id: 'rb', day: dk(today), status: 'active', driver_id: 'bill', drive_s: null, stops: demoStops('rb', { lat: 41.826, lng: -71.41 }, ['Michael B', 'Grace L', 'Dev P', 'Ana R', 'Sam K', 'Jo F', 'Max D', 'Nia H'], 3) },
  { id: 'rj', day: dk(today), status: 'active', driver_id: 'jada', drive_s: null, stops: demoStops('rj', { lat: 41.834, lng: -71.398 }, ['Lena O', 'Chris T', 'Priya N', 'Owen M', 'Rosa G'], 1) },
];
demo.routes[0].stops[1].marked_outside = true;
demo.routes[0].stops[1].mark_reason = 'Marked away from the stop';
