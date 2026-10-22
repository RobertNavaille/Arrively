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
  /** Bands covered by other UI (a sheet over the map): the points are framed in what's left. */
  inset?: { top?: number; bottom?: number };
  /**
   * Navigation view: keep the driver in the middle of the uncovered part at
   * street level, moving with them, instead of framing every point.
   */
  follow?: boolean;
  /** While following: the direction of travel (degrees from north), shown as up. */
  bearing?: number;
  /** Which way the driver is facing, degrees from north: a pointer on their dot. */
  driverHeading?: number | null;
  /** The driver dragged or turned the map by hand (so following can stand aside). Zooming keeps following. */
  onUserMove?: () => void;
  /** Leave the camera where the driver put it: no reframing (after they took over from following). */
  hold?: boolean;
}

/** Close street-level zoom for following the driver. */
export const FOLLOW_ZOOM = 17.5;

// The driver is kept in view only when near the stops; a driver far away
// (still at home, another city) would shrink the stops into a cluster.
const NEAR_KM = 25;

/** The points a map should frame: every stop, plus the pin and driver when they're near. */
export function framePoints({ stops = [], pin, driver }: Pick<RouteMapProps, 'stops' | 'pin' | 'driver'>): LatLng[] {
  const must: LatLng[] = [...stops, ...(pin ? [pin] : [])];
  if (!driver) return must;
  if (!must.length) return [driver];
  const lat = must.reduce((a, p) => a + p.lat, 0) / must.length;
  const lng = must.reduce((a, p) => a + p.lng, 0) / must.length;
  const km = Math.hypot((driver.lat - lat) * 111, (driver.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180));
  return km <= NEAR_KM ? [...must, driver] : must;
}

/**
 * Stop markers carry no numbers; size and fill show the state. Finished stops
 * are drawn first so upcoming and next stops sit on top.
 */
export const MARKER = {
  next: { size: 24, ring: 3 },
  upcoming: { size: 18, ring: 3 },
  done: { size: 12, ring: 2 },
} as const;
const ORDER = { done: 0, upcoming: 1, next: 2 } as const;
export const byDrawOrder = (stops: MapStop[]) => [...stops].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
