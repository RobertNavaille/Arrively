import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

/**
 * The surface for controls that float over the map (back, where to,
 * re-center). Web and Android: white with a soft shadow. On iPhone it's
 * Apple's Liquid Glass (FloatingSurface.ios.tsx).
 */
export function FloatingSurface({ style, children, dark }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  // `dark`: an inverted, solid surface (near-black), for strong contrast over busy content.
  return <View style={[{ backgroundColor: dark ? color.inverseSurface : color.surface }, shadow.float, style]}>{children}</View>;
}
