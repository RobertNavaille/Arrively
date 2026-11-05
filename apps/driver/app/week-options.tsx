import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '../src/lib/viewport';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { useLivePosition } from '../src/lib/location';
import { useDriverData } from '../src/lib/store';
import { DEFAULT_WEEK_OPTIONS, fmtClock, fmtHours, loadWeekOptions, planWeek, saveWeekOptions, type WeekOptions } from '../src/lib/weekPlan';
import { searchAddress, type Place } from '../src/lib/mapbox';
import { ToggleChip } from '../src/ui/Chips';
import { Icon } from '../src/ui/Icon';
import { Button } from '../src/ui/components';
import { NATIVE_CHROME } from '../src/ui/nativeChrome';
import { bareInput, color, font, radius, space, type } from '../src/ui/theme';

const DOW = [['S', 'Sunday'], ['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday']] as const;

/**
 * Optimize week (the optimize button on the Schedule): its options, kept on
 * the phone for next time. "Optimize week" regroups the week and saves it.
 */
export default function WeekOptionsScreen() {
  const router = useRouter();
  const bottomInset = useBottomInset();
  const [o, setO] = useState<WeekOptions>(DEFAULT_WEEK_OPTIONS);
  useEffect(() => { loadWeekOptions().then(setO); }, []);
  const set = (patch: Partial<WeekOptions>) => setO((x) => ({ ...x, ...patch }));
  const tooShort = o.end - o.start < 60;
  const noDays = !o.days.some(Boolean);

  const { routes, refresh } = useDriverData();
  const pos = useLivePosition();
  const [busy, setBusy] = useState(false);
  // Optimize week: regroup the week's stops with these options and save it straight away
  // (customers whose stop changes day get a text), then say what changed.
  async function run() {
    if (tooShort || noDays || busy) return;
    setBusy(true);
    try {
      await saveWeekOptions(o);
      const plan = planWeek({ routes, today: new Date(), from: o.startPlace ?? pos, options: o, pins: new Map() });
      const moved = Object.keys(plan.movedFrom).length;
      const days = plan.days
        .map((d) => ({ day: d.day, stops: d.stops.filter((st) => st.status === 'scheduled' || st.status === 'queued').map((st) => st.id) }))
        .filter((d) => d.stops.length);
      if (days.length) await backend.applyWeek(days);
      await refresh();
      router.back();
      const savedMin = plan.before.minutes - plan.after.minutes;
      const savedMi = (plan.before.meters - plan.after.meters) / 1609.34;
      if (!moved && savedMin < 5) showMessage('Week optimized', 'Your week was already well grouped, so no stops changed day.');
      else showMessage('Week optimized', [
        moved ? `${moved} ${moved === 1 ? 'stop moved' : 'stops moved'} to a new day, and ${moved === 1 ? 'its customer gets' : 'their customers get'} a text.` : 'No stops changed day.',
        savedMin >= 5 ? `About ${fmtHours(savedMin)}${savedMi >= 1 ? ` and ${Math.round(savedMi)} miles` : ''} less driving.` : '',
      ].filter(Boolean).join(' '));
    } catch (e) {
      showMessage('Could not optimize the week', e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <SafeAreaView edges={NATIVE_CHROME ? ['bottom'] : undefined} style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], paddingTop: NATIVE_CHROME ? space[4] : space[2], paddingBottom: space[2] }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}><Button variant="text" label="Cancel" onPress={() => router.back()} /></View>
        <Text style={[type.heading, { fontSize: 17 }]} accessibilityRole="header">Optimize week</Text>
        <View style={{ flex: 1 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[6], paddingBottom: space[6] }}>
        <Section title="Work hours" note={tooShort ? 'The day needs to be at least an hour long.' : "Each day's stops, driving and time on site fit inside these hours."} warn={tooShort}>
          <Group>
            <Row label="Day starts"><TimeStepper value={o.start} onChange={(start) => set({ start })} /></Row>
            <Row label="Day ends" last><TimeStepper value={o.end} onChange={(end) => set({ end })} /></Row>
          </Group>
        </Section>

        <Section title="Work days" note={noDays ? 'Choose at least one day.' : undefined} warn={noDays}>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {DOW.map(([d, name], i) => {
              const on = o.days[i];
              return (
                <Pressable key={i} onPress={() => set({ days: o.days.map((x, j) => (j === i ? !x : x)) })} accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }} accessibilityLabel={name}
                  style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                    borderColor: on ? color.action : color.divider, backgroundColor: on ? color.action : 'transparent' }, pressed && { opacity: 0.8 }]}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? color.onAction : color.inkMuted }}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Start" note="Each day ends back here.">
          <StartField place={o.startPlace} onChange={(startPlace) => set({ startPlace })} />
        </Section>

        <Section title="Each day">
          <Group>
            <Row label="Most stops a day" last>
              <Stepper label={o.maxStops ? `Up to ${o.maxStops}` : 'No limit'}
                onLess={() => set({ maxStops: o.maxStops <= 1 ? 0 : o.maxStops - 1 })}
                onMore={() => set({ maxStops: o.maxStops ? Math.min(30, o.maxStops + 1) : 4 })} />
            </Row>
          </Group>
        </Section>

        <Section title="Roads">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            <ToggleChip label="Avoid highways" selected={o.avoidHighways} onPress={() => set({ avoidHighways: !o.avoidHighways })} />
            <ToggleChip label="Avoid tolls" selected={o.avoidTolls} onPress={() => set({ avoidTolls: !o.avoidTolls })} />
          </View>
        </Section>
      </ScrollView>
      <View style={{ padding: space[4], paddingBottom: space[4] + (NATIVE_CHROME ? 0 : bottomInset), borderTopWidth: 1, borderTopColor: color.divider }}>
        <Button icon="route" label="Optimize week" onPress={run} loading={busy} disabled={tooShort || noDays} />
      </View>
    </SafeAreaView>
  );
}

