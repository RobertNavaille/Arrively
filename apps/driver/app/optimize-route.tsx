import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { useRoadPath } from '../src/lib/directions';
import { dayKey, distanceM, routeTotals } from '../src/lib/geo';
import { currentPosition, useLivePosition } from '../src/lib/location';
import { lockedOrder, optionsOf, SPEED, type RouteOptions, type RoutePlan, type TravelMode } from '../src/lib/routing';
import { sendOptimizeSignal } from '../src/lib/optimizeSignal';
import { useDriverData } from '../src/lib/store';
import { isDone, type LatLng, type Stop } from '../src/lib/types';
import { useBottomInset } from '../src/lib/viewport';
import { AutoButton } from '../src/ui/AutoButton';
import { SelectChip, ToggleChip } from '../src/ui/Chips';
import { Button } from '../src/ui/components';
import { NATIVE_CHROME } from '../src/ui/nativeChrome';
import { ReorderList } from '../src/ui/ReorderList';
import { RouteMap } from '../src/ui/RouteMap';
import { RowMenu, RowMenuHost } from '../src/ui/RowMenu';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, space, type } from '../src/ui/theme';
import { AheadRow, TripTotals } from '../src/ui/TripParts';

/**
 * Optimize route, in its own sheet (Apple's page sheet on iPhone): today's
 * stops left in the best order, on a map. Drag stops by their grip, lock one in
 * its place or edit it (press and hold its row), or change how the trip is travelled; Confirm route
 * saves the order and the options.
 */
