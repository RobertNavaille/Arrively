import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, radius, space, type } from './theme';
import { Icon, type IconName } from './Icon';

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export function Button({ label, onPress, variant = 'primary', icon, size = 'md', iconOnly, disabled, loading, style }: {
  label: string; onPress?: () => void; variant?: ButtonVariant; icon?: IconName; size?: 'md' | 'sm';
  /** Round button showing just the icon; the label is still read out. */
  iconOnly?: boolean; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'primary' ? color.onAction : variant === 'secondary' ? color.onTint
    : variant === 'danger' ? color.danger : color.actionInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={iconOnly ? label : undefined}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        size === 'sm' && styles.btnSm,
        iconOnly && { width: size === 'sm' ? 32 : 44, paddingHorizontal: 0 },
        variant === 'primary' && { backgroundColor: color.action },
        variant === 'secondary' && { backgroundColor: color.brandTint },
        (variant === 'text' || variant === 'danger') && styles.btnText,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.85 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
          {iconOnly ? null : <Text style={[styles.btnLabel, size === 'sm' && { fontSize: 13 }, { color: fg }]} numberOfLines={1}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, variant = 'tint' }: {
  icon: IconName; label: string; onPress?: () => void; variant?: 'tint' | 'plain' | 'solid';
}) {
  const fg = variant === 'tint' ? color.onTint : variant === 'solid' ? color.onAction : color.ink;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [
        styles.iconBtn,
        variant === 'tint' && { backgroundColor: color.brandTint },
        variant === 'solid' && { backgroundColor: color.action },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name={icon} size={20} color={fg} />
    </Pressable>
  );
}

export type PillTone = 'info' | 'neutral' | 'warning' | 'success';
export function StatusPill({ label, tone = 'info', icon }: { label: string; tone?: PillTone; icon?: IconName }) {
  const map = {
    info: [color.brandTint, color.onTint], neutral: [color.surfaceMuted, color.inkMuted],
    warning: [color.warningTint, color.warning], success: [color.surfaceMuted, color.success],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={14} color={fg} strokeWidth={2} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StatRow({ items, compact }: { items: { value: string; label: string }[]; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: compact ? space[4] : space[6] }}>
      {items.map((it, i) => (
        <View key={i}>
          <Text style={[type.stat, compact && { fontSize: 20, lineHeight: 26 }, { fontVariant: ['tabular-nums'] }]}>{it.value}</Text>
          <Text style={[type.caption, { marginTop: 2 }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function DetailRow({ icon, primary, secondary }: { icon: IconName; primary: string; secondary?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 1 }}><Icon name={icon} size={18} color={color.inkMuted} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{primary}</Text>
        {secondary ? <Text style={type.caption}>{secondary}</Text> : null}
      </View>
    </View>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.full, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.onAction, fontFamily: font.semibold, fontSize: Math.round(size * 0.38) }}>{initials}</Text>
    </View>
  );
}

export function PersonRow({ name, subtitle, accent, onCall, onMessage }: {
  name: string; subtitle?: string; accent?: string; onCall?: () => void; onMessage?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{name}</Text>
        {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
        {accent ? <Text style={[type.caption, { fontFamily: font.medium, color: color.actionInk }]}>{accent}</Text> : null}
      </View>
      {onCall ? <IconButton icon="phone" label={`Call ${name}`} onPress={onCall} /> : null}
      {onMessage ? <IconButton icon="message" label={`Message ${name}`} onPress={onMessage} /> : null}
    </View>
  );
}

export function Banner({ tone = 'success', title, meta, icon = 'check' }: { tone?: 'success' | 'warning'; title: string; meta?: string; icon?: IconName }) {
  const warn = tone === 'warning';
  return (
    <View style={[styles.banner, warn && { backgroundColor: color.warningTint }]}>
      <Icon name={icon} size={20} color={warn ? color.warning : color.success} />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, warn && { color: color.warning }]}>{title}</Text>
        {meta ? <Text style={[type.caption, warn && { color: color.ink }]}>{meta}</Text> : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { height: 44, borderRadius: radius.full, paddingHorizontal: space[6], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  btnSm: { height: 32, paddingHorizontal: space[4] },
  btnText: { backgroundColor: 'transparent', paddingHorizontal: space[3] },
  btnLabel: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.full, alignSelf: 'flex-start' },
  pillText: { fontFamily: font.medium, fontSize: 11, lineHeight: 18, letterSpacing: 0.2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: color.surfaceMuted },
});
