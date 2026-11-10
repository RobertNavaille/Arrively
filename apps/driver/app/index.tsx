import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, AppState, FlatList, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showIOSActionSheet } from '../src/lib/actionSheet';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { addDays, dayKey, distanceM, fmtDuration, miles, routeTotals } from '../src/lib/geo';
import { useRoadPath } from '../src/lib/directions';
import { optionsOf, SPEED } from '../src/lib/routing';
import { currentPosition, stopSharing, useLivePosition } from '../src/lib/location';
import { currentStop, dayRange, useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Button, IconButton } from '../src/ui/components';
import { FloatingSurface } from '../src/ui/FloatingSurface';
import { Icon } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import { RowMenuHost } from '../src/ui/RowMenu';
import { StopMenu } from '../src/ui/StopMenu';
import { useLocks } from '../src/lib/locks';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, shadow, space, type } from '../src/ui/theme';

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
  // The map behind, the bar on top (measured), and the sheet: open under the bar, or resting about halfway.
  const screenH = useWindowDimensions().height;
  const safeTop = useSafeAreaInsets().top;
  const [barH, setBarH] = useState(0);
  // Web: the driver's own swipes on the day pager (so its scroll isn't undone), and one trackpad swipe = one day.
  // Set up once the pager is there (it's drawn once the bar has been measured).
  const pagerShown = barH > 0;
  useEffect(() => {
    if (Platform.OS !== 'web' || !pagerShown) return;
    const node = (listRef.current as unknown as { getScrollableNode?: () => HTMLElement | null })?.getScrollableNode?.();
    if (!node) return;
    return sideSwipe(node, () => { touched.current = true; },
      (dir) => goToRef.current(Math.min(Math.max(indexRef.current + dir, 0), daysRef.current.length - 1)));
  }, [pagerShown]);
  // Resting, the sheet is about a third of the screen (never under 260), so most of the map shows.
  const restTop = screenH - Math.max(260, Math.round(screenH * 0.34));
  const [sheetOpen, setSheetOpen] = useState(false);
  // Fully up: the sheet and the bar read as one surface (no corners, no shadows between them).
  const [docked, setDocked] = useState(false);
  // Whether the day on screen is scrolled to its top (a pull down there lowers the sheet).
  const pageAtTop = useRef(true);
  useEffect(() => { pageAtTop.current = true; }, [index]);
  const selCurrent = currentStop(route);
  const selStops: MapStop[] = (route?.stops ?? []).map((st, i) => ({
    id: st.id, lat: st.lat, lng: st.lng, n: i + 1,
    state: isDone(st) ? 'done' : route?.status === 'active' && st.id === selCurrent?.id ? 'next' : 'upcoming',
  }));

  return (
    // Row menus (press and hold a stop) draw over the whole screen.
    <RowMenuHost>
    <View style={{ flex: 1, backgroundColor: color.mapGround }}>
      {/* The selected day's stops on a map that fills the screen, framed in the part the bar and the resting sheet leave. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <RouteMap height={screenH} stops={selStops} driver={isToday ? pos : null} inset={{ top: barH, bottom: screenH - restTop }} />
      </View>

      {/* The day's stops in a sheet over the map: it rests halfway down and slides up under the bar. */}
      {barH ? (
      <DaySheet openTop={barH} restTop={restTop} screenH={screenH} open={sheetOpen} onOpenChange={setSheetOpen} atTop={pageAtTop} docked={docked} onDockedChange={setDocked}>
      {/* Day pages: the day's count and its stops; swipe sideways for the next or previous day. */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={days}
          horizontal
          pagingEnabled
          initialScrollIndex={range.todayIndex}
          // Every day is a real page, so the browser's snapping only ever lands on
          // a day. Only the day on screen and its neighbours draw their list.
          initialNumToRender={days.length}
          windowSize={days.length * 2}
          extraData={{ index, routeFor, loading, sheetOpen }}
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
                  open={sheetOpen} onAtTop={i === index ? (v) => { pageAtTop.current = v; } : undefined} />
              </View>
            );
          }}
        />
      </View>
      </DaySheet>
      ) : null}

      {/* Over the map and the sheet: the header and week strip, fixed at the top. */}
      <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== barH) setBarH(h); }}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: safeTop, backgroundColor: color.surface }, !docked && shadow.float]}>
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
    </View>
    </RowMenuHost>
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
function DayPanel({ route, isToday, driver, onOpenStop, loading, bottomPad, open, onAtTop }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; onOpenStop: (s: Stop) => void; loading: boolean;
  bottomPad: number;
  /** The sheet is raised: the list scrolls (resting, a drag moves the sheet instead). */
  open: boolean;
  /** The day on screen: told whether its list is at the top. */
  onAtTop?: (atTop: boolean) => void;
}) {
  const locks = useLocks();
  const stops = route?.stops ?? [];
  const current = currentStop(route);
  const remaining = stops.filter((s) => !isDone(s));
  const done = stops.length - remaining.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const count = route?.status === 'completed' ? plural(stops.length, 'stop', 'stops')
    : done ? plural(remaining.length, 'stop left', 'stops left') : plural(stops.length, 'stop', 'stops');
  const countMeta = (route?.status === 'completed' ? `${stops.filter((s) => s.status === 'completed').length} completed`
    : done ? `${done} done` : '');
  // Drive time and distance for the stops left: by road when the map service answers, else
  // straight lines at driving speed. Today it starts from the driver; other days from the first stop.
  const options = route ? optionsOf(route) : {};
  const start = isToday ? driver : null;
  const road = useRoadPath(start, remaining, options);
  const backHome = !!options.roundTrip && !!start && remaining.length > 0;
  const straightM = routeTotals(remaining, start).meters + (backHome ? distanceM(remaining[remaining.length - 1], start!) : 0);
  const driveMin = road ? Math.round(road.durationS / 60) : Math.round((straightM * 1.3) / SPEED[options.mode ?? 'drive'] / 60);
  const driveM = road ? road.distanceM : straightM;
  const drive = remaining.length && (driveM > 0 || driveMin > 0)
    ? `${fmtDuration(Math.max(1, driveMin))} · ${miles(driveM) < 10 ? miles(driveM).toFixed(1) : Math.round(miles(driveM))} mi` : '';
  // Lowered, the list goes back to its top.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (!open) { scrollRef.current?.scrollTo({ y: 0, animated: false }); onAtTop?.(true); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // Resting, the list doesn't scroll (an up-or-down drag moves the sheet). On the web that's done with
    // its overflow hidden: turning scrolling off there blocks sideways swipes (to the next day) too.
    <ScrollView ref={scrollRef} style={[{ flex: 1 }, open ? sheetTouch.listOpen : sheetTouch.listShut]} scrollEnabled={open || Platform.OS === 'web'}
      contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}
      scrollEventThrottle={16} onScroll={(e) => onAtTop?.(e.nativeEvent.contentOffset.y <= 0)}>
      {!stops.length ? (
        <View style={{ alignItems: 'center', paddingVertical: space[6], paddingHorizontal: space[6], gap: space[2] }}>
          <Icon name="route" size={28} color={color.inkMuted} />
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, textAlign: 'center' }]}>
            {loading ? 'Loading…' : 'No stops this day. Tap + to add one.'}
          </Text>
        </View>
      ) : (
        <>
          {/* The day's count, then (gray) the drive time and distance for what's left. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: space[3] }}>
            <Text style={{ flexShrink: 1, fontFamily: font.semibold, fontSize: 17, lineHeight: 24, color: color.ink }} numberOfLines={1}>
              {count}{drive ? <Text style={{ fontFamily: font.regular, color: color.inkMuted }}>{`  ·  ${drive}`}</Text> : null}
            </Text>
            {countMeta ? <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }}>{countMeta}</Text> : null}
          </View>
          <View accessibilityRole="list" style={{ paddingHorizontal: space[4] }}>
            {stops.map((s) => (
              <StopMenu key={s.id} stop={s} day={route!.day} locked={locks.has(s.id)} onPress={() => onOpenStop(s)}>
                <StopListRow stop={s} isCurrent={route?.status === 'active' && s.id === current?.id} locked={locks.has(s.id)} />
              </StopMenu>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/**
 * The Schedule's sheet over the map. It rests at `restTop` and opens to
 * `openTop` (just under the bar) when dragged up, flicked, or scrolled with a
 * wheel; dragging down when the day's list is at its top lowers it again.
 * Sideways drags are left to the day pager inside.
 */
function DaySheet({ openTop, restTop, screenH, open, onOpenChange, atTop, docked, onDockedChange, children }: {
  openTop: number; restTop: number; screenH: number; open: boolean; onOpenChange: (open: boolean) => void;
  atTop: { current: boolean };
  /** Fully up (once it gets there): square corners and no shadow, flush with the bar above. */
  docked: boolean; onDockedChange: (docked: boolean) => void;
  children: ReactNode;
}) {
  const travel = Math.max(0, restTop - openTop);
  const offset = useRef(new Animated.Value(open ? 0 : travel)).current;
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const openRef = useRef(open);
  openRef.current = open;
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const sheetRef = useRef<View>(null);
  const dock = useRef(onDockedChange);
  dock.current = onDockedChange;
  const snap = useCallback((toOpen: boolean) => {
    if (toOpen !== openRef.current) change.current(toOpen);
    openRef.current = toOpen;
    // Corners and shadow come back as soon as it starts down; they go once it has arrived at the top.
    if (!toOpen) dock.current(false);
    Animated.spring(offset, { toValue: toOpen ? 0 : travelRef.current, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 18 })
      .start(({ finished }) => { if (finished && toOpen && openRef.current) dock.current(true); });
  }, [offset]);
  useEffect(() => { snap(open); }, [open, travel, snap]);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const start = useRef(0);
  const pan = useRef(PanResponder.create({
    // Up-and-down drags move the sheet: any, while it rests; once open, a pull down with the list at its top.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2
      && (!openRef.current || (g.dy > 0 && atTop.current)),
    onPanResponderGrant: () => { dock.current(false); offset.stopAnimation((v) => { start.current = v; }); },
    onPanResponderMove: (_, g) => offset.setValue(Math.min(Math.max(start.current + g.dy, 0), travelRef.current)),
    onPanResponderRelease: (_, g) => {
      const at = start.current + g.dy;
      snapRef.current(g.vy < -0.3 || (g.vy <= 0.3 && at < travelRef.current / 2));
    },
    onPanResponderTerminate: (_, g) => snapRef.current(start.current + g.dy < travelRef.current / 2),
    onPanResponderTerminationRequest: () => false,
  })).current;
  // Web: a wheel or trackpad scroll over the sheet raises and lowers it too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = sheetRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (!openRef.current && e.deltaY > 0) { e.preventDefault(); snapRef.current(true); }
      else if (openRef.current && e.deltaY < 0 && atTop.current) { e.preventDefault(); snapRef.current(false); }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [atTop]);
  return (
    <Animated.View ref={sheetRef} {...pan.panHandlers}
      style={[sheetTouch.sheet, !docked && shadow.sheet, docked && { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
        { top: openTop, height: screenH - openTop, transform: [{ translateY: offset }] }]}>
      <Pressable onPress={() => snap(!openRef.current)} accessibilityRole="button" accessibilityLabel={open ? 'Lower the list' : 'Raise the list'}
        style={{ height: 22, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: color.divider }} />
      </Pressable>
      {children}
    </Animated.View>
  );
}

// Touch handling for the browser (web-only styles): the resting sheet takes its own drags; an open list scrolls natively.
const touchAction = (action: 'pan-x' | 'pan-x pan-y', overflowY?: 'hidden') => ({ touchAction: action, ...(overflowY ? { overflowY } : {}) }) as ViewStyle;
const sheetTouch = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' },
  listOpen: touchAction('pan-x pan-y'),
  listShut: touchAction('pan-x', 'hidden'),
});

/** A stop on the day, styled like the trip's stop list: name and address (gray once done). No markers or dividers. */
// Tapping and press and hold are StopMenu's (around it).
function StopListRow({ stop, isCurrent, locked }: { stop: Stop; isCurrent: boolean; locked: boolean }) {
  const done = isDone(stop);
  return (
    <View accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}${locked ? ', locked to this day' : ''}`}
      style={{ height: ROW_H }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text style={{ flexShrink: 1, fontFamily: font.semibold, fontSize: 18, lineHeight: 26, color: done ? color.inkMuted : color.ink }} numberOfLines={1} maxFontSizeMultiplier={1}>{stop.customer_name}</Text>
        {locked ? <Icon name="lock" size={14} color={color.inkMuted} /> : null}
      </View>
      <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }} numberOfLines={1} maxFontSizeMultiplier={1}>
        {stop.address.split(',')[0]}{stop.notes ? ` · ${stop.notes}` : ''}
      </Text>
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

