import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

const DURATION_MS = 450;

/**
 * A number that counts quickly to `target` when it changes (the trip totals),
 * easing out as it lands. The first value shows as is; with Reduce Motion on,
 * every change does.
 */
export function useCountTo(target: number, ms = DURATION_MS): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);
  const still = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((on) => { still.current = on; }).catch(() => {});
  }, []);
  useEffect(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    const start = from.current;
    if (start === target || still.current) { from.current = target; setShown(target); return; }
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const v = start + (target - start) * (1 - (1 - k) ** 3);
      from.current = v; // a change mid-count carries on from where it is
      setShown(k < 1 ? v : target);
      frame.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [target, ms]);
  return shown;
}
