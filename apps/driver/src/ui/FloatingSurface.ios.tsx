import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

const GLASS = isLiquidGlassAvailable();

/**
 * Controls floating over the map: Apple's Liquid Glass, as in Apple Maps (white on iOS versions without it).
 * `dark`: an inverted, solid surface (near-black in light mode, near-white in dark mode) for strong contrast
 * over busy content; its text uses color.inverseInk.
 */
export function FloatingSurface({ style, children, dark }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  // Dark: a solid inverted surface, not glass. Apple's glass adapts to what's behind it, so over the list even
  // its dark version turns gray and the text on it loses its contrast.
  if (dark || !GLASS) return <View style={[{ backgroundColor: dark ? color.inverseSurface : color.surface }, shadow.float, style]}>{children}</View>;
  return <GlassView glassEffectStyle="regular" isInteractive style={[{ overflow: 'hidden' }, style]}>{children}</GlassView>;
}
