import { Alert, Platform } from 'react-native';

// Alert.alert is a no-op on web, so the browser preview uses the window dialogs.

export function showMessage(title: string, message?: string) {
  if (Platform.OS === 'web') { window.alert(message ? `${title}\n\n${message}` : title); return; }
  Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
