import { ActionSheetIOS, Platform } from 'react-native';

export interface SheetChoice { label: string; destructive?: boolean; onPress: () => void }

/**
 * On iPhone, shows Apple's action sheet (with a Cancel button) and returns
 * true; elsewhere returns false so the caller shows its own menu.
 */
export function showIOSActionSheet(choices: SheetChoice[], opts: { title?: string; message?: string } = {}): boolean {
  if (Platform.OS !== 'ios') return false;
  const destructive = choices.map((c, i) => (c.destructive ? i : -1)).filter((i) => i >= 0);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: [...choices.map((c) => c.label), 'Cancel'],
      cancelButtonIndex: choices.length,
      destructiveButtonIndex: destructive.length ? destructive : undefined,
      title: opts.title, message: opts.message,
    },
    (i) => { if (i < choices.length) choices[i].onPress(); },
  );
  return true;
}
