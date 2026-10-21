import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../../src/lib/backend';
import { confirmAction, showMessage } from '../../src/lib/dialog';
import { fmtTime, fmtWindow, parseDay } from '../../src/lib/geo';
import { useActiveTrip, useDriverData } from '../../src/lib/store';
import { isDone } from '../../src/lib/types';
import { Banner, Button, DetailRow, IconButton, PersonRow, StatusPill } from '../../src/ui/components';
import { RouteMap } from '../../src/ui/RouteMap';
import { TripBar } from '../../src/ui/TripBar';
import { color, radius, space, type } from '../../src/ui/theme';

/**
 * A stop's details, opened from My day or the trip's list. The drive, arrival
 * and marking happen in the Trip screen; while a trip is under way the trip
 * bar leads back to it.
 */
export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stopById } = useDriverData();
  const found = stopById(String(id));
  const trip = useActiveTrip();
  const [busy, setBusy] = useState<string | null>(null);

  if (!found) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        <Text style={type.body}>This stop is no longer on your route.</Text>
        <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  const { route, stop } = found;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); }
    catch (e) { showMessage('Something went wrong', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function remove() {
    const ok = await confirmAction(`Remove ${stop.customer_name}?`, isDone(stop)
      ? `This job comes off your day. Your business keeps a record that it was removed.`
      : `${stop.address.split(',')[0]} comes off your route. The customer won't get any more texts about this visit.`, 'Remove');
    if (!ok) return;
    await run('remove', async () => { await backend.removeStop(stop.id); router.replace('/'); });
  }

  const done = isDone(stop);
  const outcome = stop.status === 'completed' ? 'Done' : stop.status === 'no_show' ? 'No-show' : 'Skipped';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <IconButton icon="back" label="Back" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.heading}>{parseDay(route.day).toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={type.caption}>{parseDay(route.day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {done ? (
        // ---- A finished stop: details only ----
        <ScrollView contentContainerStyle={{ paddingBottom: space[6] }}>
          <View style={{ paddingHorizontal: space[4] }}>
            <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <RouteMap height={200} pin={stop} pinLabel={stop.address.split(',')[0]} />
            </View>
          </View>
          <View style={{ padding: space[4], gap: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{stop.customer_name}</Text>
                <Text style={type.caption}>{stop.address}</Text>
              </View>
              <StatusPill label={outcome} tone={stop.status === 'completed' ? 'success' : stop.status === 'no_show' ? 'warning' : 'neutral'} />
            </View>
            {stop.marked_outside ? (
              <Banner tone="warning" icon="alert" title="Marked away from the stop" meta="Your business sees this flag." />
            ) : null}
            <View style={{ gap: space[3] }}>
              <DetailRow icon="check" primary={`${outcome} at ${fmtTime(stop.marked_at)}`}
                secondary={stop.arrived_at ? `Arrived at ${fmtTime(stop.arrived_at)}` : undefined} />
              {stop.mark_reason && !stop.marked_outside ? <DetailRow icon="flag" primary={stop.mark_reason} secondary="Reason" /> : null}
              {stop.notes ? <DetailRow icon="notes" primary={stop.notes} /> : null}
            </View>
            <Button variant="danger" size="sm" label="Remove job" loading={busy === 'remove'} onPress={remove} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: space[4] }}>
            <View style={{ paddingHorizontal: space[4] }}>
              <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                <RouteMap height={240} pin={stop} pinLabel={stop.address.split(',')[0]} />
              </View>
            </View>
            <View style={{ padding: space[4], gap: space[6] }}>
              <View style={{ gap: 4 }}>
                <PersonRow name={stop.customer_name} subtitle={stop.address}
                  onMessage={() => showMessage('Coming soon', 'Chat with customers arrives in the next build.')} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button variant="text" size="sm" label="Wrong address? Edit it" onPress={() => router.push(`/edit/${stop.id}`)} style={{ paddingHorizontal: 0 }} />
                  <Button variant="danger" size="sm" label="Remove stop" loading={busy === 'remove'} onPress={remove} style={{ paddingHorizontal: 0 }} />
                </View>
              </View>
              <View style={{ gap: space[3] }}>
                {stop.window_start ? <DetailRow icon="clock" primary={fmtWindow(stop)} secondary="Window promised to the customer" /> : null}
                {stop.notes ? <DetailRow icon="notes" primary={stop.notes} /> : null}
              </View>
            </View>
          </ScrollView>
          {trip ? <TripBar route={trip} /> : null}
        </>
      )}
    </SafeAreaView>
  );
}
