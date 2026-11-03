import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { publishSheet } from '../lib/sheetPortal';
import type { TripSheetHostProps } from './TripSheetHost';

export type { TripSheetHostProps };

/**
 * iPhone (trial): the trip sheet is Apple's own sheet. This hands the content
 * to app/trip-sheet.tsx and presents it over the map once; it draws nothing here.
 */
export function TripSheetHost({ top, rest, resetKey, startOpen = false, bottomInset = 0, height, onOpenChange, header, children, overlay }: TripSheetHostProps) {
  const router = useRouter();
  // The latest content on every render (the sheet screen redraws from it).
  useEffect(() => {
    publishSheet({ height, top, rest, resetKey, startOpen, bottomInset, header, children, overlay: overlay ?? null, onOpenChange });
  });
  const presented = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { if (!presented.current) { presented.current = true; router.push('/trip-sheet'); } }, 0);
    return () => { clearTimeout(t); publishSheet(null); };
  }, [router]);
  return null;
}

/** Leaving the trip screen: the sheet and the map under it. */
export const TRIP_SCREENS_TO_LEAVE = 2;
