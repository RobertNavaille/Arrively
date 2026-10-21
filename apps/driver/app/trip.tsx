import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { useRoadPath } from '../src/lib/directions';
import { dayKey, fmtDuration, fmtTime, miles, parseDay, routeTotals } from '../src/lib/geo';
import { currentPosition, startSharing, useLivePosition } from '../src/lib/location';
import type { RoutePlan } from '../src/lib/routing';
import { currentStop, lastMarked, useDriverData } from '../src/lib/store';
import { isDone, type LatLng, type Stop } from '../src/lib/types';
import { Banner, Button, IconButton, StatRow } from '../src/ui/components';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, space, type } from '../src/ui/theme';

/**
 * The trip: today's stops as a route. Optimize the order here, then go stop
 * by stop; marking a stop comes back here. My day only lists the stops.
 */
export default function Trip() {
  const router = useRouter();
  const { routeFor, refresh } = useDriverData();
  const pos = useLivePosition();
  const route = routeFor(dayKey(new Date()));
  const [review, setReview] = useState<{ plan: RoutePlan; from: LatLng | null } | null>(null);
  const [busy, setBusy] = useState<'plan' | 'apply' | 'go' | null>(null);

  const stops = route?.stops ?? [];
  const done = stops.filter(isDone);
  const remaining = stops.filter((s) => !isDone(s));
  const byId = new Map(stops.map((s) => [s.id, s]));
  // While reviewing, the stops left are shown in the suggested order.
  const ahead = review ? review.plan.order.map((id) => byId.get(id)).filter((s): s is Stop => !!s) : remaining;
  const next = review ? ahead[0] : currentStop(route);
  const was = new Map((review?.plan.current.order ?? []).map((id, i) => [id, i]));
  const road = useRoadPath(pos, ahead);
  const marked = lastMarked(route);
  const showBanner = !review && marked?.marked_at && Date.now() - Date.parse(marked.marked_at) < 15 * 60 * 1000;

  if (!route || !stops.length) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], backgroundColor: color.surface }}>
        <Text style={type.body}>No stops today.</Text>
        <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  // Road figures for the order shown when Mapbox has them; the same
  // straight-line estimate for any order otherwise, so orders compare fairly.
  const straight = routeTotals(ahead, pos);
  const driveMin = road ? Math.round(road.durationS / 60) : straight.driveMin;
  const meters = road ? road.distanceM : straight.meters;
  const savedMin = review ? Math.round((review.plan.current.drive_s - review.plan.drive_s) / 60) : 0;
  const same = review ? review.plan.order.join() === review.plan.current.order.join() : false;
  const canOptimize = route.status !== 'completed' && remaining.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;

  const order = [...done, ...ahead];
  const mapStops: MapStop[] = order.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    state: isDone(s) ? 'done' : s.id === next?.id ? 'next' : 'upcoming',
  }));
  const line = road ? [...(pos ? [pos] : []), ...road.path] : [...(pos ? [pos] : []), ...ahead];

  async function optimize() {
    setBusy('plan');
    try {
      const here = pos ?? (await currentPosition());
      setReview({ plan: await backend.planRoute(route!.id, here), from: here });
    } catch (e) { showMessage('Could not optimize', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function useOrder() {
    if (!review) return;
    setBusy('apply');
    try { await backend.applyPlan(route!.id, review.plan.order, review.from); setReview(null); await refresh(); }
    catch (e) { showMessage('Could not save the order', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function go() {
    if (!next) return;
    setBusy('go');
    try {
      // The trip starts with the first stop: location sharing and the customers' texts begin here.
      if (route!.status === 'planned') {
        await backend.startRoute(route!.id);
        const ok = await startSharing();
        if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
      }
      router.push(`/stop/${next.id}`);
    } catch (e) { showMessage('Could not start', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const goLabel = !next ? '' : next.status === 'en_route' ? `Continue to ${next.customer_name}`
    : next.status === 'arrived' ? `Back to ${next.customer_name}` : `Go to ${next.customer_name}`;
  const headline = same ? 'Your order is already the best'
    : savedMin >= 1 ? `Best order saves ${fmtDuration(savedMin)} of driving` : 'About the same drive time';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <IconButton icon="back" label="Back to My day" variant="plain" onPress={() => router.replace('/')} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.heading} accessibilityRole="header">Trip</Text>
          <Text style={type.caption}>{parseDay(route.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: space[4] }}>
        <RouteMap height={240} stops={mapStops} driver={pos} line={line} />
        <View style={{ padding: space[4], gap: space[3] }}>
          <StatRow compact items={[
            { value: String(ahead.length), label: done.length ? 'stops left' : 'stops' },
            { value: fmtDuration(Math.max(1, driveMin)), label: 'drive' },
            { value: miles(meters).toFixed(1), label: 'miles' },
          ]} />
          {review ? (
            <View style={{ gap: 2, padding: space[3], borderRadius: radius.md, backgroundColor: color.brandTint }}>
              <Text style={[type.bodyStrong, { color: color.onTint }]}>{headline}</Text>
              <Text style={[type.caption, { color: color.onTint }]}>From your location. Stops that move are marked below.</Text>
            </View>
          ) : null}
          {showBanner && marked ? (
            <Banner title={marked.status === 'completed' ? 'Stop complete' : marked.status === 'no_show' ? 'Marked no-show' : 'Stop skipped'}
              meta={`${marked.customer_name} · ${fmtTime(marked.marked_at)}`} />
          ) : null}
        </View>

        {/* The stops as a sequence, from where the driver is. */}
        <View accessibilityRole="list" style={{ paddingHorizontal: space[4] }}>
          <TimelineRow dot="start" title="Your location" last={!order.length} />
          {order.map((s, i) => {
            const before = was.get(s.id);
            const after = review ? ahead.indexOf(s) : -1;
            const moved = review && before != null && before !== after ? (before > after ? 'Moved earlier' : 'Moved later') : '';
            return (
              <TimelineRow key={s.id} last={i === order.length - 1}
                dot={isDone(s) ? 'done' : s.id === next?.id ? 'next' : 'upcoming'}
                title={s.customer_name} detail={`${moved ? `${moved} · ` : ''}${s.address.split(',')[0]}`}
                onPress={() => router.push(`/stop/${s.id}`)} />
            );
          })}
        </View>
      </ScrollView>

      <View style={{ padding: space[4], paddingBottom: space[6], gap: space[2], borderTopWidth: 1, borderTopColor: color.divider }}>
        {review ? (
          same ? <Button label="Done" onPress={useOrder} loading={busy === 'apply'} /> : (
            <>
              <Button label="Use this order" onPress={useOrder} loading={busy === 'apply'} />
              <Button variant="text" label="Keep my order" onPress={() => setReview(null)} />
            </>
          )
        ) : next ? (
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Button label={goLabel} onPress={go} loading={busy === 'go'} style={{ flex: 1 }} />
            {canOptimize ? (
              <Button variant="secondary" icon="route" label={route.optimized_at ? 'Optimize again' : 'Optimize'}
                iconOnly={!!route.optimized_at} loading={busy === 'plan'} onPress={optimize} />
            ) : null}
          </View>
        ) : (
          <>
            <Text style={[type.body, { color: color.inkMuted, textAlign: 'center' }]}>Every stop is marked.</Text>
            <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function TimelineRow({ dot, title, detail, last, onPress }: {
  dot: 'start' | 'done' | 'next' | 'upcoming'; title: string; detail?: string; last: boolean; onPress?: () => void;
}) {
  const fill = dot === 'done' ? color.inkMuted : dot === 'next' ? color.action : color.surface;
  const edge = dot === 'done' ? color.inkMuted : color.action;
  const muted = dot === 'done' || dot === 'start';
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ''}${dot === 'done' ? ', done' : dot === 'next' ? ', next' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space[3] }, pressed && { opacity: 0.6 }]}>
      <View style={{ width: 20, alignItems: 'center' }}>
        {dot === 'start' ? (
          <View style={{ marginTop: 5, width: 14, height: 14, borderRadius: 7, backgroundColor: color.brand, borderWidth: 3, borderColor: color.brandTint }} />
        ) : (
          <View style={{ marginTop: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: fill, borderWidth: 3, borderColor: edge }} />
        )}
        {last ? null : <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: color.divider }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: 20 }}>
        <Text style={{ fontFamily: dot === 'start' ? font.regular : font.semibold, fontSize: dot === 'start' ? 16 : 18, lineHeight: 26, color: muted ? color.inkMuted : color.ink }}>{title}</Text>
        {detail ? <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.inkMuted }}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
