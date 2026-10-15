import type { LatLng } from '../lib/types';

export type MapStopState = 'next' | 'upcoming' | 'done';

export interface MapStop extends LatLng {
  id: string;
  n: number;
  state: MapStopState;
}

export interface RouteMapProps {
  height: number;
  /** Numbered stops for the day view. */
  stops?: MapStop[];
  /** A single destination pin (stop screens). */
  pin?: LatLng | null;
  pinLabel?: string;
  driver?: LatLng | null;
  /** Draws a line through these points in order. */
  line?: LatLng[];
}
