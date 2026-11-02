import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

const GLASS = isLiquidGlassAvailable();

/** Controls floating over the map: Apple's Liquid Glass, as in Apple Maps (white on iOS versions without it). */
export function FloatingSurface({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  if (!GLASS) return <View style={[{ backgroundColor: color.surface }, shadow.float, style]}>{children}</View>;
  return <GlassView glassEffectStyle="regular" isInteractive style={[{ overflow: 'hidden' }, style]}>{children}</GlassView>;
}
