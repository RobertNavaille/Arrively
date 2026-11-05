import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Icon, type IconName } from './Icon';
import { color, font } from './theme';

const ACTION_W = 88;

/**
 * A row that slides left to show an action behind it, as in Apple's lists.
 * The swipe is a native gesture (react-native-gesture-handler), so on iPhone
 * it works alongside the list's scrolling and the sheet around it. Swipe left
 * past the threshold and it stays open on the action; swipe back, tap the
 * action, or open another row to close it. `open` / `onOpenChange` let the
 * list keep one row open at a time.
 */
export function SwipeRow({ children, action, open, onOpenChange }: {
  children: ReactNode;
  action: { label: string; icon: IconName; onPress: () => void };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<SwipeableMethods>(null);
  // Closed from outside (another row opened, the action was used).
  useEffect(() => { if (!open) ref.current?.close(); }, [open]);

  return (
    <Swipeable ref={ref} friction={1.5} rightThreshold={ACTION_W / 2} overshootRight={false}
      onSwipeableWillOpen={() => onOpenChange(true)} onSwipeableClose={() => { if (open) onOpenChange(false); }}
      childrenContainerStyle={{ backgroundColor: color.surface }}
      renderRightActions={() => (
        <Pressable onPress={() => { ref.current?.close(); onOpenChange(false); action.onPress(); }} accessibilityRole="button" accessibilityLabel={action.label}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}>
          <Icon name={action.icon} size={20} color={color.onAction} />
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      )}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: color.action },
  actionLabel: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.onAction },
});
