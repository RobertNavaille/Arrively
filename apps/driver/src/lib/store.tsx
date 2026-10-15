import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend } from './backend';
import { addDays, dayKey } from './geo';
import { isDone, type Profile, type Route, type Stop } from './types';

export const DAY_RANGE = { before: 3, after: 3 };

interface DriverData {
  profile: Profile | null;
  routes: Route[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  routeFor: (day: string) => Route | undefined;
  stopById: (id: string) => { route: Route; stop: Stop } | undefined;
}

const Ctx = createContext<DriverData | null>(null);

export function DriverDataProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const today = new Date();
      const [p, r] = await Promise.all([
        backend.profile(),
        backend.routes(dayKey(addDays(today, -DAY_RANGE.before)), dayKey(addDays(today, DAY_RANGE.after))),
      ]);
      setProfile(p);
      setRoutes(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setProfile(null); setRoutes([]); setLoading(true); return; }
    refresh();
    return backend.subscribe(() => { refresh(); });
  }, [refresh, enabled]);

  const value = useMemo<DriverData>(() => ({
    profile, routes, loading, error, refresh,
    routeFor: (day) => routes.find((r) => r.day === day),
    stopById: (id) => {
      for (const route of routes) {
        const stop = route.stops.find((s) => s.id === id);
        if (stop) return { route, stop };
      }
      return undefined;
    },
  }), [profile, routes, loading, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDriverData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('DriverDataProvider missing');
  return v;
}

/** The stop the driver should act on next: one in progress, else the first not yet done. */
export function currentStop(route: Route | undefined): Stop | undefined {
  if (!route) return undefined;
  return route.stops.find((s) => s.status === 'en_route' || s.status === 'arrived')
    ?? route.stops.find((s) => !isDone(s));
}

export function stopNumber(route: Route, stop: Stop) {
  return route.stops.findIndex((s) => s.id === stop.id) + 1;
}

export function lastMarked(route: Route | undefined): Stop | undefined {
  if (!route) return undefined;
  return [...route.stops].filter((s) => s.marked_at).sort((a, b) => (b.marked_at ?? '').localeCompare(a.marked_at ?? ''))[0];
}
