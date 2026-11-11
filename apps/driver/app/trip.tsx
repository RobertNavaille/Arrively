import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, TextInput, StyleSheet, Text, View } from 'react-native';
import { showIOSActionSheet } from '../src/lib/actionSheet';
import { backend } from '../src/lib/backend';
import { confirmAction, showMessage } from '../src/lib/dialog';
import { useRoadPath, useRoadRoute } from '../src/lib/directions';
import { dayKey, distanceM, pathAhead, pathLengthM, estimateDriveMin, fmtDuration, fmtPhone, fmtTime, fmtWindow, miles, routeTotals } from '../src/lib/geo';
import { currentPosition, enableCompass, startSharing, stopSharing, useCompassHeading, useLivePosition, useTravelBearing } from '../src/lib/location';
import { optionsOf, SPEED, type RouteOptions } from '../src/lib/routing';
import { currentStop, useDriverData } from '../src/lib/store';
import { avoidList, avoidNotPassed, contactCustomer, etaMessage, openDirections } from '../src/lib/navigation';
import { useBottomInset, useScreenHeight } from '../src/lib/viewport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDone, type LatLng, type Stop } from '../src/lib/types';
import { AheadRow, TripTotals } from '../src/ui/TripParts';
import { Cascade } from '../src/ui/Cascade';
import { RowMenuHost } from '../src/ui/RowMenu';
import { StopMenu } from '../src/ui/StopMenu';
import { useLocks } from '../src/lib/locks';
import { onOptimizeSignal } from '../src/lib/optimizeSignal';
import { TRIP_SCREENS_TO_LEAVE, TripSheetHost } from '../src/ui/TripSheetHost';
import { NATIVE_CHROME } from '../src/ui/nativeChrome';
import { FadeIn } from '../src/ui/FadeIn';
import { FloatingSurface } from '../src/ui/FloatingSurface';
import { Button, IconButton, StatusPill } from '../src/ui/components';
import { Icon, type IconName } from '../src/ui/Icon';
import { RouteMap } from '../src/ui/RouteMap';
import type { MapStop } from '../src/ui/RouteMap.types';
import { color, font, radius, shadow, space, type } from '../src/ui/theme';

export { ScreenError as ErrorBoundary } from '../src/ui/ScreenError';

const RADIUS_M = 75;
// The bar across the top of the map: a back button (and, on the way, where to).
const NAV_TOP = 10;
const NAV_H = 44;
// Pulled all the way up, the sheet stops just under that bar, so going back is always in reach.
const SHEET_TOP = NAV_TOP + NAV_H + 10;
// Where the sheet's resting heights were first measured from (the old map strip above an open sheet).
const REST_FROM = 68;

/**
 * The trip in one view: the map fills the screen and the trip sits in a sheet
 * over it. The sheet's top is pinned and shows the step the driver is on (next
 * stop, on the way, arrived); below it, the stops after this one and the ones
 * done. Scrolling slides the sheet up over the map. My day only lists stops.
 */
