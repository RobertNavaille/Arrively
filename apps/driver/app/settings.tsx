import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setAppearance, useAppearanceMode, type AppearanceMode } from '../src/lib/appearance';
import { backend } from '../src/lib/backend';
import { confirmAction, showMessage } from '../src/lib/dialog';
import { fmtPhone } from '../src/lib/geo';
import { stopSharing } from '../src/lib/location';
import { useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { SelectChip } from '../src/ui/Chips';
import { Avatar, Button, IconButton } from '../src/ui/components';
import { NATIVE_CHROME } from '../src/ui/nativeChrome';
import { color, font, radius, space, type } from '../src/ui/theme';

const field = {
  minHeight: 48, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider,
  paddingHorizontal: space[3], fontFamily: font.regular, fontSize: 16, color: color.ink,
} as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The driver's account: their details, the number they sign in with, and signing out. */
export default function Settings() {
  const router = useRouter();
  const { profile, refresh } = useDriverData();
  const bottomInset = useBottomInset();
  const appearance = useAppearanceMode();
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [vehicle, setVehicle] = useState(profile?.vehicle ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'name' | 'email' | null>(null);

  // Fill in once the profile arrives (opened before it loaded).
  useEffect(() => {
    if (!profile) return;
    setName(profile.name); setEmail(profile.email ?? ''); setVehicle(profile.vehicle ?? '');
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = !!profile && (name.trim() !== profile.name || (email.trim() || null) !== (profile.email ?? null) || (vehicle.trim() || null) !== (profile.vehicle ?? null));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function save() {
    if (!name.trim()) { setProblem('name'); return; }
    if (email.trim() && !EMAIL.test(email.trim())) { setProblem('email'); return; }
    setBusy(true);
    try {
      await backend.updateProfile({ name, email: email.trim() || null, vehicle: vehicle.trim() || null });
      await refresh();
    } catch (e) {
      showMessage('Could not save your details', e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function signOut() {
    if (!(await confirmAction('Sign out?', 'Location sharing stops until you sign in again.', 'Sign out'))) return;
    await stopSharing();
    await backend.signOut();
  }

  return (
    <SafeAreaView edges={NATIVE_CHROME ? [] : ['top']} style={{ flex: 1, backgroundColor: color.surface }}>
      {/* iPhone shows Apple's navigation bar instead (see _layout). */}
      {NATIVE_CHROME ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], paddingVertical: space[1] }}>
          <IconButton icon="back" label="Back" variant="plain" onPress={back} />
          <Text style={[type.title, { flex: 1, textAlign: 'center', fontSize: 20, lineHeight: 28 }]} accessibilityRole="header">Settings</Text>
          {/* Balances the back button so the title stays centred. */}
          <View style={{ width: 44 }} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[4], paddingBottom: space[6] + bottomInset, gap: space[6] }}>
          <View style={{ alignItems: 'center', gap: space[2] }}>
            <Avatar name={name || profile?.name || 'Driver'} size={72} />
            {profile?.org_name ? <Text style={[type.body, { color: color.inkMuted }]}>{profile.org_name}</Text> : null}
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Name</Text>
            <TextInput value={name} onChangeText={(t) => { setName(t); setProblem(null); }} placeholder="Your name" placeholderTextColor={color.inkMuted}
              autoCapitalize="words" textContentType="name" accessibilityLabel="Name" style={[field, problem === 'name' && { borderColor: color.danger }]} />
            {problem === 'name' ? <Text style={[type.caption, { color: color.danger }]} accessibilityLiveRegion="polite">Add your name.</Text> : null}
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Email</Text>
            <TextInput value={email} onChangeText={(t) => { setEmail(t); setProblem(null); }} placeholder="you@example.com (optional)" placeholderTextColor={color.inkMuted}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email"
              accessibilityLabel="Email" style={[field, problem === 'email' && { borderColor: color.danger }]} />
            {problem === 'email' ? <Text style={[type.caption, { color: color.danger }]} accessibilityLiveRegion="polite">Enter an email like name@example.com.</Text> : null}
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Phone number</Text>
            <View style={[field, { justifyContent: 'center', backgroundColor: color.surface }]}>
              <Text style={type.body}>{profile?.phone ? fmtPhone(profile.phone) : '–'}</Text>
            </View>
            <Text style={type.caption}>You sign in with this number. To change it, ask your manager.</Text>
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[type.label, { textTransform: 'uppercase' }]}>Vehicle</Text>
            <TextInput value={vehicle} onChangeText={setVehicle} placeholder="White Ford Transit · 7KQ 204 (optional)" placeholderTextColor={color.inkMuted}
              accessibilityLabel="Vehicle" style={field} />
          </View>

          {/* Light, dark or follow the iPhone (the web app stays light for now). */}
          {Platform.OS === 'web' ? null : (
            <View style={{ gap: space[2] }}>
              <Text style={[type.label, { textTransform: 'uppercase' }]}>Appearance</Text>
              <View style={{ flexDirection: 'row' }}>
                <SelectChip<AppearanceMode> label="Appearance" value={appearance}
                  options={[{ value: 'auto', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
                  onChange={setAppearance} />
              </View>
              <Text style={type.caption}>Automatic follows your iPhone's light or dark setting.</Text>
            </View>
          )}

          {changed ? <Button label="Save changes" onPress={save} loading={busy} /> : null}

          <View style={{ gap: space[2], borderTopWidth: 1, borderTopColor: color.divider, paddingTop: space[6] }}>
            <Button variant="secondary" label="Sign out" onPress={signOut} />
            <Text style={[type.caption, { textAlign: 'center' }]}>
              Arrively Driver {Constants.expoConfig?.version ?? ''}{backend.offline ? ' · Offline demo' : ''}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
