import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { dayKey, parseDay } from '../src/lib/geo';
import { searchAddress, type Place } from '../src/lib/mapbox';
import { useDriverData } from '../src/lib/store';
import { Button } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import { bareInput, color, font, radius, space, type } from '../src/ui/theme';

const field = {
  minHeight: 48, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider,
  paddingHorizontal: space[3], fontFamily: font.regular, fontSize: 16, color: color.ink,
} as const;

/** Add a stop: the address picked in My day's search, plus a name and notes (DRV-24). */
export default function NewStop() {
  const params = useLocalSearchParams<{ day: string; name: string; detail: string; lat: string; lng: string }>();
  const router = useRouter();
  const { refresh } = useDriverData();
  const [place, setPlace] = useState<Place>({
    id: 'picked', name: String(params.name ?? ''), detail: String(params.detail ?? ''), lat: Number(params.lat), lng: Number(params.lng),
  });
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const day = String(params.day);
  const label = day === dayKey(new Date()) ? 'today' : parseDay(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  async function save() {
    setBusy(true);
    try {
      await backend.addStop(day, place.detail ? `${place.name}, ${place.detail}` : place.name, place, { name, notes });
      await refresh();
      router.back();
    } catch (e) {
      showMessage('Could not add the stop', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[4], gap: space[6] }}>
          <View style={{ gap: 4 }}>
            <Text style={type.title} accessibilityRole="header">New stop</Text>
            <Text style={type.caption}>Adding to {label}</Text>
          </View>

          {/* Where the stop is; follows the address if it's changed below. */}
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            <RouteMap height={180} pin={place} pinLabel={place.name} />
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Customer or place name" placeholderTextColor={color.inkMuted}
              autoFocus autoCapitalize="words" textContentType="name" returnKeyType="next" accessibilityLabel="Name" style={field} />
          </View>

          <AddressField place={place} onChange={setPlace} />

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Gate code, parking, what the job is" placeholderTextColor={color.inkMuted}
              multiline accessibilityLabel="Notes" style={[field, { minHeight: 96, paddingTop: space[3], textAlignVertical: 'top' }]} />
          </View>
        </ScrollView>
        <View style={{ padding: space[4], paddingBottom: space[6], gap: space[2], borderTopWidth: 1, borderTopColor: color.divider }}>
          <Button label="Add stop" onPress={save} loading={busy} />
          <Button variant="text" label="Cancel" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The picked address, with a search to change it. */
function AddressField({ place, onChange }: { place: Place; onChange: (p: Place) => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !q.trim()) { setResults([]); setErr(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAddress(q, place, ctrl.signal)
        .then((r) => { setResults(r); setErr(r.length ? null : 'No matching addresses'); })
        .catch((e) => { if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : String(e)); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.label, { textTransform: 'uppercase' }]}>Address</Text>
      {editing ? (
        <>
          <View style={[field, { flexDirection: 'row', alignItems: 'center', gap: space[2] }]}>
            <Icon name="search" size={20} color={color.inkMuted} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search for the address" placeholderTextColor={color.inkMuted}
              accessibilityLabel="Search for the address" autoCorrect={false}
              style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: color.ink, paddingVertical: 0 }, bareInput]} />
            <Pressable onPress={() => { setEditing(false); setQ(''); }} accessibilityLabel="Keep the current address" hitSlop={8}>
              <Icon name="close" size={16} color={color.inkMuted} />
            </Pressable>
          </View>
          {results.length ? (
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: color.divider, overflow: 'hidden' }}>
              {results.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => { onChange(p); setEditing(false); setQ(''); }}
                  style={({ pressed }) => [{ flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
                  <Icon name="pin" size={20} color={color.inkMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{p.name}</Text>
                    <Text style={type.caption}>{p.detail}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : err ? <Text style={type.caption}>{err}</Text> : null}
        </>
      ) : (
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={`Address: ${place.name}, ${place.detail}. Change`}
          style={({ pressed }) => [field, { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }, pressed && { backgroundColor: color.divider }]}>
          <Icon name="pin" size={20} color={color.inkMuted} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{place.name}</Text>
            {place.detail ? <Text style={type.caption}>{place.detail}</Text> : null}
          </View>
          <Text style={[type.caption, { fontFamily: font.semibold, color: color.actionInk }]}>Change</Text>
        </Pressable>
      )}
    </View>
  );
}
