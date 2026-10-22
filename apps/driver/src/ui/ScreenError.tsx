import type { ErrorBoundaryProps } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from './components';
import { color, space, type } from './theme';

/**
 * Shown when a screen fails to draw, instead of a blank page: what went wrong
 * (so the driver can send a screenshot) and a way to try again.
 */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6], backgroundColor: color.surface }}>
      <Text style={type.title}>Something went wrong</Text>
      <Text style={[type.caption, { textAlign: 'center' }]} selectable>{error.message}</Text>
      <Button label="Try again" onPress={() => { retry(); }} />
    </View>
  );
}