export default function Trip() {
  const router = useRouter();
  const height = useScreenHeight();
  // Below the status bar on a phone (0 on the web).
  const safeTop = useSafeAreaInsets().top;
  const sheetTop = SHEET_TOP + safeTop;
  const { routeFor, refresh, profile } = useDriverData();
  const pos = useLivePosition();
  const travel = useTravelBearing(pos);
  const compass = useCompassHeading();
  const route = routeFor(dayKey(new Date()));
  // Set while a stop is held by its grip, so the sheet doesn't move with the drag.
  const holding = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The height of the sheet's top card (measured) and what's covered at the
  // bottom of the screen (home indicator, Safari's floating bar), so each step
  // rests with its card, Arrived and Cancel route included, fully above it.
  const [cardH, setCardH] = useState<number | null>(null);
  const bottomInset = useBottomInset();
  // The driver moved the map by hand: stop following until they re-center.
  const [freeMap, setFreeMap] = useState(false);
  // Arrived: Complete stop opens a short form: how it went (complete, no show, skipped) and comments.
  const [choosing, setChoosing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [comments, setComments] = useState('');
  // The sheet is pulled up to full height (not resting).
  const [sheetOpen, setSheetOpen] = useState(false);
  // On the way, pulled up: the More menu beside Get directions.
  const [barMenu, setBarMenu] = useState(false);

  // Just optimized: the old order stays on screen until the Optimize route sheet has closed,
  // then slides down and away, and the new order slides down into its place.
  const [swap, setSwap] = useState<{ current: Stop | null; after: Stop[]; phase: 'hold' | 'out' | 'in' } | null>(null);
  const shownRef = useRef<{ current: Stop | null; after: Stop[] }>({ current: null, after: [] });
  useEffect(() => onOptimizeSignal((sig) => {
    if (sig === 'hold') setSwap({ ...shownRef.current, phase: 'hold' });
    else if (sig === 'cancel') setSwap(null);
    // After the sheet has slid away.
    else setTimeout(() => setSwap((sw) => (sw ? { ...sw, phase: 'out' } : sw)), 450);
  }), []);
  const locks = useLocks();
  const stops = route?.stops ?? [];
  const byId = new Map(stops.map((s) => [s.id, s]));
  const done = stops.filter(isDone);
  const remaining = stops.filter((s) => !isDone(s));
  const current = currentStop(route);
  const phase = !current ? 'finished' : current.status === 'en_route' ? 'onroute' : current.status === 'arrived' ? 'arrived' : 'next';
  // The stops after the current one.
  const ahead = remaining;
  const after = remaining.filter((s) => s.id !== current?.id);
  if (!swap) shownRef.current = { current: current ?? null, after };
  // While the old order is held or sliding away, it's what's shown.
  const old = swap && swap.phase !== 'in' ? swap : null;
  const shownCurrent = old?.current ?? current;
  const shownAfter = old ? old.after : after;
  const slide = (rows: ReactNode, onDone?: () => void) => !swap ? rows : swap.phase === 'in'
    ? <Cascade key="in" dir="in" onDone={onDone}>{rows}</Cascade>
    : <Cascade key="out" dir="out" run={swap.phase === 'out'} onDone={onDone}>{rows}</Cascade>;
  const slideDone = () => setSwap((sw) => (!sw ? sw : sw.phase === 'out' ? { ...sw, phase: 'in' } : null));

  // How the trip is travelled (round trip, avoid highways / tolls, travel mode).
  const options: RouteOptions = route ? optionsOf(route) : {};
  const back = !!options.roundTrip && !!pos && ahead.length > 0;
  // The road route for the whole trip ahead (back to the start on a round trip), and for the leg to the current stop.
  // (Only where it's shown: the trip view. On the way, the leg is enough.)
  const road = useRoadPath(pos, phase === 'next' ? ahead : [], options);
  const heading = phase === 'next' || phase === 'onroute';
  const leg = useRoadRoute(heading ? pos : null, heading && current ? current : null, options);
  // The leg isn't asked for again while the driver stays on it, so what's left counts down along its line.
  const legShare = leg && pos ? Math.min(1, pathLengthM(pathAhead(leg.path, pos)) / Math.max(1, pathLengthM(leg.path))) : 1;
  const legMeters = leg ? leg.distanceM * legShare : pos && current ? distanceM(pos, current) : null;
  const legMin = leg ? Math.max(1, Math.round((leg.durationS * legShare) / 60)) : legMeters != null ? estimateDriveMin(legMeters) : null;
  // On the way: when they'll get there, at the drive time left.
  const arriveAt = legMin != null ? fmtTime(new Date(Date.now() + legMin * 60_000)) : null;
  // Without road routes (offline): straight lines at the travel mode's usual speed.
  const straightMeters = routeTotals(ahead, pos).meters + (back ? distanceM(ahead[ahead.length - 1], pos!) : 0);
  const straight = { meters: straightMeters, driveMin: Math.max(1, Math.round((straightMeters * 1.3) / SPEED[options.mode ?? 'drive'] / 60)) };
  const tripMin = road ? Math.round(road.durationS / 60) : straight.driveMin;
  const tripMeters = road ? road.distanceM : straight.meters;

  const canOptimize = !!route && route.status !== 'completed' && remaining.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;
  // Optimize route floats over the list while the next stop is up (not mid-drive or at a stop).
  const floatOptimize = phase === 'next' && canOptimize;
  // Each step starts with the sheet at its resting height.
  // Each step follows the driver again (the sheet itself goes back to rest on its own).
  useEffect(() => { setFreeMap(false); setChoosing(false); setOutcome(null); setComments(''); }, [phase]);

  if (!route || !stops.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], backgroundColor: color.surface }}>
        <Text style={type.body}>No stops today.</Text>
        <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
      </View>
    );
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); }
    catch (e) {
      showMessage('Something went wrong', e instanceof Error ? e.message : String(e));
      // The stop may have moved on without us (arrival is also detected from location): catch up.
      refresh();
    }
    finally { setBusy(null); }
  }
  // On the way's More menu: arrival is detected, this is the fallback; Cancel route goes back to the trip view.
  const markArrivedHere = () => { if (current) run('arrived', async () => { await backend.markArrived(current.id); await refresh(); }); };
  const cancelRoute = () => { if (current) run('cancel', async () => { await backend.cancelTrip(current.id); await stopSharing(); await refresh(); }); };

  // Optimize route opens in its own sheet (Apple's page sheet on iPhone).
  const optimize = () => router.push('/optimize-route');
  // Start driving only starts the drive. (It used to open Messages with the customer's tracking link too.)
  const startDriving = () => startTrip();
  const startTrip = () => run('start', async () => {
    if (!current) return;
    // Asked from this tap: iPhone browsers share the compass only once allowed.
    await enableCompass();
    // The first drive starts the trip: location sharing and the customers' texts begin here.
    if (route.status === 'planned') {
      await backend.startRoute(route.id);
      const ok = await startSharing();
      if (!ok) showMessage('Location is off', 'Allow location "Always" so customers can see you coming and stops are marked when you arrive.');
    }
    await backend.startTrip(current.id);
    await refresh();
  });
  // The driver's comments are saved with the stop (as its mark reason). Skipping, or marking
  // away from the stop, needs a reason: without comments, a plain one is used.
  async function mark(outcome: Outcome) {
    if (!current) return;
    const note = comments.trim() || null;
    const here = pos ?? (await currentPosition());
    if (outcome !== 'skipped' && here && distanceM(here, current) > RADIUS_M * 2) {
      const ok = await confirmAction('You are away from this stop', 'Marking it from here is flagged to your business. Mark it anyway?', 'Mark it');
      if (ok) await run('mark', async () => { await backend.markStop(current.id, outcome, note ?? 'Marked away from the stop', here); await refresh(); });
      return;
    }
    await run('mark', async () => { await backend.markStop(current.id, outcome, outcome === 'skipped' ? note ?? 'Skipped' : note, here); await refresh(); });
  }
  const call = current?.customer_phone ? () => contactCustomer('tel', current.customer_phone!) : undefined;
  // Calls and texts go through the phone's own apps.
  // The text starts with the customer's live tracking link (the driver's ETA).
  const message = current?.customer_phone ? () => contactCustomer('sms', current.customer_phone!, etaMessage(current, profile?.name, profile?.org_name))
    : () => showMessage('No phone number', `There's no phone number for ${current?.customer_name ?? 'this customer'}.`);
  // The job in full, one gray line icon and its text per row (on the way, and arrived).
  // `contact`: buttons at the right of the phone number's row.
  const jobDetails = (contact?: ReactNode) => current ? (
    <View style={{ gap: 28 }} accessibilityRole="list" accessibilityLabel="Job details">
      <JobRow icon="person" text={current.customer_name} />
      {current.customer_phone ? <JobRow icon="phone" text={fmtPhone(current.customer_phone)} trailing={contact} /> : null}
      <JobRow icon="pin" text={current.address} />
      {current.window_start ? <JobRow icon="clock" text={`${route?.day === dayKey(new Date()) ? 'Today, ' : ''}${fmtWindow(current)}`} /> : null}
      {current.notes ? <JobRow icon="lines" text={current.notes} /> : null}
    </View>
  ) : null;
  // Arrived, resting: the stop's own moment (time there, who, call and text). The job in full is pulled up.
  const arrivedInfo = current ? (
    <>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <StatusPill center tone="info" icon="clock" label={`At stop${current.arrived_at ? ` since ${fmtTime(current.arrived_at)}` : ''}`} />
        <Text style={[type.title, { fontSize: 28, lineHeight: 34, marginTop: space[3] }]} accessibilityRole="header">Arrived</Text>
        <Text style={[type.body, { color: color.inkMuted, textAlign: 'center' }]}>{current.customer_name} · {current.address.split(',')[0]}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[3] }}>
        {/* Call shows even without a number on file (it says so), beside text. */}
        <IconButton icon="phone" size="xl" label={`Call ${current.customer_name}`}
          onPress={call ?? (() => showMessage('No phone number', `There's no phone number for ${current.customer_name}.`))} />
        <IconButton icon="message" size="xl" label={`Message ${current.customer_name}`} onPress={message} />
      </View>
    </>
  ) : null;
  // Pulled up to full height, on the way and arrived: the job's details, with call and text in the phone row.
  const detailsOpen = sheetOpen && !!current && (phase === 'onroute' || (phase === 'arrived' && !choosing));

  // The map: the whole trip, or once arrived, this stop alone.
  const order = [...done, ...ahead];
  // On the way, the map follows the drive: the driver and this leg only.
  const focus = phase === 'arrived' || phase === 'onroute';
  const mapStops: MapStop[] = focus ? [] : order.map((s, i) => ({
    id: s.id, lat: s.lat, lng: s.lng, n: i + 1,
    state: isDone(s) ? 'done' : s.id === current?.id ? 'next' : 'upcoming',
  }));
  // The route line starts at the driver: the road route is fetched only every
  // so often, so what's already behind them is trimmed off on every fix.
  const trimmed = (path: LatLng[]) => (pos ? [pos, ...pathAhead(path, pos)] : path);
  // On the way: where this drive started and the way driven since (the driver's own trail), per stop.
  // The map frames the start and the stop; the trail is drawn gray, what's left blue.
  const trail = useRef<{ stop: string; points: LatLng[] } | null>(null);
  if (phase === 'onroute' && current && pos) {
    if (trail.current?.stop !== current.id) trail.current = { stop: current.id, points: [{ lat: pos.lat, lng: pos.lng }] };
    else {
      const last = trail.current.points[trail.current.points.length - 1];
      if (distanceM(last, pos) > 15) trail.current.points.push({ lat: pos.lat, lng: pos.lng });
    }
  } else if (phase !== 'onroute') trail.current = null;
  const driven = phase === 'onroute' && trail.current && pos ? [...trail.current.points, pos] : undefined;
  const driveStart = phase === 'onroute' && trail.current ? [trail.current.points[0]] : undefined;
  const line = phase === 'arrived' ? undefined
    : phase === 'onroute' && current ? trimmed([...(leg ? leg.path : []), current])
    : road ? trimmed(road.path) : [...(pos ? [pos] : []), ...ahead, ...(back ? [pos!] : [])];
  // The sheet rests a third of the way down, or lower on the way: just low
  // enough that the step's card (with Arrived) sits above what's covered at the
  // bottom. Never so low that the card would slip under it.
  const sheetArea = height - sheetTop;
  // Pulled up (not at rest), a bar sits at the bottom: Arrived and Cancel on the way, Stop Complete and Continue route arrived.
  const barSpace = phase === 'onroute' || (phase === 'arrived' && !choosing) ? BAR_SPACE : 0;
  const cardRest = cardH != null ? Math.max(0, Math.round(sheetArea - cardH - bottomInset)) : null;
  // On the way and arrived, the sheet rests with its card just in view.
  const peek = (phase === 'onroute' || (phase === 'arrived' && !choosing)) && cardRest != null ? cardRest : Math.min(Math.round(height * 0.36) + REST_FROM - sheetTop, cardRest ?? Infinity);

  // Fixed over the bottom: the bottom bar when pulled up, and Optimize route.
  // Over the screen here; inside the sheet on iPhone (TripSheetHost.ios.tsx).
  // iPhone: the trip totals stay put at the top of the sheet; the stops scroll under them.
  const sheetFixed = NATIVE_CHROME && (phase === 'next' && current) ? (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[6] }}>
      <TripTotals travelMin={tripMin} meters={tripMeters} stops={ahead.length} />
    </View>
  ) : null;
  // Optimize route floats this far up from the bottom. In iPhone's sheet they sit
  // closer, just clear of the home indicator.
  const floatBottom = NATIVE_CHROME ? Math.max(space[2], bottomInset - space[1]) : bottomInset + space[4];
  const tripOverlay = (
    <>
        {/* On the way, with the sheet pulled up: Get directions, and More (arrived at location, cancel route), anchored to the bottom. */}
        {phase === 'onroute' && current && sheetOpen ? (
          <FadeIn from={16} style={[styles.bottomBar, { paddingBottom: bottomInset + space[4] }]}>
            <Button icon="navigate" label="Get directions" style={{ flex: 1 }}
              onPress={() => openDirections(current, options)} />
            <IconButton icon="more" label="More options" onPress={() => {
              // iPhone: Apple's action sheet; elsewhere the drawn menu below.
              if (!showIOSActionSheet([
                { label: 'Arrived at location', onPress: markArrivedHere },
                { label: 'Cancel route', destructive: true, onPress: cancelRoute },
              ])) setBarMenu(true);
            }} />
          </FadeIn>
        ) : null}
        {/* Arrived, with the sheet pulled up: Stop Complete and Continue route, anchored to the bottom. */}
        {phase === 'arrived' && current && !choosing && sheetOpen ? (
          <FadeIn from={16} style={[styles.bottomBar, { paddingBottom: bottomInset + space[4] }]}>
            <Button label="Stop Complete" style={{ flex: 1 }} onPress={() => setChoosing(true)} />
            {/* Arrived by mistake: back to on the way. */}
            <Button variant="text" label="Continue route" loading={busy === 'undo'}
              onPress={() => run('undo', async () => { await backend.undoArrived(current.id); await refresh(); })} />
          </FadeIn>
        ) : null}
        {/* Optimize route floats at the bottom, over the trip list, wherever it's scrolled. */}
        {floatOptimize ? (
          <View style={[styles.floatBar, { bottom: floatBottom }]}>
            <Button variant="neutral" icon="route" label="Optimize route" onPress={optimize} style={shadow.float} />
          </View>
        ) : null}
    </>
  );

  return (
    // Row menus (press and hold a stop) draw here on the web; in iPhone's sheet, in app/trip-sheet.tsx.
    <RowMenuHost>
    <View style={{ flex: 1, backgroundColor: color.mapGround }}>
      <RouteMap height={height} stops={mapStops} driver={pos} line={line} doneLine={driven} frame={driveStart}
        // On the way: a cushion around the drive, so it doesn't run to the screen's edges.
        margin={phase === 'onroute' ? 44 : 0}
        pin={focus ? current : null} pinLabel={phase === 'arrived' ? current?.address.split(',')[0] : undefined}
        inset={{ top: NAV_TOP + NAV_H + 30 + safeTop, bottom: height - peek - sheetTop }}
        // On the way the map shows the whole drive, from where it started to the stop (north up); it doesn't follow the driver.
        // The way the driver faces: the compass when there is one, else their direction of travel.
        driverHeading={compass ?? travel}
        onUserMove={() => { if (phase === 'onroute') setFreeMap(true); }}
        // After they move the map, it stays where they put it until Re-center.
        hold={phase === 'onroute' && freeMap} />

      {phase === 'onroute' && freeMap ? (
        <Pressable onPress={() => setFreeMap(false)} accessibilityRole="button" accessibilityLabel="Show the whole drive again"
          style={{ position: 'absolute', top: 72 + safeTop, right: space[4], zIndex: 2 }}>
          <FloatingSurface style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: space[3], borderRadius: radius.full }}>
            <Icon name="navigate" size={16} color={color.actionInk} />
            <Text style={[type.bodyStrong, { color: color.actionInk }]}>Re-center</Text>
          </FloatingSurface>
        </Pressable>
      ) : null}

      {/* Top bar: back to where the driver came from and, on the way, where to (until the sheet is pulled up). */}
      <View style={{ position: 'absolute', top: NAV_TOP + safeTop, left: space[4], right: space[4], height: NAV_H, zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: space[2] }}
        pointerEvents="box-none">
        {/* Floating over the map: Liquid Glass on iPhone, white elsewhere (FloatingSurface). */}
        <Pressable onPress={() => (!router.canGoBack() ? router.replace('/') : TRIP_SCREENS_TO_LEAVE > 1 ? router.dismiss(TRIP_SCREENS_TO_LEAVE) : router.back())}
          accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <FloatingSurface style={{ width: NAV_H, height: NAV_H, borderRadius: NAV_H / 2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={20} color={color.ink} />
          </FloatingSurface>
        </Pressable>
        {phase === 'onroute' && current && !sheetOpen ? (
          <Pressable onPress={() => openDirections(current, options)} accessibilityRole="button" accessibilityLabel={`Directions to ${current.address}`}
            style={{ flex: 1 }}>
            <FloatingSurface style={{ height: NAV_H, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], borderRadius: NAV_H / 2 }}>
              <Icon name="navigate" size={18} color={color.ink} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{current.address}</Text>
            </FloatingSurface>
          </Pressable>
        ) : null}
      </View>

      {/* The sheet moves only when dragged (or scrolled) itself; the map above it pans and zooms. */}
      <TripSheetHost height={height} overlay={tripOverlay} fixed={sheetFixed} top={sheetTop} rest={peek} onOpenChange={setSheetOpen} resetKey={choosing ? `${phase}:mark` : phase} startOpen={choosing} bottomInset={bottomInset + barSpace + (floatOptimize ? OPTIMIZE_SPACE : 0)} hold={holding} header={
        // The step the driver is on: stays at the top of the sheet while the list scrolls.
        // Pulled up (arrived, on the way), the card changes for the details: its resting height stays measured from before.
        <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== cardH && !(sheetOpen && (phase === 'arrived' || phase === 'onroute'))) setCardH(h); }}
          style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], gap: space[3], borderBottomWidth: phase === 'arrived' || phase === 'next' || phase === 'onroute' ? 0 : 1, borderBottomColor: color.divider }}>
          {/* iPhone's sheet has its own grabber. */}
          {NATIVE_CHROME ? null : <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.divider, alignSelf: 'center' }} />}

          {phase === 'next' && current ? (
            <>
              {NATIVE_CHROME ? null : <TripTotals travelMin={tripMin} meters={tripMeters} stops={ahead.length} />}
              {/* The next stop sits on the trip's line: its circle and line run on into the stops after it. */}
              {slide(
              <View key="next" style={{ flexDirection: 'row', gap: space[3] }}>
                <View style={{ width: 20, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
                  <View style={styles.nextDot} />
                  {after.length ? <View style={[styles.line, { marginBottom: -space[4] }]} /> : null}
                </View>
                <View style={{ flex: 1, gap: space[3] }}>
                  <StopHeading stop={shownCurrent ?? current} onCall={call} onMessage={message} />
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[3] }}>
                    {legMin != null ? (
                      <Text style={type.body}><Text style={type.bodyStrong}>{legMin} min</Text>
                        <Text style={{ color: color.inkMuted }}> · {miles(legMeters!).toFixed(1)} mi</Text></Text>
                    ) : null}
                    {(shownCurrent ?? current).notes ? <Text style={[type.body, { flex: 1, color: color.inkMuted }]} numberOfLines={1}>{(shownCurrent ?? current).notes}</Text> : null}
                  </View>
                  <Button label="Start driving" onPress={startDriving} loading={busy === 'start'} disabled={!!swap} />
                </View>
              </View>, shownAfter.length ? undefined : slideDone)}
            </>
          ) : null}


          {/* On the way: the drive leads; who it's to comes second. */}
          {phase === 'onroute' && current ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <View style={{ flex: 1 }} accessible accessibilityLabel={`${legMin ?? '–'} minutes, ${legMeters != null ? miles(legMeters).toFixed(1) : '–'} miles${arriveAt ? `, arriving ${arriveAt}` : ''}`}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 34, lineHeight: 40, color: color.ink }}>{legMin != null ? `${legMin} min` : '–'}</Text>
                  <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]} numberOfLines={1}>
                    {[legMeters != null ? `${miles(legMeters).toFixed(1)} mi` : null, arriveAt ? `Arrive ${arriveAt}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {/* Pulled up, call and text move to the phone number's row. */}
                {!(sheetOpen && current.customer_phone) ? (
                  <>
                    {call ? <IconButton icon="phone" label={`Call ${current.customer_name}`} onPress={call} /> : null}
                    <IconButton icon="message" label={`Text ${current.customer_name}`} onPress={message} />
                  </>
                ) : null}
              </View>
              {/* Arrival is detected, so getting there leads. Pulled up, it moves to the bar at the bottom. */}
              {sheetOpen ? null : <Button icon="navigate" label="Get directions" onPress={() => openDirections(current, options)} style={{ marginTop: space[6] - space[1] }} />}
              {/* The maps app can't be told this from a link: a reminder to set it there. */}
              {avoidNotPassed(options) ? (
                <Text style={[type.caption, { fontSize: 13, lineHeight: 18 }]}>
                  In your maps app, turn on Avoid {avoidList(options).join(' and ')} too: it isn't passed on.
                </Text>
              ) : null}
            </>
          ) : null}

          {/* Arrived: the stop's own moment; the list comes back once it's marked. */}
          {/* Marking (the form), the sheet is just the form. */}
          {/* Pulled up, the job's details take its place, with Stop Complete in a bar at the bottom. */}
          {/* Arrived, pulled up to the job's details: a left-aligned heading, how long they've been there beside it, a divider under it. */}
          {phase === 'arrived' && current && !choosing && sheetOpen ? (
            <FadeIn style={styles.arrivedHeading} from={-6}>
              <Text style={[type.title, { flex: 1, fontSize: 28, lineHeight: 34 }]} accessibilityRole="header">Arrived</Text>
              <StatusPill center tone="info" icon="clock" label={`At stop${current.arrived_at ? ` since ${fmtTime(current.arrived_at)}` : ''}`} />
            </FadeIn>
          ) : null}
          {phase === 'arrived' && current && !choosing && !sheetOpen ? (
            <FadeIn style={{ gap: space[4] }}>
              {arrivedInfo}
              {/* Twice the usual space above it; Continue route is in the pulled-up sheet's bar. */}
              <Button label="Stop Complete" onPress={() => setChoosing(true)} style={{ marginTop: space[4] }} />
            </FadeIn>
          ) : null}

          {phase === 'finished' ? (
            <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
              <Text style={type.title}>Every stop is marked</Text>
              <Button variant="text" label="Back to My day" onPress={() => router.replace('/')} />
            </View>
          ) : null}
        </View>
      }>
        {/* The rest of the sheet: the stops after this one, then the ones done. On the way: the job instead. */}
        <View style={{ paddingBottom: space[8] }}>
          {/* Marking the stop: pick how it went, add comments, finish. The sheet opens to full height for it, and all of it scrolls. */}
          {phase === 'arrived' && current && choosing ? (
            <View style={{ gap: 20, paddingHorizontal: space[4], paddingTop: space[2] }}>
              <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]} accessibilityRole="header">How did it go?</Text>
              <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Outcome">
                {OUTCOMES.map((o) => (
                  <OutcomeChoice key={o.key} label={o.label} description={o.description} selected={outcome === o.key} onPress={() => setOutcome(o.key)} />
                ))}
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[type.label, { textTransform: 'uppercase' }]}>Comments</Text>
                <TextInput value={comments} onChangeText={setComments} multiline accessibilityLabel="Comments"
                  placeholder="What was done, parts used, anything for next time (optional)" placeholderTextColor={color.inkMuted}
                  style={styles.comments} />
                <Text style={type.caption}>Saved with the stop.</Text>
              </View>
              <View style={{ gap: space[2] }}>
                <Button label={outcome === 'no_show' ? 'Mark no show' : outcome === 'skipped' ? 'Skip stop' : 'Complete stop'}
                  disabled={!outcome} loading={busy === 'mark'} onPress={() => outcome && mark(outcome)} />
                <Button variant="text" label="Back" onPress={() => setChoosing(false)} />
              </View>
            </View>
          ) : null}
          {/* The job's details show once the sheet is pulled up to full height. */}
          {detailsOpen && current ? (
            <FadeIn delay={60} style={{ paddingTop: phase === 'onroute' ? 40 : space[4], paddingHorizontal: space[4] }}>
              {jobDetails(
                <View style={{ flexDirection: 'row', gap: space[2], marginVertical: -16 }}>
                  {call ? <IconButton icon="phone" label={`Call ${current.customer_name}`} onPress={call} /> : null}
                  <IconButton icon="message" label={`Text ${current.customer_name}`} onPress={message} />
                </View>,
              )}
            </FadeIn>
          ) : null}
          {phase !== 'arrived' && phase !== 'onroute' ? (
            <>
              {after.length ? (
                <View style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4] }}>
                  {/* While the next stop is up, the trip's line passes beside the heading. */}
                  {phase === 'next' ? <View style={{ width: 20, alignItems: 'center' }}><View style={[styles.line, { marginTop: 0 }]} /></View> : null}
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[4], paddingBottom: space[3] }}>
                    <Text style={[type.bodyStrong, { color: color.inkMuted }]}>{after.length} more {after.length === 1 ? 'stop' : 'stops'}</Text>
                    {/* While the next stop is up, the totals head the sheet instead. */}
                    {phase !== 'next' ? <Text style={type.caption}>{fmtDuration(Math.max(1, tripMin))} · {miles(tripMeters).toFixed(1)} mi</Text> : null}
                  </View>
                </View>
              ) : null}
              <View accessibilityRole="list" style={{ paddingHorizontal: space[4], paddingTop: 0 }}>
                {/* Tap a stop for its details; press and hold for Edit stop and Lock. */}
                {slide(shownAfter.map((s, i) => (
                  <StopMenu key={s.id} stop={s} day={route.day} onPress={() => router.push(`/stop/${s.id}`)} locked={locks.has(s.id)}>
                    <AheadRow stop={s} detail={s.address.split(',')[0]} last={i === shownAfter.length - 1} lock={{ on: locks.has(s.id) }} />
                  </StopMenu>
                )), slideDone)}
              </View>
              {done.length ? (
                <>
                  <Text style={[type.caption, { fontFamily: font.semibold, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], borderTopWidth: after.length ? 1 : 0, borderTopColor: color.divider }]}>
                    Done · {done.length}
                  </Text>
                  {done.map((s) => (
                    <Pressable key={s.id} onPress={() => router.push(`/stop/${s.id}`)} accessibilityRole="button" accessibilityLabel={`${s.customer_name}, done`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[4] }}>
                      <View style={{ width: 20, alignItems: 'center' }}><Icon name="check" size={18} color={color.inkMuted} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, { fontSize: 16, lineHeight: 22, color: color.inkMuted }]}>{s.customer_name}</Text>
                        <Text style={type.caption}>{s.address.split(',')[0]}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </TripSheetHost>

      <Modal transparent visible={barMenu && phase === 'onroute' && !!current} animationType="fade" onRequestClose={() => setBarMenu(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setBarMenu(false)} accessibilityLabel="Close menu" />
        {current ? (
          <View style={[styles.barMenu, shadow.float, { bottom: bottomInset + space[4] + 56 + space[2] }]} accessibilityRole="menu">
            {/* A fallback: arrival is detected. */}
            <BarMenuItem icon="pin" label="Arrived at location" onPress={() => { setBarMenu(false); markArrivedHere(); }} />
            {/* Started by mistake, or plans changed: back to the trip view. */}
            <BarMenuItem icon="close" label="Cancel route" danger onPress={() => { setBarMenu(false); cancelRoute(); }} />
          </View>
        ) : null}
      </Modal>
    </View>
    </RowMenuHost>
  );
}

// Room at the end of the list so its last stop can scroll clear of the floating button.
const OPTIMIZE_SPACE = 44 + space[4] * 2;
// The bar at the bottom on the way (a 56px button with its padding, not counting the inset under it).
const BAR_SPACE = 56 + space[3] + space[4] + 1;
const styles = StyleSheet.create({
  // The trip's line, shared by the next stop, the list heading and the stops after it.
  line: { flex: 1, width: 2, marginTop: 4, backgroundColor: color.divider },
  nextDot: { marginTop: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: color.action, borderWidth: 4, borderColor: color.brandTint },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.md, borderWidth: 1, borderColor: color.divider },
  choiceOn: { borderWidth: 2, borderColor: color.action, paddingVertical: 13, paddingHorizontal: space[4] - 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.controlBorder, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.action },
  comments: { minHeight: 104, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, borderWidth: 1, borderColor: color.divider,
    paddingHorizontal: space[3], paddingTop: space[3], paddingBottom: space[3], fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: color.ink, textAlignVertical: 'top' },
  arrivedHeading: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: -space[4], paddingHorizontal: space[4], paddingBottom: space[3], borderBottomWidth: 1, borderBottomColor: color.divider },
  barMenu: { position: 'absolute', right: space[4], minWidth: 220, paddingVertical: space[1], borderRadius: radius.md, backgroundColor: color.surface },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[3], paddingHorizontal: space[4], backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.divider },
  floatBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' },
  // Beside the centred button, at the sheet's left margin.
  floatStart: { position: 'absolute', left: space[4], top: 0, bottom: 0, justifyContent: 'center' },
});


type Outcome = 'completed' | 'no_show' | 'skipped';
const OUTCOMES: { key: Outcome; label: string; description: string }[] = [
  { key: 'completed', label: 'Completed', description: 'The job is done' },
  { key: 'no_show', label: 'No show', description: 'The customer wasn\u2019t there' },
  { key: 'skipped', label: 'Skipped', description: 'Not done today' },
];

/** One way the stop went, as a selectable card. */
function OutcomeChoice({ label, description, selected, onPress }: { label: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label}, ${description}`}
      style={[styles.choice, selected && styles.choiceOn]}>
      <View style={[styles.radio, selected && { borderColor: color.action }]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { fontSize: 16, lineHeight: 22 }]}>{label}</Text>
        <Text style={[type.body, { color: color.inkMuted }]}>{description}</Text>
      </View>
    </Pressable>
  );
}

