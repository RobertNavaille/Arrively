import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { useRoadPath } from '../src/lib/directions';
import { addDays, dayKey, fmtDuration, fmtTime, routeTotals } from '../src/lib/geo';
import { currentPosition, startSharing, stopSharing, useLivePosition } from '../src/lib/location';
import { searchAddress, type Place } from '../src/lib/mapbox';
import type { RoutePlan } from '../src/lib/routing';
import { currentStop, dayRange, lastMarked, useDriverData } from '../src/lib/store';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Banner, Button, IconButton, StatRow, StatusPill, type PillTone } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { PlanSheet } from '../src/ui/PlanSheet';
import { RouteMap } from '../src/ui/RouteMap';
import { framePoints, type MapStop } from '../src/ui/RouteMap.types';
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
    const mark = () => { touched.current = true; };
    const events = ['touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => node.addEventListener(e, mark, { passive: true }));
    // Trackpad and mouse wheel: a sideways swipe moves exactly one day. The
    // browser's own snapping re-snaps after every small trackpad movement, so
    // on wide screens a swipe never reached the next day. Vertical scrolling is
    // left alone so the stop list scrolls normally.
    let sum = 0, locked = false, idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      touched.current = true;
      clearTimeout(idle);
      idle = setTimeout(() => { sum = 0; locked = false; }, 250); // the gesture (and its momentum) has ended
      if (locked) return;
      sum += e.deltaX;
      if (Math.abs(sum) < 30) return;
      locked = true;
      const next = Math.min(Math.max(indexRef.current + (sum > 0 ? 1 : -1), 0), daysRef.current.length - 1);
      goToRef.current(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      events.forEach((e) => node.removeEventListener(e, mark));
      node.removeEventListener('wheel', onWheel);
      clearTimeout(idle);
    };
  }, []);

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
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ route: Route; plan: RoutePlan; from: LatLng | null } | null>(null);
  const [planning, setPlanning] = useState<string | null>(null); // route id being optimized
  const [applying, setApplying] = useState(false);

  async function optimize(r: Route) {
    setPlanning(r.id);
    try {
      // Plan from where the driver is right now.
      const here = pos ?? (await currentPosition());
      setPlan({ route: r, plan: await backend.planRoute(r.id, here), from: here });
    }
    catch (e) { showMessage('Could not optimize', e instanceof Error ? e.message : String(e)); }
    finally { setPlanning(null); }
  }
  // Today and later, with at least two stops still to visit. After the first
  // optimize the button shrinks to its icon.
  const optimizable = !!route && route.status !== 'completed' && dayK >= dayKey(today)
    && route.stops.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;
  const optimizeButton = route ? (
    <Button variant="secondary" icon="route" label={route.optimized_at ? 'Optimize again' : 'Optimize'}
      iconOnly={!!route.optimized_at} loading={planning === route.id} onPress={() => optimize(route)} />
  ) : null;
  async function usePlan() {
    if (!plan) return;
    setApplying(true);
    try { await backend.applyPlan(plan.route.id, plan.plan.order, plan.from); setPlan(null); await refresh(); }
    catch (e) { showMessage('Could not save the order', e instanceof Error ? e.message : String(e)); }
    finally { setApplying(false); }
  }

  function goTo(i: number) {
    touched.current = true;
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  }
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const current = currentStop(route);
  const marked = lastMarked(route);
  const showBanner = isToday && marked && current && marked.marked_at
    && Date.now() - new Date(marked.marked_at).getTime() < 15 * 60 * 1000;

  async function primaryAction() {
    if (!route || !current) return;
    setBusy(true);
    try {
      if (route.status === 'planned') {
        await backend.startRoute(route.id);
        const ok = await startSharing();
        if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
      }
      router.push(`/stop/${current.id}`);
    } catch (e) {
      showMessage('Could not start', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ctaLabel = !current ? '' : route?.status === 'planned' ? 'Start route'
    : current.status === 'en_route' ? `Continue to ${current.customer_name}`
    : current.status === 'arrived' ? `Back to ${current.customer_name}`
    : `Start trip to ${current.customer_name}`;

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4], paddingBottom: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }}>
        {/* The selected day's week, Sunday to Saturday. */}
        {days.slice(index - (index % 7), index - (index % 7) + 7).map((d, j) => {
          const i = index - (index % 7) + j;
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

      {showBanner && marked ? (
        <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
          <Banner title={marked.status === 'completed' ? 'Stop complete' : marked.status === 'no_show' ? 'Marked no-show' : 'Stop skipped'}
            meta={`${marked.customer_name} · ${fmtTime(marked.marked_at)}`} />
        </View>
      ) : null}

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
                    onOpenStop={(s) => router.push(`/stop/${s.id}`)} loading={loading}
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
      {/* Footer */}
          <View style={{ padding: space[4], paddingBottom: space[6], borderTopWidth: 1, borderTopColor: color.divider }}>
            {q.trim() ? <Pressable accessibilityLabel="Close search" onPress={() => setQ('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim, zIndex: 2 }} /> : null}
            {error ? <Text style={[type.caption, { color: color.danger, marginBottom: space[2] }]}>{error}</Text> : null}
            {isToday && current ? (
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <Button label={ctaLabel} onPress={primaryAction} loading={busy} style={{ flex: 1 }} />
                {optimizable ? optimizeButton : null}
              </View>
            ) : optimizable ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Text style={[type.body, { flex: 1, color: color.inkMuted }]}>{footerText(route, day, today)}</Text>
                {optimizeButton}
              </View>
            ) : (
              <Text style={[type.body, { color: color.inkMuted, textAlign: 'center', paddingVertical: space[3] }]}>
                {footerText(route, day, today)}
              </Text>
            )}
          </View>
      </View>

      {plan ? <PlanSheet route={plan.route} plan={plan.plan} busy={applying} onUse={usePlan} onClose={() => setPlan(null)} /> : null}

      <Menu visible={menu} onClose={() => setMenu(false)} offline={backend.offline} onDemo={async () => {
        setMenu(false);
        const here = pos ?? (await currentPosition()) ?? { lat: 41.824, lng: -71.4128 };
        try { await backend.createDemoDay(here, null); goTo(range.todayIndex); await refresh(); }
        catch (e) { showMessage('Could not create demo day', e instanceof Error ? e.message : String(e)); }
      }} onSignOut={async () => { setMenu(false); await stopSharing(); await backend.signOut(); }} />
    </SafeAreaView>
  );
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
  // Routed ETAs when the server has them; a straight-line estimate otherwise.
  const totals = routeTotals(remaining, isToday ? driver : null);
  const last = remaining[remaining.length - 1];
  const routed = route?.drive_s != null && !!last?.eta;
  const driveLabel = routed ? fmtDuration(Math.round(route!.drive_s! / 60)) : `~${fmtDuration(totals.driveMin)}`;

  const mapStops: MapStop[] = stops.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    state: isDone(s) ? 'done' : s.id === current?.id ? 'next' : 'upcoming',
  }));
  // Follow real roads when Mapbox can route them; straight lines until then.
  // A driver too far away to show on the map isn't routed from either.
  const near = isToday && driver && framePoints({ stops: mapStops, driver }).includes(driver) ? driver : null;
  const road = useRoadPath(near, remaining);
  const line = road ? [...(near ? [near] : []), ...road] : [...(isToday && driver ? [driver] : []), ...remaining];

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
          <RouteMap height={190} stops={mapStops} driver={isToday ? driver : null} line={line} />
        </View>
      </View>
      <View style={{ padding: space[4], paddingVertical: space[3] }}>
        <StatRow compact items={route?.status === 'completed'
          ? [{ value: String(stops.length), label: 'stops' }, { value: String(stops.filter((s) => s.status === 'completed').length), label: 'completed' }]
          : [
            { value: String(remaining.length), label: done ? 'stops left' : 'stops' },
            { value: driveLabel, label: 'drive' },
          ]} />
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
  const status = stop.status === 'completed' ? ['Done', 'success'] : stop.status === 'no_show' ? ['No-show', 'warning']
    : stop.status === 'skipped' ? ['Skipped', 'neutral'] : stop.status === 'arrived' ? ['Arrived', 'info']
    : stop.status === 'en_route' ? ['On the way', 'info'] : isCurrent ? ['Next', 'info'] : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: done ? color.divider : color.brand }} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{stop.customer_name}</Text>
        <Text style={type.caption} numberOfLines={1}>{stop.address}{stop.notes ? ` · ${stop.notes}` : ''}</Text>
      </View>
      {status ? <StatusPill label={status[0]} tone={status[1] as PillTone} /> : null}
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

