import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PanResponder, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, shadow } from './theme';

/**
 * A list whose rows the driver drags into a new order by their grip. The row
 * moves with the finger and the others make way as it passes their middle.
 * `hold` is set while a row is held, so a sheet around the list leaves the
 * drag alone. `fixed` rows (locked stops) have no grip and keep their place:
 * a held row passes over them.
 */
export function ReorderList<T>({ items, keyOf, onReorder, hold, fixed, renderRow }: {
  items: T[];
  keyOf: (item: T) => string;
  onReorder: (items: T[]) => void;
  hold?: MutableRefObject<boolean>;
  fixed?: (item: T) => boolean;
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
    const stays = (j: number) => !!fixed?.(list[j]);
    // The next row it can trade places with, past any fixed ones, and how far
    // away its middle is; the fixed rows between stay put.
    const target = (dir: 1 | -1) => {
      let j = i + dir, gap = 0;
      while (j >= 0 && j < list.length && stays(j)) { gap += h(j); j += dir; }
      return j >= 0 && j < list.length ? { j, mid: gap + h(j) / 2, step: gap + h(j) } : null;
    };
    const swap = (j: number) => { list = [...list]; [list[i], list[j]] = [list[j], list[i]]; i = j; };
    // Past the middle of the row below (or above): swap places with it.
    for (let t = target(1); t && offset > t.mid; t = target(1)) { swap(t.j); offset -= t.step; passed.current += t.step; }
    for (let t = target(-1); t && offset < -t.mid; t = target(-1)) { swap(t.j); offset += t.step; passed.current -= t.step; }
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
            {renderRow(item, i, fixed?.(item) ? <View style={{ width: 44 }} />
              : <Grip label={key} onStart={() => start(key)} onMove={(dy) => move(key, dy)} onEnd={end} />, isHeld)}
          </View>
        );
      })}
    </View>
  );
}

/** The ≡ grip a row is dragged by. */
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
      {[0, 1, 2].map((r) => <View key={r} style={styles.bar} />)}
    </View>
  );
}

// The grip takes touches itself on the web too (no browser scrolling from it).
// Its 44px box is centred on a row's name and address (48px of text): 2px down; the dots sit
// at its right edge, in line with the list heading's right-hand text.
const styles = StyleSheet.create({
  held: { zIndex: 2, backgroundColor: color.surface, borderRadius: radius.md, marginHorizontal: -8, paddingHorizontal: 8 },
  grip: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginTop: 2, ...({ touchAction: 'none', cursor: 'grab' } as unknown as ViewStyle) },
  bar: { width: 18, height: 2, borderRadius: 1, backgroundColor: color.inkMuted },
});
