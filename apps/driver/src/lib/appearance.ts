import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';
import { useEffect, useState } from 'react';

/** Light, dark, or follow the iPhone's setting (Settings → Appearance). */
export type AppearanceMode = 'auto' | 'light' | 'dark';
const KEY = 'arrively.appearance';
let mode: AppearanceMode = 'auto';
const listeners = new Set<(m: AppearanceMode) => void>();

function apply(m: AppearanceMode) {
  // The web app stays light for now.
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(m === 'auto' ? 'unspecified' : m);
}

/** At launch: the saved choice. */
export async function loadAppearance() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') mode = saved;
  } catch { /* keep automatic */ }
  apply(mode);
  listeners.forEach((l) => l(mode));
}

export async function setAppearance(m: AppearanceMode) {
  mode = m;
  apply(m);
  listeners.forEach((l) => l(m));
  try { await AsyncStorage.setItem(KEY, m); } catch { /* still applied for now */ }
}

export function useAppearanceMode(): AppearanceMode {
  const [m, setM] = useState(mode);
  useEffect(() => { listeners.add(setM); return () => { listeners.delete(setM); }; }, []);
  return m;
}
