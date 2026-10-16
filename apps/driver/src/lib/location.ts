import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { backend } from './backend';
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

/** Live position for the screens (foreground). Also reports it in the browser demo. */
export function useLivePosition(enabled = true): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
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
          const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setPos(p);
          if (Platform.OS === 'web') backend.reportLocation(p).catch(() => {});
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled]);
  return pos;
}
