import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Icon } from './Icon';
import { color, font, radius } from './theme';

const WORKING_MS = 500; // the spinner
const DONE_MS = 700; // the check
const FADE_MS = 250;

/**
 * Optimize route's Auto: a small secondary button shown while the order differs
 * from the suggested one. Tapped, it shows a brief spinner, puts the suggested
 * order back, shows a check, then fades out. If the order comes back to the
 * suggested one some other way (dragged back), it just fades out.
 */
export function AutoButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const [step, setStep] = useState<'idle' | 'working' | 'done' | 'gone'>(visible ? 'idle' : 'gone');
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fadeOut = () => Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: Platform.OS !== 'web' })
    .start(() => setStep('gone'));

  useEffect(() => {
    if (visible && (step === 'gone' || step === 'done')) {
      // The order differs again: back, ready to tap.
      timers.current.forEach(clearTimeout); timers.current = [];
      opacity.setValue(1);
      setStep('idle');
    } else if (!visible && step === 'idle') {
      fadeOut();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === 'gone') return null;

  const press = () => {
    if (step !== 'idle') return;
    setStep('working');
    later(WORKING_MS, () => {
      onPress();
      setStep('done');
      later(DONE_MS, fadeOut);
    });
  };

  return (
    <Animated.View style={{ opacity }}>
      <Pressable onPress={press} disabled={step !== 'idle'} accessibilityRole="button"
        accessibilityLabel={step === 'done' ? 'Suggested order restored' : 'Auto: use the suggested order'}
        accessibilityState={{ busy: step === 'working' }}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
        {step === 'working' ? <ActivityIndicator size="small" color={color.action} />
          : step === 'done' ? <Icon name="check" size={18} color={color.action} strokeWidth={2.25} />
          : <Text style={styles.label}>Auto</Text>}
      </Pressable>
    </Animated.View>
  );
}

// Secondary, small: like Button variant="secondary" size="sm", at a fixed width so it
// keeps its size through the spinner and check.
const styles = StyleSheet.create({
  btn: { marginTop: 1, height: 32, minWidth: 68, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: color.brandTint, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 20, color: color.action },
});