export default function OptimizeRoute() {
  const router = useRouter();
  const bottomInset = useBottomInset();
  const { routeFor, refresh } = useDriverData();
  const route = routeFor(dayKey(new Date()));
  const pos = useLivePosition();
  const [review, setReview] = useState<{ plan: RoutePlan; from: LatLng | null } | null>(null);
  // The driver's own order (dragged or with locks); null = the suggested one.
  const [custom, setCustom] = useState<string[] | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [options, setOptions] = useState<RouteOptions>(() => (route ? optionsOf(route) : {}));
  const [busy, setBusy] = useState<string | null>('plan');
  // While a stop is held by its grip the list doesn't scroll (and the sheet doesn't move).
  const [dragging, setDragging] = useState(false);
  const hold = useMemo(() => {
    let v = false;
    return { get current() { return v; }, set current(x: boolean) { v = x; setDragging(x); } };
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); }
    catch (e) { showMessage('Something went wrong', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  // Planned once on opening, from where the driver is.
  const planned = useRef(false);
  useEffect(() => {
    if (planned.current || !route) return;
    planned.current = true;
    run('plan', async () => {
      const here = pos ?? (await currentPosition());
      setReview({ plan: await backend.planRoute(route.id, here, optionsOf(route)), from: here });
    });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map((route?.stops ?? []).map((s) => [s.id, s]));
  const shown = review ? custom ?? review.plan.order : [];
  const order = shown.map((id) => byId.get(id)).filter((s): s is Stop => !!s && !isDone(s));
  const was = new Map((review?.plan.current.order ?? []).map((id, i) => [id, i]));
  const slots = Object.fromEntries(locked.map((id) => [id, shown.indexOf(id)]).filter(([, i]) => (i as number) >= 0));
  const slotsKey = JSON.stringify(slots);
  // The best order that keeps the locked stops where they are (what Auto goes back to).
  const best = useMemo(() => (review && route ? lockedOrder(review.plan, route, review.from, slots) : null),
    [review, slotsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The trip's totals follow the order as it changes: the road route, or straight lines offline.
  // From where the driver is now, like the trip screen (where it was planned from, until a fix comes in).
  const from = pos ?? review?.from ?? null;
  const road = useRoadPath(from, order, options);
  const back = !!options.roundTrip && !!from && order.length > 0;
  const straightM = routeTotals(order, from).meters + (back ? distanceM(order[order.length - 1], from!) : 0);
  const tripMin = road ? Math.round(road.durationS / 60) : Math.max(1, Math.round((straightM * 1.3) / SPEED[options.mode ?? 'drive'] / 60));
  const tripMeters = road ? road.distanceM : straightM;
  const mapStops: MapStop[] = order.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, n: i + 1, state: i === 0 ? 'next' : 'upcoming' }));
  const line = road ? road.path : [...(from ? [from] : []), ...order, ...(back ? [from!] : [])];

  const showOrder = (next: string[]) => setCustom(review && next.join() === review.plan.order.join() ? null : next);
  const toggleLock = (id: string) => {
    if (!review) return;
    if (locked.includes(id)) { setLocked(locked.filter((x) => x !== id)); return; }
    const next = [...locked, id];
    setLocked(next);
    showOrder(lockedOrder(review.plan, route!, review.from, Object.fromEntries(next.map((x) => [x, shown.indexOf(x)]))));
  };
  // A changed option plans the route again with it; locked stops stay where they are.
  const changeOptions = (next: RouteOptions) => run('options', async () => {
    if (!review || !route) return;
    setOptions(next);
    const plan = await backend.planRoute(route.id, review.from, next);
    setReview({ plan, from: review.from });
    const keep = lockedOrder(plan, route, review.from, Object.fromEntries(locked.map((id) => [id, shown.indexOf(id)])));
    setCustom(keep.join() === plan.order.join() ? null : keep);
  });
  // The trip underneath keeps the old order on screen while this saves, then slides the new one in.
  const confirm = () => run('apply', async () => {
    if (!review || !route) return;
    sendOptimizeSignal('hold');
    try {
      await backend.applyPlan(route.id, custom ?? review.plan.order, review.from, options);
      await refresh();
    } catch (e) { sendOptimizeSignal('cancel'); throw e; }
    router.back();
    sendOptimizeSignal('go');
  });

  return (
    <RowMenuHost>
    <SafeAreaView edges={NATIVE_CHROME ? ['bottom'] : undefined} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], paddingTop: NATIVE_CHROME ? space[4] : space[2], paddingBottom: space[2] }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}><Button variant="text" label="Cancel" onPress={() => router.back()} /></View>
        <Text style={[type.heading, { fontSize: 17 }]} accessibilityRole="header">Optimize route</Text>
        <View style={{ flex: 1 }} />
      </View>
      {!route ? (
        <Text style={[type.body, { padding: space[4], color: color.inkMuted }]}>No stops today.</Text>
      ) : (
        <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingBottom: space[6] }}>
          <View style={{ paddingHorizontal: space[4] }}>
            <View style={{ borderRadius: 12, overflow: 'hidden' }}>
              <RouteMap height={220} stops={mapStops} driver={from} line={line} />
            </View>
          </View>
          {!review ? (
            <View style={{ alignItems: 'center', padding: space[8], gap: space[3] }}>
              <ActivityIndicator color={color.action} />
              <Text style={[type.body, { color: color.inkMuted }]}>Finding the best order…</Text>
            </View>
          ) : (
            <>
              <View style={{ paddingHorizontal: space[4], paddingTop: space[4], gap: space[3] }}>
                <TripTotals travelMin={tripMin} meters={tripMeters} stops={order.length} />
                {/* How to plan it: each change plans the route again. Walking and biking don't take the avoid options. */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }}
                  contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}>
                  <ToggleChip label="Round trip" selected={!!options.roundTrip} onPress={() => changeOptions({ ...options, roundTrip: !options.roundTrip })} />
                  <ToggleChip label="Avoid highways" selected={!!options.avoidHighways} disabled={options.mode !== 'drive' && !!options.mode}
                    onPress={() => changeOptions({ ...options, avoidHighways: !options.avoidHighways })} />
                  <ToggleChip label="Avoid tolls" selected={!!options.avoidTolls} disabled={options.mode !== 'drive' && !!options.mode}
                    onPress={() => changeOptions({ ...options, avoidTolls: !options.avoidTolls })} />
                  <SelectChip<TravelMode> label="Vehicle type" value={options.mode ?? 'drive'}
                    options={[{ value: 'drive', label: 'Drive' }, { value: 'walk', label: 'Walk' }, { value: 'bike', label: 'Bike' }]}
                    onChange={(mode) => changeOptions({ ...options, mode })} />
                </ScrollView>
              </View>
              {/* Drag stops by their grip; ones now earlier than the driver's order are in blue. Locked stops stay put. */}
              <View accessibilityRole="list" style={{ paddingHorizontal: space[4], paddingTop: space[4] }}>
                <ReorderList items={order} keyOf={(s) => s.id} hold={hold} fixed={(s) => locked.includes(s.id)}
                  onReorder={(list) => setCustom(list.map((s) => s.id))}
                  renderRow={(s, i, grip) => {
                    const before = was.get(s.id);
                    const on = locked.includes(s.id);
                    // Press and hold the row: Edit stop, and Lock in place (or Unlock).
                    return (
                      <RowMenu label={`${s.customer_name}, ${s.address.split(',')[0]}${on ? ', locked in place' : ''}`} items={[
                        { label: 'Edit stop', icon: 'edit', onPress: () => router.push({ pathname: '/new-stop', params: { id: s.id, day: route!.day } }) },
                        { label: on ? 'Unlock' : 'Lock in place', icon: 'lock', onPress: () => toggleLock(s.id) },
                      ]}>
                        <AheadRow stop={s} detail={s.address.split(',')[0]} last={i === order.length - 1}
                          highlight={before != null && i < before} trailing={grip} lock={{ on }} />
                      </RowMenu>
                    );
                  }} />
              </View>
            </>
          )}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], paddingBottom: space[4] + (NATIVE_CHROME ? 0 : bottomInset), borderTopWidth: 1, borderTopColor: color.divider }}>
        {/* Auto: back to the suggested best order (keeping locked stops), while the order differs from it. */}
        <AutoButton visible={!!best && shown.length > 0 && shown.join() !== best.join()} onPress={() => best && showOrder(best)} />
        <Button icon="check" label="Confirm route" onPress={confirm} loading={busy === 'apply'} disabled={!review || busy === 'options'} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
    </RowMenuHost>
  );
}
