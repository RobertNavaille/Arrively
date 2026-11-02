import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg from 'react-native-svg';
import { PUCK_SIZE, PuckShapes } from './DriverPuck';
import { color, font, shadow } from './theme';
import { MARKER, byDrawOrder, framePoints, routeColorAt, type RouteMapProps } from './RouteMap.types';

// Trial (branch claude/apple-maps-trial): on iPhone the map is Apple Maps
// (MapKit) instead of Mapbox, muted and without points of interest so the
// route and stops stand out. Same props and behaviour as the Mapbox map.

// Camera height (metres) for following the driver at street level, about Mapbox zoom 17.5.
const FOLLOW_ALTITUDE = 450;
// A single point to frame: close, but not as close as following.
const ONE_POINT_ALTITUDE = 1500;
const LABEL_H = 20;

export function RouteMap({ height, stops = [], pin, pinLabel, driver, line, inset, follow, bearing = 0, driverHeading, onUserMove, hold }: RouteMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);

  const points = useMemo(() => {
    const all = framePoints({ stops, pin, driver });
    return all.length ? all : [{ lat: 41.824, lng: -71.4128 }];
  }, [stops, pin, driver]);
  const frameKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

  const following = !!follow && !!driver;
  const padding = { top: inset?.top ?? 0, bottom: inset?.bottom ?? 0, left: 0, right: 0 };

  // Navigation view: keep the driver centred in the uncovered part, direction of travel up.
  useEffect(() => {
    if (!ready || hold || !following) return;
    map.current?.animateCamera({ center: { latitude: driver!.lat, longitude: driver!.lng }, heading: bearing, pitch: 0, altitude: FOLLOW_ALTITUDE }, { duration: 800 });
  }, [ready, hold, following, driver?.lat, driver?.lng, bearing, padding.top, padding.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overview: frame every point, north up.
  useEffect(() => {
    if (!ready || hold || following) return;
    if (points.length === 1) {
      map.current?.animateCamera({ center: { latitude: points[0].lat, longitude: points[0].lng }, heading: 0, pitch: 0, altitude: ONE_POINT_ALTITUDE }, { duration: 600 });
      return;
    }
    map.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 0 });
    map.current?.fitToCoordinates(points.map((p) => ({ latitude: p.lat, longitude: p.lng })), {
      edgePadding: { top: 48, bottom: 32, left: 32, right: 32 }, animated: true,
    });
  }, [ready, hold, following, frameKey, padding.top, padding.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // A driver too far away to frame isn't connected to the route line.
  const path = (line ?? []).filter((p) => p !== driver || following || points.includes(driver));
  // New coordinates only when the line itself changes, so it doesn't flicker as the screen re-renders.
  const lineKey = path.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const lineCoords = useMemo(() => path.map((p) => ({ latitude: p.lat, longitude: p.lng })), [lineKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Deep blue where the trip starts to pale blue where it ends.
  const lineColors = useMemo(() => lineCoords.map((_, i) => routeColorAt(lineCoords.length > 1 ? i / (lineCoords.length - 1) : 0)), [lineCoords]);

  return (
    <View style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }}>
      <MapView ref={map} style={{ flex: 1 }} mapType="mutedStandard" userInterfaceStyle="light"
        showsPointsOfInterests={false} showsCompass={false} showsScale={false} showsTraffic={false}
        pitchEnabled={false} toolbarEnabled={false} mapPadding={padding}
        initialRegion={{ latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onMapReady={() => setReady(true)}
        onPanDrag={() => onUserMove?.()}>
        {lineCoords.length > 1 ? (
          <>
            <Polyline coordinates={lineCoords} strokeColor={color.surface} strokeWidth={7} lineCap="round" lineJoin="round" zIndex={1} />
            <Polyline coordinates={lineCoords} strokeColors={lineColors} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={2} />
          </>
        ) : null}
        {byDrawOrder(stops).map((s, i) => (
          <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lng }} tracksViewChanges={false} zIndex={10 + i}>
            <View style={{
              width: MARKER[s.state].size, height: MARKER[s.state].size, borderRadius: MARKER[s.state].size / 2,
              borderWidth: MARKER[s.state].ring,
              backgroundColor: s.state === 'next' ? color.action : s.state === 'done' ? color.inkMuted : color.surface,
              borderColor: s.state === 'upcoming' ? color.action : color.surface,
              ...shadow.float,
            }} />
          </Marker>
        ))}
        {pin ? (
          // The bottom of the pin sits on the place (Apple Maps centres marker views, so shift up by half).
          <Marker key={`pin-${pinLabel ?? ''}`} coordinate={{ latitude: pin.lat, longitude: pin.lng }} tracksViewChanges={false} zIndex={50}
            centerOffset={{ x: 0, y: -(22 + (pinLabel ? LABEL_H + 4 : 0)) / 2 }}>
            <View style={{ alignItems: 'center' }}>
              {pinLabel ? (
                <View style={[{ height: LABEL_H, justifyContent: 'center', backgroundColor: color.mapLabel, borderRadius: 999, paddingHorizontal: 10, marginBottom: 4 }, shadow.float]}>
                  <Text style={{ color: color.onAction, fontFamily: font.medium, fontSize: 11 }}>{pinLabel}</Text>
                </View>
              ) : null}
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.mapLabel, borderWidth: 2, borderColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.surface }} />
              </View>
            </View>
          </Marker>
        ) : null}
        {driver ? (
          <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} zIndex={100}>
            {/* Facing, relative to the screen: the map itself is turned by the camera heading while following. */}
            <Svg width={PUCK_SIZE} height={PUCK_SIZE} viewBox={`${-PUCK_SIZE / 2} ${-PUCK_SIZE / 2} ${PUCK_SIZE} ${PUCK_SIZE}`}
              style={{ transform: [{ rotate: `${(driverHeading ?? 0) - (following ? bearing : 0)}deg` }] }}>
              <PuckShapes heading={driverHeading != null ? 0 : null} />
            </Svg>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}
