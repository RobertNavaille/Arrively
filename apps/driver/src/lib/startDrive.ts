import { backend } from './backend';
import { showMessage } from './dialog';
import { enableCompass, startSharing } from './location';
import type { Route, Stop } from './types';

/**
 * Starts the drive to `stop`. The first drive of the day starts the route
 * too: location sharing and the customers' texts begin here.
 */
export async function beginDrive(route: Route, stop: Stop, refresh: () => Promise<unknown> | void) {
  // Asked from this tap: iPhone browsers share the compass only once allowed.
  await enableCompass();
  if (route.status === 'planned') {
    await backend.startRoute(route.id);
    const ok = await startSharing();
    if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
  }
  await backend.startTrip(stop.id);
  await refresh();
}
