import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { MAPBOX_TOKEN } from '../lib/config';
import { color, font, shadow } from './theme';
import { FOLLOW_ZOOM, MARKER, byDrawOrder, framePoints, type RouteMapProps } from './RouteMap.types';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);

// Mapbox map in the Arrively style: light base map, blue route and driver,
// numbered stops, a dark pin for a single destination.
export function RouteMap({ height, stops = [], pin, pinLabel, driver, line, inset, follow, bearing = 0, driverHeading, onUserMove }: RouteMapProps) {
  const points = useMemo(() => {
    const all = framePoints({ stops, pin, driver });
    return all.length ? all : [{ lat: 41.824, lng: -71.4128 }];
  }, [stops, pin, driver]);

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
  const lineShape = path.length > 1 ? {
    type: 'Feature' as const, properties: {},
    geometry: { type: 'LineString' as const, coordinates: path.map((p) => [p.lng, p.lat]) },
  } : null;

  return (
    <View style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }}>
      <Mapbox.MapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Light} scaleBarEnabled={false}
        onCameraChanged={(state) => { if (state.gestures.isGestureActive) onUserMove?.(); }}
        logoPosition={{ bottom: 6, left: 6 }} attributionPosition={{ bottom: 6, right: 6 }}>
        {following ? (
          // Navigation view: the driver stays centred in the uncovered part as they move.
          <Mapbox.Camera centerCoordinate={[driver!.lng, driver!.lat]} zoomLevel={FOLLOW_ZOOM} heading={bearing} animationDuration={800}
            padding={{ paddingTop: inset?.top ?? 0, paddingBottom: inset?.bottom ?? 0, paddingLeft: 0, paddingRight: 0 }} />
        ) : (
          <Mapbox.Camera
            bounds={{ ...bounds, paddingTop: 48 + (inset?.top ?? 0), paddingBottom: 32 + (inset?.bottom ?? 0), paddingLeft: 32, paddingRight: 32 }}
            maxZoomLevel={16}
            heading={0}
            animationDuration={600}
          />
        )}
        {lineShape ? (
          <Mapbox.ShapeSource id="route" shape={lineShape}>
            <Mapbox.LineLayer id="route-casing" style={{ lineColor: color.surface, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
            <Mapbox.LineLayer id="route-line" aboveLayerID="route-casing" style={{ lineColor: color.brand, lineWidth: 3.5, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
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
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,157,254,0.18)', alignItems: 'center', justifyContent: 'center',
              // Facing, relative to the screen: the map itself is turned by the camera heading while following.
              transform: [{ rotate: `${(driverHeading ?? 0) - (following ? bearing : 0)}deg` }] }}>
              {driverHeading != null ? (
                <View style={{ position: 'absolute', top: 1, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color.brand }} />
              ) : null}
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: color.brand }} />
              </View>
            </View>
          </Mapbox.MarkerView>
        ) : null}
      </Mapbox.MapView>
    </View>
  );
}
