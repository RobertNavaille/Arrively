import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { backend } from '../src/lib/backend';
import { confirmAction, showMessage } from '../src/lib/dialog';
import { useRoadPath, useRoadRoute } from '../src/lib/directions';
import { bearingDeg, dayKey, distanceM, pathAhead, estimateDriveMin, fmtDuration, fmtTime, miles, routeTotals } from '../src/lib/geo';
import { currentPosition, enableCompass, startSharing, stopSharing, useCompassHeading, useLivePosition, useTravelBearing } from '../src/lib/location';
import { lockedOrder, type RoutePlan } from '../src/lib/routing';
import { currentStop, lastMarked, useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { isDone, type LatLng, type Stop } from '../src/lib/types';
import { AutoButton } from '../src/ui/AutoButton';
import { BottomSheet } from '../src/ui/BottomSheet';
import { ReorderList } from '../src/ui/ReorderList';
import { Banner, Button, DetailRow, IconButton, StatusPill } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, shadow, space, type } from '../src/ui/theme';

export { ScreenError as ErrorBoundary } from '../src/ui/ScreenError';

const RADIUS_M = 75;
// A strip of map always shows above the sheet, even pulled all the way up.
const MAP_STRIP = 68;

function openDirections(s: Stop) {
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  Linking.openURL(url);
}

/**
 * The trip in one view: the map fills the screen and the trip sits in a sheet
 * over it. The sheet's top is pinned and shows the step the driver is on (next
 * stop, on the way, arrived); below it, the stops after this one and the ones
 * done. Scrolling slides the sheet up over the map. My day only lists stops.
 */
