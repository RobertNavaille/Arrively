import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadAppearance } from '../src/lib/appearance';
import { backend } from '../src/lib/backend';
import '../src/lib/location'; // registers the background location task
import { DriverDataProvider } from '../src/lib/store';
import { NATIVE_CHROME, nativeHeader, nativePageSheet, nativeSheet } from '../src/ui/nativeChrome';
import { color } from '../src/ui/theme';

export { ScreenError as ErrorBoundary } from '../src/ui/ScreenError';

function useAuthGate() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    backend.isSignedIn().then((v) => { setSignedIn(v); setReady(true); });
    return backend.onAuthChange(setSignedIn);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onSignIn = segments[0] === 'sign-in';
    if (!signedIn && !onSignIn) router.replace('/sign-in');
    if (signedIn && onSignIn) router.replace('/');
  }, [ready, signedIn, segments, router]);

  return { ready, signedIn, setSignedIn };
}

export default function RootLayout() {
  // Light, dark or automatic, as chosen in Settings.
  useEffect(() => { loadAppearance(); }, []);
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  const { ready, signedIn } = useAuthGate();

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface }}>
        <ActivityIndicator color={color.action} />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surface } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="trip" />
      {/* iPhone (trial): the trip screen's sheet, presented by Apple over the map. */}
      <Stack.Screen name="trip-sheet" options={NATIVE_CHROME ? {
        // Apple's own corners and margins (inset at the lower height on current iOS, edge to edge when fully open).
        presentation: 'formSheet', sheetAllowedDetents: [0.4, 0.9], sheetInitialDetentIndex: 0, sheetGrabberVisible: true,
        sheetLargestUndimmedDetentIndex: 'last', gestureEnabled: false,
        // Dragging the list up at the resting height opens the sheet first (Apple's behaviour).
        sheetExpandsWhenScrolledToEdge: true,
      } : undefined} />
      {/* iPhone: Apple's navigation bar and sheets (see nativeChrome.ts); elsewhere the screens draw their own. */}
      <Stack.Screen name="settings" options={NATIVE_CHROME ? { ...nativeHeader, title: 'Settings' } : undefined} />
      <Stack.Screen name="stop/[id]" options={NATIVE_CHROME ? { ...nativeHeader, title: '' } : undefined} />
      <Stack.Screen name="skip/[id]" options={NATIVE_CHROME ? nativeSheet([0.75, 1]) : { presentation: 'modal' }} />
      <Stack.Screen name="new-stop" options={NATIVE_CHROME ? nativePageSheet : { presentation: 'modal' }} />
      {/* Optimize route: no swipe to close, so a drag in the list can't lose the new order (Cancel closes it). */}
      <Stack.Screen name="optimize-route" options={NATIVE_CHROME ? { ...nativePageSheet, gestureEnabled: false } : { presentation: 'modal' }} />
      <Stack.Screen name="week-options" options={NATIVE_CHROME ? nativePageSheet : { presentation: 'modal' }} />
    </Stack>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <DriverDataProvider enabled={signedIn}>{stack}</DriverDataProvider>
    </SafeAreaProvider>
  );
}
