import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { isDone, type Route } from '../lib/types';
import { useBottomInset } from '../lib/viewport';
import { Button } from './components';
import { color, radius, shadow, space, type } from './theme';

/** Pinned to the bottom of screens outside the trip while a trip is under way. */
export function TripBar({ route }: { route: Route }) {
  const router = useRouter();
  const done = route.stops.filter(isDone).length;
  const bottomInset = useBottomInset();
  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4] + bottomInset }}>
      <View accessibilityRole="summary" style={[{ gap: 10, padding: space[3], borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider }, shadow.float]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand }} />
          <Text style={type.caption}>Trip in progress · {done} of {route.stops.length} done</Text>
        </View>
        <Button label="Resume trip" onPress={() => router.push('/trip')} />
      </View>
    </View>
  );
}
