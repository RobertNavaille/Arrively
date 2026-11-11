import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { Text, View } from 'react-native';
import { MAPBOX_TOKEN } from '../lib/config';
import { BASEMAP_CONFIG, BASEMAP_CONFIG_DARK, BASEMAP_STYLE } from './basemap';
import Svg from 'react-native-svg';
import { PUCK_SIZE, PuckShapes } from './DriverPuck';
import { color, colorHex, font, shadow } from './theme';
import { FOLLOW_ZOOM, MARKER, ROUTE_DONE, ROUTE_GRADIENT, byDrawOrder, framePoints, type RouteMapProps } from './RouteMap.types';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);

// Mapbox map in the Arrively style: muted base map (see basemap.ts), blue route and driver,
// numbered stops, a dark pin for a single destination.
export function RouteMap({ height, stops = [], pin, pinLabel, driver, line, doneLine, frame, margin = 0, inset, follow, bearing = 0, driverHeading, onUserMove, hold }: RouteMapProps) {
  const dark = useColorScheme() === 'dark';
  const frameKey = (frame ?? []).map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const points = useMemo(() => {
    const all = framePoints({ stops, pin, driver, frame });
    return all.length ? all : [{ lat: 41.824, lng: -71.4128 }];
  }, [stops, pin, driver, frameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo(() => {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return {
      ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
      sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
    };
  }, [points]);

  // A driver too far away to frame isn't connected to the route line.
  const following = !!follow && !!driver;
  const path = (line ?? []).filter((p) => p !== driver || following || points.includes(driver));
  // A new shape only when the line itself changes: the screen re-renders many times a
  // second (compass, location), and a fresh shape each time makes the line flicker.
  const lineKey = path.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const lineShape = useMemo(() => path.length > 1 ? {
    type: 'Feature' as const, properties: {},
    geometry: { type: 'LineString' as const, coordinates: path.map((p) => [p.lng, p.lat]) },
  } : null, [lineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The part already driven, in gray under the blue.
  const donePath = doneLine ?? [];
  const doneKey = donePath.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const doneShape = useMemo(() => donePath.length > 1 ? {
    type: 'Feature' as const, properties: {},
    geometry: { type: 'LineString' as const, coordinates: donePath.map((p) => [p.lng, p.lat]) },
  } : null, [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }}>
      <Mapbox.MapView style={{ flex: 1 }} styleURL={BASEMAP_STYLE} scaleBarEnabled={false}
        onCameraChanged={(state) => { if (state.gestures.isGestureActive) onUserMove?.(); }}
        logoPosition={{ bottom: 6, left: 6 }} attributionPosition={{ bottom: 6, right: 6 }}>
        <Mapbox.StyleImport id="basemap" existing config={dark ? BASEMAP_CONFIG_DARK : BASEMAP_CONFIG} />
        {hold ? (
          // The driver took over from following: leave the camera where they put it.
          <Mapbox.Camera animationDuration={0} />
        ) : following ? (
          // Navigation view: the driver stays centred in the uncovered part as they move.
          <Mapbox.Camera centerCoordinate={[driver!.lng, driver!.lat]} zoomLevel={FOLLOW_ZOOM} heading={bearing} animationDuration={800}
            padding={{ paddingTop: inset?.top ?? 0, paddingBottom: inset?.bottom ?? 0, paddingLeft: 0, paddingRight: 0 }} />
        ) : (
          <Mapbox.Camera
            bounds={{ ...bounds, paddingTop: 48 + margin + (inset?.top ?? 0), paddingBottom: 32 + margin + (inset?.bottom ?? 0), paddingLeft: 32 + margin, paddingRight: 32 + margin }}
            maxZoomLevel={16}
            heading={0}
            animationDuration={600}
          />
        )}
        {doneShape ? (
          <Mapbox.ShapeSource id="route-done" shape={doneShape}>
            <Mapbox.LineLayer id="route-done-casing" slot="middle" style={{ lineColor: colorHex.surface, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
            <Mapbox.LineLayer id="route-done-line" slot="middle" aboveLayerID="route-done-casing" style={{ lineColor: ROUTE_DONE, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
          </Mapbox.ShapeSource>
        ) : null}
        {lineShape ? (
          // Deep blue where the trip starts to pale blue where it ends, so the line shows which way it runs.
          <Mapbox.ShapeSource id="route" shape={lineShape} lineMetrics>
            <Mapbox.LineLayer id="route-casing" slot="middle" style={{ lineColor: colorHex.surface, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
            <Mapbox.LineLayer id="route-line" slot="middle" aboveLayerID="route-casing" style={{ lineGradient: ROUTE_GRADIENT as never, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
          </Mapbox.ShapeSource>
        ) : null}
        {byDrawOrder(stops).map((s) => (
          <Mapbox.MarkerView key={s.id} coordinate={[s.lng, s.lat]} allowOverlap>
            <View style={{
              width: MARKER[s.state].size, height: MARKER[s.state].size, borderRadius: MARKER[s.state].size / 2,
              borderWidth: MARKER[s.state].ring,
              backgroundColor: s.state === 'next' ? color.action : s.state === 'done' ? color.inkMuted : color.surface,
              borderColor: s.state === 'upcoming' ? color.action : color.surface,
              ...shadow.float,
            }} />
          </Mapbox.MarkerView>
        ))}
        {pin ? (
          <Mapbox.MarkerView coordinate={[pin.lng, pin.lat]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={{ alignItems: 'center' }}>
              {pinLabel ? (
                <View style={[{ backgroundColor: color.mapLabel, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4 }, shadow.float]}>
                  <Text style={{ color: color.onAction, fontFamily: font.medium, fontSize: 11 }}>{pinLabel}</Text>
                </View>
              ) : null}
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.mapLabel, borderWidth: 2, borderColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.surface }} />
              </View>
            </View>
          </Mapbox.MarkerView>
        ) : null}
        {driver ? (
          <Mapbox.MarkerView coordinate={[driver.lng, driver.lat]} allowOverlap>
            {/* Facing, relative to the screen: the map itself is turned by the camera heading while following. */}
            <Svg width={PUCK_SIZE} height={PUCK_SIZE} viewBox={`${-PUCK_SIZE / 2} ${-PUCK_SIZE / 2} ${PUCK_SIZE} ${PUCK_SIZE}`}
              style={{ transform: [{ rotate: `${(driverHeading ?? 0) - (following ? bearing : 0)}deg` }] }}>
              <PuckShapes heading={driverHeading != null ? 0 : null} />
            </Svg>
          </Mapbox.MarkerView>
        ) : null}
      </Mapbox.MapView>
    </View>
  );
}
