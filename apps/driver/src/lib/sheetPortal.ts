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
  /** Stays put at the top, above what scrolls (the trip totals). */
  fixed: ReactNode;
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

/**
 * The same for the Schedule (app/index.tsx): its day sheet, presented by Apple
 * over the map on iPhone (app/day-sheet.tsx).
 */
export interface DaySheetContent {
  /** The screen's height and the sheet's top when fully open, and how far below that it rests (px). */
  height: number; top: number; rest: number;
  body: ReactNode;
  /** Fixed over the bottom of the sheet (Optimize schedule). */
  overlay: ReactNode;
  onOpenChange: (open: boolean) => void;
  /** The sheet's width: Apple's sheet is inset from the screen's edges at its lower height. */
  onWidth: (width: number) => void;
  /** Whether the day's list is scrolled to its top (a pull down there lowers the sheet). */
  atTop: { current: boolean };
  /** The sheet is back on screen (a screen opened from it has closed): the Schedule's own focus handling. */
  onFocus: () => void;
}

let dayContent: DaySheetContent | null = null;
const dayListeners = new Set<() => void>();

export function publishDaySheet(next: DaySheetContent | null) {
  dayContent = next;
  dayListeners.forEach((l) => l());
}

export function useDaySheetContent(): DaySheetContent | null {
  return useSyncExternalStore(
    (l) => { dayListeners.add(l); return () => { dayListeners.delete(l); }; },
    () => dayContent,
    () => dayContent,
  );
}
