import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSheetContent } from '../src/lib/sheetPortal';
import { color } from '../src/ui/theme';

// iPhone (trial): Apple's sheet over the trip map, showing what the trip
// screen hands it (src/lib/sheetPortal.ts). It rests low or opens full height
// (the two detents), can't be swiped away, and leaves the map usable above it.
export default function TripSheet() {
  const sheet = useSheetContent();
  const navigation = useNavigation();
  const open = useRef(false);
  const onOpenChange = useRef(sheet?.onOpenChange);
  onOpenChange.current = sheet?.onOpenChange;

  // The two heights, as fractions of the screen: resting, and fully open (just below the trip screen's top bar).
  const full = sheet ? round((sheet.height - sheet.top) / sheet.height) : 0.9;
  const resting = sheet ? Math.max(0.08, round((sheet.height - sheet.top - sheet.rest) / sheet.height)) : 0.4;
  const detents = resting < full - 0.02 ? [resting, full] : [full];
  const detentsKey = detents.join(',');

  useEffect(() => {
    navigation.setOptions({ sheetAllowedDetents: detents });
  }, [detentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new step starts where it should (open for Optimize review and the complete-stop form):
  // briefly allow only that height, which moves the sheet there, then both again.
  const startOpen = !!sheet?.startOpen;
  useEffect(() => {
    if (!sheet) return;
    const target = startOpen ? full : resting;
    navigation.setOptions({ sheetAllowedDetents: [target] });
    setOpen(startOpen);
    const t = setTimeout(() => navigation.setOptions({ sheetAllowedDetents: detents }), 350);
    return () => clearTimeout(t);
  }, [sheet?.resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open or resting, as the driver drags it.
  useEffect(() => {
    const off = (navigation as unknown as { addListener: (e: string, cb: (ev: { data?: { index?: number; isStable?: boolean } }) => void) => () => void })
      .addListener('sheetDetentChange', (ev) => {
        if (ev.data?.isStable === false) return;
        setOpen((ev.data?.index ?? 0) >= detentsRef.current.length - 1 && detentsRef.current.length > 1);
      });
    return off;
  }, [navigation]);
  const detentsRef = useRef(detents);
  detentsRef.current = detents;

  function setOpen(v: boolean) {
    if (open.current === v) return;
    open.current = v;
    onOpenChange.current?.(v);
  }

  // The trip screen went away (trip over, or left): close the sheet too.
  useEffect(() => {
    if (!sheet && navigation.isFocused() && navigation.canGoBack()) navigation.goBack();
  }, [sheet, navigation]);

  if (!sheet) return <View style={{ flex: 1, backgroundColor: color.surface }} />;
  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      {/* One scroll view for the whole sheet, with the step's card pinned at its top while the list scrolls:
          Apple's sheet lays out its scroll view from the top, so a card above it would sit underneath. */}
      <ScrollView style={{ flex: 1 }} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: sheet.bottomInset }}
        showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: color.surface }}>{sheet.header}</View>
        <View>{sheet.children}</View>
      </ScrollView>
      {sheet.overlay}
    </View>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
