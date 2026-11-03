import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, dayKey } from '../lib/geo';
import { IconButton } from './components';
import { color, font, radius, space, type } from './theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A month of days to pick one from (a stop's date). Days before `from` can't be
 * picked. Opens on the picked day's month, else `from`'s.
 */
export function MonthCalendar({ value, from, onPick }: { value: string | null; from: Date; onPick: (day: string) => void }) {
  const start = value ? new Date(`${value}T12:00:00`) : from;
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1, 12));
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const fromKey = dayKey(from);
  const canGoBack = month.getFullYear() > from.getFullYear() || (month.getFullYear() === from.getFullYear() && month.getMonth() > from.getMonth());
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1, 12));

  return (
    <View style={{ padding: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: color.divider, gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[type.heading, { flex: 1, paddingLeft: space[1] }]} accessibilityRole="header">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        {canGoBack ? <IconButton icon="back" label="Previous month" variant="plain" onPress={() => shift(-1)} /> : null}
        <View style={{ transform: [{ scaleX: -1 }] }}>
          <IconButton icon="back" label="Next month" variant="plain" onPress={() => shift(1)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {DOW.map((d, i) => <Text key={i} style={[type.label, { flex: 1, textAlign: 'center' }]}>{d}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 40 }} />;
            const k = dayKey(d);
            const past = k < fromKey;
            const sel = k === value;
            const isToday = k === fromKey;
            return (
              <Pressable key={i} disabled={past} onPress={() => onPick(k)} accessibilityRole="button"
                accessibilityState={{ selected: sel, disabled: past }}
                accessibilityLabel={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (isToday ? ', today' : '')}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: sel ? color.action : isToday ? color.brandTint : 'transparent' }}>
                  <Text style={{ fontFamily: sel || isToday ? font.semibold : font.regular, fontSize: 15,
                    color: sel ? color.onAction : isToday ? color.onTint : past ? color.controlBorder : color.ink }}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
