import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
    const measure = () => setHidden(vv ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))) : 0);
    measure();
    vv?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => { vv?.removeEventListener('resize', measure); window.removeEventListener('resize', measure); };
  }, []);
  return Math.max(insets.bottom, hidden);
}
