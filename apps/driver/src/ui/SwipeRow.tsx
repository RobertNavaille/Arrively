import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { color, font } from './theme';

const ACTION_W = 88;

/**
 * A row that slides left to show an action behind it, as in Apple's lists.
 * Swipe it left past halfway (or flick it) and it stays open on the action;
 * swipe back, tap the action, or open another row to close it. Swiping all
 * the way across does the action at once. `open` / `onOpenChange` let the list
 * keep one row open at a time.
 */
export function SwipeRow({ children, action, open, onOpenChange }: {
  children: ReactNode;
  action: { label: string; icon: IconName; onPress: () => void };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const at = useRef(0); // where the row rests: 0 closed, -ACTION_W open
  const calls = useRef({ onOpenChange, action });
  calls.current = { onOpenChange, action };

  const settle = (to: number) => {
    at.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 20 }).start();
  };
  // Closed from outside (another row opened, the list changed).
  useEffect(() => { settle(open ? -ACTION_W : 0); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    // Only a sideways drag: an up-and-down one scrolls the list.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.min(0, at.current + g.dx)),
    onPanResponderRelease: (_, g) => {
      const end = at.current + g.dx;
      // All the way across: do it now.
      if (width.current && end < -width.current * 0.6) { settle(0); calls.current.onOpenChange(false); calls.current.action.onPress(); return; }
      const opens = end < -ACTION_W / 2 || g.vx < -0.5;
      settle(opens && g.vx < 0.5 ? -ACTION_W : 0);
      calls.current.onOpenChange(opens && g.vx < 0.5);
    },
    onPanResponderTerminate: () => settle(at.current),
    onPanResponderTerminationRequest: () => false,
  })).current;

  return (
    <View onLayout={(e) => { width.current = e.nativeEvent.layout.width; }} style={{ overflow: 'hidden' }}
      accessibilityActions={[{ name: 'activate-action', label: action.label }]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate-action') action.onPress(); }}>
      {/* The action, behind the row's right end. */}
      <Pressable onPress={() => { onOpenChange(false); action.onPress(); }} accessibilityRole="button" accessibilityLabel={action.label}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}>
        <Icon name={action.icon} size={20} color={color.onAction} />
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Pressable>
      <Animated.View {...pan.panHandlers} style={[styles.row, { transform: [{ translateX: x }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Lets the page scroll up and down on the web while sideways drags slide the row.
  row: { backgroundColor: color.surface, ...({ touchAction: 'pan-y' } as unknown as ViewStyle) },
  action: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: color.action },
  actionLabel: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.onAction },
});
