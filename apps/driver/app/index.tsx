import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { fmtHours, loadWeekOptions, planWeek, takeWeekRun, type WeekOptions, type WeekPlan } from '../src/lib/weekPlan';
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
  const { profile, routes, routeFor, loading, error, refresh } = useDriverData();
  // Optimize week: the proposed week, shown in place of the real one until it's confirmed or cancelled.
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null);
  const [weekOpts, setWeekOpts] = useState<WeekOptions | null>(null);
  const [pins, setPins] = useState<Map<string, string>>(new Map());
  const [applying, setApplying] = useState(false);
  const planDay = (k: string) => weekPlan?.days.find((d) => d.day === k);
  // A day as it's shown: the proposed stops while reviewing, else the real ones.
  const shownRouteFor = useCallback((k: string): Route | undefined => {
    const pd = weekPlan?.days.find((d) => d.day === k);
    const real = routeFor(k);
    if (!pd) return real;
    return { ...(real ?? { id: `plan-${k}`, day: k, status: 'planned' as const }), stops: pd.stops } as Route;
  }, [weekPlan, routeFor]);
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
  const route = shownRouteFor(dayK);
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

  // Optimize week: plan it (with the saved options), then show it for review.
  async function runWeek(nextPins: Map<string, string> = new Map(), opts?: WeekOptions) {
    const o = opts ?? weekOpts ?? (await loadWeekOptions());
    const plan = planWeek({ routes, today, from: o.startPlace ?? pos, options: o, pins: nextPins });
    setWeekOpts(o); setPins(nextPins); setWeekPlan(plan);
    // Show the first day of the planned week (or today, if that's later).
    const first = plan.days.find((d) => d.day >= dayKey(today))?.day;
    const i = first ? days.findIndex((d) => dayKey(d) === first) : -1;
    if (i >= 0 && !weekPlan) setTimeout(() => goToRef.current(i), 0);
  }
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  // Back from the options sheet's "Optimize week": run with the new options.
  useFocusEffect(useCallback(() => {
    if (takeWeekRun()) loadWeekOptions().then((o) => runWeek(new Map(), o));
  }, [routes, pos, today])); // eslint-disable-line react-hooks/exhaustive-deps
  function togglePin(stop: Stop, day: string) {
    const next = new Map(pins);
    if (next.has(stop.id)) next.delete(stop.id); else next.set(stop.id, day);
    runWeek(next);
  }
  async function confirmWeek() {
    if (!weekPlan) return;
    setApplying(true);
    try {
      const daysToSave = weekPlan.days
        .map((d) => ({ day: d.day, stops: d.stops.filter((st) => st.status === 'scheduled' || st.status === 'queued').map((st) => st.id) }))
        .filter((d) => d.stops.length);
      await backend.applyWeek(daysToSave);
      await refresh();
      setWeekPlan(null); setPins(new Map());
    } catch (e) {
      showMessage('Could not update the week', e instanceof Error ? e.message : String(e));
    }
    setApplying(false);
  }
  const moved = weekPlan ? Object.keys(weekPlan.movedFrom).length : 0;
  const saved = weekPlan ? { min: weekPlan.before.minutes - weekPlan.after.minutes, mi: (weekPlan.before.meters - weekPlan.after.meters) / 1609.34 } : null;

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
          <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]} accessibilityRole="header">{weekPlan ? 'Optimized week' : day.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]}>{weekPlan ? day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}{isToday && !weekPlan ? ' · Today' : ''}</Text>
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
          extraData={{ index, shownRouteFor, today }}
          onScroll={Platform.OS === 'web' ? (e) => onStripScroll(e.nativeEvent.contentOffset.x) : undefined}
          onMomentumScrollEnd={(e) => goToWeek(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={32}
          renderItem={({ item: wk, index: w }) => (
            <View style={{ width, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4], paddingBottom: space[3] }}>
              {wk.map((d, j) => {
                const i = w * 7 + j;
                const sel = i === index;
                const has = (shownRouteFor(dayKey(d))?.stops.length ?? 0) > 0;
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
          extraData={{ index, shownRouteFor, pins, loading }}
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
            const pd = planDay(k);
            return (
              <View style={{ width, height: pagerH || undefined }}>
                <DayPanel route={shownRouteFor(k)} isToday={k === dayKey(today)} driver={k === dayKey(today) ? pos : null}
                  loading={loading} onOpenStop={(st) => router.push(`/stop/${st.id}`)} bottomPad={TOOLBAR_H + bottomInset}
                  summary={weekPlan && saved ? <WeekSummary saved={saved} moved={moved} /> : null}
                  planMeta={pd && pd.stops.length ? `${fmtHours(pd.minutes)}${pd.over ? ' · over hours' : ''}` : undefined}
                  emptyText={pd ? 'Free day' : undefined}
                  review={weekPlan && pd ? { movedFrom: weekPlan.movedFrom, pins, onPin: (st) => togglePin(st, k) } : undefined} />
              </View>
            );
          }}
        />
      </View>

      {/* Toolbar, floating over the bottom of the list: today's trip, and adding a stop. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4] + bottomInset }}>
        {weekPlan ? (
          <>
            <Button variant="secondary" label="Cancel" onPress={() => { setWeekPlan(null); setPins(new Map()); }} />
            <Button icon="check" label="Confirm week" onPress={confirmWeek} loading={applying} style={{ flex: 1 }} />
          </>
        ) : (
          <>
            {/* Optimize week: tap to run with the saved options; press and hold for the options. */}
            <Pressable onPress={() => runWeek()} onLongPress={() => router.push('/week-options')} delayLongPress={350}
              accessibilityRole="button" accessibilityLabel="Optimize week" accessibilityHint="Press and hold for options"
              accessibilityActions={[{ name: 'longpress', label: 'Options' }]}
              onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') router.push('/week-options'); }}
              style={({ pressed }) => pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }}>
              <FloatingSurface style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="route" size={24} color={color.action} />
              </FloatingSurface>
            </Pressable>
            <Button label="View my day" onPress={() => router.push('/trip')} style={{ flex: 1 }} />
            <IconButton icon="plus" label="Add stop" onPress={() => router.push('/new-stop')} />
          </>
        )}
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
// A stop row has a fixed height, so the pin button lines up.
const ROW_H = 68;

interface WeekReview { movedFrom: Record<string, string>; pins: Map<string, string>; onPin: (s: Stop) => void }

/** A day's page: its map, how many stops, then the stops. */
function DayPanel({ route, isToday, driver, onOpenStop, loading, bottomPad, summary, planMeta, emptyText, review }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; onOpenStop: (s: Stop) => void; loading: boolean;
  bottomPad: number;
  /** While reviewing an optimized week: the week's summary, the day's working time, and pins. */
  summary: React.ReactNode; planMeta?: string; emptyText?: string; review?: WeekReview;
}) {
  const stops = route?.stops ?? [];
  const current = currentStop(route);
  const remaining = stops.filter((s) => !isDone(s));
  const done = stops.length - remaining.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const count = route?.status === 'completed' ? plural(stops.length, 'stop', 'stops')
    : done ? plural(remaining.length, 'stop left', 'stops left') : plural(stops.length, 'stop', 'stops');
  const countMeta = planMeta ?? (route?.status === 'completed' ? `${stops.filter((s) => s.status === 'completed').length} completed`
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
      {summary}
      {!stops.length ? (
        <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[6], gap: space[2] }}>
          <Icon name="route" size={28} color={color.inkMuted} />
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, textAlign: 'center' }]}>
            {loading ? 'Loading…' : emptyText ?? 'No stops this day. Tap + to add one.'}
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
              <StopListRow key={s.id} stop={s} isCurrent={route?.status === 'active' && s.id === current?.id} onPress={() => onOpenStop(s)} review={review} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** Reviewing an optimized week: what it saves and how many stops change day. */
