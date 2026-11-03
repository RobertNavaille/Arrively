import { Button, HStack, Host, Image, ProgressView, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as disabledMod, font, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import type { NativeButtonProps, NativeIconButtonProps } from './NativeButton';
import { SF_SYMBOLS } from './sfSymbols';
import { color } from './theme';

export type { NativeButtonProps, NativeIconButtonProps };

// iPhone: Apple's own SwiftUI buttons, with the system's press highlight,
// disabled look and haptics-ready behaviour, in Arrively's colors and type.
const STYLE = {
  primary: { style: 'borderedProminent', tint: color.action },
  secondary: { style: 'bordered', tint: color.action },
  neutral: { style: 'borderedProminent', tint: color.neutralFill },
  text: { style: 'borderless', tint: color.actionInk },
  danger: { style: 'borderless', tint: color.danger },
} as const;
const SIZE = { md: 'large', compact: 'regular', sm: 'small' } as const;
const FONT = { md: 16, compact: 15, sm: 13 } as const;

export function NativeButton({ label, onPress, variant, icon, size, iconOnly, disabled, loading, style }: NativeButtonProps) {
  const v = STYLE[variant];
  // Full-width buttons fill the space they're given; text, gray (Optimize) and round ones fit their label.
  const fill = !iconOnly && (variant === 'primary' || variant === 'secondary');
  const sym = icon ? SF_SYMBOLS[icon].name : undefined;
  const content = loading ? <ProgressView /> : (
    <HStack spacing={8}>
      {sym ? <Image systemName={sym} size={FONT[size] + 1} /> : null}
      {iconOnly ? null : <Text modifiers={[font({ family: 'Poppins_600SemiBold', size: FONT[size] })]}>{label}</Text>}
    </HStack>
  );
  return (
    <Host matchContents={fill ? { vertical: true } : true} style={[fill ? styles.fill : null, style]}>
      <Button onPress={onPress} modifiers={[
        buttonStyle(v.style), controlSize(SIZE[size]), tint(v.tint),
        buttonBorderShape(iconOnly ? 'circle' : 'capsule'), disabledMod(!!disabled || !!loading),
        ...(iconOnly ? [accessibilityLabel(label)] : []),
      ]}>
        {fill ? <HStack modifiers={[frame({ maxWidth: 10000 })]}>{content}</HStack> : content}
      </Button>
    </Host>
  );
}

// Round icon buttons: call and text (tinted), More and back (plain), and the solid ones.
const ICON_STYLE = {
  tint: { style: 'bordered', tint: color.action },
  solid: { style: 'borderedProminent', tint: color.action },
  plain: { style: 'borderless', tint: color.ink },
} as const;
const DIAMETER = { md: 56, compact: 40, xl: 72 } as const;
const GLYPH = { md: 22, compact: 18, xl: 28 } as const;

export function NativeIconButton({ icon, label, onPress, variant, size }: NativeIconButtonProps) {
  const v = ICON_STYLE[variant];
  const d = variant === 'plain' ? 44 : DIAMETER[size];
  return (
    <Host matchContents style={{ minWidth: d, minHeight: d }}>
      <Button onPress={onPress} modifiers={[buttonStyle(v.style), buttonBorderShape('circle'), controlSize('large'), tint(v.tint), accessibilityLabel(label)]}>
        {/* The glyph's frame sets the circle's size; Apple adds the padding around it. */}
        <Image systemName={SF_SYMBOLS[icon].name} size={variant === 'plain' ? 20 : GLYPH[size]}
          modifiers={[frame({ width: Math.round(d * 0.55), height: Math.round(d * 0.55) })]} />
      </Button>
    </Host>
  );
}
const styles = StyleSheet.create({ fill: { alignSelf: 'stretch' } });
