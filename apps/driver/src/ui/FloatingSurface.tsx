import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

/**
 * The surface for controls that float over the map (back, where to,
 * re-center). Web and Android: white with a soft shadow. On iPhone it's
 * Apple's Liquid Glass (FloatingSurface.ios.tsx).
 */
export function FloatingSurface({ style, children, dark }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  // `dark`: a near-black, slightly see-through surface (with a blur in browsers), for more contrast over busy content.
  return <View style={[{ backgroundColor: dark ? 'rgba(28, 28, 30, 0.88)' : color.surface }, dark && ({ backdropFilter: 'blur(16px)' } as object), shadow.float, style]}>{children}</View>;
}
