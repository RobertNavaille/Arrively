import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { backend } from '../lib/backend';
import { showMessage } from '../lib/dialog';
import { fmtPhone } from '../lib/geo';
import type { Stop } from '../lib/types';
import { FloatingSurface } from './FloatingSurface';
import { Icon } from './Icon';
import { color, font, shadow, space, type } from './theme';

const LIVE = '#2EA05A';
const LIVE_INK = '#1E7A44';
const OFF = '#A0A4AB';

/**
 * On the way: whether the customer can follow the driver (their live tracking
 * link), as a pill centred in the top bar. Tapping it slides a panel down from
 * the top: who it's shared with, and a switch to stop (or start) sharing.
 */
export function EtaSharingPill({ stop, top, height, onPress }: { stop: Stop; top: number; height: number; onPress: () => void }) {
  const on = stop.share_trip !== false;
  // A slow pulse on the dot while it's shared.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [on, pulse]);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top, height, alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}
        accessibilityLabel={on ? `ETA being shared with ${stop.customer_name}` : 'ETA not shared'} accessibilityHint="Shows who it's shared with"
        style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <FloatingSurface style={{ height, borderRadius: height / 2, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 9, height: 9, alignItems: 'center', justifyContent: 'center' }}>
            {on ? <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 5, backgroundColor: LIVE, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} /> : null}
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: on ? LIVE : OFF }} />
          </View>
          <Text style={{ fontFamily: font.semibold, fontSize: 15, color: on ? color.ink : color.inkMuted }}>{on ? 'ETA being shared' : 'ETA not shared'}</Text>
          <View style={{ transform: [{ rotate: '-90deg' }] }}><Icon name="back" size={14} color={color.inkMuted} strokeWidth={2.4} /></View>
        </FloatingSurface>
      </Pressable>
    </View>
  );
}

/** The panel that slides down from the top: who's following, and the switch. Tap outside, or drag it up, to close. */
export function EtaSharingPanel({ stop, open, onClose, onChanged, safeTop }: {
  stop: Stop; open: boolean; onClose: () => void; onChanged: () => void; safeTop: number;
}) {
  const [on, setOn] = useState(stop.share_trip !== false);
  useEffect(() => { setOn(stop.share_trip !== false); }, [stop.share_trip]);
  const [shown, setShown] = useState(open);
  const y = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown
  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(y, { toValue: open ? 1 : 0, duration: open ? 340 : 240, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished && !open) setShown(false); });
  }, [open, y]);
  const [h, setH] = useState(400);
  const close = useRef(onClose);
  close.current = onClose;
  // Drag it back up to close.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy < -30 || g.vy < -0.3) close.current(); },
  })).current;
  if (!shown) return null;
  const first = stop.customer_name.trim().split(/\s+/)[0];
  const initials = stop.customer_name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  async function toggle(v: boolean) {
    setOn(v);
    try { await backend.setShareTrip(stop.id, v); onChanged(); }
    catch (e) { setOn(!v); showMessage('Something went wrong', e instanceof Error ? e.message : String(e)); }
  }
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)', opacity: y }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View {...pan.panHandlers} accessibilityViewIsModal onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={[styles.panel, shadow.float, { paddingTop: safeTop + space[2], borderTopLeftRadius: topRadius(safeTop), borderTopRightRadius: topRadius(safeTop), transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-h - 16, 0] }) }] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.title, { fontSize: 20, lineHeight: 28 }]} accessibilityRole="header">ETA sharing</Text>
          <View style={[styles.badge, { backgroundColor: on ? 'rgba(46,160,90,0.12)' : 'rgba(60,60,67,0.08)' }]}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? LIVE : OFF }} />
            <Text style={{ fontFamily: font.semibold, fontSize: 13, color: on ? LIVE_INK : color.inkMuted }}>{on ? 'Live' : 'Off'}</Text>
          </View>
        </View>
        {/* Who's following. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: 18 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: color.onTint }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 24, color: color.ink }}>{stop.customer_name}</Text>
            {stop.customer_phone ? <Text style={[type.body, { color: color.inkMuted }]}>{fmtPhone(stop.customer_phone)}</Text> : null}
          </View>
        </View>
        <Text style={[type.body, { marginTop: 14, color: color.inkMuted }]}>
          {on ? `${first} can see you on a map and when you'll arrive, until you get there.`
            : `${first}'s link no longer shows where you are. Turn it back on any time.`}
        </Text>
        {/* The switch. */}
        <View style={styles.switchRow}>
          <Text style={{ fontFamily: font.regular, fontSize: 17, color: color.ink }}>Share my ETA</Text>
          <Switch value={on} onValueChange={toggle} accessibilityLabel="Share my ETA" />
        </View>
        {/* Drag (or tap) it back up. */}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 10 }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: color.divider }} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * The panel's top corners follow the screen's own (rounder on newer iPhones), set in by the
 * panel's 8pt margin so the two curves run side by side. iPhones with the Dynamic Island have
 * about 55pt screen corners, those with a notch about 44, others (and browsers) square ones.
 */
function topRadius(safeTop: number) {
  const screen = safeTop >= 59 ? 55 : safeTop >= 44 ? 44 : 0;
  return Math.max(36, screen - space[2]);
}

const styles = StyleSheet.create({
  // Floating just in from the edges, all its corners round (as Apple's sheets at their lower height).
  panel: { position: 'absolute', top: space[2], left: space[2], right: space[2], paddingHorizontal: 20, borderRadius: 36, backgroundColor: color.surface },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[4], paddingVertical: 14, borderTopWidth: 1, borderTopColor: color.divider },
});
