import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, FlatList, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showIOSActionSheet } from '../src/lib/actionSheet';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { addDays, dayKey } from '../src/lib/geo';
import { currentPosition, stopSharing, useLivePosition } from '../src/lib/location';
import { currentStop, dayRange, useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Button, IconButton } from '../src/ui/components';
import { FloatingSurface } from '../src/ui/FloatingSurface';
import { Icon } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, space, type } from '../src/ui/theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MyDay() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile, routeFor, loading, error, refresh } = useDriverData();
  const pos = useLivePosition();
  // "Today" follows the clock, so an app left open overnight moves to the new day.
  const [today, setToday] = useState(() => new Date());
  const range = useMemo(() => dayRange(today), [today]);
  const days = useMemo(() => Array.from({ length: range.count }, (_, i) => addDays(range.start, i)), [range]);
  const [index, setIndex] = useState(range.todayIndex);
  const indexRef = useRef(index);
  indexRef.current = index;
  // One page per day; swipe sideways for the next or previous day. Each page is
  // exactly as tall as the pager, so its stops scroll inside it (browsers don't
  // stretch pages).
  const [pagerH, setPagerH] = useState(0);
  const listRef = useRef<FlatList<Date>>(null);
  // Only the driver's own swipe or tap changes the day. Scrolling the browser
  // does by itself (Safari restores the pager's old position after a reload,
  // layout can nudge it) is undone, so the app opens on today.
  const touched = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToOffset({ offset: width * indexRef.current, animated: false }), 0);
    return () => clearTimeout(t);
  }, [width]);
  const daysRef = useRef(days);
  daysRef.current = days;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (listRef.current as unknown as { getScrollableNode?: () => HTMLElement | null })?.getScrollableNode?.();
    if (!node) return;
    return sideSwipe(node, () => { touched.current = true; },
      (dir) => goToRef.current(Math.min(Math.max(indexRef.current + dir, 0), daysRef.current.length - 1)));
  }, []);

  // The week strip pages too: swiping it moves to the same weekday in the next
  // or previous week, and the day pages follow.
  const weeks = useMemo(() => Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7)), [days]);
  const week = Math.floor(index / 7);
  const stripRef = useRef<FlatList<Date[]>>(null);
  const stripTouched = useRef(false);
  const stripIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function goToWeek(w: number) {
    const i = Math.min(Math.max(w, 0), weeks.length - 1) * 7 + (indexRef.current % 7);
    if (i !== indexRef.current) goTo(i);
    else stripRef.current?.scrollToOffset({ offset: width * week, animated: true });
  }
  const goToWeekRef = useRef(goToWeek);
  goToWeekRef.current = goToWeek;
  // Keep the strip on the selected day's week, however the day changed.
  const stripPlaced = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      stripRef.current?.scrollToOffset({ offset: width * week, animated: stripPlaced.current });
      stripPlaced.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [week, width]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (stripRef.current as unknown as { getScrollableNode?: () => HTMLElement | null })?.getScrollableNode?.();
    if (!node) return;
    return sideSwipe(node, () => { stripTouched.current = true; },
      (dir) => goToWeekRef.current(Math.floor(indexRef.current / 7) + dir));
  }, []);
  // Web has no momentum-end event: act once the strip has stopped scrolling.
  function onStripScroll(x: number) {
    clearTimeout(stripIdle.current);
    stripIdle.current = setTimeout(() => {
      const w = Math.round(x / width);
      const now = Math.floor(indexRef.current / 7);
      if (w === now) return;
      if (stripTouched.current) goToWeekRef.current(w);
      // Not the driver (Safari restoring an old position): back to the selected week.
      else stripRef.current?.scrollToOffset({ offset: width * now, animated: false });
      stripTouched.current = false;
    }, 120);
  }

  // Back on the app on a new day: select the new today.
  useEffect(() => {
    const check = () => {
      if (dayKey(new Date()) === dayKey(today)) return;
      const now = new Date();
      const at = dayRange(now).todayIndex;
      setToday(now);
      setIndex(at);
      refresh();
      touched.current = false;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: width * at, animated: false }), 0);
    };
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    const timer = setInterval(check, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [today, width, refresh]);
  const day = days[index];
  const dayK = dayKey(day);
  const isToday = dayK === dayKey(today);
  const route = routeFor(dayK);
  const [menu, setMenu] = useState(false);
  // Picking a day in the strip (or a week swipe) pages to it.
  function goTo(i: number) {
    touched.current = true;
    // Jumps of more than a day skip the animation: the pages in between aren't drawn.
    const near = Math.abs(i - indexRef.current) <= 1;
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: near });
  }

  async function demoDay() {
    const here = pos ?? (await currentPosition()) ?? { lat: 41.824, lng: -71.4128 };
    try { await backend.createDemoDay(here, null); goTo(range.todayIndex); await refresh(); }
    catch (e) { showMessage('Could not create demo day', e instanceof Error ? e.message : String(e)); }
  }
  async function signOut() { await stopSharing(); await backend.signOut(); }

  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const bottomInset = useBottomInset();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2] }}>
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings and account" hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Avatar name={profile?.name ?? 'Driver'} size={36} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]} accessibilityRole="header">{day.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]}>{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}{isToday ? ' · Today' : ''}</Text>
        </View>
        <IconButton icon="more" label="More" variant="plain" onPress={() => {
          // iPhone: Apple's action sheet; elsewhere the drawn panel.
          if (!showIOSActionSheet([
            { label: 'Create a demo day around me', onPress: demoDay },
            { label: 'End shift and sign out', destructive: true, onPress: signOut },
          ], { title: backend.offline ? 'Offline demo mode' : 'Signed in' })) setMenu(true);
        }} />
      </View>

      {/* Date strip */}
      {/* Week strip, Sunday to Saturday; swipe for the next or previous week. */}
      <View>
        <FlatList
          ref={stripRef}
          data={weeks}
          horizontal
          pagingEnabled
          initialScrollIndex={week}
          initialNumToRender={weeks.length}
          getItemLayout={(_, w) => ({ length: width, offset: width * w, index: w })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(w) => dayKey(w[0])}
          extraData={{ index, routeFor, today }}
          onScroll={Platform.OS === 'web' ? (e) => onStripScroll(e.nativeEvent.contentOffset.x) : undefined}
          onMomentumScrollEnd={(e) => goToWeek(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={32}
          renderItem={({ item: wk, index: w }) => (
            <View style={{ width, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4], paddingBottom: space[3] }}>
              {wk.map((d, j) => {
                const i = w * 7 + j;
                const sel = i === index;
                const has = (routeFor(dayKey(d))?.stops.length ?? 0) > 0;
                const past = dayKey(d) < dayKey(today);
                const isTodayCell = dayKey(d) === dayKey(today);
                return (
                  <Pressable key={i} onPress={() => goTo(i)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${d.toDateString()}${isTodayCell ? ', today' : ''}`} style={{ alignItems: 'center', gap: 2, minWidth: 36 }}>
                    <Text style={[type.label, past && { color: color.controlBorder }]}>{DOW[d.getDay()]}</Text>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? (past ? color.inkMuted : color.action) : isTodayCell ? color.brandTint : 'transparent' }}>
                      <Text style={[type.bodyStrong, { color: sel ? color.onAction : isTodayCell ? color.onTint : past ? color.controlBorder : color.ink }]}>{d.getDate()}</Text>
                    </View>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: has ? (past ? color.divider : color.inkMuted) : 'transparent' }} />
                  </Pressable>
                );
              })}
            </View>
          )}
        />
      </View>

      {error ? <Text style={[type.caption, { color: color.danger, paddingHorizontal: space[4], paddingBottom: space[2] }]}>{error}</Text> : null}

      {/* Day pages: map, the day's count and its stops scroll together. */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={days}
          horizontal
          pagingEnabled
          initialScrollIndex={range.todayIndex}
          // Every day is a real page, so the browser's snapping only ever lands on
          // a day. Only the day on screen and its neighbours draw their map and list.
          initialNumToRender={days.length}
          windowSize={days.length * 2}
          extraData={{ index, routeFor, loading }}
          onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h && h !== pagerH) setPagerH(h); }}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(d) => dayKey(d)}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={Platform.OS === 'web' ? (e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (!touched.current) {
              // Not the driver: put the pager back on the selected day.
              if (i !== index) listRef.current?.scrollToOffset({ offset: width * index, animated: false });
              return;
            }
            if (i !== index) setIndex(i);
          } : undefined}
          scrollEventThrottle={64}
          renderItem={({ item, index: i }) => {
            if (Math.abs(i - index) > 1) return <View style={{ width, height: pagerH || undefined }} />;
            const k = dayKey(item);
            return (
              <View style={{ width, height: pagerH || undefined }}>
                <DayPanel route={routeFor(k)} isToday={k === dayKey(today)} driver={k === dayKey(today) ? pos : null}
                  loading={loading} onOpenStop={(st) => router.push(`/stop/${st.id}`)} bottomPad={TOOLBAR_H + bottomInset}
/>
              </View>
            );
          }}
        />
      </View>

      {/* Toolbar, floating over the bottom of the list: today's trip, and adding a stop. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4] + bottomInset }}>
            {/* Optimize week: opens its options; the sheet's Optimize week regroups and saves the week. */}
            <Pressable onPress={() => router.push('/week-options')} accessibilityRole="button" accessibilityLabel="Optimize week"
              style={({ pressed }) => pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }}>
              <FloatingSurface style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="route" size={24} color={color.action} />
              </FloatingSurface>
            </Pressable>
            <Button label="View my day" onPress={() => router.push('/trip')} style={{ flex: 1 }} />
            <IconButton icon="plus" label="Add stop" onPress={() => router.push('/new-stop')} />
      </View>

      <Menu visible={menu} onClose={() => setMenu(false)} offline={backend.offline} onDemo={() => { setMenu(false); demoDay(); }}
        onSignOut={() => { setMenu(false); signOut(); }} />
    </SafeAreaView>
  );
}

// Trackpad and mouse wheel on a pager: one sideways swipe moves exactly one
// page. The browser's own snapping re-snaps after every small trackpad
// movement, so on wide screens a swipe never reached the next page. Vertical
// scrolling is left alone so the stop list scrolls normally.
function sideSwipe(node: HTMLElement, onInput: () => void, step: (dir: 1 | -1) => void) {
  const events = ['touchstart', 'pointerdown', 'keydown'] as const;
  events.forEach((e) => node.addEventListener(e, onInput, { passive: true }));
  let sum = 0, locked = false, idle: ReturnType<typeof setTimeout> | undefined;
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    onInput();
    clearTimeout(idle);
    idle = setTimeout(() => { sum = 0; locked = false; }, 250); // the gesture (and its momentum) has ended
    if (locked) return;
    sum += e.deltaX;
    if (Math.abs(sum) < 30) return;
    locked = true;
    step(sum > 0 ? 1 : -1);
  };
  node.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    events.forEach((e) => node.removeEventListener(e, onInput));
    node.removeEventListener('wheel', onWheel);
    clearTimeout(idle);
  };
}

const TOOLBAR_H = 88;
// Each stop row has the same height.
const ROW_H = 68;

/** A day's page: its map, how many stops, then the stops. */
function DayPanel({ route, isToday, driver, onOpenStop, loading, bottomPad }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; onOpenStop: (s: Stop) => void; loading: boolean;
  bottomPad: number;
}) {
  const stops = route?.stops ?? [];
  const current = currentStop(route);
  const remaining = stops.filter((s) => !isDone(s));
  const done = stops.length - remaining.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const count = route?.status === 'completed' ? plural(stops.length, 'stop', 'stops')
    : done ? plural(remaining.length, 'stop left', 'stops left') : plural(stops.length, 'stop', 'stops');
  const countMeta = (route?.status === 'completed' ? `${stops.filter((s) => s.status === 'completed').length} completed`
    : done ? `${done} done` : '');
  const mapStops: MapStop[] = stops.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    // The next stop stands out only once the trip is under way.
    state: isDone(s) ? 'done' : route?.status === 'active' && s.id === current?.id ? 'next' : 'upcoming',
  }));
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPad }}>
      <View style={{ paddingHorizontal: space[4] }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <RouteMap height={190} stops={mapStops} driver={isToday ? driver : null} />
        </View>
      </View>
      {!stops.length ? (
        <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[6], gap: space[2] }}>
          <Icon name="route" size={28} color={color.inkMuted} />
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, textAlign: 'center' }]}>
            {loading ? 'Loading…' : 'No stops this day. Tap + to add one.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingTop: space[6], paddingBottom: space[4] }}>
            <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]}>{count}</Text>
            {countMeta ? <Text style={[type.body, { color: color.inkMuted, flexShrink: 1, textAlign: 'right' }]}>{countMeta}</Text> : null}
          </View>
          <View accessibilityRole="list" style={{ paddingHorizontal: space[4] }}>
            {stops.map((s) => (
              <StopListRow key={s.id} stop={s} isCurrent={route?.status === 'active' && s.id === current?.id} onPress={() => onOpenStop(s)} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** A stop on the day, styled like the trip's stop list: name and address (gray once done). No markers or dividers. */
function StopListRow({ stop, isCurrent, onPress }: { stop: Stop; isCurrent: boolean; onPress: () => void }) {
  const done = isDone(stop);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}`}
      style={({ pressed }) => [{ height: ROW_H }, pressed && { opacity: 0.6 }]}>
      <Text style={{ fontFamily: font.semibold, fontSize: 18, lineHeight: 26, color: done ? color.inkMuted : color.ink }} numberOfLines={1} maxFontSizeMultiplier={1}>{stop.customer_name}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }} numberOfLines={1} maxFontSizeMultiplier={1}>
        {stop.address.split(',')[0]}{stop.notes ? ` · ${stop.notes}` : ''}
      </Text>
    </Pressable>
  );
}

function Menu({ visible, onClose, onDemo, onSignOut, offline }: {
  visible: boolean; onClose: () => void; onDemo: () => void; onSignOut: () => void; offline: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: color.scrim, justifyContent: 'flex-end' }} onPress={onClose}>
        <View style={{ backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: space[8], gap: space[2] }}>
          <Text style={[type.caption, { textAlign: 'center' }]}>{offline ? 'Offline demo mode' : 'Signed in'}</Text>
          <Button variant="secondary" icon="route" label="Create a demo day around me" onPress={onDemo} />
          <Button variant="text" label="End shift and sign out" onPress={onSignOut} />
        </View>
      </Pressable>
    </Modal>
  );
}

