import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Room taken by Safari's floating address bar on iOS 26 and later, which sits
// over the bottom of the page (the page runs underneath it). Safari doesn't
// report it, so this is its usual size: the bar plus its gap and the home
// indicator below it.
const IOS26_SAFARI_BAR = 92;

function floatingBarRoom(): number {
  if (typeof navigator === 'undefined') return 0;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && /Mobile/.test(ua));
  const safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const version = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
  // Added to the Home Screen there's no address bar.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && safari && version >= 26 && !standalone ? IOS26_SAFARI_BAR : 0;
}

/**
 * How much of the bottom of the window is covered (home indicator, browser
 * toolbars), so buttons can sit just above it: the safe-area inset, what the
 * browser reports as outside its visible viewport, and on iOS 26+ Safari the
 * floating address bar.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const [web, setWeb] = useState(() => (Platform.OS === 'web' ? floatingBarRoom() : 0));
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const measure = () => {
      const hidden = vv ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))) : 0;
      setWeb(Math.max(hidden, floatingBarRoom()));
    };
    measure();
    vv?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => { vv?.removeEventListener('resize', measure); window.removeEventListener('resize', measure); };
  }, []);
  return Math.max(insets.bottom, web);
}
