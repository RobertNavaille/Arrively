import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useDaySheetContent } from '../src/lib/sheetPortal';
import { RowMenuHost } from '../src/ui/RowMenu';
import { color } from '../src/ui/theme';

// iPhone: the Schedule's day sheet is Apple's own sheet over the map, showing
// what the Schedule hands it (src/lib/sheetPortal.ts): Today, the day, Add stop,
// the week strip and the day pages. It rests low or opens full height (the two
// detents), can't be swiped away, and leaves the map usable above it.
export default function DaySheet() {
  const sheet = useDaySheetContent();
  const navigation = useNavigation();
  const open = useRef(false);
  const latest = useRef(sheet);
  latest.current = sheet;

  // The two heights, as fractions of the screen: resting, and fully open (just below the avatar).
  const full = sheet ? round((sheet.height - sheet.top) / sheet.height) : 0.9;
  const resting = sheet ? Math.max(0.08, round((sheet.height - sheet.top - sheet.rest) / sheet.height)) : 0.5;
  const detents = resting < full - 0.02 ? [resting, full] : [full];
  const detentsKey = detents.join(',');
  const detentsRef = useRef(detents);
  detentsRef.current = detents;
  useEffect(() => {
    navigation.setOptions({ sheetAllowedDetents: detents });
  }, [detentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function setOpen(v: boolean) {
    if (open.current === v) return;
    open.current = v;
    latest.current?.onOpenChange(v);
  }
  // Open or resting: from Apple's event when it comes, and from the height the sheet gives us.
  useEffect(() => {
    const off = (navigation as unknown as { addListener: (e: string, cb: (ev: { data?: { index?: number } }) => void) => () => void })
      .addListener('sheetDetentChange', (ev) => {
        const i = ev.data?.index ?? 0;
        setOpen(detentsRef.current.length > 1 && i >= detentsRef.current.length - 1);
      });
    return off;
  }, [navigation]);

  // Back on the sheet after a screen opened from it (a stop, Optimize schedule): the Schedule
  // lines its pages up again, as it does when it comes back into view itself.
  useFocusEffect(useCallback(() => { latest.current?.onFocus(); }, []));

  // The Schedule went away (signed out): close the sheet too.
  useEffect(() => {
    if (!sheet && navigation.isFocused() && navigation.canGoBack()) navigation.goBack();
  }, [sheet, navigation]);

  if (!sheet) return <View style={{ flex: 1, backgroundColor: color.surface }} />;
  return (
    // Row menus (press and hold a stop) are drawn inside the sheet.
    <RowMenuHost>
      <View style={{ flex: 1, backgroundColor: color.surface }} collapsable={false}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          sheet.onWidth(Math.round(width));
          if (detentsRef.current.length > 1) {
            const [a, b] = detentsRef.current;
            setOpen(height > sheet.height * ((a + b) / 2));
          }
        }}>
        {/* First inside the sheet, before any list: with a list first, Apple's sheet can leave it blank. */}
        <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1 }} pointerEvents="none" />
        {/* Room for Apple's grabber. */}
        <View style={{ height: 14 }} />
        {sheet.body}
        {sheet.overlay}
      </View>
    </RowMenuHost>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
