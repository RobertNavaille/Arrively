import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, shadow } from './theme';

/**
 * A list whose rows the driver drags into a new order by their grip. The row
 * moves with the finger and the others make way as it passes their middle.
 * `hold` is set while a row is held, so a sheet around the list leaves the
 * drag alone.
 */
export function ReorderList<T>({ items, keyOf, onReorder, hold, renderRow }: {
  items: T[];
  keyOf: (item: T) => string;
  onReorder: (items: T[]) => void;
  hold?: MutableRefObject<boolean>;
  renderRow: (item: T, index: number, grip: ReactNode, held: boolean) => ReactNode;
}) {
  const heights = useRef(new Map<string, number>());
  const order = useRef(items);
  order.current = items;
  const [held, setHeld] = useState<{ key: string; offset: number } | null>(null);
  const passed = useRef(0); // how far the finger's travel has been taken up by rows swapped past

  const start = (key: string) => {
    if (hold) hold.current = true;
    passed.current = 0;
    setHeld({ key, offset: 0 });
  };
  const move = (key: string, dy: number) => {
    let list = order.current;
    let offset = dy - passed.current;
    let i = list.findIndex((x) => keyOf(x) === key);
    const h = (j: number) => heights.current.get(keyOf(list[j])) ?? 64;
    // Past the middle of the row below (or above): swap places with it.
    while (i < list.length - 1 && offset > h(i + 1) / 2) {
      const step = h(i + 1);
      list = [...list]; [list[i], list[i + 1]] = [list[i + 1], list[i]];
      i += 1; offset -= step; passed.current += step;
    }
    while (i > 0 && offset < -h(i - 1) / 2) {
      const step = h(i - 1);
      list = [...list]; [list[i], list[i - 1]] = [list[i - 1], list[i]];
      i -= 1; offset += step; passed.current -= step;
    }
    if (list !== order.current) { order.current = list; onReorder(list); }
    setHeld({ key, offset });
  };
  const end = () => {
    if (hold) hold.current = false;
    setHeld(null);
  };

  return (
    <View>
      {items.map((item, i) => {
        const key = keyOf(item);
        const isHeld = held?.key === key;
        return (
          <View key={key} onLayout={(e) => { heights.current.set(key, e.nativeEvent.layout.height); }}
            style={isHeld ? [styles.held, shadow.float, { transform: [{ translateY: held!.offset }] }] : undefined}>
            {renderRow(item, i, <Grip label={key} onStart={() => start(key)} onMove={(dy) => move(key, dy)} onEnd={end} />, isHeld)}
          </View>
        );
      })}
    </View>
  );
}

/** The ⠿ grip a row is dragged by. */
function Grip({ onStart, onMove, onEnd }: { label: string; onStart: () => void; onMove: (dy: number) => void; onEnd: () => void }) {
  const calls = useRef({ onStart, onMove, onEnd });
  calls.current = { onStart, onMove, onEnd };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => calls.current.onStart(),
    onPanResponderMove: (_, g) => calls.current.onMove(g.dy),
    onPanResponderRelease: () => calls.current.onEnd(),
    onPanResponderTerminate: () => calls.current.onEnd(),
    // Once a row is held, nothing else (the sheet, the list) takes the drag.
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <View {...pan.panHandlers} style={styles.grip} accessibilityLabel="Drag to reorder" accessibilityRole="adjustable">
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 5 }}>
          <View style={styles.dot} /><View style={styles.dot} />
        </View>
      ))}
    </View>
  );
}

// The grip takes touches itself on the web too (no browser scrolling from it).
const styles = StyleSheet.create({
  held: { zIndex: 2, backgroundColor: color.surface, borderRadius: radius.md, marginHorizontal: -8, paddingHorizontal: 8 },
  grip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: -6, ...({ touchAction: 'none', cursor: 'grab' } as unknown as ViewStyle) },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.inkMuted },
});
