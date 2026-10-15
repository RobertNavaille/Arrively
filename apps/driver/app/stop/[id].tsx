import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import { confirmAction, showMessage } from '../../src/lib/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../../src/lib/backend';
import { distanceM, estimateDriveMin, fmtTime, fmtWindow, miles } from '../../src/lib/geo';
import { currentPosition, useLivePosition } from '../../src/lib/location';
import { stopNumber, useDriverData } from '../../src/lib/store';
import { isDone, type Stop } from '../../src/lib/types';
import { Banner, Button, DetailRow, IconButton, PersonRow, StatRow, StatusPill, StopProgress } from '../../src/ui/components';
import { RouteMap } from '../../src/ui/RouteMap';
import { color, radius, shadow, space, type } from '../../src/ui/theme';

const RADIUS_M = 75;

function openDirections(s: Stop) {
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  Linking.openURL(url);
}

/** Screens 2–4: next stop, on route, arrived. The view follows the stop's status. */
export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stopById } = useDriverData();
  const found = stopById(String(id));
  const pos = useLivePosition();
  const [busy, setBusy] = useState<string | null>(null);

  // After the stop is marked, go back to My day (screen 5 = screen 1).
  useEffect(() => {
    if (found && isDone(found.stop)) router.replace('/');
  }, [found, router]);

  if (!found) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        <Text style={type.body}>This stop is no longer on your route.</Text>
        <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  const { route, stop } = found;
  const n = stopNumber(route, stop);
  const total = route.stops.length;
  const meters = pos ? distanceM(pos, stop) : null;
  const driveMin = meters != null ? estimateDriveMin(meters) : null;
  const eta = driveMin != null ? new Date(Date.now() + driveMin * 60000) : null;
  const farFromArrived = stop.status === 'arrived' && meters != null && meters > RADIUS_M * 2;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); }
    catch (e) { showMessage('Something went wrong', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function mark(outcome: 'completed' | 'no_show') {
    const here = pos ?? (await currentPosition());
    const away = here ? distanceM(here, stop) > RADIUS_M * 2 : false;
    if (away) {
      const ok = await confirmAction('You are away from this stop', 'Marking it from here is flagged to your business. Mark it anyway?', 'Mark it');
      if (ok) await run(outcome, () => backend.markStop(stop.id, outcome, 'Marked away from the stop', here));
      return;
    }
    await run(outcome, () => backend.markStop(stop.id, outcome, null, here));
  }

  const preview = stop.status === 'queued' || stop.status === 'scheduled';
  const statusText = preview ? `${total - n} more after this` : stop.status === 'en_route' ? 'On route' : 'Arrived';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <IconButton icon="back" label="Back to My day" variant="plain" onPress={() => router.replace('/')} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.heading}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={type.caption}>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <StopProgress current={n} total={total} status={farFromArrived ? 'Not marked yet' : statusText}
        statusColor={farFromArrived ? color.warning : undefined} />

      {preview ? (
        // ---- Screen 2: next stop ----
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: space[4] }}>
            <View style={{ paddingHorizontal: space[4] }}>
              <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                <RouteMap height={240} pin={stop} pinLabel={stop.address.split(',')[0]} driver={pos} line={pos ? [pos, stop] : undefined} />
              </View>
            </View>
            <View style={{ padding: space[4], gap: space[6] }}>
              <View style={{ gap: 4 }}>
                <PersonRow name={stop.customer_name} subtitle={stop.address} accent={pos ? 'From current location' : undefined}
                  onMessage={() => showMessage('Coming soon', 'Chat with customers arrives in the next build.')} />
                <Button variant="text" size="sm" label="Wrong address? Edit it" onPress={() => router.push(`/edit/${stop.id}`)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
              </View>
              <View style={{ gap: space[3] }}>
                <DetailRow icon="clock" primary={fmtWindow(stop)} secondary="Window promised to the customer" />
                {stop.notes ? <DetailRow icon="notes" primary={stop.notes} /> : null}
              </View>
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], paddingBottom: space[6], borderTopWidth: 1, borderTopColor: color.divider }}>
            {driveMin != null ? (
              <View>
                <Text style={[type.title, { fontSize: 20, lineHeight: 26 }]}>{driveMin} min</Text>
                <Text style={type.caption}>{miles(meters!).toFixed(1)} mi · {fmtTime(eta)}</Text>
              </View>
            ) : null}
            <Button label="Start trip" style={{ flex: 1 }} loading={busy === 'start'}
              onPress={() => run('start', () => backend.startTrip(stop.id))} />
          </View>
        </>
      ) : (
        // ---- Screens 3 and 4: on route / arrived ----
        <>
          <RouteMap height={stop.status === 'arrived' ? 260 : 340} pin={stop} pinLabel={stop.address.split(',')[0]}
            driver={pos} line={stop.status === 'en_route' && pos ? [pos, stop] : undefined} />
          <View style={[{ marginTop: -20, flex: 1, backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space[4], paddingTop: space[2], gap: space[4] }, shadow.sheet]}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.divider, alignSelf: 'center' }} />
            {stop.status === 'en_route' ? (
              <>
                <StatRow items={[
                  { value: driveMin != null ? String(driveMin) : '–', label: 'minutes' },
                  { value: meters != null ? miles(meters).toFixed(1) : '–', label: 'miles' },
                  { value: eta ? fmtTime(eta).replace(/ (am|pm)/, '') : '–', label: 'eta' },
                ]} />
                <PersonRow name={stop.customer_name} subtitle={stop.address}
                  onMessage={() => showMessage('Coming soon', 'Chat with customers arrives in the next build.')} />
                {stop.notes ? <DetailRow icon="notes" primary={stop.notes} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                  <Button label="Arrived" style={{ flex: 1 }} loading={busy === 'arrived'}
                    onPress={() => run('arrived', () => backend.markArrived(stop.id))} />
                  <Button variant="text" icon="navigate" label="Directions" onPress={() => openDirections(stop)} />
                </View>
                <Text style={[type.caption, { textAlign: 'center' }]}>Arrival is detected when you reach the stop. Use the button if it isn't.</Text>
              </>
            ) : (
              <ScrollView contentContainerStyle={{ gap: space[4], paddingBottom: space[6] }}>
                {farFromArrived ? (
                  <Banner tone="warning" icon="alert" title="You left without marking this stop" meta="Mark it to start your next trip." />
                ) : null}
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <StatusPill tone="info" icon="clock" label={`At stop${stop.arrived_at ? ` since ${fmtTime(stop.arrived_at)}` : ''}`} />
                  <Text style={[type.title, { marginTop: 4 }]}>Arrived</Text>
                  <Text style={type.caption}>{stop.customer_name} · {stop.address}</Text>
                </View>
                {stop.notes ? <DetailRow icon="notes" primary={stop.notes} /> : null}
                <Button icon="check" label="Complete stop" loading={busy === 'completed'} onPress={() => mark('completed')} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Button variant="danger" label="No-show" loading={busy === 'no_show'} onPress={() => mark('no_show')} />
                  <Button variant="text" icon="skip" label="Skip or defer" onPress={() => router.push(`/skip/${stop.id}`)} />
                </View>
                <Text style={[type.caption, { textAlign: 'center' }]}>Mark this stop to start your next trip.</Text>
              </ScrollView>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
