import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { addDays, dayKey, fmtTime } from '../src/lib/geo';
import { currentPosition, stopSharing, useLivePosition } from '../src/lib/location';
import { searchAddress, type Place } from '../src/lib/mapbox';
import { currentStop, dayRange, useActiveTrip, useDriverData } from '../src/lib/store';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Button, IconButton } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { TripBar } from '../src/ui/TripBar';
import { bareInput, color, font, radius, shadow, space, type } from '../src/ui/theme';

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
  // Each day page is exactly as tall as the pager, so its stop list scrolls
  // inside it instead of running off the bottom (browsers don't stretch pages).
  const [pagerH, setPagerH] = useState(0);
  const listRef = useRef<FlatList<Date>>(null);
  // Only the driver's own swipe or tap changes the day. Scrolling the browser
  // does by itself (Safari restores the pager's old position after a reload,
  // layout can nudge it) is undone, so the app opens on today.
  const touched = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToOffset({ offset: width * index, animated: false }), 0);
    return () => clearTimeout(t);
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps
  const indexRef = useRef(index);
  indexRef.current = index;
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
  // Address search for adding a stop; it sits at the top of each day page and closes when the day changes.
  const [q, setQ] = useState('');
  const found = useAddressSearch(q, pos);
  useEffect(() => { setQ(''); }, [index]);
  function goTo(i: number) {
    touched.current = true;
    // Jumps of more than a day skip the animation: the pages in between aren't drawn.
    const near = Math.abs(i - indexRef.current) <= 1;
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: near });
  }
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const current = currentStop(route);
  const trip = useActiveTrip();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2] }}>
        <Avatar name={profile?.name ?? 'Driver'} size={36} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.heading}>{day.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={type.caption}>{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}{isToday ? ' · Today' : ''}</Text>
        </View>
        <IconButton icon="more" label="More" variant="plain" onPress={() => setMenu(true)} />
      </View>

      {/* Date strip */}
      {/* Week strip, Sunday to Saturday; swipe for the next or previous week. */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: color.divider }}>
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

      {/* Day pages: search, map, summary and stops scroll together */}
      <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={days}
            horizontal
            pagingEnabled
            initialScrollIndex={range.todayIndex}
            // Every day is a real page, so the browser's snapping only ever lands on
            // a day (stand-in spacers for undrawn days made iOS jump weeks back).
            // Only the day on screen and its neighbours draw their map and list.
            initialNumToRender={days.length}
            windowSize={days.length * 2}
            extraData={index}
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
              // A weekday alone is clear within a week of today; further out it gets the date.
              const label = k === dayKey(today) ? 'today'
                : Math.abs(item.getTime() - today.getTime()) < 6.5 * 86400000 ? item.toLocaleDateString('en-US', { weekday: 'long' })
                : item.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <View style={{ width, height: pagerH || undefined }}>
                  <DayPanel route={routeFor(k)} isToday={k === dayKey(today)} driver={k === dayKey(today) ? pos : null}
                    onOpenStop={(s) => router.push(`/stop/${s.id}?view=details`)} loading={loading}
                    search={
                      <SearchHeader label={label} q={k === dayK ? q : ''} setQ={setQ} {...found}
                        onPick={(p) => {
                          // Picking an address opens New stop for the name, notes and a last check of the address.
                          setQ('');
                          router.push({ pathname: '/new-stop', params: { day: k, name: p.name, detail: p.detail, lat: String(p.lat), lng: String(p.lng) } });
                        }} />
                    } />
                </View>
              );
            }}
          />
      {/* Footer: while a trip is under way, the trip bar on every day; otherwise Start trip on today. */}
          <View>
            {q.trim() ? <Pressable accessibilityLabel="Close search" onPress={() => setQ('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim, zIndex: 2 }} /> : null}
            {error ? <Text style={[type.caption, { color: color.danger, paddingHorizontal: space[4], paddingTop: space[2] }]}>{error}</Text> : null}
            {trip ? <TripBar route={trip} /> : (
              <View style={{ padding: space[4], paddingBottom: space[6], borderTopWidth: 1, borderTopColor: color.divider }}>
                {isToday && current ? (
                  <Button label="Start trip" onPress={() => router.push('/trip')} />
                ) : (
                  <Text style={[type.body, { color: color.inkMuted, textAlign: 'center', paddingVertical: space[3] }]}>
                    {footerText(route, day, today)}
                  </Text>
                )}
              </View>
            )}
          </View>
      </View>

      <Menu visible={menu} onClose={() => setMenu(false)} offline={backend.offline} onDemo={async () => {
        setMenu(false);
        const here = pos ?? (await currentPosition()) ?? { lat: 41.824, lng: -71.4128 };
        try { await backend.createDemoDay(here, null); goTo(range.todayIndex); await refresh(); }
        catch (e) { showMessage('Could not create demo day', e instanceof Error ? e.message : String(e)); }
      }} onSignOut={async () => { setMenu(false); await stopSharing(); await backend.signOut(); }} />
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

function footerText(route: Route | undefined, day: Date, today: Date) {
  if (!route || route.stops.length === 0) return 'No stops this day';
  if (route.status === 'completed') {
    const last = [...route.stops].sort((a, b) => (b.marked_at ?? '').localeCompare(a.marked_at ?? ''))[0];
    return `Route finished${last?.marked_at ? ` at ${fmtTime(last.marked_at)}` : ''}`;
  }
  if (day > today) return 'Starts on the day';
  return 'This route was not finished';
}

function DayPanel({ route, isToday, driver, onOpenStop, loading, search }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; onOpenStop: (s: Stop) => void; loading: boolean;
  search: React.ReactNode;
}) {
  const stops = route?.stops ?? [];
  const current = currentStop(route);
  const remaining = stops.filter((s) => !isDone(s));
  const done = stops.length - remaining.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // Stops only: the order, drive time and route line live in the Trip screen.
  const count = route?.status === 'completed' ? plural(stops.length, 'stop', 'stops')
    : done ? plural(remaining.length, 'stop left', 'stops left') : plural(stops.length, 'stop', 'stops');
  const countMeta = route?.status === 'completed' ? `${stops.filter((s) => s.status === 'completed').length} completed`
    : done ? `${done} done` : isToday && remaining.length > 1 ? 'Order is set when you start the trip' : '';

  const mapStops: MapStop[] = stops.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    // The next stop stands out only once the trip is under way.
    state: isDone(s) ? 'done' : route?.status === 'active' && s.id === current?.id ? 'next' : 'upcoming',
  }));

  if (!stops.length) {
    return (
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {search}
        <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[6], gap: space[2] }}>
          <Icon name="route" size={28} color={color.inkMuted} />
          <Text style={[type.body, { color: color.inkMuted, textAlign: 'center' }]}>
            {loading ? 'Loading…' : 'No stops this day. Search above to add one.'}
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space[4] }}>
      {search}
      <View style={{ paddingHorizontal: space[4] }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <RouteMap height={190} stops={mapStops} driver={isToday ? driver : null} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2] }}>
        <Text style={type.heading}>{count}</Text>
        {countMeta ? <Text style={type.caption}>{countMeta}</Text> : null}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: color.divider, paddingHorizontal: space[4] }}>
        {stops.map((s, i) => (
          <StopListRow key={s.id} stop={s} isCurrent={s.id === current?.id} last={i === stops.length - 1} onPress={() => onOpenStop(s)} />
        ))}
      </View>
    </ScrollView>
  );
}

