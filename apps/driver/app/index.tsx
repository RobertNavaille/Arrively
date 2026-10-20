import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { addDays, dayKey, fmtDuration, fmtTime, fmtWindow, routeTotals } from '../src/lib/geo';
import { currentPosition, startSharing, stopSharing, useLivePosition } from '../src/lib/location';
import { searchAddress, type Place } from '../src/lib/mapbox';
import type { RoutePlan } from '../src/lib/routing';
import { DAY_RANGE, currentStop, lastMarked, useDriverData } from '../src/lib/store';
import { isDone, type LatLng, type Route, type Stop } from '../src/lib/types';
import { Avatar, Banner, Button, IconButton, StatRow, StatusPill, type PillTone } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { PlanSheet } from '../src/ui/PlanSheet';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, shadow, space, type } from '../src/ui/theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MyDay() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile, routeFor, loading, error, refresh } = useDriverData();
  const pos = useLivePosition();
  const today = useMemo(() => new Date(), []);
  const days = useMemo(
    () => Array.from({ length: DAY_RANGE.before + DAY_RANGE.after + 1 }, (_, i) => addDays(today, i - DAY_RANGE.before)),
    [today],
  );
  const [index, setIndex] = useState(DAY_RANGE.before);
  const listRef = useRef<FlatList<Date>>(null);
  const day = days[index];
  const dayK = dayKey(day);
  const isToday = dayK === dayKey(today);
  const route = routeFor(dayK);
  const [menu, setMenu] = useState(false);
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
  async function usePlan() {
    if (!plan) return;
    setApplying(true);
    try { await backend.applyPlan(plan.route.id, plan.plan.order, plan.from); setPlan(null); await refresh(); }
    catch (e) { showMessage('Could not save the order', e instanceof Error ? e.message : String(e)); }
    finally { setApplying(false); }
  }

  function goTo(i: number) {
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  }

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
        {days.map((d, i) => {
          const sel = i === index;
          const has = (routeFor(dayKey(d))?.stops.length ?? 0) > 0;
          return (
            <Pressable key={i} onPress={() => goTo(i)} accessibilityRole="tab" accessibilityState={{ selected: sel }}
              accessibilityLabel={d.toDateString()} style={{ alignItems: 'center', gap: 2, minWidth: 36 }}>
              <Text style={type.label}>{DOW[d.getDay()]}</Text>
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? color.action : 'transparent' }}>
                <Text style={[type.bodyStrong, { color: sel ? color.onAction : color.ink }]}>{d.getDate()}</Text>
              </View>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: has ? color.inkMuted : 'transparent' }} />
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

      {/* Search + day pages */}
      <View style={{ flex: 1 }}>
        <AddStopSearch dayLabel={day.toLocaleDateString('en-US', { weekday: 'long' })} near={pos}
          onAdd={async (p) => { await backend.addStop(dayK, `${p.name}, ${p.detail}`, p); await refresh(); }}>
          <FlatList
            ref={listRef}
            data={days}
            horizontal
            pagingEnabled
            initialScrollIndex={DAY_RANGE.before}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(d) => dayKey(d)}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            onScroll={Platform.OS === 'web' ? (e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / width);
              if (i !== index) setIndex(i);
            } : undefined}
            scrollEventThrottle={64}
            renderItem={({ item }) => (
              <View style={{ width }}>
                <DayPanel route={routeFor(dayKey(item))} isToday={dayKey(item) === dayKey(today)} driver={dayKey(item) === dayKey(today) ? pos : null}
                  onOpenStop={(s) => router.push(`/stop/${s.id}`)} loading={loading}
                  onOptimize={optimize} optimizing={planning === routeFor(dayKey(item))?.id} />
              </View>
            )}
          />
      {/* Footer */}
          <View style={{ padding: space[4], paddingBottom: space[6], borderTopWidth: 1, borderTopColor: color.divider }}>
            {error ? <Text style={[type.caption, { color: color.danger, marginBottom: space[2] }]}>{error}</Text> : null}
            {isToday && current ? (
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <Button label={ctaLabel} onPress={primaryAction} loading={busy} style={{ flex: 1 }} />
              </View>
            ) : (
              <Text style={[type.body, { color: color.inkMuted, textAlign: 'center', paddingVertical: space[3] }]}>
                {footerText(route, day, today)}
              </Text>
            )}
          </View>
        </AddStopSearch>
      </View>

      {plan ? <PlanSheet route={plan.route} plan={plan.plan} busy={applying} onUse={usePlan} onClose={() => setPlan(null)} /> : null}

      <Menu visible={menu} onClose={() => setMenu(false)} offline={backend.offline} onDemo={async () => {
        setMenu(false);
        const here = pos ?? (await currentPosition()) ?? { lat: 41.824, lng: -71.4128 };
        try { await backend.createDemoDay(here, null); goTo(DAY_RANGE.before); await refresh(); }
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

function DayPanel({ route, isToday, driver, onOpenStop, loading, onOptimize, optimizing }: {
  route: Route | undefined; isToday: boolean; driver: LatLng | null; onOpenStop: (s: Stop) => void; loading: boolean;
  onOptimize: (r: Route) => void; optimizing: boolean;
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
  const finish = routed ? new Date(Date.parse(last.eta!) + last.service_minutes * 60000)
    : new Date(Date.now() + (totals.driveMin + totals.serviceMin) * 60000);
  const canOptimize = route && route.status !== 'completed' && remaining.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;

  const mapStops: MapStop[] = stops.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    state: isDone(s) ? 'done' : s.id === current?.id ? 'next' : 'upcoming',
  }));
  const line = [...(isToday && driver ? [driver] : []), ...remaining];

  let badge: { label: string; tone: PillTone } = { label: 'Planned', tone: 'info' };
  if (route?.status === 'completed') badge = { label: 'Done', tone: 'success' };
  else if (route?.status === 'active') badge = { label: `${done} of ${stops.length} done`, tone: 'info' };

  if (!stops.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[2] }}>
        <Icon name="route" size={28} color={color.inkMuted} />
        <Text style={[type.body, { color: color.inkMuted, textAlign: 'center' }]}>
          {loading ? 'Loading…' : 'No stops this day. Search above to add one.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space[4] }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <RouteMap height={190} stops={mapStops} driver={isToday ? driver : null} line={line} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space[4], paddingVertical: space[3] }}>
        <StatRow compact items={route?.status === 'completed'
          ? [{ value: String(stops.length), label: 'stops' }, { value: String(stops.filter((s) => s.status === 'completed').length), label: 'completed' }]
          : [
            { value: String(remaining.length), label: done ? 'stops left' : 'stops' },
            { value: driveLabel, label: 'drive' },
            { value: fmtTime(finish), label: 'finish' },
          ]} />
        <StatusPill label={badge.label} tone={badge.tone} />
      </View>
      <ScrollView style={{ flex: 1, borderTopWidth: 1, borderTopColor: color.divider }} contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
        {canOptimize ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[2] }}>
            <Text style={type.caption}>{route?.status === 'active' ? 'Stops left' : 'Stop order'}</Text>
            <Button size="sm" variant="text" icon="route" label="Optimize order" loading={optimizing} onPress={() => onOptimize(route!)} />
          </View>
        ) : null}
        {stops.map((s, i) => (
          <StopListRow key={s.id} stop={s} isCurrent={s.id === current?.id} showEta={route?.status !== 'completed'} onPress={() => onOpenStop(s)} />
        ))}
        <Text style={[type.caption, { paddingTop: space[3] }]}>Tap a stop to see its details or fix its address.</Text>
      </ScrollView>
    </View>
  );
}

