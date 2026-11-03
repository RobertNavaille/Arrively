import { useSyncExternalStore, type ReactNode } from 'react';

/**
 * Hands the trip screen's sheet content to the iPhone sheet screen
 * (app/trip-sheet.tsx), which Apple presents over the map. The trip screen
 * keeps all the state; the elements it publishes carry their own handlers.
 */
export interface SheetContent {
  /** The screen's height and the sheet's top when fully open, and how far below that it rests (px). */
  height: number; top: number; rest: number;
  /** A new step: back to where that step starts (open or resting). */
  resetKey: string; startOpen: boolean;
  bottomInset: number;
  header: ReactNode; children: ReactNode;
  /** Fixed over the bottom of the sheet: the bottom bar, Optimize / Confirm route. */
  overlay: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

let content: SheetContent | null = null;
const listeners = new Set<() => void>();

export function publishSheet(next: SheetContent | null) {
  content = next;
  listeners.forEach((l) => l());
}

export function useSheetContent(): SheetContent | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => content,
    () => content,
  );
}
