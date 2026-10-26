import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { OFFLINE_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { addDays, dayKey, distanceM } from './geo';
import { localEtas, localPlan, type RoutePlan } from './routing';
import type { LatLng, MarkOutcome, Profile, Route, Stop } from './types';

/** Everything the app does against the server. Two implementations: Supabase and an offline demo. */
/** What the driver fills in when adding a stop. */
export interface StopDetails { name?: string; notes?: string }

export interface Backend {
  offline: boolean;
  isSignedIn(): Promise<boolean>;
  onAuthChange(cb: (signedIn: boolean) => void): () => void;
  sendCode(phone: string): Promise<void>;
  verifyCode(phone: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  profile(): Promise<Profile>;
  routes(fromDay: string, toDay: string): Promise<Route[]>;
  subscribe(onChange: () => void): () => void;
  startRoute(routeId: string): Promise<void>;
  startTrip(stopId: string): Promise<void>;
  markArrived(stopId: string): Promise<void>;
  /** Back to on the way, for an arrival marked by mistake. */
  undoArrived(stopId: string): Promise<void>;
  /** Cancel route: ends the trip (the route is no longer under way); its open stops wait, this one still next. */
  cancelTrip(stopId: string): Promise<void>;
  markStop(stopId: string, outcome: MarkOutcome, reason: string | null, at: LatLng | null): Promise<void>;
  addStop(day: string, address: string, at: LatLng, details?: StopDetails): Promise<void>;
  updateAddress(stopId: string, address: string, at: LatLng): Promise<void>;
  /** A stop's name and notes (Edit details). */
  updateDetails(stopId: string, details: StopDetails): Promise<void>;
  /** Removes a stop that isn't in progress, finished or not (it's kept as cancelled). */
  removeStop(stopId: string): Promise<void>;
  reportLocation(p: LatLng & { heading?: number | null; speed?: number | null; accuracy?: number | null; at?: string }): Promise<void>;
  createDemoDay(at: LatLng, phone: string | null): Promise<void>;
  /** The best order for the stops left, starting where the driver is (`from`), next to the current order (RTE-4). */
  planRoute(routeId: string, from: LatLng | null): Promise<RoutePlan>;
  /** Saves an order the driver accepted, then refreshes ETAs from `from`. */
  applyPlan(routeId: string, order: string[], from: LatLng | null): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

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

// ETAs are refreshed after anything that changes the route, and at most once a
// minute from location reports; the server throttles too (ETA-2).
const ETA_EVERY_MS = 60_000;
let lastEtaCall = 0;
function refreshEtas(force: boolean) {
  if (!force && Date.now() - lastEtaCall < ETA_EVERY_MS) return;
  lastEtaCall = Date.now();
  invoke('route-etas', { force }).catch((e) => console.warn('ETA refresh failed', e));
}

const supabaseBackend: Backend = {
  offline: false,
  async isSignedIn() {
    const { data } = await supabase().auth.getSession();
    return !!data.session;
  },
  onAuthChange(cb) {
    const { data } = supabase().auth.onAuthStateChange((_e, session) => cb(!!session));
    return () => data.subscription.unsubscribe();
  },
  async sendCode(phone) {
    check(await supabase().auth.signInWithOtp({ phone }));
  },
  async verifyCode(phone, token) {
    check(await supabase().auth.verifyOtp({ phone, token, type: 'sms' }));
  },
  async signOut() {
    await supabase().auth.signOut();
  },
  async profile() {
    const { data: u } = await supabase().auth.getUser();
    const row = check(await supabase().from('profiles').select('id,name,role,vehicle,orgs(name)').eq('id', u.user?.id ?? '').maybeSingle());
    if (!row) throw new Error("This phone number hasn't been invited to a business yet.");
    const org = (row as unknown as { orgs: { name: string } | null }).orgs;
    return { id: row.id, name: row.name, role: row.role, vehicle: row.vehicle, org_name: org?.name ?? '' };
  },
  async routes(fromDay, toDay) {
    const { data: u } = await supabase().auth.getUser();
    const rows = check(await supabase().from('routes').select('id,day,status,optimized_at,drive_s,stops(*)')
      .eq('driver_id', u.user?.id ?? '').gte('day', fromDay).lte('day', toDay).order('day'));
    return (rows ?? []).map((r) => ({
      ...(r as unknown as Route),
      stops: [...((r as unknown as Route).stops ?? [])].filter((s) => s.status !== 'cancelled').sort((a, b) => a.position - b.position),
    }));
  },
  subscribe(onChange) {
    const ch = supabase().channel('driver-stops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, onChange)
      .subscribe();
    return () => { supabase().removeChannel(ch); };
  },
  async startRoute(routeId) { check(await supabase().rpc('start_route', { p_route: routeId })); refreshEtas(true); },
  async startTrip(stopId) { check(await supabase().rpc('start_trip', { p_stop: stopId })); refreshEtas(true); },
  async markArrived(stopId) { check(await supabase().rpc('mark_arrived', { p_stop: stopId })); refreshEtas(true); },
  async undoArrived(stopId) { check(await supabase().rpc('undo_arrived', { p_stop: stopId })); refreshEtas(true); },
  async cancelTrip(stopId) { check(await supabase().rpc('cancel_trip', { p_stop: stopId })); refreshEtas(true); },
  async markStop(stopId, outcome, reason, at) {
    check(await supabase().rpc('mark_stop', { p_stop: stopId, p_outcome: outcome, p_reason: reason, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null }));
    refreshEtas(true);
  },
  async addStop(day, address, at, details) {
    const routeId = check(await supabase().rpc('my_route_for', { p_day: day })) as string;
    check(await supabase().rpc('add_stop', {
      p_route: routeId, p_address: address, p_lat: at.lat, p_lng: at.lng,
      p_customer_name: details?.name?.trim() || null, p_notes: details?.notes?.trim() || null,
    }));
    refreshEtas(true);
  },
  async updateAddress(stopId, address, at) {
    check(await supabase().rpc('update_stop_address', { p_stop: stopId, p_address: address, p_lat: at.lat, p_lng: at.lng }));
    refreshEtas(true);
  },
  async updateDetails(stopId, details) {
    check(await supabase().rpc('update_stop_details', { p_stop: stopId, p_name: details.name?.trim() || null, p_notes: details.notes?.trim() || null }));
  },
  async removeStop(stopId) {
    check(await supabase().rpc('remove_stop', { p_stop: stopId }));
    refreshEtas(true);
  },
  async reportLocation(p) {
    check(await supabase().rpc('report_location', {
      p_lat: p.lat, p_lng: p.lng, p_heading: p.heading ?? null, p_speed: p.speed ?? null,
      p_accuracy: p.accuracy ?? null, p_recorded_at: p.at ?? new Date().toISOString(),
    }));
    refreshEtas(false);
  },
  planRoute(routeId, from) { return invoke<RoutePlan>('route-plan', { route_id: routeId, from }); },
  async applyPlan(routeId, order, from) { await invoke('route-plan', { route_id: routeId, apply: order, from }); },
  async createDemoDay(at, phone) {
    check(await supabase().rpc('create_demo_day', { p_lat: at.lat, p_lng: at.lng, p_stop_count: 6, p_customer_phone: phone }));
  },
};

// ---------------------------------------------------------------------------
// Offline demo: sample data in memory, same rules as the database.
// ---------------------------------------------------------------------------
const RADIUS = 75;
const listeners = new Set<() => void>();
let lastPos: LatLng | null = null;
// Every change recomputes ETAs, like the route-etas function does online.
function computeEtas() {
  for (const r of demoRoutes ?? []) {
    if (r.status === 'completed') continue;
    const { etas, drive_s } = localEtas(r, lastPos);
    r.drive_s = drive_s;
    for (const s of r.stops) s.eta = etas[s.id] ?? null;
  }
}
const emit = () => { computeEtas(); listeners.forEach((l) => l()); };
let signedIn = false;
const authListeners = new Set<(v: boolean) => void>();
const setSignedIn = (v: boolean) => { signedIn = v; authListeners.forEach((l) => l(v)); };
let demoRoutes: Route[] | null = null;
let seq = 1;

const NAMES = ['Michael B', 'Grace L', 'Dev P', 'Ana R', 'Sam K', 'Jo F', 'Max D', 'Nia H'];
const STREETS = ['150 Union St, Apt 303', '9 Planet St', '77 Hope St', '18 Wickenden St', '42 Benefit St', '3 Arnold St', '110 Ives St', '27 Governor St'];
const JOBS = ['New key', 'Leak repair', 'Thermostat', 'Drop-off', 'Water heater', 'Garbage disposal', 'Sump pump', 'Inspection'];

function makeDay(day: Date, center: LatLng, count: number, done: boolean): Route {
  const id = `r${seq++}`;
  const stops: Stop[] = Array.from({ length: count }, (_, i) => {
    // Zig-zag around town so "Optimize order" has something to fix.
    const k = (i * 3) % count;
    const a = (k / count) * Math.PI * 2;
    const km = 0.8 + k * 0.35;
    const start = new Date(day); start.setHours(9 + i, 0, 0, 0);
    return {
      id: `s${seq++}`, route_id: id, position: i + 1, status: done ? 'completed' : 'scheduled',
      customer_name: NAMES[i % NAMES.length], customer_phone: null, address: STREETS[i % STREETS.length],
      lat: center.lat + (km / 111) * Math.cos(a), lng: center.lng + (km / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a),
      window_start: null, window_end: null, service_minutes: 20,
      notes: JOBS[i % JOBS.length], eta: null, arrived_at: null,
      marked_at: done ? start.toISOString() : null, departed_at: done ? start.toISOString() : null,
    };
  });
  return { id, day: dayKey(day), status: done ? 'completed' : 'planned', stops };
}

function ensureDemo(): Route[] {
  if (!demoRoutes) {
    const c = { lat: 41.824, lng: -71.4128 };
    const today = new Date();
    demoRoutes = [makeDay(addDays(today, -1), c, 7, true), makeDay(today, c, 8, false), makeDay(addDays(today, 1), c, 5, false)];
    computeEtas();
  }
  return demoRoutes;
}
function findStop(id: string): [Route, Stop] {
  for (const r of ensureDemo()) { const s = r.stops.find((x) => x.id === id); if (s) return [r, s]; }
  throw new Error('Stop not found');
}
function finishIfDone(r: Route) {
  if (r.stops.every((s) => ['completed', 'no_show', 'skipped', 'cancelled'].includes(s.status))) r.status = 'completed';
}

const offlineBackend: Backend = {
  offline: true,
  async isSignedIn() { return signedIn; },
  onAuthChange(cb) { authListeners.add(cb); return () => { authListeners.delete(cb); }; },
  async sendCode() {},
  async verifyCode() { setSignedIn(true); },
  async signOut() { setSignedIn(false); },
  async profile() { return { id: 'demo', name: 'Bill Brien', role: 'driver', vehicle: 'White Ford Transit · 7KQ 204', org_name: 'Acme Plumbing (demo)' }; },
  async routes(from, to) {
    return ensureDemo().filter((r) => r.day >= from && r.day <= to)
      .map((r) => ({ ...r, stops: r.stops.filter((s) => s.status !== 'cancelled').sort((a, b) => a.position - b.position) }));
  },
  subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async startRoute(routeId) {
    const r = ensureDemo().find((x) => x.id === routeId); if (!r) throw new Error('Route not found');
    r.status = 'active'; r.stops.forEach((s) => { if (s.status === 'scheduled') s.status = 'queued'; }); emit();
  },
  async startTrip(stopId) {
    const [r, s] = findStop(stopId);
    if (r.stops.some((x) => x.id !== s.id && (x.status === 'en_route' || x.status === 'arrived'))) {
      throw new Error('Mark your current stop before starting the next trip.');
    }
    r.status = 'active'; r.stops.forEach((x) => { if (x.status === 'scheduled') x.status = 'queued'; });
    s.status = 'en_route'; emit();
  },
  async markArrived(stopId) { const [, s] = findStop(stopId); if (s.status === 'arrived') return; s.status = 'arrived'; s.arrived_at = new Date().toISOString(); emit(); },
  async undoArrived(stopId) { const [, s] = findStop(stopId); s.status = 'en_route'; s.arrived_at = null; emit(); },
  async cancelTrip(stopId) {
    // Ends the trip: the route is no longer under way and its open stops go back to scheduled.
    const [r, s] = findStop(stopId);
    s.arrived_at = null;
    r.stops.forEach((x) => { if (x.status === 'en_route' || x.status === 'arrived' || x.status === 'queued') x.status = 'scheduled'; });
    if (r.status === 'active') r.status = 'planned';
    emit();
  },
  async markStop(stopId, outcome, reason, at) {
    const [r, s] = findStop(stopId);
    const outside = at ? distanceM(at, s) > RADIUS * 2 : false;
    if ((outcome === 'completed' || outcome === 'no_show') && outside && !reason) throw new Error('You are away from the stop. Add a reason.');
    if ((outcome === 'skipped' || outcome === 'deferred') && !reason) throw new Error('A reason is required.');
    const now = new Date().toISOString();
    if (outcome === 'deferred') {
      s.status = 'queued'; s.position = Math.max(...r.stops.map((x) => x.position)) + 1; s.arrived_at = null;
    } else {
      s.status = outcome; s.marked_at = now; s.departed_at = now; // offline demo: no real departure, count it now
      s.mark_reason = reason; s.marked_outside = outside;
    }
    finishIfDone(r); emit();
  },
  async addStop(day, address, at, details) {
    let r = ensureDemo().find((x) => x.day === day);
    if (!r) { r = { id: `r${seq++}`, day, status: 'planned', stops: [] }; ensureDemo().push(r); }
    if (r.status === 'completed') r.status = 'active';
    r.stops.push({
      id: `s${seq++}`, route_id: r.id, position: (Math.max(0, ...r.stops.map((x) => x.position))) + 1,
      status: r.status === 'active' ? 'queued' : 'scheduled', customer_name: details?.name?.trim() || 'New stop', customer_phone: null,
      address, lat: at.lat, lng: at.lng, window_start: null, window_end: null, service_minutes: 20, notes: details?.notes?.trim() || null,
      eta: null, arrived_at: null, marked_at: null, departed_at: null,
    });
    emit();
  },
  async updateAddress(stopId, address, at) { const [, s] = findStop(stopId); s.address = address; s.lat = at.lat; s.lng = at.lng; emit(); },
  async updateDetails(stopId, details) {
    const [, s] = findStop(stopId);
    s.customer_name = details.name?.trim() || s.customer_name; s.notes = details.notes?.trim() || null; emit();
  },
  async removeStop(stopId) {
    const [r, s] = findStop(stopId);
    if (s.status === 'en_route' || s.status === 'arrived') throw new Error('Mark this stop before removing it.');
    s.status = 'cancelled';
    if (r.status === 'active') finishIfDone(r);
    emit();
  },
  async reportLocation(p) {
    lastPos = { lat: p.lat, lng: p.lng };
    for (const r of ensureDemo()) {
      if (r.status !== 'active') continue;
      for (const s of r.stops) {
        if (s.status === 'en_route' && distanceM(p, s) <= RADIUS) { s.status = 'arrived'; s.arrived_at = new Date().toISOString(); emit(); }
      }
    }
  },
  async createDemoDay(at) {
    const routes = ensureDemo();
    const i = routes.findIndex((r) => r.day === dayKey(new Date()));
    const fresh = makeDay(new Date(), at, 6, false);
    if (i >= 0) routes[i] = fresh; else routes.push(fresh);
    emit();
  },
  async planRoute(routeId, from) {
    const r = ensureDemo().find((x) => x.id === routeId); if (!r) throw new Error('Route not found');
    return localPlan(r, from ?? lastPos);
  },
  async applyPlan(routeId, order, from) {
    if (from) lastPos = from;
    const r = ensureDemo().find((x) => x.id === routeId); if (!r) throw new Error('Route not found');
    // Same rule as reorder_route: upcoming stops take the slots upcoming stops hold.
    const movable = order.map((id) => r.stops.find((s) => s.id === id)).filter((s): s is Stop => !!s && (s.status === 'scheduled' || s.status === 'queued'));
    const slots = movable.map((s) => s.position).sort((a, b) => a - b);
    movable.forEach((s, i) => { s.position = slots[i]; });
    r.optimized_at = new Date().toISOString();
    emit();
  },
};

export const backend: Backend = OFFLINE_DEMO ? offlineBackend : supabaseBackend;