export default function Trip() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { routeFor, refresh } = useDriverData();
  const pos = useLivePosition();
  const travel = useTravelBearing(pos);
  const compass = useCompassHeading();
  const route = routeFor(dayKey(new Date()));
  const [review, setReview] = useState<{ plan: RoutePlan; from: LatLng | null } | null>(null);
  // In review the driver can drag the stops into their own order; null = the suggested one.
  const [custom, setCustom] = useState<string[] | null>(null);
  // Stops the driver locked in place (tapping their circle); the rest are optimized around them.
  const [locked, setLocked] = useState<string[]>([]);
  // Set while a stop is held by its grip, so the sheet doesn't move with the drag.
  const holding = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The height of the sheet's top card (measured) and what's covered at the
  // bottom of the screen (home indicator, Safari's floating bar), so each step
  // rests with its card, Arrived and Cancel route included, fully above it.
  const [cardH, setCardH] = useState<number | null>(null);
  const bottomInset = useBottomInset();
  // The driver moved the map by hand: stop following until they re-center.
  const [freeMap, setFreeMap] = useState(false);
  // Arrived: Complete stop opens the ways to mark it (complete, no show, skip).
  const [choosing, setChoosing] = useState(false);

  const stops = route?.stops ?? [];
  const byId = new Map(stops.map((s) => [s.id, s]));
  const done = stops.filter(isDone);
  const remaining = stops.filter((s) => !isDone(s));
  const current = currentStop(route);
  const phase = !current ? 'finished' : review ? 'review' : current.status === 'en_route' ? 'onroute' : current.status === 'arrived' ? 'arrived' : 'next';
  // In review the whole suggested order is listed; otherwise the stops after the current one.
  const shown = review ? custom ?? review.plan.order : null;
  const reviewOrder = shown ? shown.map((id) => byId.get(id)).filter((s): s is Stop => !!s) : null;
  const ahead = reviewOrder ?? remaining;
  const after = reviewOrder ?? remaining.filter((s) => s.id !== current?.id);
  const was = new Map((review?.plan.current.order ?? []).map((id, i) => [id, i]));
  // Where each locked stop sits, and the best order that keeps them there (Auto's order).
  const slots = Object.fromEntries(locked.map((id) => [id, shown?.indexOf(id) ?? -1]).filter(([, i]) => (i as number) >= 0));
  const slotsKey = JSON.stringify(slots);
  const best = useMemo(() => review && route ? lockedOrder(review.plan, route, review.from, slots) : null,
    [review, slotsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The road route for the whole trip ahead, and for the leg to the current stop.
  const road = useRoadPath(pos, ahead);
  const heading = phase === 'next' || phase === 'onroute';
  const leg = useRoadRoute(heading ? pos : null, heading && current ? current : null);
  const legMeters = leg ? leg.distanceM : pos && current ? distanceM(pos, current) : null;
  const legMin = leg ? Math.max(1, Math.round(leg.durationS / 60)) : legMeters != null ? estimateDriveMin(legMeters) : null;
  const straight = routeTotals(ahead, pos);
  const tripMin = road ? Math.round(road.durationS / 60) : straight.driveMin;
  const tripMeters = road ? road.distanceM : straight.meters;

  const away = current && pos ? distanceM(pos, current) > RADIUS_M * 2 : false;
  const marked = lastMarked(route);
  const justMarked = phase === 'next' && marked?.marked_at && Date.now() - Date.parse(marked.marked_at) < 15 * 60 * 1000;
  const canOptimize = !!route && route.status !== 'completed' && remaining.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;
  // Optimize route floats over the list while the next stop is up (not mid-drive, at a stop or in review).
  const floatOptimize = phase === 'next' && canOptimize;
  // Each step starts with the sheet at its resting height.
  // Each step follows the driver again (the sheet itself goes back to rest on its own).
  useEffect(() => { setFreeMap(false); setChoosing(false); }, [phase]);

  if (!route || !stops.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], backgroundColor: color.surface }}>
        <Text style={type.body}>No stops today.</Text>
        <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
      </View>
    );
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); }
    catch (e) {
      showMessage('Something went wrong', e instanceof Error ? e.message : String(e));
      // The stop may have moved on without us (arrival is also detected from location): catch up.
      refresh();
    }
    finally { setBusy(null); }
  }
  const optimize = () => run('plan', async () => {
    const here = pos ?? (await currentPosition());
    setCustom(null);
    setLocked([]);
    setReview({ plan: await backend.planRoute(route.id, here), from: here });
  });
  const useOrder = () => run('apply', async () => {
    if (!review) return;
    await backend.applyPlan(route.id, custom ?? review.plan.order, review.from);
    setReview(null);
    setCustom(null);
    setLocked([]);
    await refresh();
  });
  // The suggested order is shown as null (no custom order).
  const showOrder = (order: string[]) => setCustom(review && order.join() === review.plan.order.join() ? null : order);
  // Locking keeps the stop where it is now and re-optimizes the others around it; unlocking
  // leaves the order alone (Auto then offers the best order without that lock).
  const toggleLock = (id: string) => {
    if (!review || !shown) return;
    if (locked.includes(id)) { setLocked(locked.filter((x) => x !== id)); return; }
    const next = [...locked, id];
    setLocked(next);
    showOrder(lockedOrder(review.plan, route, review.from, Object.fromEntries(next.map((x) => [x, shown.indexOf(x)]))));
  };
  const startDriving = () => run('start', async () => {
    if (!current) return;
    // Asked from this tap: iPhone browsers share the compass only once allowed.
    await enableCompass();
    // The first drive starts the trip: location sharing and the customers' texts begin here.
    if (route.status === 'planned') {
      await backend.startRoute(route.id);
      const ok = await startSharing();
      if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
    }
    await backend.startTrip(current.id);
    await refresh();
  });
  async function mark(outcome: 'completed' | 'no_show') {
    if (!current) return;
    const here = pos ?? (await currentPosition());
    if (here && distanceM(here, current) > RADIUS_M * 2) {
      const ok = await confirmAction('You are away from this stop', 'Marking it from here is flagged to your business. Mark it anyway?', 'Mark it');
      if (ok) await run(outcome, async () => { await backend.markStop(current.id, outcome, 'Marked away from the stop', here); await refresh(); });
      return;
    }
    await run(outcome, async () => { await backend.markStop(current.id, outcome, null, here); await refresh(); });
  }
  const call = current?.customer_phone ? () => Linking.openURL(`tel:${current.customer_phone}`) : undefined;
  const message = () => showMessage('Coming soon', 'Chat with customers arrives in the next build.');

  // The map: the whole trip, or once arrived, this stop alone.
  const order = [...done, ...ahead];
  // On the way, the map follows the drive: the driver and this leg only.
  const focus = phase === 'arrived' || phase === 'onroute';
  const mapStops: MapStop[] = focus ? [] : order.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    state: isDone(s) ? 'done' : s.id === (reviewOrder?.[0] ?? current)?.id ? 'next' : 'upcoming',
  }));
  // The route line starts at the driver: the road route is fetched only every
  // so often, so what's already behind them is trimmed off on every fix.
  const trimmed = (path: LatLng[]) => (pos ? [pos, ...pathAhead(path, pos)] : path);
  const line = phase === 'arrived' ? undefined
    : phase === 'onroute' && current ? trimmed([...(leg ? leg.path : []), current])
    : road ? trimmed(road.path) : [...(pos ? [pos] : []), ...ahead];
  // The sheet rests a third of the way down, or lower on the way: just low
  // enough that the step's card (with Arrived) sits above what's covered at the
  // bottom. Never so low that the card would slip under it.
  const sheetArea = height - MAP_STRIP;
  const cardRest = cardH != null ? Math.max(0, Math.round(sheetArea - cardH - bottomInset)) : null;
  const peek = phase === 'onroute' && cardRest != null ? cardRest : Math.min(Math.round(height * 0.36), cardRest ?? Infinity);

  return (
    <View style={{ flex: 1, backgroundColor: color.mapGround }}>
      <RouteMap height={height} stops={mapStops} driver={pos} line={line}
        pin={focus ? current : null} pinLabel={phase === 'arrived' ? current?.address.split(',')[0] : undefined}
        inset={{ top: phase === 'onroute' ? 84 : 0, bottom: height - peek - MAP_STRIP }}
        // On the way it's a navigation view: the map follows the driver, who stays centred.
        follow={phase === 'onroute' && !freeMap}
        // The way the driver faces: the compass when there is one, else their direction of travel.
        driverHeading={compass ?? travel}
        onUserMove={() => { if (phase === 'onroute') setFreeMap(true); }}
        // After they take over, the map stays where they put it (no jump to the overview).
        hold={phase === 'onroute' && freeMap}
        // Direction of travel is up; before the driver moves, the stop is.
        bearing={travel ?? (pos && current ? bearingDeg(pos, current) : 0)} />

      {phase === 'onroute' && freeMap ? (
        <Pressable onPress={() => setFreeMap(false)} accessibilityRole="button" accessibilityLabel="Re-center on your location"
          style={[{ position: 'absolute', top: 72, right: space[4], zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: color.surface }, shadow.float]}>
          <Icon name="navigate" size={16} color={color.actionInk} />
          <Text style={[type.bodyStrong, { color: color.actionInk }]}>Re-center</Text>
        </Pressable>
      ) : null}

      {/* On the way: where to, across the top of the map. */}
      {phase === 'onroute' && current ? (
        <Pressable onPress={() => openDirections(current)} accessibilityRole="button" accessibilityLabel={`Directions to ${current.address}`}
          style={[{ position: 'absolute', top: 12, left: space[4], right: space[4], zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: 10, borderRadius: radius.md, backgroundColor: color.surface }, shadow.float]}>
          <Icon name="navigate" size={18} color={color.ink} />
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{current.address}</Text>
        </Pressable>
      ) : null}

      {/* The sheet moves only when dragged (or scrolled) itself; the map above it pans and zooms. */}
      <BottomSheet top={MAP_STRIP} rest={peek} resetKey={phase} startOpen={phase === 'review'} bottomInset={bottomInset + (floatOptimize || phase === 'review' ? OPTIMIZE_SPACE : 0)} hold={holding} header={
        // The step the driver is on: stays at the top of the sheet while the list scrolls.
        <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== cardH) setCardH(h); }}
          style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], gap: space[3], borderBottomWidth: phase === 'arrived' || phase === 'next' || phase === 'review' ? 0 : 1, borderBottomColor: color.divider }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.divider, alignSelf: 'center' }} />

          {phase === 'next' && current ? (
            <>
              {justMarked && marked ? (
                <Banner title={marked.status === 'completed' ? 'Stop complete' : marked.status === 'no_show' ? 'Marked no-show' : 'Stop skipped'}
                  meta={`${marked.customer_name} · ${fmtTime(marked.marked_at)}`} />
              ) : null}
              {/* The next stop sits on the trip's line: its circle and line run on into the stops after it. */}
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <View style={{ width: 20, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
                  <View style={styles.nextDot} />
                  {after.length ? <View style={[styles.line, { marginBottom: -space[4] }]} /> : null}
                </View>
                <View style={{ flex: 1, gap: space[3] }}>
                  <StopHeading stop={current} onCall={call} onMessage={message} />
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[3] }}>
                    {legMin != null ? (
                      <Text style={type.body}><Text style={type.bodyStrong}>{legMin} min</Text>
                        <Text style={{ color: color.inkMuted }}> · {miles(legMeters!).toFixed(1)} mi</Text></Text>
                    ) : null}
                    {current.notes ? <Text style={[type.body, { flex: 1, color: color.inkMuted }]} numberOfLines={1}>{current.notes}</Text> : null}
                  </View>
                  <Button label="Start driving" onPress={startDriving} loading={busy === 'start'} />
                </View>
              </View>
            </>
          ) : null}

          {phase === 'review' && review ? (
            // Optimize route: the trip's drive time and distance under it follow the order as stops are dragged.
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 28, lineHeight: 34, color: color.ink }} accessibilityRole="header">Optimize route</Text>
                <Text style={[type.body, { fontSize: 16, lineHeight: 24, color: color.inkMuted }]}>
                  {fmtDuration(Math.max(1, tripMin))} · {miles(tripMeters).toFixed(1)} mi
                </Text>
              </View>
              {/* Auto: back to the suggested best order; only while the order differs from it. */}
              <AutoButton visible={!!best && !!shown && shown.join() !== best.join()} onPress={() => best && showOrder(best)} />
            </View>
          ) : null}

          {/* On the way: the drive leads; who it's to comes second. */}
          {phase === 'onroute' && current ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ flex: 1 }} accessible accessibilityLabel={`${legMin ?? '–'} minutes, ${legMeters != null ? miles(legMeters).toFixed(1) : '–'} miles to ${current.customer_name}`}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 34, lineHeight: 40, color: color.ink }}>{legMin != null ? `${legMin} min` : '–'}</Text>
                  <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]} numberOfLines={1}>
                    {legMeters != null ? `${miles(legMeters).toFixed(1)} mi · ` : ''}to {current.customer_name}
                  </Text>
                </View>
                {call ? <IconButton icon="phone" label={`Call ${current.customer_name}`} onPress={call} /> : null}
                <IconButton icon="navigate" label="Directions" onPress={() => openDirections(current)} />
              </View>
              <View style={{ gap: space[2] }}>
                <Button label="Arrived" loading={busy === 'arrived'}
                  onPress={() => run('arrived', async () => { await backend.markArrived(current.id); await refresh(); })} />
                {/* Started by mistake, or plans changed: back to the trip view. */}
                <Button variant="text" label="Cancel route" loading={busy === 'cancel'}
                  onPress={() => run('cancel', async () => { await backend.cancelTrip(current.id); await stopSharing(); await refresh(); })} />
              </View>
            </>
          ) : null}

          {/* Arrived: the stop's own moment; the list comes back once it's marked. */}
          {phase === 'arrived' && current ? (
            <View style={{ gap: space[4] }}>
              {away ? <Banner tone="warning" icon="alert" title="You left without marking this stop" meta="Mark it to start your next trip." /> : null}
              <View style={{ alignItems: 'center', gap: 4 }}>
                <StatusPill tone="info" icon="clock" label={`At stop${current.arrived_at ? ` since ${fmtTime(current.arrived_at)}` : ''}`} />
                <Text style={[type.title, { fontSize: 28, lineHeight: 34, marginTop: 6 }]} accessibilityRole="header">Arrived</Text>
                <Text style={[type.body, { color: color.inkMuted, textAlign: 'center' }]}>{current.customer_name} · {current.address.split(',')[0]}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[3] }}>
                {call ? <IconButton icon="phone" label={`Call ${current.customer_name}`} onPress={call} /> : null}
                <IconButton icon="message" label={`Message ${current.customer_name}`} onPress={message} />
              </View>
              {current.notes ? <DetailRow icon="notes" primary={current.notes} /> : null}
              {choosing ? (
                <View style={{ gap: space[2] }}>
                  <Button label="Complete" loading={busy === 'completed'} onPress={() => mark('completed')} />
                  <Button variant="text" label="No show" loading={busy === 'no_show'} onPress={() => mark('no_show')} />
                  <Button variant="text" label="Skip" onPress={() => router.push(`/skip/${current.id}`)} />
                </View>
              ) : (
                <View style={{ gap: space[2] }}>
                  <Button icon="check" label="Complete stop" onPress={() => setChoosing(true)} />
                  {/* Arrived by mistake: back to on the way. */}
                  <Button variant="text" label="Continue route" loading={busy === 'undo'}
                    onPress={() => run('undo', async () => { await backend.undoArrived(current.id); await refresh(); })} />
                </View>
              )}
              <Text style={[type.caption, { textAlign: 'center' }]}>Mark this stop to start your next trip.</Text>
            </View>
          ) : null}

          {phase === 'finished' ? (
            <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
              <Text style={type.title}>Every stop is marked</Text>
              <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
            </View>
          ) : null}
        </View>
      }>
        {/* The rest of the sheet: the stops after this one, then the ones done. */}
        <View style={{ paddingBottom: space[8] }}>
          {phase !== 'arrived' ? (
            <>
              {after.length && !review ? (
                <View style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4] }}>
                  {/* While the next stop is up, the trip's line passes beside the heading. */}
                  {phase === 'next' ? <View style={{ width: 20, alignItems: 'center' }}><View style={[styles.line, { marginTop: 0 }]} /></View> : null}
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[4], paddingBottom: space[3] }}>
                    <Text style={type.heading}>{review ? 'New order' : 'After this'} · {after.length} {after.length === 1 ? 'stop' : 'stops'}</Text>
                    <Text style={type.caption}>{fmtDuration(Math.max(1, tripMin))} · {miles(tripMeters).toFixed(1)} mi</Text>
                  </View>
                </View>
              ) : null}
              <View accessibilityRole="list" style={{ paddingHorizontal: space[4], paddingTop: review ? space[2] : 0 }}>
                {review ? (
                  // Reviewing: drag stops by their grip; ones now earlier than the driver's order are in blue.
                  // Locked stops have no grip and stay put while others are dragged past them.
                  <ReorderList items={after} keyOf={(s) => s.id} hold={holding} fixed={(s) => locked.includes(s.id)}
                    onReorder={(list) => setCustom(list.map((s) => s.id))}
                    renderRow={(s, i, grip) => {
                      const before = was.get(s.id);
                      return <AheadRow stop={s} detail={s.address.split(',')[0]} last={i === after.length - 1}
                        highlight={before != null && i < before} trailing={grip}
                        lock={{ on: locked.includes(s.id), toggle: () => toggleLock(s.id) }} />;
                    }} />
                ) : after.map((s, i) => (
                  <AheadRow key={s.id} stop={s} detail={s.address.split(',')[0]} last={i === after.length - 1}
                    onPress={() => router.push(`/stop/${s.id}`)} />
                ))}
              </View>
              {done.length && !review ? (
                <>
                  <Text style={[type.caption, { fontFamily: font.semibold, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], borderTopWidth: after.length ? 1 : 0, borderTopColor: color.divider }]}>
                    Done · {done.length}
                  </Text>
                  {done.map((s) => (
                    <Pressable key={s.id} onPress={() => router.push(`/stop/${s.id}`)} accessibilityRole="button" accessibilityLabel={`${s.customer_name}, done`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[4] }}>
                      <View style={{ width: 20, alignItems: 'center' }}><Icon name="check" size={18} color={color.inkMuted} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, { fontSize: 16, lineHeight: 22, color: color.inkMuted }]}>{s.customer_name}</Text>
                        <Text style={type.caption}>{s.address.split(',')[0]}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </BottomSheet>

      {/* Reviewing: Confirm route takes Optimize route's place, in blue. */}
      {phase === 'review' && review ? (
        <View style={[styles.floatBar, { bottom: bottomInset + space[4] }]}>
          <Button size="compact" icon="check" label="Confirm route" loading={busy === 'apply'} onPress={useOrder} style={shadow.float} />
        </View>
      ) : null}
      {/* Optimize route floats at the bottom, over the trip list, wherever it's scrolled. */}
      {floatOptimize ? (
        <View style={[styles.floatBar, { bottom: bottomInset + space[4] }]}>
          <Button variant="neutral" icon="route" label="Optimize route" loading={busy === 'plan'} onPress={optimize} style={shadow.float} />
        </View>
      ) : null}
    </View>
  );
}

