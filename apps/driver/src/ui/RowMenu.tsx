import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { color, font, radius, shadow, space } from './theme';

/** `sfSymbol`: the SF Symbol in Apple's menu on iPhone (menus use the outline symbols). */
export interface RowMenuItem { label: string; icon: IconName; sfSymbol?: string; onPress: () => void; destructive?: boolean }

const MENU_W = 240;
const ITEM_H = 48;

/**
 * Press and hold a row for a small menu of actions beside it. On iPhone this is
 * Apple's own context menu (RowMenu.ios.tsx); here (web, Android) it's drawn:
 * a card just under the row (or above it, near the bottom of the screen).
 */
export function RowMenu({ children, items, label }: { children: ReactNode; items: RowMenuItem[]; label: string }) {
  const ref = useRef<View>(null);
  const { height } = useWindowDimensions();
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }));
  const menuH = items.length * ITEM_H;
  const below = at ? at.y + at.h + space[1] + menuH < height - space[4] : true;
  return (
    <>
      <Pressable ref={ref} onLongPress={open} delayLongPress={400} accessibilityHint="Press and hold for options"
        accessibilityActions={items.map((it, i) => ({ name: `a${i}`, label: it.label }))}
        onAccessibilityAction={(e) => items[Number(e.nativeEvent.actionName.slice(1))]?.onPress()}
        accessibilityLabel={label}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
      <Modal transparent visible={!!at} animationType="fade" onRequestClose={() => setAt(null)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} onPress={() => setAt(null)} accessibilityLabel="Close menu" />
        {at ? (
          <View accessibilityRole="menu" style={[styles.menu, shadow.float, {
            left: Math.max(space[4], at.x + at.w - MENU_W),
            top: below ? at.y + at.h + space[1] : at.y - menuH - space[1],
          }]}>
            {items.map((it, i) => (
              <Pressable key={it.label} accessibilityRole="menuitem" onPress={() => { setAt(null); it.onPress(); }}
                style={({ pressed }) => [styles.item, i < items.length - 1 && styles.divider, pressed && { backgroundColor: color.surfaceMuted }]}>
                <Text style={[styles.label, it.destructive && { color: color.danger }]}>{it.label}</Text>
                <Icon name={it.icon} size={18} color={it.destructive ? color.danger : color.ink} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', width: MENU_W, borderRadius: radius.md, backgroundColor: color.surface, overflow: 'hidden' },
  item: { height: ITEM_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  label: { fontFamily: font.regular, fontSize: 16, color: color.ink },
});