function WeekSummary({ saved, moved }: { saved: { min: number; mi: number }; moved: number }) {
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: space[4], marginTop: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: color.brandTint }}>
      <Icon name="route" size={24} color={color.onTint} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.onTint }}>
          {saved.min >= 5 ? `Saves ${fmtHours(saved.min)}${saved.mi >= 1 ? ` and ${Math.round(saved.mi)} miles` : ''}` : 'Your week is already well grouped'}
        </Text>
        <Text style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.onTint }}>
          {moved ? `${moved} ${moved === 1 ? 'stop moves' : 'stops move'} to a new day · their customers get a text` : 'No stops need to change day'}
        </Text>
      </View>
    </View>
  );
}

/** A stop on the day, styled like/** A stop on the day, styled like the trip's stop list: name and address (gray once done). No markers or dividers. */
function StopListRow({ stop, isCurrent, onPress, review }: { stop: Stop; isCurrent: boolean; onPress: () => void; review?: WeekReview }) {
  const done = isDone(stop);
  const from = review?.movedFrom[stop.id];
  const pinned = !!review?.pins.has(stop.id);
  const canPin = !!review && (stop.status === 'scheduled' || stop.status === 'queued');
  return (
    <View style={{ height: ROW_H, flexDirection: 'row', alignItems: 'flex-start' }}>
      <Pressable onPress={review ? undefined : onPress} disabled={!!review} accessibilityRole="button"
        accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}${from ? `, moves from ${weekday(from)}` : ''}`}
        style={({ pressed }) => [{ flex: 1, minWidth: 0 }, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text style={{ flexShrink: 1, fontFamily: font.semibold, fontSize: 18, lineHeight: 26, color: done ? color.inkMuted : color.ink }} numberOfLines={1} maxFontSizeMultiplier={1}>{stop.customer_name}</Text>
          {from ? (
            <View style={{ paddingHorizontal: space[2], paddingVertical: 1, borderRadius: radius.full, backgroundColor: color.brandTint }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 18, color: color.onTint }} maxFontSizeMultiplier={1}>From {weekday(from).slice(0, 3)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }} numberOfLines={1} maxFontSizeMultiplier={1}>
          {stop.address.split(',')[0]}{stop.notes ? ` · ${stop.notes}` : ''}
        </Text>
      </Pressable>
      {/* Reviewing an optimized week: pin a stop to the day it's shown on. */}
      {canPin ? (
        <Pressable onPress={() => review!.onPin(stop)} accessibilityRole="button" accessibilityState={{ selected: pinned }}
          accessibilityLabel={pinned ? `${stop.customer_name} is pinned to this day. Unpin` : `Pin ${stop.customer_name} to this day`}
          hitSlop={4} style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <Icon name="lock" size={20} color={pinned ? color.action : color.controlBorder} />
        </Pressable>
      ) : null}
    </View>
  );
}

const weekday = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });

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

