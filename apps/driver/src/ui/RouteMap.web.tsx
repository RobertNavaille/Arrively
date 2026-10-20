import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { MAPBOX_TOKEN } from '../lib/config';
import { color, font } from './theme';
import { MARKER, byDrawOrder, framePoints, type MapStop, type RouteMapProps } from './RouteMap.types';

// Browser map: real Mapbox GL when a token is set, otherwise a drawn stand-in
// (offline demo, screenshots).
export function RouteMap(props: RouteMapProps) {
  return MAPBOX_TOKEN ? <MapboxWeb {...props} /> : <Drawn {...props} />;
}

function stopEl(s: MapStop) {
  const el = document.createElement('div');
  const { size, ring } = MARKER[s.state];
  const fill = s.state === 'next' ? color.action : s.state === 'done' ? color.inkMuted : color.surface;
  const edge = s.state === 'upcoming' ? color.action : color.surface;
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;`
    + `background:${fill};border:${ring}px solid ${edge};box-shadow:0 1px 4px rgba(26,26,26,.25);`;
  return el;
}

function pinEl(label?: string) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
  el.innerHTML = (label
    ? `<span style="padding:3px 10px;border-radius:999px;background:${color.mapLabel};color:#fff;font:500 11px Poppins_500Medium,Poppins,sans-serif;white-space:nowrap">${label}</span>`
    : '')
    + `<span style="width:22px;height:22px;border-radius:50%;background:${color.mapLabel};border:2px solid #fff;display:grid;place-items:center"><span style="width:8px;height:8px;border-radius:50%;background:#fff"></span></span>`;
  return el;
}

function driverEl() {
  const el = document.createElement('div');
  el.style.cssText = 'width:40px;height:40px;border-radius:50%;background:rgba(0,157,254,.18);display:grid;place-items:center;';
  el.innerHTML = `<span style="width:16px;height:16px;border-radius:50%;background:${color.brand};border:3px solid #fff;box-shadow:0 1px 4px rgba(26,26,26,.3)"></span>`;
  return el;
}

function MapboxWeb({ height, stops = [], pin, pinLabel, driver, line }: RouteMapProps) {
  const host = useRef<View>(null);
  const map = useRef<import('mapbox-gl').Map | null>(null);
  const markers = useRef<import('mapbox-gl').Marker[]>([]);
  const [ready, setReady] = useState(false);
  const framed = framePoints({ stops, pin, driver });
  const showDriver = !!driver && framed.includes(driver);
  const path = (line ?? []).filter((p) => p !== driver || showDriver);
  // Refit only when the set of framed places changes, not on every location ping.
  const frameKey = framed.filter((p) => p !== driver).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|') + (showDriver ? '|d' : '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      const el = host.current as unknown as HTMLElement | null;
      if (cancelled || !el || map.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const m = new mapboxgl.Map({ container: el, style: 'mapbox://styles/mapbox/light-v11', center: [-71.41, 41.82], zoom: 11, attributionControl: false });
      m.addControl(new mapboxgl.AttributionControl({ compact: true }));
      m.on('load', () => {
        m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7 } });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color.brand, 'line-width': 3.5, 'line-opacity': 0.85 } });
        setReady(true);
      });
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Markers and the route line.
  useEffect(() => {
    if (!ready || !map.current) return;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      const m = map.current!;
      markers.current.forEach((x) => x.remove());
      markers.current = [
        ...byDrawOrder(stops).map((s) => new mapboxgl.Marker({ element: stopEl(s) }).setLngLat([s.lng, s.lat])),
        ...(pin ? [new mapboxgl.Marker({ element: pinEl(pinLabel), anchor: 'bottom' }).setLngLat([pin.lng, pin.lat])] : []),
        ...(driver && showDriver ? [new mapboxgl.Marker({ element: driverEl() }).setLngLat([driver.lng, driver.lat])] : []),
      ].map((mk) => mk.addTo(m));
      (m.getSource('route') as import('mapbox-gl').GeoJSONSource | undefined)?.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: path.length > 1 ? path.map((p) => [p.lng, p.lat]) : [] },
      });
    })();
  }); // every render: cheap, and keeps numbers and states current

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !framed.length) return;
    const lngs = framed.map((p) => p.lng), lats = framed.map((p) => p.lat);
    m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: pinLabel ? 56 : 36, bottom: 28, left: 28, right: 28 }, maxZoom: 15, duration: 0 });
  }, [ready, frameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <View ref={host} style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }} />;
}

// ---------------------------------------------------------------------------
// Drawn stand-in. Drawn at the box's real size so nothing is cropped on wide or
// tall screens; the street pattern is kept faint so markers stand out.
// ---------------------------------------------------------------------------
const BASE_W = 400;
const BASE_H = 300;

function Drawn({ height, stops = [], pin, pinLabel, driver, line }: RouteMapProps) {
  const [width, setWidth] = useState(BASE_W);
  const W = width, H = height;
  const pts = framePoints({ stops, pin, driver });
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  // Fit every point, with at least ~1 km of view so a single pin sits mid-map.
  const cLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 41.824;
  const cLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -71.4128;
  const minLat = Math.min(...lats, cLat - 0.005), maxLat = Math.max(...lats, cLat + 0.005);
  const minLng = Math.min(...lngs, cLng - 0.006), maxLng = Math.max(...lngs, cLng + 0.006);
  // Room for markers at the edges, and above a labelled pin.
  const padX = 30, padTop = pinLabel ? 64 : 30, padBottom = 26;
  // Longitude degrees are shorter than latitude degrees away from the equator.
  const k = Math.cos((cLat * Math.PI) / 180);
  const s = Math.min(
    (W - padX * 2) / Math.max((maxLng - minLng) * k, 1e-6),
    (H - padTop - padBottom) / Math.max(maxLat - minLat, 1e-6),
  );
  const X = (lng: number) => W / 2 + (lng - (minLng + maxLng) / 2) * k * s;
  const Y = (lat: number) => padTop + (H - padTop - padBottom) / 2 - (lat - (minLat + maxLat) / 2) * s;

  const roads = ['M-20 40 L420 70', 'M-20 150 L420 175', 'M-20 245 L420 262', 'M70 -20 L95 320', 'M190 -20 L205 320', 'M310 -20 L330 320', 'M-20 300 L250 -20'];
  const minor = ['M-20 95 L420 120', 'M-20 205 L420 222', 'M130 -20 L150 320', 'M250 -20 L268 320', 'M365 -20 L380 320'];
  // A driver too far away to frame isn't drawn, and neither is the leg from them.
  const showDriver = !!driver && pts.includes(driver);
  const path = (line ?? []).filter((p) => p !== driver || showDriver);
  const d = path.length > 1 ? path.map((p, i) => `${i ? 'L' : 'M'}${X(p.lng)} ${Y(p.lat)}`).join(' ') : null;

  return (
    <View style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }}
      onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w && w !== width) setWidth(w); }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={color.mapGround} />
        {/* Decorative streets, stretched to the box and kept faint. */}
        <G transform={`scale(${W / BASE_W} ${H / BASE_H})`} opacity={0.55}>
          {Array.from({ length: 24 }, (_, i) => {
            const row = Math.floor(i / 6), c = i % 6;
            if ((row * 7 + c * 3) % 5 === 0) return null;
            return <Rect key={i} x={8 + c * 66 + (row % 2) * 6} y={8 + row * 74 + c * 4} width={44} height={50} rx={4} fill={color.mapBlock} />;
          })}
          {minor.map((p, i) => <Path key={`m${i}`} d={p} stroke={color.mapRoad} strokeWidth={4} fill="none" />)}
          {roads.map((p, i) => <Path key={`r${i}`} d={p} stroke={color.mapRoad} strokeWidth={9} fill="none" />)}
        </G>
        {d ? <Path d={d} stroke={color.surface} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {d ? <Path d={d} stroke={color.brand} strokeWidth={3.5} strokeOpacity={0.85} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {byDrawOrder(stops).map((st) => {
          const { size, ring } = MARKER[st.state];
          return (
            <G key={st.id} transform={`translate(${X(st.lng)} ${Y(st.lat)})`}>
              <Circle r={size / 2 + 1} cy={1.5} fill="rgba(26,26,26,0.18)" />
              <Circle r={(size - ring) / 2} strokeWidth={ring}
                fill={st.state === 'next' ? color.action : st.state === 'done' ? color.inkMuted : color.surface}
                stroke={st.state === 'upcoming' ? color.action : color.surface} />
            </G>
          );
        })}
        {pin ? (
          <G transform={`translate(${X(pin.lng)} ${Y(pin.lat)})`}>
            <Path d="M0 0 C-3 -6 -11 -12 -11 -20 A11 11 0 0 1 11 -20 C11 -12 3 -6 0 0 Z" fill={color.mapLabel} stroke={color.surface} strokeWidth={2} />
            <Circle cy={-20} r={4} fill={color.surface} />
            {pinLabel ? (
              <G transform="translate(0 -44)">
                <Rect x={-(pinLabel.length * 3.3 + 10)} y={-10} width={pinLabel.length * 6.6 + 20} height={20} rx={10} fill={color.mapLabel} />
                <SvgText y={4} textAnchor="middle" fontSize={11} fontFamily={font.medium} fill={color.onAction}>{pinLabel}</SvgText>
              </G>
            ) : null}
          </G>
        ) : null}
        {driver && showDriver ? (
          <G transform={`translate(${X(driver.lng)} ${Y(driver.lat)})`}>
            <Circle r={20} fill={color.brand} opacity={0.18} />
            <Circle r={9} fill={color.surface} />
            <Circle r={6.5} fill={color.brand} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
