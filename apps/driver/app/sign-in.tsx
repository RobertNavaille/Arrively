import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import { Button } from '../src/ui/components';
import { color, font, radius, space, type } from '../src/ui/theme';

function toE164(input: string) {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return input.startsWith('+') ? `+${digits}` : `+${digits}`;
}

export default function SignIn() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try { await backend.sendCode(toE164(phone)); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError(null);
    try { await backend.verifyCode(toE164(phone), code.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space[6], justifyContent: 'center', gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text style={[type.title, { fontSize: 28, lineHeight: 34 }]}>Arrively</Text>
          <Text style={[type.body, { color: color.inkMuted }]}>
            {sent ? `Enter the 6-digit code we texted to ${phone}.` : 'Sign in with the mobile number your business invited.'}
          </Text>
          {backend.offline ? (
            <Text style={[type.caption, { color: color.warning }]}>Offline demo: any number and code work.</Text>
          ) : null}
        </View>
        <View style={{ gap: space[2] }}>
          <Text style={[type.label, { textTransform: 'uppercase' }]}>{sent ? 'Code' : 'Mobile number'}</Text>
          <TextInput
            key={sent ? 'code' : 'phone'}
            value={sent ? code : phone}
            onChangeText={sent ? setCode : setPhone}
            placeholder={sent ? '123456' : '(401) 555-0100'}
            placeholderTextColor={color.inkMuted}
            keyboardType={sent ? 'number-pad' : 'phone-pad'}
            textContentType={sent ? 'oneTimeCode' : 'telephoneNumber'}
            autoComplete={sent ? 'sms-otp' : 'tel'}
            autoFocus
            accessibilityLabel={sent ? 'Code' : 'Mobile number'}
            style={{
              height: 48, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider,
              paddingHorizontal: space[3], fontFamily: font.regular, fontSize: 16, color: color.ink,
            }}
          />
          {error ? <Text style={[type.caption, { color: color.danger }]}>{error}</Text> : null}
        </View>
        <Button
          label={sent ? 'Sign in' : 'Text me a code'}
          onPress={sent ? verify : send}
          loading={busy}
          disabled={sent ? code.trim().length < 4 : phone.replace(/\D/g, '').length < 10}
        />
        {sent ? <Button variant="text" label="Use a different number" onPress={() => { setSent(false); setCode(''); }} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
