export type StopStatus =
  | 'scheduled' | 'queued' | 'en_route' | 'arrived'
  | 'completed' | 'no_show' | 'skipped' | 'cancelled';

export interface Stop {
  id: string;
  route_id: string;
  position: number;
  status: StopStatus;
  customer_name: string;
  customer_phone: string | null;
  address: string;
  lat: number;
  lng: number;
  window_start: string | null;
  window_end: string | null;
  service_minutes: number;
  notes: string | null;
  eta: string | null;
  eta_approx?: boolean;
  arrived_at: string | null;
  marked_at: string | null;
  departed_at: string | null;
  mark_reason?: string | null; // why it was skipped, or 'Marked away from the stop'
  marked_outside?: boolean;
  // Share trip: Start driving texts the customer their tracking link (from the driver's phone). On unless turned off.
  share_trip?: boolean;
  tracking_token?: string; // the customer's tracking page: TRACKING_BASE_URL + token
}

export interface Route {
  id: string;
  day: string; // YYYY-MM-DD
  status: 'planned' | 'active' | 'completed';
  optimized_at?: string | null; // set once the driver uses a suggested order
  drive_s?: number | null; // remaining drive time at the last ETA refresh
  // Options from Optimize route (missing on an older server: the defaults).
  round_trip?: boolean;
  avoid_highways?: boolean;
  avoid_tolls?: boolean;
  travel_mode?: 'drive' | 'walk' | 'bike';
  stops: Stop[];
}

export interface Profile {
  id: string;
  name: string;
  role: 'admin' | 'driver';
  vehicle: string | null;
  org_name: string;
  /** The number they sign in with (texted codes go here). */
  phone?: string | null;
  /** Contact email (optional; sign-in is by phone). */
  email?: string | null;
}

/** What the driver can change on the Settings screen. */
export interface ProfileEdit { name: string; email: string | null; vehicle: string | null }

export type MarkOutcome = 'completed' | 'no_show' | 'skipped' | 'deferred';

export interface LatLng { lat: number; lng: number }

export const DONE: StopStatus[] = ['completed', 'no_show', 'skipped', 'cancelled'];
export const isDone = (s: Stop) => DONE.includes(s.status);
