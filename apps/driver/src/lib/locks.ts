import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Stops the driver locked (press and hold a stop, Lock). A locked stop keeps its
 * day when the week is optimized and its place when the route is optimized.
 * Kept on the phone for now.
 */
const KEY = 'arrively.lockedStops';
let locked = new Set<string>();
const listeners = new Set<() => void>();
let loaded = false;
const load = AsyncStorage.getItem(KEY).then((v) => {
  try { const ids = JSON.parse(v ?? '[]'); if (Array.isArray(ids)) locked = new Set(ids.filter((x) => typeof x === 'string')); } catch { /* none */ }
  loaded = true;
  listeners.forEach((l) => l());
}).catch(() => { loaded = true; });

export function isLocked(id: string) { return locked.has(id); }
export function lockedIds() { return locked; }
export async function locksReady() { await load; }
export function setLocked(id: string, on: boolean) {
  const next = new Set(locked);
  if (on) next.add(id); else next.delete(id);
  locked = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
}
export const toggleLocked = (id: string) => setLocked(id, !locked.has(id));

/** The locked stops, kept current as they change. */
export function useLocks(): Set<string> {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    if (loaded) l();
    return () => { listeners.delete(l); };
  }, []);
  return locked;
}
