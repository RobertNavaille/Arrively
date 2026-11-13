import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;
import { NATIVE_CHROME } from '../ui/nativeChrome';

/**
 * iPhone: the Schedule's day sheet is Apple's sheet (app/day-sheet.tsx). A
 * full screen (the trip, a stop, Settings) opened while it's up would open
 * inside that sheet, stacked in layers. So the sheet is closed first, the
 * Schedule opens the screen (see NativeDaySheet in app/index.tsx), and the
 * sheet comes back when the driver returns to the Schedule.
 * Web and Android: the screen just opens (`replace`: in place of this one).
 */
let pending: string | null = null;

export function openOverSchedule(router: Router, path: string, opts: { replace?: boolean } = {}) {
  if (!NATIVE_CHROME) {
    if (opts.replace) router.replace(path as never); else router.push(path as never);
    return;
  }
  pending = path;
  router.dismissTo('/');
}

/** The screen waiting to open once the Schedule is back on screen (once). */
export function takePendingScreen(): string | null {
  const p = pending;
  pending = null;
  return p;
}
