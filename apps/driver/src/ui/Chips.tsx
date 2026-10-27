import { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { color, font, radius, shadow, space } from './theme';

/**
 * Selection chips (Optimize route's options). A toggle chip turns an option on
 * or off; a select chip shows the chosen value and opens a single-select menu.
 */
export function ToggleChip({ label, selected, disabled, onPress }: {
  label: string; selected: boolean; disabled?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="switch"
      accessibilityState={{ checked: selected, disabled: !!disabled }} accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, selected && styles.on, disabled && styles.disabled, pressed && { opacity: 0.8 }]}>
      {selected ? <Icon name="check" size={16} color={color.onTint} strokeWidth={2.25} /> : null}
      <Text style={[styles.label, selected && { color: color.onTint }]}>{label}</Text>
    </Pressable>
  );
}

export function SelectChip<T extends string>({ label, value, options, onChange }: {
  /** What's being chosen, read out with the value ("Vehicle type: Drive"). */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const chip = useRef<View>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  // The menu opens just under the chip, over everything (the sheet would clip it).
  // Kept on screen when the chip sits near the right edge.
  const open = () => chip.current?.measureInWindow((x, y, _w, h) =>
    setAt({ x: Math.max(space[4], Math.min(x, Dimensions.get('window').width - MENU_W - space[4])), y: y + h + 4 }));
  return (
    <>
      <Pressable ref={chip} onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${current.label}`}
        accessibilityState={{ expanded: !!at }}
        style={({ pressed }) => [styles.chip, styles.on, pressed && { opacity: 0.8 }]}>
        <Text style={[styles.label, { color: color.onTint }]}>{current.label}</Text>
        <Icon name="chevronDown" size={16} color={color.onTint} strokeWidth={2.25} />
      </Pressable>
      <Modal transparent visible={!!at} animationType="fade" onRequestClose={() => setAt(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Close menu" />
        {at ? (
          <View style={[styles.menu, shadow.float, { left: at.x, top: at.y }]} accessibilityRole="menu" accessibilityLabel={label}>
            {options.map((o) => (
              <Pressable key={o.value} accessibilityRole="menuitem" accessibilityState={{ selected: o.value === value }}
                onPress={() => { setAt(null); if (o.value !== value) onChange(o.value); }}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: color.surfaceMuted }]}>
                <Text style={[styles.itemLabel, o.value === value && { fontFamily: font.semibold }]}>{o.label}</Text>
                {o.value === value ? <Icon name="check" size={20} color={color.action} strokeWidth={2.25} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const MENU_W = 180;

// 36px chips: smaller than buttons, still easy to hit; selected ones take the brand tint.
const styles = StyleSheet.create({
  chip: {
    height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.full,
    borderWidth: 1, borderColor: color.divider, backgroundColor: color.surface,
  },
  on: { backgroundColor: color.brandTint, borderColor: color.brandTint },
  disabled: { opacity: 0.4 },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.ink },
  menu: { position: 'absolute', width: MENU_W, paddingVertical: space[1], borderRadius: radius.md, backgroundColor: color.surface },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 48, paddingHorizontal: space[4] },
  itemLabel: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: color.ink },
});
