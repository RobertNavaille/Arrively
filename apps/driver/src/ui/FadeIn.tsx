import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Eases its content in when it appears: a fade, with a short slide (`from` px;
 * negative slides down into place, positive up). Used where the sheet swaps
 * content as it opens and closes. With Reduce Motion on, it just appears.
 */
export function FadeIn({ children, from = 8, delay = 0, duration = 220, style }: {
  children: ReactNode; from?: number; delay?: number; duration?: number; style?: StyleProp<ViewStyle>;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    const run = (still: boolean) => {
      if (cancelled) return;
      if (still) { t.setValue(1); return; }
      Animated.timing(t, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    };
    (AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false)).then(run).catch(() => run(false));
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
