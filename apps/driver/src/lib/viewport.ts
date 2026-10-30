import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How much of the bottom of the window is covered (home indicator, browser
 * toolbars), so buttons can sit just above it: the safe-area inset and, in the
 * browser, whatever it reports as outside its visible viewport. (On iOS 26
 * Safari the visible area already ends just above the floating address bar,
 * so nothing more is needed for it.)
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    // While typing, the keyboard covers the bottom: that isn't an inset to lay out around.
    const measure = () => { if (!typing()) setHidden(vv ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))) : 0); };
    const blur = () => setTimeout(measure, 300); // once the keyboard has gone
    measure();
    vv?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    window.addEventListener('focusout', blur);
    return () => { vv?.removeEventListener('resize', measure); window.removeEventListener('resize', measure); window.removeEventListener('focusout', blur); };
  }, []);
  return Math.max(insets.bottom, hidden);
}

/** A text field has focus (on a phone, the keyboard is up). */
function typing(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/**
 * The window's height for laying out full-screen views (the map, the sheet).
 * In a phone browser the window shrinks while the keyboard is up; the layout
 * keeps its full height then, so the keyboard covers the page (and the browser
 * scrolls the field into view) instead of the sheet ending above it.
 */
export function useScreenHeight(): number {
  const [h, setH] = useState(() => Dimensions.get('window').height);
  useEffect(() => {
    const measure = () => {
      const now = Dimensions.get('window').height;
      setH((prev) => (Platform.OS === 'web' && typing() && now < prev ? prev : now));
    };
    const sub = Dimensions.addEventListener('change', measure);
    const blur = () => setTimeout(measure, 300);
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focusout', blur);
    return () => { sub.remove(); if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focusout', blur); };
  }, []);
  return h;
}
