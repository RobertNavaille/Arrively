import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../../src/lib/backend';
import { confirmAction, showMessage } from '../../src/lib/dialog';
import { useRoadRoute } from '../../src/lib/directions';
import { fmtTime, fmtWindow, parseDay } from '../../src/lib/geo';
import { useLivePosition } from '../../src/lib/location';
import { useActiveTrip, useDriverData } from '../../src/lib/store';
import { isDone } from '../../src/lib/types';
import { Banner, Button, IconButton, InfoRow, StatusPill } from '../../src/ui/components';
import { RouteMap } from '../../src/ui/RouteMap';
import { TripBar } from '../../src/ui/TripBar';
import { Icon, type IconName } from '../../src/ui/Icon';
import { color, font, radius, shadow, space, type } from '../../src/ui/theme';

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
  const [menu, setMenu] = useState(false);
  // An open stop's map shows the drive to it from where you are.
  const open = !!found && !isDone(found.stop);
  const pos = useLivePosition(open);
  const leg = useRoadRoute(open ? pos : null, open && found ? found.stop : null);

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
    setMenu(false);
    const ok = await confirmAction(`Delete ${stop.customer_name}?`, isDone(stop)
      ? `This job comes off your day. Your business keeps a record that it was removed.`
      : `${stop.address.split(',')[0]} comes off your route. The customer won't get any more texts about this visit.`, 'Delete');
    if (!ok) return;
    await run('remove', async () => { await backend.removeStop(stop.id); router.replace('/'); });
  }

  const done = isDone(stop);
  const outcome = stop.status === 'completed' ? 'Done' : stop.status === 'no_show' ? 'No-show' : 'Skipped';
  const call = stop.customer_phone ? () => Linking.openURL(`tel:${stop.customer_phone}`) : undefined;
  const message = () => showMessage('Coming soon', 'Chat with customers arrives in the next build.');
  const line = !done && pos ? [pos, ...(leg ? leg.path : []), stop] : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <IconButton icon="back" label="Back" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.heading}>{parseDay(route.day).toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={type.caption}>{parseDay(route.day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
        </View>
        <IconButton icon="more" label="More options" variant="plain" onPress={() => setMenu((m) => !m)} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: space[6] }}>
        <View style={{ paddingHorizontal: space[4] }}>
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            <RouteMap height={240} pin={stop} driver={line ? pos : null} line={line} />
          </View>
        </View>

        <View style={{ padding: space[4], gap: space[6] }}>
          {/* Who and where, with call and message beside them */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 26, lineHeight: 32, color: color.ink }}>{stop.customer_name}</Text>
              <Text style={[type.body, { fontSize: 16, lineHeight: 22, color: color.inkMuted }]}>{stop.address.split(',')[0]}</Text>
              {line ? (
                <Text style={[type.body, { fontSize: 15, lineHeight: 22, marginTop: 4 }]}>
                  From <Text style={{ color: color.actionInk, fontFamily: font.medium }}>Current location</Text>
                </Text>
              ) : null}
            </View>
            {done ? (
              <StatusPill label={outcome} tone={stop.status === 'completed' ? 'success' : stop.status === 'no_show' ? 'warning' : 'neutral'} />
            ) : (
              <>
                {call ? <IconButton icon="phone" label={`Call ${stop.customer_name}`} onPress={call} /> : null}
                <IconButton icon="message" label={`Message ${stop.customer_name}`} onPress={message} />
              </>
            )}
          </View>

          {done && stop.marked_outside ? (
            <Banner tone="warning" icon="alert" title="Marked away from the stop" meta="Your business sees this flag." />
          ) : null}

          <View style={{ gap: space[6] }}>
            {done ? (
              <InfoRow icon="check" title={`${outcome} at ${fmtTime(stop.marked_at)}`}
                body={stop.arrived_at ? `Arrived at ${fmtTime(stop.arrived_at)}` : undefined} />
            ) : null}
            {done && stop.mark_reason && !stop.marked_outside ? <InfoRow icon="flag" title="Reason" body={stop.mark_reason} /> : null}
            {!done && stop.window_start ? <InfoRow icon="clock" title="Time window" body={`${fmtWindow(stop)} · promised to the customer`} /> : null}
            <InfoRow icon="notes" title="Description" body={stop.notes || 'No notes for this stop.'} />
          </View>

        </View>
      </ScrollView>
      {!done && trip ? <TripBar route={trip} /> : null}

      {/* The overflow menu: edit the stop's details, or delete it */}
      {menu ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Close menu" />
          <View style={[styles.menu, shadow.float]} accessibilityRole="menu">
            {!done ? (
              <MenuItem icon="edit" label="Edit details"
                onPress={() => { setMenu(false); router.push({ pathname: '/new-stop', params: { id: stop.id, day: route.day } }); }} />
            ) : null}
            <MenuItem icon="trash" label="Delete stop" danger onPress={remove} />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const tint = danger ? color.danger : color.ink;
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: color.surfaceMuted }]}>
      <Icon name={icon} size={20} color={tint} />
      <Text style={[type.body, { fontSize: 16, color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', top: 56, right: space[3], minWidth: 200, paddingVertical: space[1], borderRadius: radius.md, backgroundColor: color.surface },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[4] },
});
