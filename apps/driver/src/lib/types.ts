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
  arrived_at: string | null;
  marked_at: string | null;
  departed_at: string | null;
}

export interface Route {
  id: string;
  day: string; // YYYY-MM-DD
  status: 'planned' | 'active' | 'completed';
  stops: Stop[];
}

export interface Profile {
  id: string;
  name: string;
  role: 'admin' | 'driver';
  vehicle: string | null;
  org_name: string;
}

export type MarkOutcome = 'completed' | 'no_show' | 'skipped' | 'deferred';

export interface LatLng { lat: number; lng: number }

export const DONE: StopStatus[] = ['completed', 'no_show', 'skipped', 'cancelled'];
export const isDone = (s: Stop) => DONE.includes(s.status);