function Section({ title, note, warn, children }: { title: string; note?: string; warn?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.label, { textTransform: 'uppercase' }]} accessibilityRole="header">{title}</Text>
      {children}
      {note ? <Text style={[type.caption, warn && { color: color.danger }]}>{note}</Text> : null}
    </View>
  );
}
function Group({ children }: { children: ReactNode }) {
  return <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: color.divider, overflow: 'hidden' }}>{children}</View>;
}
function Row({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: ReactNode }) {
  return (
    <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: space[2],
      borderBottomWidth: last ? 0 : 1, borderBottomColor: color.divider }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontSize: 16, lineHeight: 22 }]}>{label}</Text>
        {sub ? <Text style={type.caption}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}
/** − 8:00 AM + in half-hour steps. */
function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <Stepper label={fmtClock(value)} onLess={() => onChange(Math.max(0, value - 30))} onMore={() => onChange(Math.min(24 * 60 - 30, value + 30))} />;
}
function Stepper({ label, onLess, onMore }: { label: string; onLess: () => void; onMore: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm, backgroundColor: color.surfaceMuted }}>
      <Pressable onPress={onLess} accessibilityRole="button" accessibilityLabel={`Less than ${label}`} hitSlop={4}
        style={({ pressed }) => [{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
        <Text style={{ fontFamily: font.semibold, fontSize: 20, color: color.ink }}>−</Text>
      </Pressable>
      <Text style={{ minWidth: 80, textAlign: 'center', fontFamily: font.semibold, fontSize: 15, color: color.ink }} accessibilityLiveRegion="polite">{label}</Text>
      <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={`More than ${label}`} hitSlop={4}
        style={({ pressed }) => [{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
        <Text style={{ fontFamily: font.semibold, fontSize: 20, color: color.ink }}>+</Text>
      </Pressable>
    </View>
  );
}

/** Where each day starts: your current location (the default), or an address you search for. */
function StartField({ place, onChange }: { place: Place | null; onChange: (p: Place | null) => void }) {
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
  const done = (p: Place | null) => { onChange(p); setEditing(false); setQ(''); };
  const field = { minHeight: 48, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider, paddingHorizontal: space[3] } as const;
  const option = (key: string, icon: 'navigate' | 'pin', name: string, detail: string | null, onPress: () => void, last = false) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: color.divider }, pressed && { backgroundColor: color.surfaceMuted }]}>
      <Icon name={icon} size={20} color={icon === 'navigate' ? color.action : color.inkMuted} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{name}</Text>
        {detail ? <Text style={type.caption}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={`Start each day at ${place ? place.name : 'your current location'}. Change`}
        style={({ pressed }) => [field, { flexDirection: 'row', alignItems: 'center', gap: space[2] }, pressed && { opacity: 0.7 }]}>
        <Icon name={place ? 'pin' : 'navigate'} size={20} color={place ? color.inkMuted : color.action} />
        <View style={{ flex: 1, paddingVertical: space[2] }}>
          <Text style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.inkMuted }}>Start each day at</Text>
          <Text style={{ fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: color.ink }} numberOfLines={1}>{place ? place.name : 'Current location'}</Text>
        </View>
        <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.actionInk }}>Change</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: space[2] }}>
      <View style={[field, { flexDirection: 'row', alignItems: 'center', gap: space[2] }]}>
        <Icon name="search" size={20} color={color.inkMuted} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search for a start address" placeholderTextColor={color.inkMuted}
          accessibilityLabel="Search for a start address" autoCorrect={false}
          style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: color.ink, paddingVertical: 0 }, bareInput]} />
        <Pressable onPress={() => { setEditing(false); setQ(''); }} accessibilityLabel="Keep the current start" hitSlop={8}>
          <Icon name="close" size={16} color={color.inkMuted} />
        </Pressable>
      </View>
      <View>
        {option('here', 'navigate', 'Current location', 'Wherever you are when you optimize', () => done(null), !results.length)}
        {results.map((p, i) => option(p.id, 'pin', p.name, p.detail, () => done(p), i === results.length - 1))}
      </View>
      {err ? <Text style={type.caption}>{err}</Text> : null}
    </View>
  );
}
