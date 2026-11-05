import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, useLongPressGesture } from 'react-native-gesture-handler';
import { FloatingSurface } from './FloatingSurface';
import { Icon, type IconName } from './Icon';
import { color, font, shadow, space } from './theme';

export interface RowMenuItem { label: string; icon: IconName; onPress: () => void; destructive?: boolean }

const MENU_W = 250;
const ITEM_H = 52;
const PAD = 8;

type Rect = { x: number; y: number; w: number; h: number };
const Ctx = createContext<((items: RowMenuItem[], at: Rect) => void) | null>(null);

/**
 * Where row menus are drawn: wrap the screen in it. The menu is drawn inside
 * the screen, not in a pop-up window (React Native's Modal), because iPhone
 * won't show a pop-up over a screen that's itself a sheet.
 */
export function RowMenuHost({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const [menu, setMenu] = useState<{ items: RowMenuItem[]; at: Rect; origin: { x: number; y: number }; h: number; w: number } | null>(null);
  const open = useCallback((items: RowMenuItem[], at: Rect) => {
    // Rows measure themselves in the window; the menu is placed in this view.
    ref.current?.measureInWindow((x, y, w, h) => setMenu({ items, at, origin: { x, y }, w, h }));
  }, []);
  let pos = null;
  if (menu) {
    const top = menu.at.y - menu.origin.y, left = menu.at.x - menu.origin.x;
    const menuH = menu.items.length * ITEM_H + PAD * 2;
    const below = top + menu.at.h + space[1] + menuH < menu.h - space[4];
    pos = { left: Math.max(space[4], Math.min(menu.w - MENU_W - space[4], left + menu.at.w - MENU_W)), top: below ? top + menu.at.h + space[1] : Math.max(space[4], top - menuH - space[1]) };
  }
  return (
    <Ctx.Provider value={open}>
      {/* Also the root for the rows' native press and hold (each sheet on iPhone needs its own). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View ref={ref} style={{ flex: 1 }} collapsable={false}>
        {children}
        {menu && pos ? (
          <>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} onPress={() => setMenu(null)} accessibilityLabel="Close menu" />
            <View accessibilityRole="menu" style={[styles.menu, shadow.float, pos]}>
              {/* Frosted (Liquid Glass on iPhone), like Apple's menus. */}
              <FloatingSurface style={StyleSheet.absoluteFill} />
              {menu.items.map((it, i) => (
                <Pressable key={it.label} accessibilityRole="menuitem" onPress={() => { setMenu(null); it.onPress(); }}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
                  <Icon name={it.icon} size={20} color={it.destructive ? color.danger : color.ink} />
                  <Text style={[styles.label, it.destructive && { color: color.danger }]}>{it.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
      </GestureHandlerRootView>
    </Ctx.Provider>
  );
}

/**
 * Press and hold a row for a small menu of actions beside it, in the style of
 * Apple's context menus: a frosted card just under the row (or above it, near
 * the bottom). A tap does `onPress` (the row's own action). Needs a RowMenuHost
 * around the screen.
 */
export function RowMenu({ children, items, label, onPress }: { children: ReactNode; items: RowMenuItem[]; label: string; onPress?: () => void }) {
  const ref = useRef<View>(null);
  const open = useContext(Ctx);
  const show = () => ref.current?.measureInWindow((x, y, w, h) => open?.(items, { x, y, w, h }));
  // The hold is iOS's own long-press recognizer (react-native-gesture-handler): React Native's
  // onLongPress never fired in these scrolling lists on iPhone, and letting go counted as a tap.
  const held = useRef(false);
  const longPress = useLongPressGesture({
    minDuration: 400, runOnJS: true,
    onActivate: () => { held.current = true; show(); },
  });
  return (
    <GestureDetector gesture={longPress}>
      <Pressable ref={ref} onPress={() => { if (held.current) { held.current = false; return; } onPress?.(); }}
        onPressIn={() => { held.current = false; }}
        accessibilityRole={onPress ? 'button' : undefined} accessibilityHint="Press and hold for options"
        accessibilityActions={items.map((it, i) => ({ name: `a${i}`, label: it.label }))}
        onAccessibilityAction={(e) => items[Number(e.nativeEvent.actionName.slice(1))]?.onPress()}
        accessibilityLabel={label}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    </GestureDetector>
  );
}

// As Apple's menus on iOS 26: a frosted card with round corners, icon then label, no dividers.
const styles = StyleSheet.create({
  menu: { position: 'absolute', width: MENU_W, paddingVertical: PAD, borderRadius: 26, overflow: 'hidden' },
  item: { height: ITEM_H, flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: PAD, paddingHorizontal: space[3], borderRadius: 18 },
  itemPressed: { backgroundColor: 'rgba(120,120,128,0.2)' },
  label: { fontFamily: font.regular, fontSize: 17, color: color.ink },
});
