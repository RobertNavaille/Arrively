import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { color, radius, shadow } from './theme';

/**
 * A sheet over a full-screen map. It rests `rest` px below `top` and opens to
 * `top` when dragged up (or flicked, or scrolled with a wheel on the web);
 * dragging down when its list is at the top closes it again. The header stays
 * put inside the sheet; the list scrolls only once the sheet is open. The map
 * above the sheet gets every touch, since nothing covers it.
 */
export function BottomSheet({ top, rest, resetKey, bottomInset = 0, header, children }: {
  top: number; rest: number; resetKey: string;
  /** Covered at the bottom of the screen: the list's end scrolls clear of it. */
  bottomInset?: number;
  header: ReactNode; children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const offset = useRef(new Animated.Value(rest)).current;
  const restRef = useRef(rest);
  restRef.current = rest;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const listAtTop = useRef(true);
  const headerH = useRef(0);
  const topRef = useRef(top);
  topRef.current = top;
  const listRef = useRef<ScrollView>(null);
  const sheetRef = useRef<View>(null);

  const snap = useCallback((toOpen: boolean) => {
    openRef.current = toOpen;
    setOpen(toOpen);
    if (!toOpen) { listRef.current?.scrollTo({ y: 0, animated: false }); listAtTop.current = true; }
    Animated.spring(offset, { toValue: toOpen ? 0 : restRef.current, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 18 }).start();
  }, [offset]);

  // A new step, or a new resting height: back to rest.
  useEffect(() => { snap(false); }, [resetKey, rest, snap]);

  const snapRef = useRef(snap);
  snapRef.current = snap;
  const start = useRef(0);
  const pan = useRef(PanResponder.create({
    // Vertical drags move the sheet. While it's open, a pull down on its header
    // closes it; on the list, only once the list is back at its top.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx)
      && (!openRef.current || (g.dy > 0 && (listAtTop.current || g.y0 - topRef.current < headerH.current))),
    onPanResponderGrant: () => { offset.stopAnimation((v) => { start.current = v; }); },
    onPanResponderMove: (_, g) => offset.setValue(Math.min(Math.max(start.current + g.dy, 0), restRef.current)),
    onPanResponderRelease: (_, g) => {
      const at = start.current + g.dy;
      snapRef.current(g.vy < -0.3 || (g.vy <= 0.3 && at < restRef.current / 2));
    },
    onPanResponderTerminate: (_, g) => snapRef.current(start.current + g.dy < restRef.current / 2),
    onPanResponderTerminationRequest: () => false,
  })).current;

  // Web: a wheel or trackpad scroll over the sheet opens and closes it too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = sheetRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!openRef.current && e.deltaY > 0) { e.preventDefault(); snapRef.current(true); }
      else if (openRef.current && e.deltaY < 0 && listAtTop.current) { e.preventDefault(); snapRef.current(false); }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <Animated.View ref={sheetRef} {...pan.panHandlers}
      style={[styles.sheet, shadow.sheet, { top, height: height - top, transform: [{ translateY: offset }] }]}>
      <View onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}>{header}</View>
      <ScrollView ref={listRef} style={[{ flex: 1 }, open ? styles.listOpen : styles.listShut]} scrollEnabled={open}
        onScroll={(e) => { listAtTop.current = e.nativeEvent.contentOffset.y <= 0; }} scrollEventThrottle={16}
        showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset }}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

// Touch handling for the browser (a web-only style, so not in React Native's types),
// in a StyleSheet, which is where react-native-web applies it from. The sheet takes
// its own drags, with no browser panning; an open list scrolls natively.
const touch = (action: 'none' | 'pan-y') => ({ touchAction: action }) as ViewStyle;
const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...touch('none'),
  },
  listOpen: touch('pan-y'),
  listShut: touch('none'),
});
