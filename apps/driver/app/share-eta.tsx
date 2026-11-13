import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { backend } from '../src/lib/backend';
import { showMessage } from '../src/lib/dialog';
import { fmtTime, miles } from '../src/lib/geo';
import { contactCustomer, etaMessage } from '../src/lib/navigation';
import { beginDrive } from '../src/lib/startDrive';
import { useDriverData } from '../src/lib/store';
import { useBottomInset } from '../src/lib/viewport';
import { Button, IconButton } from '../src/ui/components';
import { Icon } from '../src/ui/Icon';
import { NATIVE_CHROME } from '../src/ui/nativeChrome';
import { color, font, shadow, space, type } from '../src/ui/theme';

/**
 * After Start driving, before the drive: who and where, how long, the job's
 * notes, and two choices, both starting the drive and opening the trip:
 * Share ETA also opens Messages with the customer's live tracking link
 * written in; Start trip doesn't. The trip shows whether the ETA is shared.
 * iPhone: Apple's sheet, sized to fit. Elsewhere: a card over the dimmed Schedule.
 */
export default function ShareEta() {
  const { id, min, m } = useLocalSearchParams<{ id: string; min?: string; m?: string }>();
  const router = useRouter();
  const { stopById, profile, refresh } = useDriverData();
  const found = stopById(String(id));
  // Which button is working: sharing (start, then Messages) or starting without sharing.
  const [busy, setBusy] = useState<'share' | 'start' | null>(null);
  const bottomInset = useBottomInset();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!found) {
    return <Frame onClose={close} bottomInset={bottomInset}><Text style={[type.body, { textAlign: 'center', padding: space[6] }]}>This stop isn't on your schedule anymore.</Text></Frame>;
  }
  const { route, stop } = found;
  const legMin = min ? Number(min) : null;
  const legM = m ? Number(m) : null;
  const arrive = legMin != null ? fmtTime(new Date(Date.now() + legMin * 60_000)) : null;
  const initials = stop.customer_name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  // Both start the drive, then open the trip. Share ETA also opens Messages with the customer's live
  // tracking link written in (the drive started first, so the link is live when they open it).
  const go = async (how: 'share' | 'start') => {
    if (how === 'share' && !stop.customer_phone) { showMessage('No phone number', `There's no phone number for ${stop.customer_name}.`); return; }
    setBusy(how);
    try {
      await beginDrive(route, stop, refresh);
      // Sharing is on for this stop (the trip screen shows it, and it can be switched off there).
      if (how === 'share') {
        if (stop.share_trip === false) await backend.setShareTrip(stop.id, true);
        contactCustomer('sms', stop.customer_phone, etaMessage(stop, profile?.name, profile?.org_name, true));
      }
      router.replace('/trip');
    } catch (e) {
      showMessage('Something went wrong', e instanceof Error ? e.message : String(e));
      refresh();
      setBusy(null);
    }
  };

  return (
    <Frame onClose={close} bottomInset={bottomInset}>
      {/* Who and where. */}
      <View style={{ alignItems: 'center', paddingTop: space[6] }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 20, color: color.onTint }}>{initials}</Text>
        </View>
        <Text style={[type.label, { fontSize: 13, lineHeight: 18, marginTop: space[3], textTransform: 'uppercase' }]}>Driving to</Text>
        <Text style={[type.title, { fontSize: 24, lineHeight: 30, textAlign: 'center' }]} accessibilityRole="header">{stop.customer_name}</Text>
        <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted, textAlign: 'center' }]}>{stop.address}</Text>
      </View>

      {/* The drive: how long, and when they'll get there. */}
      {legMin != null ? (
        <View style={styles.drive} accessible accessibilityLabel={`${legMin} minutes${legM != null ? `, ${miles(legM).toFixed(1)} miles` : ''}${arrive ? `, arriving ${arrive}` : ''}`}>
          <Item icon="clock" text={`${legMin} min`} />
          {arrive ? <Item icon="navigate" text={`Arrive ${arrive}`} /> : null}
        </View>
      ) : <View style={[styles.drive, { borderBottomWidth: 0 }]} />}

      {/* The job's notes, on the sheet itself. */}
      {stop.notes ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[4], paddingTop: space[6] - space[1], paddingHorizontal: space[1] }}>
          <Icon name="lines" size={22} color={color.mapLabel} />
          <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: color.ink }}>{stop.notes}</Text>
        </View>
      ) : null}

      {/* Share ETA (then the trip), or Start trip without sending the text. */}
      <View style={{ gap: 10, marginTop: space[6] }}>
        <Button icon="message" label="Share ETA" loading={busy === 'share'} disabled={!!busy} onPress={() => go('share')} />
        <Button variant="secondary" icon="navigate" label="Start trip" loading={busy === 'start'} disabled={!!busy} onPress={() => go('start')} />
      </View>
    </Frame>
  );
}

function Item({ icon, text }: { icon: 'clock' | 'navigate'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={color.action} />
      <Text style={{ fontFamily: font.medium, fontSize: 16, lineHeight: 22, color: color.ink }}>{text}</Text>
    </View>
  );
}

/** iPhone: the content of Apple's sheet. Elsewhere: a card at the bottom over the dimmed screen (tap outside to close). */
function Frame({ children, onClose, bottomInset }: { children: ReactNode; onClose: () => void; bottomInset: number }) {
  // Close, at the top right: the same round icon button as Today, + and call/text (Liquid Glass on iPhone,
  // the light-blue tint elsewhere), full size. Back to the Schedule without starting.
  const closeButton = (
    <View style={styles.close}>
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
  );
  if (NATIVE_CHROME) return <View style={{ paddingHorizontal: 20, paddingBottom: space[4], backgroundColor: color.surface }}>{children}{closeButton}</View>;
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: space[2] }}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} onPress={onClose} accessibilityLabel="Close" />
      <View accessibilityViewIsModal style={[styles.card, shadow.sheet, { marginBottom: space[2] + bottomInset }]}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, marginTop: 6, borderRadius: 3, backgroundColor: color.divider }} />
        {children}
        {closeButton}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', top: space[3], right: space[3] },
  card: { paddingHorizontal: 20, paddingBottom: space[6], borderRadius: 36, backgroundColor: color.surface, width: '100%', maxWidth: 480, alignSelf: 'center' },
  drive: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 20, paddingVertical: space[3], borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.divider },
});