function StopListRow({ stop, isCurrent, showEta, onPress }: { stop: Stop; isCurrent: boolean; showEta: boolean; onPress: () => void }) {
  const done = isDone(stop);
  const eta = showEta && !done && stop.status !== 'arrived' ? stop.eta : null;
  const late = !!eta && !!stop.window_end && Date.parse(eta) > Date.parse(stop.window_end);
  const status = stop.status === 'completed' ? ['Done', 'success'] : stop.status === 'no_show' ? ['No-show', 'warning']
    : stop.status === 'skipped' ? ['Skipped', 'neutral'] : stop.status === 'arrived' ? ['Arrived', 'info']
    : stop.status === 'en_route' ? ['On the way', 'info'] : isCurrent ? ['Next', 'info'] : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${stop.customer_name}, ${stop.address}${done ? ', done' : isCurrent ? ', next' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: done ? color.divider : color.brand }} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{stop.customer_name}</Text>
        <Text style={type.caption} numberOfLines={1}>{stop.address}{stop.notes ? ` · ${stop.notes}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {eta ? (
          <Text style={[type.caption, { fontFamily: font.semibold, color: late ? color.warning : color.ink }]}>
            {stop.eta_approx ? '~' : ''}{fmtTime(eta)}{late ? ' · late' : ''}
          </Text>
        ) : <Text style={type.caption}>{done ? fmtTime(stop.marked_at) : fmtWindow(stop)}</Text>}
        {status ? <StatusPill label={status[0]} tone={status[1] as PillTone} />
          : eta ? <Text style={type.caption}>{fmtWindow(stop)}</Text> : null}
      </View>
    </Pressable>
  );
}

function AddStopSearch({ dayLabel, near, onAdd, children }: {
  dayLabel: string; near: LatLng | null; onAdd: (p: Place) => Promise<void>; children: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const open = q.trim().length > 0;

  useEffect(() => {
    if (!open) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAddress(q, near, ctrl.signal).then((r) => { setResults(r); setErr(null); }).catch((e) => {
        if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open, near]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space[4], paddingTop: space[3], paddingBottom: space[3], backgroundColor: color.surface, zIndex: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 44, paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider }}>
          <Icon name="search" size={20} color={color.inkMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder={`Add a stop to ${dayLabel}`} placeholderTextColor={color.inkMuted}
            accessibilityLabel="Add a stop by address" autoCorrect={false}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink, paddingVertical: 0 }} />
          {open ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8}><Icon name="close" size={16} color={color.inkMuted} /></Pressable> : null}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {children}
        {open ? (
          <>
            <Pressable accessibilityLabel="Close search" onPress={() => setQ('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -200, backgroundColor: color.scrim }} />
            <View style={[{ position: 'absolute', top: 0, left: space[4], right: space[4], backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.divider, overflow: 'hidden' }, shadow.float]}>
              {results.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={async () => {
                  try { await onAdd(p); setQ(''); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
                  <Icon name="pin" size={20} color={color.inkMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
                    <Text style={type.caption} numberOfLines={1}>{p.detail}</Text>
                  </View>
                  <Text style={[type.caption, { fontFamily: font.semibold, color: color.actionInk }]}>Add to {dayLabel}</Text>
                </Pressable>
              ))}
              {!results.length || err ? (
                <Text style={[type.body, { color: err ? color.danger : color.inkMuted, padding: space[3] }]}>{err ?? 'No matching addresses'}</Text>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
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

