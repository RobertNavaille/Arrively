import type { StyleProp, ViewStyle } from 'react-native';
import type { IconName } from './Icon';

// The iPhone's own buttons (NativeButton.ios.tsx). The web and Android never
// use these: components.tsx draws its buttons there.
export interface NativeButtonProps {
  label: string; onPress?: () => void; variant: 'primary' | 'secondary' | 'neutral' | 'text' | 'danger';
  icon?: IconName; size: 'md' | 'compact' | 'sm'; iconOnly?: boolean; disabled?: boolean; loading?: boolean;
  style?: StyleProp<ViewStyle>;
}
export interface NativeIconButtonProps {
  icon: IconName; label: string; onPress?: () => void; variant: 'tint' | 'plain' | 'solid'; size: 'md' | 'compact' | 'xl';
}
export function NativeButton(_: NativeButtonProps): null { return null; }
export function NativeIconButton(_: NativeIconButtonProps): null { return null; }
