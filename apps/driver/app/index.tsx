import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, AppState, FlatList, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, dayKey, distanceM, estimateDriveMin, miles, routeTotals } from '../src/lib/geo';
import { useRoadPath, useRoadRoute } from '../src/lib/directions';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { enableCompass, startSharing } from '../src/lib/location';
import { contactCustomer, etaMessage } from '../src/lib/navigation';
import { optionsOf, SPEED } from '../src/lib/routing';
import { useLivePosition } from '../src/lib/location';
import { currentStop, dayRange, useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Button, IconButton } from '../src/ui/components';
import { Icon, type IconName } from '../src/ui/Icon';
import { AheadRow } from '../src/ui/TripParts';
import { FadeIn } from '../src/ui/FadeIn';
import { FloatingSurface } from '../src/ui/FloatingSurface';
import { RouteMap } from '../src/ui/RouteMap';
import { RowMenuHost } from '../src/ui/RowMenu';
import { StopMenu } from '../src/ui/StopMenu';
import { useLocks } from '../src/lib/locks';
import { takeWeekOptimized } from '../src/lib/weekPlan';
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
  // Picking a day in the strip (or a week swipe) pages to it.
  function goTo(i: number) {
    touched.current = true;
    // Jumps of more than a day skip the animation: the pages in between aren't drawn.
    const near = Math.abs(i - indexRef.current) <= 1;
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: near });
  }


  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  // Back on the Schedule: the pages line up with the selected day again (a screen shown over this one
  // can leave the pager or the strip scrolled somewhere else, which read as a jump to a past date).
  // After Optimize week, it's today that shows.
  const todayIndexRef = useRef(range.todayIndex);
  todayIndexRef.current = range.todayIndex;
  useFocusEffect(useCallback(() => {
    const i = takeWeekOptimized() ? todayIndexRef.current : indexRef.current;
    touched.current = false;
    setIndex(i);
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: width * i, animated: false });
      stripRef.current?.scrollToOffset({ offset: width * Math.floor(i / 7), animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [width]));

  const bottomInset = useBottomInset();
  // The map fills the screen; the sheet rests a little below halfway and opens up to just under the avatar.
  const screenH = useWindowDimensions().height;
  const safeTop = useSafeAreaInsets().top;
  const openTop = safeTop + NAV_TOP + NAV_H + 10;
  // Web: the driver's own swipes on the day pager (so its scroll isn't undone), and one trackpad swipe = one day.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (listRef.current as unknown as { getScrollableNode?: () => HTMLElement | null })?.getScrollableNode?.();
    if (!node) return;
    return sideSwipe(node, () => { touched.current = true; },
      (dir) => goToRef.current(Math.min(Math.max(indexRef.current + dir, 0), daysRef.current.length - 1)));
  }, []);
  const restTop = Math.round(screenH * 0.47);
  const travel = Math.max(0, restTop - openTop);
  const [sheetOpen, setSheetOpen] = useState(false);
  // How far the sheet is below its open position (0: fully up, `travel`: resting).
  const sheetY = useRef(new Animated.Value(travel)).current;
  // Whether the day on screen is scrolled to its top (a pull down there lowers the sheet).
  const pageAtTop = useRef(true);
  useEffect(() => { pageAtTop.current = true; }, [index]);
  const selCurrent = currentStop(route);
  const selStops: MapStop[] = (route?.stops ?? []).map((st, i) => ({
    id: st.id, lat: st.lat, lng: st.lng, n: i + 1,
    state: isDone(st) ? 'done' : route?.status === 'active' && st.id === selCurrent?.id ? 'next' : 'upcoming',
  }));
  // The selected day's trip info (what's left of it): drive time, miles, stops, in a ribbon under the week strip.
  const stats = useDayStats(route, isToday ? pos : null);

  // Today's trip, started from here: the first drive starts the route (location sharing, customers' texts),
  // then the trip screen takes over (on the way, arrived, marking the stop).
  const [busy, setBusy] = useState(false);
  async function startDriving(r: Route, stop: Stop) {
    setBusy(true);
    try {
      await enableCompass();
      if (r.status === 'planned') {
        await backend.startRoute(r.id);
        const ok = await startSharing();
        if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
      }
      await backend.startTrip(stop.id);
      await refresh();
      router.push('/trip');
    } catch (e) {
      showMessage('Something went wrong', e instanceof Error ? e.message : String(e));
      refresh();
    } finally { setBusy(false); }
  }

  return (
    // Row menus (press and hold a stop) draw over the whole screen.
    <RowMenuHost>
    <View style={{ flex: 1, backgroundColor: color.mapGround }}>
      {/* The selected day's stops on a map that fills the screen, framed in the part above the resting sheet. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <RouteMap height={screenH} stops={selStops} driver={isToday ? pos : null} inset={{ top: openTop, bottom: screenH - restTop }} />
      </View>

      {/* Over the map: the avatar (settings and account). */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: safeTop + NAV_TOP, left: space[4], zIndex: 3 }}>
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings and account" hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <FloatingSurface style={{ width: NAV_H, height: NAV_H, borderRadius: NAV_H / 2, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar name={profile?.name ?? 'Driver'} size={32} />
          </FloatingSurface>
        </Pressable>
      </View>

      {/* The day in a sheet over the map: its date, the week strip, and its stops. */}
      <DaySheet openTop={openTop} travel={travel} screenH={screenH} open={sheetOpen} onOpenChange={setSheetOpen} atTop={pageAtTop} offset={sheetY}>
        {/* Today (as in Apple's Calendar) goes back to the current day; + adds a stop. The selected day shows in the strip. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[3], paddingTop: space[1] }}>
          <Pressable onPress={() => goTo(range.todayIndex)} accessibilityRole="button" accessibilityLabel="Go to today"
            style={({ pressed }) => [{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: color.brandTint, justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.onTint }}>Today</Text>
          </Pressable>
          <IconButton icon="plus" size="compact" label="Add stop" onPress={() => router.push('/new-stop')} />
        </View>

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
              <View style={{ width, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: 14 }}>
                {wk.map((d, j) => {
                  const i = w * 7 + j;
                  const sel = i === index;
                  const has = (routeFor(dayKey(d))?.stops.length ?? 0) > 0;
                  const past = dayKey(d) < dayKey(today);
                  const isTodayCell = dayKey(d) === dayKey(today);
                  return (
                    <Pressable key={i} onPress={() => goTo(i)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
                      accessibilityLabel={`${d.toDateString()}${isTodayCell ? ', today' : ''}`} style={{ alignItems: 'center', gap: 2, minWidth: 40 }}>
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
        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.divider }} />

        {/* Day pages: swipe sideways for the next or previous day. */}
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
            extraData={{ index, routeFor, loading, sheetOpen, stats, pos, busy }}
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
              const r = routeFor(k);
              const todayPage = k === dayKey(today);
              return (
                <View style={{ width, height: pagerH || undefined }}>
                  <DayPanel route={r} isToday={todayPage} driver={todayPage ? pos : null}
                    stats={i === index ? stats : straightStats(r, null)}
                    loading={loading} onOpenStop={(st) => router.push(`/stop/${st.id}`)} bottomPad={TOOLBAR_H + bottomInset}
                    open={sheetOpen} onAtTop={i === index ? (v) => { pageAtTop.current = v; } : undefined}
                    starting={busy} onStart={(st) => r && startDriving(r, st)} onOpenTrip={() => router.push('/trip')}
                    profile={profile} />
                </View>
              );
            }}
          />
        </View>
      </DaySheet>

      {/* Optimize schedule, floating at the bottom of the sheet: the week's optimize options. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: space[3], paddingBottom: space[4] + bottomInset }}>
        <Button variant="neutral" icon="route" label="Optimize schedule" style={shadow.float} onPress={() => router.push('/week-options')} />
      </View>
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
// The avatar's bar over the map; pulled all the way up, the sheet stops just under it.
const NAV_TOP = 10;
const NAV_H = 44;

/** A day's trip info: drive time and miles for the stops left, and how many. */
interface DayStats { min: number; meters: number; stops: number; left: boolean }

/** Without road routes (offline, or a day not on screen): straight lines at the travel mode's usual speed. */
function straightStats(route: Route | undefined, start: LatLng | null, road?: { durationS: number; distanceM: number } | null): DayStats | null {
  const stops = route?.stops ?? [];
  const remaining = stops.filter((s) => !isDone(s));
  if (!remaining.length) return null;
  const options = route ? optionsOf(route) : {};
  const backHome = !!options.roundTrip && !!start;
  const straightM = routeTotals(remaining, start).meters + (backHome ? distanceM(remaining[remaining.length - 1], start!) : 0);
  const min = road ? Math.round(road.durationS / 60) : Math.round((straightM * 1.3) / SPEED[options.mode ?? 'drive'] / 60);
  return { min: Math.max(1, min), meters: road ? road.distanceM : straightM, stops: remaining.length, left: remaining.length < stops.length };
}

/** The day's trip info by road when the map service answers. Today it starts from the driver; other days from the first stop. */
function useDayStats(route: Route | undefined, start: LatLng | null): DayStats | null {
  const remaining = (route?.stops ?? []).filter((s) => !isDone(s));
  const road = useRoadPath(start, remaining, route ? optionsOf(route) : {});
  return straightStats(route, start, road);
}

const fmtTripTime = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}`);

/** The trip info's three items, each with a small blue icon: drive time, miles, stops. */
function TripInfo({ stats, size }: { stats: DayStats; size: number }) {
  const mi = miles(stats.meters);
  const items: { icon: IconName; text: string }[] = [
    { icon: 'clock', text: fmtTripTime(stats.min) },
    { icon: 'route', text: `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi` },
    { icon: 'pin', text: `${stats.stops} ${stats.left ? 'left' : stats.stops === 1 ? 'stop' : 'stops'}` },
  ];
  return (
    <>
      {items.map((it) => (
        <View key={it.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={it.icon} size={size} color={color.action} />
          <Text style={{ fontFamily: font.medium, fontSize: size, lineHeight: size + 6, color: color.ink }} maxFontSizeMultiplier={1.3}>{it.text}</Text>
        </View>
      ))}
    </>
  );
}

/**
 * A day's page. Today, with the trip still to drive, the next stop leads (Start driving), then the
 * stops after it and the ones done; other days, the stops in order. The trip info is a ribbon at the
 * top: in line at first, then (pulled up) it stays put and floats over the stops as they scroll.
 */
function DayPanel({ route, isToday, driver, stats, onOpenStop, loading, bottomPad, open, onAtTop, starting, onStart, onOpenTrip, profile }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; stats: DayStats | null; onOpenStop: (s: Stop) => void; loading: boolean;
  bottomPad: number;
  /** The sheet is raised: the list scrolls (resting, a drag moves the sheet instead). */
  open: boolean;
  /** The day on screen: told whether its list is at the top. */
  onAtTop?: (atTop: boolean) => void;
  starting: boolean; onStart: (s: Stop) => void; onOpenTrip: () => void;
  profile: { name?: string | null; org_name?: string | null } | null | undefined;
}) {
  const locks = useLocks();
  const stops = route?.stops ?? [];
  const current = isToday && route?.status !== 'completed' ? currentStop(route) : undefined;
  const phase = !current ? null : current.status === 'en_route' ? 'onroute' : current.status === 'arrived' ? 'arrived' : 'next';
  const done = stops.filter(isDone);
  const upcoming = stops.filter((s) => !isDone(s) && s.id !== current?.id);
  const options = route ? optionsOf(route) : {};
  // The drive to the next stop (today, before starting it).
  const leg = useRoadRoute(phase === 'next' ? driver : null, phase === 'next' && current ? current : null, options);
  const legM = leg ? leg.distanceM : driver && current ? distanceM(driver, current) : null;
  const legMin = leg ? Math.max(1, Math.round(leg.durationS / 60)) : legM != null ? estimateDriveMin(legM) : null;
  // The ribbon floats (glass, with a shadow) once the stops scroll under it.
  const [floated, setFloated] = useState(false);
  // Lowered, the list goes back to its top.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (!open) { scrollRef.current?.scrollTo({ y: 0, animated: false }); onAtTop?.(true); setFloated(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = current?.customer_phone ? () => contactCustomer('tel', current.customer_phone!) : undefined;
  const message = current ? () => (current.customer_phone
    ? contactCustomer('sms', current.customer_phone, etaMessage(current, profile?.name ?? undefined, profile?.org_name ?? undefined))
    : showMessage('No phone number', `There's no phone number for ${current.customer_name}.`)) : undefined;
  const row = (s: Stop, last: boolean) => (
    <StopMenu key={s.id} stop={s} day={route!.day} locked={locks.has(s.id)} onPress={() => onOpenStop(s)}>
      <AheadRow stop={s} detail={`${s.address.split(',')[0]}${s.notes ? ` · ${s.notes}` : ''}`} last={last} lock={{ on: locks.has(s.id) }} />
    </StopMenu>
  );
  return (
    // Resting, the list doesn't scroll (an up-or-down drag moves the sheet). On the web that's done with
    // its overflow hidden: turning scrolling off there blocks sideways swipes (to the next day) too.
    <ScrollView ref={scrollRef} style={[{ flex: 1 }, open ? sheetTouch.listOpen : sheetTouch.listShut]} scrollEnabled={open || Platform.OS === 'web'}
      contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
      scrollEventThrottle={16} onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        onAtTop?.(y <= 0);
        if ((y > 4) !== floated) setFloated(y > 4);
      }}>
      {/* The trip info ribbon (first, so it can stick over the stops as they scroll). */}
      <View>
        {stats ? (
          <FadeIn from={-6} style={{ marginHorizontal: space[4], marginTop: space[3], marginBottom: space[2] }}>
            <View accessible accessibilityLabel={`${fmtTripTime(stats.min)} driving, ${miles(stats.meters).toFixed(1)} miles, ${stats.stops} ${stats.left ? 'stops left' : stats.stops === 1 ? 'stop' : 'stops'}`}
              style={[{ height: 44, borderRadius: 22, overflow: floated ? 'visible' : 'hidden' }, floated ? shadow.float : { backgroundColor: color.surfaceMuted }]}>
              {floated ? <FloatingSurface style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} /> : null}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}>
                <TripInfo stats={stats} size={15} />
              </View>
            </View>
          </FadeIn>
        ) : <View style={{ height: space[3] }} />}
      </View>
      {!stops.length ? (
        <View style={{ alignItems: 'center', paddingVertical: space[6], paddingHorizontal: space[6], gap: space[2] }}>
          <Icon name="route" size={28} color={color.inkMuted} />
          <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, textAlign: 'center' }]}>
            {loading ? 'Loading…' : 'No stops this day. Tap + to add one.'}
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: space[4] }}>
          {/* Today: the stop the driver is on leads, on the route's line. */}
          {current && phase ? (
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <View style={{ width: 20, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
                <View style={styles.nextDot} />
                {upcoming.length ? <View style={styles.line} /> : null}
              </View>
              <View style={{ flex: 1, gap: space[3], paddingBottom: space[4] }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.title, { fontSize: 20, lineHeight: 28 }]} accessibilityRole="header"
                      accessibilityLabel={`${phase === 'next' ? 'Next stop' : phase === 'onroute' ? 'On the way to' : 'At'} ${current.customer_name}`}>{current.customer_name}</Text>
                    <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]} numberOfLines={1}>
                      {current.address.split(',')[0]}{current.notes ? ` · ${current.notes}` : ''}
                    </Text>
                  </View>
                  {call ? <IconButton icon="phone" size="compact" label={`Call ${current.customer_name}`} onPress={call} /> : null}
                  {message ? <IconButton icon="message" size="compact" label={`Message ${current.customer_name}`} onPress={message} /> : null}
                </View>
                {phase === 'next' && legMin != null && legM != null ? (
                  <Text style={type.body}><Text style={type.bodyStrong}>{legMin} min</Text>
                    <Text style={{ color: color.inkMuted }}> · {miles(legM).toFixed(1)} mi</Text></Text>
                ) : null}
                {phase === 'next'
                  ? <Button label="Start driving" loading={starting} onPress={() => onStart(current)} />
                  : <Button icon="navigate" label={phase === 'onroute' ? 'On the way · Open trip' : 'At the stop · Open trip'} onPress={onOpenTrip} />}
              </View>
            </View>
          ) : null}
          {current && upcoming.length ? (
            <Text style={[type.bodyStrong, { color: color.inkMuted, paddingLeft: 20 + space[3], paddingBottom: space[3] }]}>
              {upcoming.length} more {upcoming.length === 1 ? 'stop' : 'stops'}
            </Text>
          ) : null}
          <View accessibilityRole="list">
            {(current ? upcoming : stops.filter((s) => !isDone(s) || !isToday)).map((s, i, list) => row(s, i === list.length - 1))}
          </View>
          {/* Today: the stops done, in gray. */}
          {isToday && done.length ? (
            <>
              <Text style={[type.caption, { fontFamily: font.semibold, paddingTop: space[3], paddingBottom: space[3] }]}>Done · {done.length}</Text>
              {done.map((s) => (
                <Pressable key={s.id} onPress={() => onOpenStop(s)} accessibilityRole="button" accessibilityLabel={`${s.customer_name}, done`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: space[4] }}>
                  <View style={{ width: 20, alignItems: 'center' }}><Icon name="check" size={18} color={color.inkMuted} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { fontSize: 16, lineHeight: 22, color: color.inkMuted }]}>{s.customer_name}</Text>
                    <Text style={type.caption}>{s.address.split(',')[0]}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * The day's sheet over the map. It rests `travel` below `openTop` and opens up to
 * it (just under the avatar) when dragged up, flicked, or scrolled with a wheel;
 * dragging down when the day's list is at its top lowers it again. Sideways
 * drags are left to the day pager and week strip inside.
 */
function DaySheet({ openTop, travel, screenH, open, onOpenChange, atTop, offset, children }: {
  openTop: number; travel: number; screenH: number; open: boolean; onOpenChange: (open: boolean) => void;
  atTop: { current: boolean };
  /** Where the sheet is: its distance below `openTop` (0 fully up). */
  offset: Animated.Value;
  children: ReactNode;
}) {
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const openRef = useRef(open);
  openRef.current = open;
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const sheetRef = useRef<View>(null);
  // Starts where it should be, without sliding there (set before the first paint, not while drawing).
  useLayoutEffect(() => { offset.setValue(openRef.current ? 0 : travelRef.current); }, [offset]);
  // Driven from JavaScript (not the native driver), so a drag follows the finger on every platform.
  const snap = useCallback((toOpen: boolean) => {
    if (toOpen !== openRef.current) change.current(toOpen);
    openRef.current = toOpen;
    Animated.spring(offset, { toValue: toOpen ? 0 : travelRef.current, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }, [offset]);
  useEffect(() => { snap(open); }, [open, travel, snap]);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const start = useRef(0);
  const pan = useRef(PanResponder.create({
    // Up-and-down drags move the sheet: any, while it rests; once open, a pull down with the list at its top.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2
      && (!openRef.current || (g.dy > 0 && atTop.current)),
    onPanResponderGrant: () => { offset.stopAnimation((v) => { start.current = v; }); },
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
      style={[sheetTouch.sheet, { top: openTop, height: screenH - openTop, transform: [{ translateY: offset }] }]}>
      {/* The shadow, on a layer of its own (the sheet clips its content). */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.round, { backgroundColor: color.surface }, shadow.sheet]} />
      <View style={[{ flex: 1, backgroundColor: color.surface, overflow: 'hidden' }, styles.round]}>
        {/* The grabber (also a button for raising and lowering the sheet). */}
        <Pressable onPress={() => snap(!openRef.current)} accessibilityRole="button" accessibilityLabel={open ? 'Lower the list' : 'Raise the list'}
          style={{ height: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: color.divider }} />
        </Pressable>
        {children}
      </View>
    </Animated.View>
  );
}

// Touch handling for the browser (web-only styles): the resting sheet takes its own drags; an open list scrolls natively.
const touchAction = (action: 'pan-x' | 'pan-x pan-y', overflowY?: 'hidden') => ({ touchAction: action, ...(overflowY ? { overflowY } : {}) }) as ViewStyle;
const sheetTouch = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0 },
  listOpen: touchAction('pan-x pan-y'),
  listShut: touchAction('pan-x', 'hidden'),
});

const styles = StyleSheet.create({
  round: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  // The route's line, from the next stop down to the stops after it.
  line: { flex: 1, width: 2, marginTop: 4, marginBottom: -space[4], backgroundColor: color.divider },
  nextDot: { marginTop: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: color.action, borderWidth: 4, borderColor: color.brandTint },
});