/** An item in the More menu above the on-the-way bar. */
function BarMenuItem({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const tint = danger ? color.danger : color.ink;
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4] }, pressed && { backgroundColor: color.surfaceMuted }]}>
      <Icon name={icon} size={20} color={tint} />
      <Text style={[type.body, { fontSize: 16, color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** One line of the job on the way: a gray line icon and its text (and any buttons, at the right). */
function JobRow({ icon, text, trailing }: { icon: IconName; text: string; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: trailing ? 'center' : 'flex-start', gap: 20 }}>
      <Icon name={icon} size={24} color={color.mapLabel} />
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 17, lineHeight: 24, color: color.ink }}>{text}</Text>
      {trailing}
    </View>
  );
}

function StopHeading({ eyebrow, stop, onCall, onMessage }: { eyebrow?: string; stop: Stop; onCall?: () => void; onMessage: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[type.label, { textTransform: 'uppercase', color: color.actionInk }]}>{eyebrow}</Text> : null}
        <Text style={[type.title, { fontSize: 22, lineHeight: 30 }]} accessibilityRole="header"
          accessibilityLabel={eyebrow ? undefined : `Next stop: ${stop.customer_name}`}>{stop.customer_name}</Text>
        <Text style={[type.body, { fontSize: 15, lineHeight: 22, color: color.inkMuted }]}>{stop.address.split(',')[0]}</Text>
      </View>
      {onCall ? <IconButton icon="phone" label={`Call ${stop.customer_name}`} onPress={onCall} /> : null}
      <IconButton icon="message" label={`Message ${stop.customer_name}`} onPress={onMessage} />
    </View>
  );
}

