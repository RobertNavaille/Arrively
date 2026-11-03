import { Button, HStack, Host, Image, ProgressView, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as disabledMod, font, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useState } from 'react';
import { View } from 'react-native';
import type { NativeButtonProps, NativeIconButtonProps } from './NativeButton';
import { SF_SYMBOLS } from './sfSymbols';
import { color } from './theme';

export type { NativeButtonProps, NativeIconButtonProps };

// iPhone: Apple's own SwiftUI buttons (press highlight, disabled look,
// VoiceOver), in Liquid Glass where the iPhone has it, in Arrively's colors,
// Poppins, and the same sizes as the web app's buttons.
const GLASS = isLiquidGlassAvailable();
type SwiftStyle = 'borderedProminent' | 'bordered' | 'borderless' | 'glass' | 'glassProminent';
const STYLE: Record<NativeButtonProps['variant'], { style: SwiftStyle; tint: string }> = {
  primary: { style: GLASS ? 'glassProminent' : 'borderedProminent', tint: color.action },
  secondary: { style: GLASS ? 'glass' : 'bordered', tint: color.action },
  neutral: { style: GLASS ? 'glassProminent' : 'borderedProminent', tint: color.neutralFill },
  text: { style: 'borderless', tint: color.actionInk },
  danger: { style: 'borderless', tint: color.danger },
};
// The web app's heights.
const HEIGHT = { md: 56, compact: 44, sm: 32 } as const;
const FONT = { md: 16, compact: 15, sm: 13 } as const;

/**
 * Apple's button adds its own padding around the label, so the label's height
 * is corrected once after the button is drawn until the whole button is the
 * size we want. Apple's styling stays whole.
 */
function useExactSize(target: number, targetW = 0) {
  const [extra, setExtra] = useState(0);
  const [extraW, setExtraW] = useState(0);
  const onLayoutContent = (e: { nativeEvent: { height: number; width: number } }) => {
    const off = target - e.nativeEvent.height;
    if (target && Math.abs(off) > 0.5) setExtra((x) => Math.max(-target, x + off));
    const offW = targetW - e.nativeEvent.width;
    if (targetW && Math.abs(offW) > 0.5) setExtraW((x) => Math.max(-targetW, x + offW));
  };
  return { extra, extraW, onLayoutContent };
}

export function NativeButton({ label, onPress, variant, icon, size, iconOnly, disabled, loading, style }: NativeButtonProps) {
  const v = STYLE[variant];
  const h = HEIGHT[size];
  const textOnly = variant === 'text' || variant === 'danger';
  // Full-width buttons take the width they're given, measured here, since some of
  // Apple's styles (glass) size to their label; text, gray (Optimize) and round ones fit their label.
  const fill = !iconOnly && (variant === 'primary' || variant === 'secondary');
  const [boxW, setBoxW] = useState(0);
  const { extra, extraW, onLayoutContent } = useExactSize(textOnly ? 0 : h, fill ? boxW : 0);
  const sym = icon ? SF_SYMBOLS[icon].name : undefined;
  // Label size: a first guess, then corrected (above) until the whole button is the size we want.
  const labelH = textOnly ? undefined : Math.max(1, Math.round(FONT[size] * 1.3) + extra);
  const labelW = fill && boxW ? Math.max(1, Math.round(boxW - 2 * h * 0.4) + extraW) : undefined;
  const content = loading ? <ProgressView /> : (
    <HStack spacing={8}>
      {sym ? <Image systemName={sym} size={FONT[size] + 1} /> : null}
      {iconOnly ? null : <Text modifiers={[font({ family: 'Poppins_600SemiBold', size: FONT[size] })]}>{label}</Text>}
    </HStack>
  );
  const button = (
    <Host matchContents onLayoutContent={textOnly ? undefined : onLayoutContent}>
      <Button onPress={onPress} modifiers={[
        buttonStyle(v.style), controlSize('regular'), tint(v.tint),
        buttonBorderShape(iconOnly ? 'circle' : 'capsule'), disabledMod(!!disabled || !!loading),
        ...(iconOnly ? [accessibilityLabel(label)] : []),
      ]}>
        <HStack modifiers={[frame({
          ...(labelW != null ? { width: labelW } : {}),
          ...(labelH != null ? { height: labelH } : {}),
          ...(iconOnly && labelH != null ? { width: labelH } : {}),
        })]}>{content}</HStack>
      </Button>
    </Host>
  );
  if (!fill) return <View style={style}>{button}</View>;
  // The space this button may fill (a column's width, or its share of a row).
  return (
    <View style={[{ alignSelf: 'stretch', alignItems: 'center' }, style]}
      onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w !== boxW) setBoxW(w); }}>
      {boxW ? button : <View style={{ height: h }} />}
    </View>
  );
}

// Round icon buttons: call and text (tinted glass), More and back (glass), and solid ones.
const ICON_STYLE: Record<NativeIconButtonProps['variant'], { style: SwiftStyle; tint: string }> = {
  tint: { style: GLASS ? 'glass' : 'bordered', tint: color.action },
  solid: { style: GLASS ? 'glassProminent' : 'borderedProminent', tint: color.action },
  plain: { style: GLASS ? 'glass' : 'borderless', tint: color.ink },
};
// The web app's sizes (plain ones are 40 there too).
const DIAMETER = { md: 56, compact: 40, xl: 72 } as const;
const GLYPH = { md: 22, compact: 18, xl: 28 } as const;

export function NativeIconButton({ icon, label, onPress, variant, size }: NativeIconButtonProps) {
  const v = ICON_STYLE[variant];
  const d = variant === 'plain' ? 40 : DIAMETER[size];
  const { extra, onLayoutContent } = useExactSize(d);
  const inner = Math.max(1, Math.round(d * 0.6) + extra);
  return (
    <Host matchContents onLayoutContent={onLayoutContent}>
      <Button onPress={onPress} modifiers={[buttonStyle(v.style), buttonBorderShape('circle'), controlSize('regular'), tint(v.tint), accessibilityLabel(label)]}>
        <Image systemName={SF_SYMBOLS[icon].name} size={variant === 'plain' ? 20 : GLYPH[size]}
          modifiers={[frame({ width: inner, height: inner })]} />
      </Button>
    </Host>
  );
}
