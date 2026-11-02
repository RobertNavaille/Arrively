import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Route = { path: [number, number][]; durationS: number; distanceM: number };
type Found = { name: string; detail: string; lat: number; lng: number };

interface AppleMapsKit {
  route(points: [number, number][], mode: string, avoidHighways: boolean, avoidTolls: boolean): Promise<Route | null>;
  search(query: string, near: [number, number] | null): Promise<Found[]>;
}

/** Apple Maps routes and search, on iPhone builds that include the module; null elsewhere (web, Android). */
export const appleMaps: AppleMapsKit | null = Platform.OS === 'ios' ? requireOptionalNativeModule<AppleMapsKit>('AppleMapsKit') : null;
