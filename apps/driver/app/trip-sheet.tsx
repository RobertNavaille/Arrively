import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSheetContent } from '../src/lib/sheetPortal';
import { color } from '../src/ui/theme';

// iPhone (trial): Apple's sheet over the trip map, showing what the trip
// screen hands it (src/lib/sheetPortal.ts). It rests low or opens full height
// (the two detents), can't be swiped away, and leaves the map usable above it.
export default function TripSheet() {
  const sheet = useSheetContent();
  const navigation = useNavigation();
  const open = useRef(false);
  // Which height the sheet is at (0 resting, last fully open): the content is sized to it,
  // since inside Apple's sheet "fill the space" gets no height of its own.
  const [at, setAt] = useState(0);
  // TEMPORARY (trial): what Apple's sheet actually gives us, shown at the top of the sheet.
  const [dbg, setDbg] = useState({ event: -1, outer: '', inner: '' });
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
    setAt(startOpen ? 1 : 0);
    setOpen(startOpen);
    const t = setTimeout(() => navigation.setOptions({ sheetAllowedDetents: detents }), 350);
    return () => clearTimeout(t);
  }, [sheet?.resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open or resting, as the driver drags it.
  useEffect(() => {
    const off = (navigation as unknown as { addListener: (e: string, cb: (ev: { data?: { index?: number; isStable?: boolean } }) => void) => () => void })
      .addListener('sheetDetentChange', (ev) => {
        if (ev.data?.isStable === false) return;
        setDbg((d) => ({ ...d, event: ev.data?.index ?? -2 }));
        const top = (ev.data?.index ?? 0) >= detentsRef.current.length - 1 && detentsRef.current.length > 1;
        setAt(top ? 1 : 0);
        setOpen(top);
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
  // The height showing now: resting or fully open.
  const contentH = Math.round(sheet.height * (at === 1 || detents.length === 1 ? detents[detents.length - 1] : detents[0]));
  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const l = e.nativeEvent.layout; setDbg((d) => ({ ...d, outer: `${Math.round(l.y)}/${Math.round(l.height)}` })); }}>
    <Text style={{ fontSize: 11, color: '#c00', paddingHorizontal: 16 }}>
      {`H ${Math.round(sheet.height)} top ${Math.round(sheet.top)} rest ${Math.round(sheet.rest)} detents ${detents.join(',')} at ${at} event ${dbg.event} outer ${dbg.outer} inner ${dbg.inner}`}
    </Text>
    <View style={{ height: contentH, backgroundColor: color.surface }} onLayout={(e) => { const l = e.nativeEvent.layout; setDbg((d) => ({ ...d, inner: `${Math.round(l.y)}/${Math.round(l.height)}` })); }}>
      {/* One scroll view for the whole sheet, with the step's card pinned at its top while the list scrolls. */}
      <ScrollView style={{ height: contentH }} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: sheet.bottomInset }}
        showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: color.surface }}>{sheet.header}</View>
        <View>{sheet.children}</View>
      </ScrollView>
      {sheet.overlay}
    </View>
    </View>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
