import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSheetContent } from '../src/lib/sheetPortal';
import { color } from '../src/ui/theme';

// iPhone (trial): Apple's sheet over the trip map, showing what the trip
// screen hands it (src/lib/sheetPortal.ts). It rests low or opens full height
// (the two detents), can't be swiped away, and leaves the map usable above it.
// Dragging up anywhere on the resting sheet opens it (Apple's behaviour for a
// sheet whose list is at its top); then the list scrolls.
export default function TripSheet() {
  const sheet = useSheetContent();
  const navigation = useNavigation();
  const open = useRef(false);
  const onOpenChange = useRef(sheet?.onOpenChange);
  onOpenChange.current = sheet?.onOpenChange;
  // TEMPORARY (trial): what Apple's sheet gives us.
  const [dbg, setDbg] = useState({ event: -1, h: 0 });
  // The fixed part's height: Apple's sheet stretches the list from its very top, so the
  // totals float over the list's top and the list starts this far down.
  const [fixedH, setFixedH] = useState(0);

  // The two heights, as fractions of the screen: resting, and fully open (just below the trip screen's top bar).
  const full = sheet ? round((sheet.height - sheet.top) / sheet.height) : 0.9;
  const resting = sheet ? Math.max(0.08, round((sheet.height - sheet.top - sheet.rest) / sheet.height)) : 0.4;
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
    onOpenChange.current?.(v);
  }

  // A new step starts where it should (open for Optimize review and the complete-stop form):
  // briefly allow only that height, which moves the sheet there, then both again.
  const startOpen = !!sheet?.startOpen;
  useEffect(() => {
    if (!sheet) return;
    navigation.setOptions({ sheetAllowedDetents: [startOpen ? full : resting] });
    setOpen(startOpen);
    const t = setTimeout(() => navigation.setOptions({ sheetAllowedDetents: detentsRef.current }), 350);
    return () => clearTimeout(t);
  }, [sheet?.resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open or resting: from Apple's event when it comes, and from the height the sheet gives us.
  useEffect(() => {
    const off = (navigation as unknown as { addListener: (e: string, cb: (ev: { data?: { index?: number } }) => void) => () => void })
      .addListener('sheetDetentChange', (ev) => {
        const i = ev.data?.index ?? 0;
        setDbg((d) => ({ ...d, event: i }));
        setOpen(detentsRef.current.length > 1 && i >= detentsRef.current.length - 1);
      });
    return off;
  }, [navigation]);
  const onLayout = (h: number) => {
    setDbg((d) => ({ ...d, h: Math.round(h) }));
    if (!sheet || detentsRef.current.length < 2) return;
    const [a, b] = detentsRef.current;
    setOpen(h > sheet.height * ((a + b) / 2));
  };

  // The trip screen went away (trip over, or left): close the sheet too.
  useEffect(() => {
    if (!sheet && navigation.isFocused() && navigation.canGoBack()) navigation.goBack();
  }, [sheet, navigation]);

  if (!sheet) return <View style={{ flex: 1, backgroundColor: color.surface }} />;
  return (
    <View style={{ flex: 1, backgroundColor: color.surface }} onLayout={(e) => onLayout(e.nativeEvent.layout.height)}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: sheet.fixed ? fixedH : 0, paddingBottom: sheet.bottomInset }}
        scrollIndicatorInsets={{ top: fixedH }} showsVerticalScrollIndicator={false}>
        {sheet.header}
        {sheet.children}
        <Text style={{ fontSize: 11, color: '#c00', padding: 16 }}>
          {`TEMP H ${Math.round(sheet.height)} detents ${detentsKey} h ${dbg.h} event ${dbg.event} open ${open.current}`}
        </Text>
      </ScrollView>
      {sheet.fixed ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, backgroundColor: color.surface }}
          onLayout={(e) => setFixedH(Math.round(e.nativeEvent.layout.height))}>
          {sheet.fixed}
        </View>
      ) : null}
      {sheet.overlay}
    </View>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
