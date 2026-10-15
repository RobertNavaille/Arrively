import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { OFFLINE_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { addDays, dayKey, distanceM } from './geo';
import type { LatLng, MarkOutcome, Profile, Route, Stop } from './types';

/** Everything the app does against the server. Two implementations: Supabase and an offline demo. */
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
  markStop(stopId: string, outcome: MarkOutcome, reason: string | null, at: LatLng | null): Promise<void>;
  addStop(day: string, address: string, at: LatLng): Promise<void>;
  updateAddress(stopId: string, address: string, at: LatLng): Promise<void>;
  reportLocation(p: LatLng & { heading?: number | null; speed?: number | null; accuracy?: number | null; at?: string }): Promise<void>;
  createDemoDay(at: LatLng, phone: string | null): Promise<void>;
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
    const rows = check(await supabase().from('routes').select('id,day,status,stops(*)')
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
  async startRoute(routeId) { check(await supabase().rpc('start_route', { p_route: routeId })); },
  async startTrip(stopId) { check(await supabase().rpc('start_trip', { p_stop: stopId })); },
  async markArrived(stopId) { check(await supabase().rpc('mark_arrived', { p_stop: stopId })); },
  async markStop(stopId, outcome, reason, at) {
    check(await supabase().rpc('mark_stop', { p_stop: stopId, p_outcome: outcome, p_reason: reason, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null }));
  },
  async addStop(day, address, at) {
    const routeId = check(await supabase().rpc('my_route_for', { p_day: day })) as string;
    check(await supabase().rpc('add_stop', { p_route: routeId, p_address: address, p_lat: at.lat, p_lng: at.lng }));
  },
  async updateAddress(stopId, address, at) {
    check(await supabase().rpc('update_stop_address', { p_stop: stopId, p_address: address, p_lat: at.lat, p_lng: at.lng }));
  },
  async reportLocation(p) {
    check(await supabase().rpc('report_location', {
      p_lat: p.lat, p_lng: p.lng, p_heading: p.heading ?? null, p_speed: p.speed ?? null,
      p_accuracy: p.accuracy ?? null, p_recorded_at: p.at ?? new Date().toISOString(),
    }));
  },
  async createDemoDay(at, phone) {
    check(await supabase().rpc('create_demo_day', { p_lat: at.lat, p_lng: at.lng, p_stop_count: 6, p_customer_phone: phone }));
  },
};

// ---------------------------------------------------------------------------
// Offline demo: sample data in memory, same rules as the database.
// ---------------------------------------------------------------------------
const RADIUS = 75;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
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
    const a = (i / count) * Math.PI * 2;
    const km = 0.8 + i * 0.35;
    const start = new Date(day); start.setHours(9 + i, 0, 0, 0);
    const end = new Date(start); end.setHours(start.getHours() + 2);
    return {
      id: `s${seq++}`, route_id: id, position: i + 1, status: done ? 'completed' : 'scheduled',
      customer_name: NAMES[i % NAMES.length], customer_phone: null, address: STREETS[i % STREETS.length],
      lat: center.lat + (km / 111) * Math.cos(a), lng: center.lng + (km / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a),
      window_start: start.toISOString(), window_end: end.toISOString(), service_minutes: 20,
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
  async routes(from, to) { return ensureDemo().filter((r) => r.day >= from && r.day <= to).map((r) => ({ ...r, stops: [...r.stops].sort((a, b) => a.position - b.position) })); },
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
  async markArrived(stopId) { const [, s] = findStop(stopId); s.status = 'arrived'; s.arrived_at = new Date().toISOString(); emit(); },
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
    }
    finishIfDone(r); emit();
  },
  async addStop(day, address, at) {
    let r = ensureDemo().find((x) => x.day === day);
    if (!r) { r = { id: `r${seq++}`, day, status: 'planned', stops: [] }; ensureDemo().push(r); }
    if (r.status === 'completed') r.status = 'active';
    r.stops.push({
      id: `s${seq++}`, route_id: r.id, position: (Math.max(0, ...r.stops.map((x) => x.position))) + 1,
      status: r.status === 'active' ? 'queued' : 'scheduled', customer_name: 'New stop', customer_phone: null,
      address, lat: at.lat, lng: at.lng, window_start: null, window_end: null, service_minutes: 20, notes: null,
      eta: null, arrived_at: null, marked_at: null, departed_at: null,
    });
    emit();
  },
  async updateAddress(stopId, address, at) { const [, s] = findStop(stopId); s.address = address; s.lat = at.lat; s.lng = at.lng; emit(); },
  async reportLocation(p) {
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
};

export const backend: Backend = OFFLINE_DEMO ? offlineBackend : supabaseBackend;
