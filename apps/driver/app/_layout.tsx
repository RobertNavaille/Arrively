import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, useFonts } from '@expo-google-fonts/poppins';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { backend } from '../src/lib/backend';
import '../src/lib/location'; // registers the background location task
import { DriverDataProvider } from '../src/lib/store';
import { NATIVE_CHROME, nativeHeader, nativeSheet } from '../src/ui/nativeChrome';
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
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
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
        presentation: 'formSheet', sheetAllowedDetents: [0.4, 0.9], sheetInitialDetentIndex: 0, sheetGrabberVisible: true,
        sheetCornerRadius: 24, sheetLargestUndimmedDetentIndex: 'last', gestureEnabled: false,
      } : undefined} />
      {/* iPhone: Apple's navigation bar and sheets (see nativeChrome.ts); elsewhere the screens draw their own. */}
      <Stack.Screen name="settings" options={NATIVE_CHROME ? { ...nativeHeader, title: 'Settings' } : undefined} />
      <Stack.Screen name="stop/[id]" options={NATIVE_CHROME ? { ...nativeHeader, title: '' } : undefined} />
      <Stack.Screen name="skip/[id]" options={NATIVE_CHROME ? nativeSheet([0.75, 1]) : { presentation: 'modal' }} />
      <Stack.Screen name="new-stop" options={NATIVE_CHROME ? nativeSheet([1]) : { presentation: 'modal' }} />
    </Stack>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DriverDataProvider enabled={signedIn}>{stack}</DriverDataProvider>
    </SafeAreaProvider>
  );
}
