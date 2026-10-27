import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Icon } from './Icon';
import { color, font, radius, shadow } from './theme';

const FADE_MS = 200; // the button fading out, then in and out of each step
const WORKING_MS = 500; // the spinner
const DONE_MS = 700; // the check

/**
 * Optimize route's Auto: a small secondary button shown while the order differs
 * from the suggested one. Tapped, the button fades out and a spinner takes its
 * place on the sheet's white; the suggested order comes back, the spinner
 * becomes a check, and that fades out. If the order comes back to the suggested
 * one some other way (dragged back), the button just fades out.
 */
export function AutoButton({ visible, onPress, floating }: {
  visible: boolean; onPress: () => void;
  /** Floats over the list beside Confirm route: compact (44px), raised, the spinner and check on a white disc. */
  floating?: boolean;
}) {
  const [step, setStep] = useState<'idle' | 'leaving' | 'working' | 'done' | 'gone'>(visible ? 'idle' : 'gone');
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fade = (to: number, then?: () => void) =>
    Animated.timing(opacity, { toValue: to, duration: FADE_MS, useNativeDriver: Platform.OS !== 'web' }).start(then);
  const fadeOut = () => fade(0, () => setStep('gone'));

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
    setStep('leaving');
    fade(0, () => {
      setStep('working');
      fade(1);
      later(WORKING_MS, () => {
        onPress();
        setStep('done');
        later(DONE_MS, fadeOut);
      });
    });
  };

  return (
    <Animated.View style={{ opacity }}>
      <Pressable onPress={press} disabled={step !== 'idle'} accessibilityRole="button"
        accessibilityLabel={step === 'done' ? 'Suggested order restored' : 'Auto: use the suggested order'}
        accessibilityState={{ busy: step === 'working' }}
        style={({ pressed }) => [styles.box, floating && styles.floating, step === 'idle' || step === 'leaving' ? styles.btn : null, pressed && { opacity: 0.85 }]}>
        {step === 'working' ? <ActivityIndicator size="small" color={color.action} />
          : step === 'done' ? <Icon name="check" size={18} color={color.action} strokeWidth={2.25} />
          : <Text style={[styles.label, floating && { fontSize: 14 }]}>Auto</Text>}
      </Pressable>
    </Animated.View>
  );
}

// The button is secondary, small (like Button variant="secondary" size="sm"); the spinner
// and check sit in the same box on the sheet's white, so nothing around them moves.
const styles = StyleSheet.create({
  box: { marginTop: 1, height: 32, minWidth: 68, paddingHorizontal: 16, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  btn: { backgroundColor: color.brandTint },
  floating: { height: 44, minWidth: 44, paddingHorizontal: 20, marginTop: 0, backgroundColor: color.surface, ...shadow.float },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 20, color: color.action },
});
