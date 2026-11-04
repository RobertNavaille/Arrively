import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fmtDuration, miles } from '../lib/geo';
import type { Stop } from '../lib/types';
import { Icon } from './Icon';
import { color, font, space, type } from './theme';
import { useCountTo } from './useCountTo';

// The trip's pieces shared by the trip screen and Optimize route.

const styles = StyleSheet.create({
  // Full width under the trip totals, like the step dividers.
  totals: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -space[4], paddingHorizontal: space[8], paddingTop: space[1], paddingBottom: space[4], borderBottomWidth: 1, borderBottomColor: color.divider, marginBottom: space[1] },
});

export /** The whole trip ahead, as the sheet's heading: travel time only (no time at the stops), miles, and stops left. */
function TripTotals({ travelMin, meters, stops }: { travelMin: number; meters: number; stops: number }) {
  const total = Math.max(1, travelMin);
  const mi = miles(meters);
  // When a total changes (an option, a dragged stop) its number counts quickly to the new one.
  const t = Math.round(useCountTo(total));
  const m = useCountTo(mi);
  const n = Math.round(useCountTo(stops));
  const items = [
    t < 60 ? { value: String(t), label: 'Minutes' } : { value: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, label: 'Hours' },
    { value: mi < 10 ? m.toFixed(1) : String(Math.round(m)), label: 'Miles' },
    { value: String(n), label: n === 1 ? 'Stop' : 'Stops' },
  ];
  return (
    <View style={styles.totals} accessible accessibilityLabel={`Trip: ${fmtDuration(total)}, ${mi.toFixed(1)} miles, ${stops} ${stops === 1 ? 'stop' : 'stops'}`}>
      {items.map((it, i) => (
        <Text key={i} style={[type.stat, { fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] }]}>{it.value}
          <Text style={{ fontFamily: font.medium, fontSize: 16, color: color.inkMuted }}> {it.label}</Text></Text>
      ))}
    </View>
  );
}

export function AheadRow({ stop, detail, last, onPress, highlight, trailing, lock }: {
  stop: Stop; detail: string; last: boolean; onPress?: () => void;
  /** Moved earlier in a new order: the name is blue. */
  highlight?: boolean;
  trailing?: ReactNode;
  /** Reviewing: the circle locks the stop in place, and shows a lock while it is. */
  lock?: { on: boolean; toggle: () => void };
}) {
  const marker = lock?.on
    ? <View style={{ marginTop: 3, height: 20, alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={20} color={color.action} strokeWidth={2} /></View>
    : <View style={{ marginTop: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: color.surface, borderWidth: 3, borderColor: color.action }} />;
  const label = `${stop.customer_name}, ${detail}${highlight ? ', moved earlier' : ''}`;
  const content = (
    <>
      <View style={{ width: 20, alignItems: 'center' }}>
        {lock ? (
          <Pressable onPress={lock.toggle} hitSlop={12} accessibilityRole="button"
            accessibilityLabel={lock.on ? `Unlock ${stop.customer_name}` : `Lock ${stop.customer_name} in this place`}
            accessibilityState={{ selected: lock.on }}>
            {marker}
          </Pressable>
        ) : marker}
        {last ? null : <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: color.divider }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: 20 }}>
        {/* Draggable rows (reviewing): no text selection, which a mouse drag on the web would start. */}
        <Text selectable={!lock} style={{ fontFamily: font.semibold, fontSize: 18, lineHeight: 26, color: highlight ? color.actionInk : color.ink }}>{stop.customer_name}</Text>
        <Text selectable={!lock} style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }}>{detail}</Text>
      </View>
      {trailing}
    </>
  );
  // Without a press (reviewing) it's a plain row, so its lock button stays enabled.
  if (!onPress) return <View accessibilityLabel={label} style={{ flexDirection: 'row', gap: space[3] }}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space[3] }, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}
