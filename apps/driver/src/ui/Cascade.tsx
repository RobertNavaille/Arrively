import { Children, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const DROP = 28;

/**
 * Rows that slide down one after another, top first: `out` slides them down
 * and fades them away, `in` brings them down from just above into place.
 * Used when a route is optimized: the old order slides away and the new one
 * slides in after it. `run` false holds the rows still (before `out` starts).
 */
export function Cascade({ children, dir, run = true, onDone }: {
  children: ReactNode; dir: 'out' | 'in'; run?: boolean; onDone?: () => void;
}) {
  const rows = Children.toArray(children);
  const values = useRef<Animated.Value[]>([]);
  while (values.current.length < rows.length) values.current.push(new Animated.Value(0));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!run) return;
    // The whole cascade stays short however many rows there are (most are below the fold).
    const step = Math.min(dir === 'out' ? 30 : 45, (dir === 'out' ? 120 : 240) / Math.max(1, rows.length - 1));
    const anim = Animated.stagger(step, values.current.slice(0, rows.length).map((v) => Animated.timing(v, {
      toValue: 1, duration: dir === 'out' ? 200 : 320,
      easing: dir === 'out' ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    })));
    anim.start(({ finished }) => { if (finished) done.current?.(); });
    return () => anim.stop();
  }, [run, dir]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {rows.map((row, i) => {
        const v = values.current[i];
        const style = dir === 'out'
          ? { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, DROP] }) }] }
          : { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-DROP, 0] }) }] };
        return <Animated.View key={(row as { key?: string }).key ?? i} style={style}>{row}</Animated.View>;
      })}
    </>
  );
}
