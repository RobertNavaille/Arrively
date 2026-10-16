import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../../src/lib/backend';
import { showMessage } from '../../src/lib/dialog';
import { currentPosition } from '../../src/lib/location';
import { stopNumber, useDriverData } from '../../src/lib/store';
import { Button } from '../../src/ui/components';
import { color, radius, space, type } from '../../src/ui/theme';

const WHAT = [
  { key: 'deferred' as const, label: 'Move to the end of the route', description: 'Try again after your other stops' },
  { key: 'skipped' as const, label: 'Skip for today', description: 'Removed from today’s route' },
];
const REASONS = ['Customer not home', 'Access blocked', 'Customer asked to reschedule', 'Out of time today'];

function Choice({ label, description, selected, onPress }: { label: string; description?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={{ flexDirection: 'row', gap: space[3], padding: space[3], borderRadius: radius.sm, borderWidth: selected ? 2 : 1, borderColor: selected ? color.action : color.divider }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? color.action : color.controlBorder, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.action }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        {description ? <Text style={type.caption}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function SkipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stopById, profile } = useDriverData();
  const found = stopById(String(id));
  const [what, setWhat] = useState<'deferred' | 'skipped'>('deferred');
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  if (!found) return null;
  const { route, stop } = found;

  async function confirm() {
    setBusy(true);
    try {
      await backend.markStop(stop.id, what, reason, await currentPosition());
      router.dismissAll();
      router.replace('/');
    } catch (e) {
      showMessage('Could not update the stop', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4] }}>
        <View style={{ gap: 4 }}>
          <Text style={type.title}>Skip or defer this stop</Text>
          <Text style={type.caption}>Stop {stopNumber(route, stop)} of {route.stops.length} · {stop.customer_name} · {stop.address}</Text>
        </View>
        <View style={{ gap: space[2] }}>
          <Text style={[type.label, { textTransform: 'uppercase' }]}>What should happen</Text>
          {WHAT.map((w) => <Choice key={w.key} label={w.label} description={w.description} selected={what === w.key} onPress={() => setWhat(w.key)} />)}
        </View>
        <View style={{ gap: space[2] }}>
          <Text style={[type.label, { textTransform: 'uppercase' }]}>Reason</Text>
          {REASONS.map((r) => <Choice key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}
        </View>
        <Text style={type.caption}>{profile?.org_name || 'Your business'} and the customer will be told. Your next trip starts after you confirm.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Button label={what === 'deferred' ? 'Move to end' : 'Skip stop'} style={{ flex: 1 }} loading={busy} onPress={confirm} />
          <Button variant="text" label="Back" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
