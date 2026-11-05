import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { ContextMenuView } from 'react-native-ios-context-menu';
import type { RowMenuItem } from './RowMenu';
import { SF_SYMBOLS } from './sfSymbols';

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
      // The lifted row: a white (dark: system background) rounded card, like the Phone app's.
      previewConfig={{ previewType: 'DEFAULT', borderRadius: 16, backgroundColor: { dynamic: { light: '#FFFFFF', dark: '#1C1C1E' } } }}
      onPressMenuItem={({ nativeEvent }) => items[Number(nativeEvent.actionKey)]?.onPress()}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label} accessibilityHint="Press and hold for options"
        accessibilityActions={items.map((it, i) => ({ name: `a${i}`, label: it.label }))}
        onAccessibilityAction={(e) => items[Number(e.nativeEvent.actionName.slice(1))]?.onPress()}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    </ContextMenuView>
  );
}
