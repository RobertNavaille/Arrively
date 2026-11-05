import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ContextMenuView } from 'react-native-ios-context-menu';
import type { RowMenuItem } from './RowMenu';
import { SF_SYMBOLS } from './sfSymbols';
import { color } from './theme';

export type { RowMenuItem } from './RowMenu';

/** iPhone: nothing to host; Apple draws its menus itself. */
export function RowMenuHost({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * iPhone: Apple's own context menu (UIContextMenuInteraction, through
 * react-native-ios-context-menu), as in the Phone app: press and hold and the
 * row lifts as a rounded card, the screen blurs and dims behind it, the menu
 * springs out beside it with a haptic tap, and it all settles back on close.
 * A tap does `onPress`.
 */
export function RowMenu({ children, items, label, onPress }: { children: ReactNode; items: RowMenuItem[]; label: string; onPress?: () => void }) {
  return (
    <ContextMenuView
      menuConfig={{
        menuTitle: '',
        menuItems: items.map((it, i) => ({
          actionKey: String(i),
          actionTitle: it.label,
          icon: { type: 'IMAGE_SYSTEM', imageValue: { systemName: it.sfSymbol ?? SF_SYMBOLS[it.icon]?.name ?? 'circle' } },
          ...(it.destructive ? { menuAttributes: ['destructive' as const] } : {}),
        })),
      }}
      // The lifted row is the row itself (it has its own background: styles.card), with round corners.
      // No preview background colour: the library leaves it on the row for a while after the menu closes.
      previewConfig={{ previewType: 'DEFAULT', borderRadius: 16 }}
      onPressMenuItem={({ nativeEvent }) => items[Number(nativeEvent.actionKey)]?.onPress()}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label} accessibilityHint="Press and hold for options"
        accessibilityActions={items.map((it, i) => ({ name: `a${i}`, label: it.label }))}
        onAccessibilityAction={(e) => items[Number(e.nativeEvent.actionName.slice(1))]?.onPress()}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    </ContextMenuView>
  );
}

// The row carries its own background (the screen's color), with rounded corners and a little room
// around the text: in the list it looks the same, and it's what iOS lifts as the card when held
// (the library's preview background setting isn't applied, so without it the row lifted see-through).
const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: 16, marginHorizontal: -12, paddingHorizontal: 12, marginTop: -6, paddingTop: 6 },
});
