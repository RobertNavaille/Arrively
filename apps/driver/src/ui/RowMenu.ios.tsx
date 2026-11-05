import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { RowMenuItem } from './RowMenu';
import { SF_SYMBOLS } from './sfSymbols';

export type { RowMenuItem } from './RowMenu';

/**
 * iPhone: Apple's context menu. Press and hold the row: it lifts, the screen
 * blurs behind it, and the actions show beside it.
 */
export function RowMenu({ children, items, label }: { children: ReactNode; items: RowMenuItem[]; label: string }) {
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <ContextMenu>
        <ContextMenu.Items>
          {items.map((it) => (
            <Button key={it.label} label={it.label} systemImage={(it.sfSymbol ?? SF_SYMBOLS[it.icon]?.name ?? 'circle') as never}
              role={it.destructive ? 'destructive' : 'default'} onPress={it.onPress} />
          ))}
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents={{ vertical: true }}>
            <View accessibilityLabel={label} accessibilityHint="Press and hold for options">{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
