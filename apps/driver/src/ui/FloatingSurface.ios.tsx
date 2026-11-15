import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

const GLASS = isLiquidGlassAvailable();

/**
 * Controls floating over the map: Apple's Liquid Glass, as in Apple Maps (white on iOS versions without it).
 * `dark`: the dark glass, for more contrast over busy content (white text on it).
 */
export function FloatingSurface({ style, children, dark }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  if (!GLASS) return <View style={[{ backgroundColor: dark ? DARK : color.surface }, shadow.float, style]}>{children}</View>;
  return <GlassView glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'auto'} isInteractive style={[{ overflow: 'hidden' }, style]}>{children}</GlassView>;
}

const DARK = 'rgba(28, 28, 30, 0.92)';