function StopListRow({ stop, isCurrent, last, onPress }: { stop: Stop; isCurrent: boolean; last: boolean; onPress: () => void }) {
  const done = isDone(stop);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: done ? color.divider : color.brand }} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{stop.customer_name}</Text>
        <Text style={type.caption} numberOfLines={1}>{stop.address}{stop.notes ? ` · ${stop.notes}` : ''}</Text>
      </View>
    </Pressable>
  );
}

function useAddressSearch(q: string, near: LatLng | null) {
  const [results, setResults] = useState<Place[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!q.trim()) { setResults([]); setErr(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAddress(q, near, ctrl.signal).then((r) => { setResults(r); setErr(null); }).catch((e) => {
        if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, near]);
  return { results, err };
}

/** The address search at the top of a day page. Results drop down over the page, which is dimmed. */
function SearchHeader({ label, q, setQ, results, err, onPick }: {
  label: string; q: string; setQ: (v: string) => void; results: Place[]; err: string | null; onPick: (p: Place) => void;
}) {
  const open = q.trim().length > 0;
  return (
    <View style={{ padding: space[4], paddingTop: space[3], paddingBottom: space[3], backgroundColor: color.surface, zIndex: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 44, paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider }}>
        <Icon name="search" size={20} color={color.inkMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder={`Add a stop to ${label}`} placeholderTextColor={color.inkMuted}
          accessibilityLabel={`Add a stop to ${label}`} autoCorrect={false}
          style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: color.ink, paddingVertical: 0 }, bareInput]} />
        {open ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8}><Icon name="close" size={16} color={color.inkMuted} /></Pressable> : null}
      </View>
      {open ? (
        <>
          {/* Dims everything under the search bar; tapping it closes the search. */}
          <Pressable accessibilityLabel="Close search" onPress={() => setQ('')}
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, height: 3000, backgroundColor: color.scrim }} />
          <View style={[{ position: 'absolute', top: '100%', left: space[4], right: space[4], backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.divider, overflow: 'hidden' }, shadow.float]}>
            {results.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" onPress={() => onPick(p)}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
                <Icon name="pin" size={20} color={color.inkMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
                  <Text style={type.caption} numberOfLines={1}>{p.detail}</Text>
                </View>
                <Text style={[type.caption, { fontFamily: font.semibold, color: color.actionInk }]}>Add to {label}</Text>
              </Pressable>
            ))}
            {!results.length || err ? (
              <Text style={[type.body, { color: err ? color.danger : color.inkMuted, padding: space[3] }]}>{err ?? 'No matching addresses'}</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
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

