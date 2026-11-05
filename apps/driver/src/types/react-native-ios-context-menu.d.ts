// react-native-ios-context-menu ships its TypeScript source but no built types; these are
// the parts the app uses (src/ui/RowMenu.ios.tsx). Its own source is what Metro bundles.
declare module 'react-native-ios-context-menu' {
  import type { ComponentType, ReactNode } from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';
  type Color = string | { dynamic: { light: string; dark: string } };
  export type MenuActionConfig = {
    actionKey: string;
    actionTitle: string;
    icon?: { type: 'IMAGE_SYSTEM'; imageValue: { systemName: string } };
    menuAttributes?: ('hidden' | 'disabled' | 'destructive' | 'keepsMenuPresented')[];
  };
  export type MenuConfig = { menuTitle: string; menuItems: MenuActionConfig[] };
  export const ContextMenuView: ComponentType<{
    menuConfig: MenuConfig;
    previewConfig?: { previewType?: 'DEFAULT' | 'CUSTOM'; borderRadius?: number; backgroundColor?: Color };
    onPressMenuItem?: (e: { nativeEvent: { actionKey: string; actionTitle: string } }) => void;
    isContextMenuEnabled?: boolean;
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
  }>;
}
