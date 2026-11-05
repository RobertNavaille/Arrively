import { Platform } from 'react-native';
import { color, font } from './theme';

/**
 * On iPhone the app uses Apple's own navigation bar (system back button,
 * swipe back) and sheets (grabber, swipe down to close). The web and Android
 * keep the drawn versions, so screens check this before drawing their own.
 */
export const NATIVE_CHROME = Platform.OS === 'ios';

/** The iPhone navigation bar, in Arrively's colors and type. */
export const nativeHeader = {
  headerShown: true,
  headerTintColor: color.action,
  headerTitleStyle: { fontFamily: font.semibold, fontSize: 17, color: color.ink },
  headerStyle: { backgroundColor: color.surface },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Apple's page sheet: the full-height card that slides up over the screen,
 * which shrinks back behind it. Swipe down (or Cancel) to close. Behind the
 * shrunk screen is the app's root background, black on iPhone (app.json
 * ios.backgroundColor), as in Apple's apps; on white the effect can't be seen.
 */
export const nativePageSheet = { presentation: 'pageSheet' as const };

/** An iPhone sheet: grabber, rounded corners, swipe down to close. */
export const nativeSheet = (detents: number[]) => ({
  presentation: 'formSheet' as const,
  sheetAllowedDetents: detents,
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
});