// Room at the end of the list so its last stop can scroll clear of the floating button.
const OPTIMIZE_SPACE = 44 + space[4] * 2;
const styles = StyleSheet.create({
  // The trip's line, shared by the next stop, the list heading and the stops after it.
  line: { flex: 1, width: 2, marginTop: 4, backgroundColor: color.divider },
  nextDot: { marginTop: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: color.action, borderWidth: 4, borderColor: color.brandTint },
  floatBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' },
});

function StopHeading({ eyebrow, stop, onCall, onMessage }: { eyebrow?: string; stop: Stop; onCall?: () => void; onMessage: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[type.label, { textTransform: 'uppercase', color: color.actionInk }]}>{eyebrow}</Text> : null}
        <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]} accessibilityRole="header"
          accessibilityLabel={eyebrow ? undefined : `Next stop: ${stop.customer_name}`}>{stop.customer_name}</Text>
        <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]}>{stop.address.split(',')[0]}</Text>
      </View>
      {onCall ? <IconButton icon="phone" label={`Call ${stop.customer_name}`} onPress={onCall} /> : null}
      <IconButton icon="message" label={`Message ${stop.customer_name}`} onPress={onMessage} />
    </View>
  );
}

function AheadRow({ stop, detail, last, onPress, highlight, trailing, lock }: {
  stop: Stop; detail: string; last: boolean; onPress?: () => void;
  /** Moved earlier in a new order: the name is blue. */
  highlight?: boolean;
  trailing?: ReactNode;
  /** Reviewing: the circle locks the stop in place, and shows a lock while it is. */
  lock?: { on: boolean; toggle: () => void };
}) {
  const marker = lock?.on
    ? <View style={{ marginTop: 3, height: 20, alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={20} color={color.action} strokeWidth={2} /></View>
    : <View style={{ marginTop: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: color.surface, borderWidth: 3, borderColor: color.action }} />;
  const label = `${stop.customer_name}, ${detail}${highlight ? ', moved earlier' : ''}`;
  const content = (
    <>
      <View style={{ width: 20, alignItems: 'center' }}>
        {lock ? (
          <Pressable onPress={lock.toggle} hitSlop={12} accessibilityRole="button"
            accessibilityLabel={lock.on ? `Unlock ${stop.customer_name}` : `Lock ${stop.customer_name} in this place`}
            accessibilityState={{ selected: lock.on }}>
            {marker}
          </Pressable>
        ) : marker}
        {last ? null : <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: color.divider }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: 20 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 18, lineHeight: 26, color: highlight ? color.actionInk : color.ink }}>{stop.customer_name}</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }}>{detail}</Text>
      </View>
      {trailing}
    </>
  );
  // Without a press (reviewing) it's a plain row, so its lock button stays enabled.
  if (!onPress) return <View accessibilityLabel={label} style={{ flexDirection: 'row', gap: space[3] }}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space[3] }, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}
