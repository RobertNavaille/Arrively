import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../../src/lib/backend';
import { showMessage } from '../../src/lib/dialog';
import { searchAddress, type Place } from '../../src/lib/mapbox';
import { useDriverData } from '../../src/lib/store';
import { Button } from '../../src/ui/components';
import { Icon } from '../../src/ui/Icon';
import { bareInput, color, font, radius, space, type } from '../../src/ui/theme';

/** Correct a stop's address (DRV-23). */
export default function EditAddress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stopById } = useDriverData();
  const found = stopById(String(id));
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim() || !found) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAddress(q, found.stop, ctrl.signal).then(setResults).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, found]);

  if (!found) return null;
  const { stop } = found;

  async function choose(p: Place) {
    setBusy(true);
    try {
      await backend.updateAddress(stop.id, `${p.name}, ${p.detail}`, p);
      router.back();
    } catch (e) {
      showMessage('Could not update the address', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ padding: space[4], gap: space[4] }}>
        <View style={{ gap: 4 }}>
          <Text style={type.title}>Fix the address</Text>
          <Text style={type.caption}>{stop.customer_name} · currently {stop.address}</Text>
          <Text style={type.caption}>Your business is notified and the customer's ETA updates.</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 44, paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider }}>
          <Icon name="search" size={20} color={color.inkMuted} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search the correct address" placeholderTextColor={color.inkMuted}
            accessibilityLabel="Correct address" style={[{ flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink }, bareInput]} />
        </View>
        <View style={{ borderRadius: radius.md, borderWidth: results.length ? 1 : 0, borderColor: color.divider, overflow: 'hidden' }}>
          {results.map((p) => (
            <Pressable key={p.id} disabled={busy} onPress={() => choose(p)} accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
              <Icon name="pin" size={20} color={color.inkMuted} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{p.name}</Text>
                <Text style={type.caption}>{p.detail}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Button variant="text" label="Cancel" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
