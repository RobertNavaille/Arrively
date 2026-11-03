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
  // All the days in one vertical list, each under its own heading. Scrolling past
  // a day's last stop selects the next day (header, week strip and map follow).
  const listRef = useRef<ScrollView>(null);
  // Where each day starts in the list. Headings and rows have fixed heights, so
  // the positions are worked out rather than measured (the web doesn't report
  // the layout of rows far down the list).
  const [listH, setListH] = useState(0);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const d of days) {
      out.push(y);
      const n = shownRouteFor(dayKey(d))?.stops.length ?? 0;
      y += HEADING_H + (n ? n * ROW_H : EMPTY_H);
    }
    return out;
  }, [days, shownRouteFor]);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  const dayY = (i: number) => offsetsRef.current[i] ?? null;
  // The list opens on today (asked again until the list has laid out, for the web).
  const placed = useRef(false);
  const pendingY = useRef<number | null>(null);
  function place(y: number) {
    pendingY.current = y;
    [0, 50, 150, 400, 800].forEach((ms) => setTimeout(() => {
      if (pendingY.current != null) listRef.current?.scrollTo({ y: pendingY.current, animated: false });
    }, ms));
  }
  // Once the day's stops have loaded: today at the top.
  useEffect(() => {
    if (placed.current || loading) return;
    placed.current = true;
    place(offsets[range.todayIndex] ?? 0);
  }, [loading, offsets, range.todayIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  function onListScroll(y: number) {
    if (pendingY.current != null) {
      if (Math.abs(y - pendingY.current) > 2) return;
      pendingY.current = null;
    }
    let at = 0;
    const offs = offsetsRef.current;
    for (let i = 0; i < offs.length; i++) if (offs[i] <= y + 1) at = i;
    if (at !== indexRef.current) setIndex(at);
  }

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
      placed.current = false;
      const y = dayY(at);
      if (y != null) { placed.current = true; place(y); }
    };
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    const timer = setInterval(check, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [today, refresh]);
  const day = days[index];
  const dayK = dayKey(day);
  const isToday = dayK === dayKey(today);
  const route = shownRouteFor(dayK);
  const [menu, setMenu] = useState(false);
  // Picking a day in the strip scrolls the list to it.
  function goTo(i: number) {
    const y = dayY(i);
    if (y != null) listRef.current?.scrollTo({ y, animated: Math.abs(i - indexRef.current) <= 7 });
    setIndex(i);
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
  // The selected day's stops on the map; the next one stands out once its trip is under way.
  const current = currentStop(route);
  const mapStops: MapStop[] = (route?.stops ?? []).map((st, i) => ({
    id: st.id, lat: st.lat, lng: st.lng, n: i + 1,
    state: isDone(st) ? 'done' : route?.status === 'active' && st.id === current?.id ? 'next' : 'upcoming',
  }));

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

      {/* The selected day's map stays put above the list. */}
      <View style={{ paddingHorizontal: space[4] }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <RouteMap height={190} stops={mapStops} driver={isToday ? pos : null} />
        </View>
      </View>
      {error ? <Text style={[type.caption, { color: color.danger, paddingHorizontal: space[4], paddingTop: space[2] }]}>{error}</Text> : null}
      {weekPlan && saved ? (
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
      ) : null}

      {/* Every day in one list, each under a heading that stays at the top while its stops scroll. */}
      <ScrollView ref={listRef} style={{ flex: 1 }} onLayout={(e) => setListH(Math.round(e.nativeEvent.layout.height))}
        stickyHeaderIndices={days.map((_, i) => i * 2)} scrollEventThrottle={16}
        onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
        // Room after the last day so it can reach the top, clear of the toolbar.
        contentContainerStyle={{ paddingBottom: Math.max(TOOLBAR_H + bottomInset, listH - 160) }}>
        {days.flatMap((d, i) => {
          const k = dayKey(d);
          const r = shownRouteFor(k);
          const pd = planDay(k);
          return [
            <DayHeading key={`h${k}`} day={d} route={r} isToday={k === dayKey(today)} past={k < dayKey(today)}
              extra={pd && pd.stops.length ? `${fmtHours(pd.minutes)}${pd.over ? ' · over hours' : ''}` : undefined}
              emptyText={pd ? 'Free day' : undefined} />,
            <DayStops key={`s${k}`} route={r} loading={loading} onOpenStop={(st) => router.push(`/stop/${st.id}`)}
              emptyText={pd ? 'Free day' : undefined}
              review={weekPlan && pd ? { movedFrom: weekPlan.movedFrom, pins, onPin: (st) => togglePin(st, k) } : undefined} />,
          ];
        })}
      </ScrollView>

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
// Fixed heights, so each day's place in the list can be worked out.
const HEADING_H = 48;
const ROW_H = 68;
const EMPTY_H = 42;

/** A day's heading in the list: the date, and how many stops (or how many are left). */
function DayHeading({ day, route, isToday, past, extra }: {
  day: Date; route: Route | undefined; isToday: boolean; past: boolean;
  /** While reviewing an optimized week: the day's working time. */
  extra?: string; emptyText?: string;
}) {
  const stops = route?.stops ?? [];
  const left = stops.filter((s) => !isDone(s)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const count = !stops.length ? ''
    : route?.status === 'completed' || !left ? plural(stops.length, 'stop', 'stops')
    : left < stops.length ? plural(left, 'stop left', 'stops left') : plural(stops.length, 'stop', 'stops');
  const label = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (isToday ? ' · Today' : '');
  return (
    <View accessibilityRole="header"
      style={{ height: HEADING_H, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingTop: 20, backgroundColor: color.surface }}>
      {/* A quiet label over each day's stops; today's reads a little stronger. */}
      <Text style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: isToday && !past ? color.ink : color.inkMuted }}
        numberOfLines={1} maxFontSizeMultiplier={1}>{label}</Text>
      {count ? <Text style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.inkMuted }} maxFontSizeMultiplier={1}>{count}{extra ? ` · ${extra}` : ''}</Text> : null}
    </View>
  );
}

/** A day's stops under its heading (or a line saying there are none). */
interface WeekReview { movedFrom: Record<string, string>; pins: Map<string, string>; onPin: (s: Stop) => void }

function DayStops({ route, loading, onOpenStop, emptyText, review }: {
  route: Route | undefined; loading: boolean; onOpenStop: (s: Stop) => void; emptyText?: string; review?: WeekReview;
}) {
  const stops = route?.stops ?? [];
  const current = currentStop(route);
  if (!stops.length) {
    return (
      <View style={{ height: EMPTY_H }}>
        <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, paddingHorizontal: space[4] }]} maxFontSizeMultiplier={1}>
          {loading ? 'Loading…' : emptyText ?? 'No stops this day'}
        </Text>
      </View>
    );
  }
  return (
    <View accessibilityRole="list" style={{ paddingHorizontal: space[4] }}>
      {stops.map((s) => (
        <StopListRow key={s.id} stop={s} isCurrent={route?.status === 'active' && s.id === current?.id} onPress={() => onOpenStop(s)} review={review} />
      ))}
    </View>
  );
}

/** A stop on the day, styled like the trip's stop list: name and address (gray once done). No markers or dividers. */
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

