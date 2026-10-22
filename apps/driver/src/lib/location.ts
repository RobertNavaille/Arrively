import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { backend } from './backend';
import { bearingDeg, distanceM } from './geo';
import type { LatLng } from './types';

export const LOCATION_TASK = 'arrively-location';

// Runs in the background on iOS while a route is active: every location the OS
// delivers is sent to the server, which detects arrivals and departures.
if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    for (const loc of data.locations) {
      try {
        await backend.reportLocation({
          lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading,
          speed: loc.coords.speed, accuracy: loc.coords.accuracy, at: new Date(loc.timestamp).toISOString(),
        });
      } catch {
        // Offline or signed out: the next fix will try again.
      }
    }
  });
}

/** Ask for "Always" permission and start background sharing (route started). */
export async function startSharing(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  if (Platform.OS === 'web') return true;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 4000,
      distanceInterval: 10,
      activityType: Location.LocationActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  }
  return true;
}

/** End of shift: stop sharing (PRV-5). */
export async function stopSharing() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function currentPosition(): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return null;
    }
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30000 });
    const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

/** A live fix: where the driver is, and their compass heading and speed when the device knows them. */
export type LivePosition = LatLng & { heading?: number | null; speed?: number | null };

const finite = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? n : null);

/** Live position for the screens (foreground). Also reports it in the browser demo. */
export function useLivePosition(enabled = true): LivePosition | null {
  const [pos, setPos] = useState<LivePosition | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // In the browser, watch with the Geolocation API directly. expo-location's
    // web watcher files each update under the browser's watch id rather than
    // its own, so unless the two happen to match (they did in Chrome tests, not
    // on phones) the update is dropped and the browser watch is cleared after
    // the first fix, and the driver's position stops moving.
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        (fix) => {
          if (cancelled) return;
          const p = { lat: fix.coords.latitude, lng: fix.coords.longitude, heading: finite(fix.coords.heading), speed: finite(fix.coords.speed) };
          setPos(p);
          backend.reportLocation(p).catch(() => {});
        },
        () => { /* denied or unavailable: keep the last position */ },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
      );
      return () => { cancelled = true; navigator.geolocation.clearWatch(id); };
    }
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const first = await Location.getLastKnownPositionAsync({ maxAge: 60000 }).catch(() => null)
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (first && !cancelled) setPos({ lat: first.coords.latitude, lng: first.coords.longitude });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
        (loc) => {
          if (cancelled) return;
          setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude, heading: finite(loc.coords.heading), speed: finite(loc.coords.speed) });
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled]);
  return pos;
}

/**
 * The driver's direction of travel, degrees from north: the device's heading
 * while moving, otherwise the bearing between fixes at least 8 m apart (web
 * often has no heading). Null until they've moved.
 */
export function useTravelBearing(pos: LivePosition | null): number | null {
  const [bearing, setBearing] = useState<number | null>(null);
  const from = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!pos) return;
    if (pos.heading != null && pos.heading >= 0 && (pos.speed ?? 0) > 1) {
      setBearing(pos.heading);
      from.current = pos;
      return;
    }
    if (!from.current) { from.current = pos; return; }
    if (distanceM(from.current, pos) >= 8) {
      setBearing(bearingDeg(from.current, pos));
      from.current = pos;
    }
  }, [pos?.lat, pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return bearing;
}
