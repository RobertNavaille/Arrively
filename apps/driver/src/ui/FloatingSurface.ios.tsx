import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, shadow } from './theme';

const GLASS = isLiquidGlassAvailable();

/**
 * Controls floating over the map: Apple's Liquid Glass, as in Apple Maps (white on iOS versions without it).
 * `thick`: Apple's standard blur material instead (between thin and thick): white-ish in light mode, dark gray
 * in dark mode, frosted enough to see the content behind it move while text on it stays readable.
 */
export function FloatingSurface({ style, children, thick }: { style?: StyleProp<ViewStyle>; children?: ReactNode; thick?: boolean }) {
  if (thick) {
    // The shadow on a wrapper (the blur clips its own content to the corners); the layout on the blur itself.
    const radius = StyleSheet.flatten(style)?.borderRadius;
    return (
      <View style={[shadow.float, { borderRadius: radius }]}>
        <BlurView tint="systemMaterial" intensity={100} style={[{ overflow: 'hidden' }, style]}>{children}</BlurView>
      </View>
    );
  }
  if (!GLASS) return <View style={[{ backgroundColor: color.surface }, shadow.float, style]}>{children}</View>;
  return <GlassView glassEffectStyle="regular" isInteractive style={[{ overflow: 'hidden' }, style]}>{children}</GlassView>;
}
