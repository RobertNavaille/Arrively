import type { MutableRefObject, ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';

export interface TripSheetHostProps {
  top: number; rest: number; resetKey: string; startOpen?: boolean; bottomInset?: number;
  height: number;
  hold?: MutableRefObject<boolean>;
  onOpenChange?: (open: boolean) => void;
  header: ReactNode; children: ReactNode;
  /** Fixed over the bottom of the screen (here) or of the sheet (iPhone): bottom bar, Optimize. */
  overlay?: ReactNode;
}

/** Web and Android: the drawn sheet, with the bars over the bottom of the screen. iPhone: TripSheetHost.ios.tsx. */
export function TripSheetHost({ overlay, height: _height, ...sheet }: TripSheetHostProps) {
  return (
    <>
      <BottomSheet {...sheet} />
      {overlay}
    </>
  );
}

/** Leaving the trip screen: one step back here (the iPhone sheet is a screen of its own). */
export const TRIP_SCREENS_TO_LEAVE = 1;
