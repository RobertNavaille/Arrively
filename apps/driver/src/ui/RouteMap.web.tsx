import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { color, font } from './theme';
import type { RouteMapProps } from './RouteMap.types';

// Browser stand-in for the Mapbox map (used for the web preview and screenshots):
// the same Arrively styling over a simple drawn street grid.
const W = 400;
const H = 300;

export function RouteMap({ height, stops = [], pin, pinLabel, driver, line }: RouteMapProps) {
  const pts = [...stops, ...(pin ? [pin] : []), ...(driver ? [driver] : []), ...(line ?? [])];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  // Fit every point, with at least ~1 km of view so a single pin sits mid-map.
  const cLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 41.824;
  const cLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -71.4128;
  const minLat = Math.min(...lats, cLat - 0.005), maxLat = Math.max(...lats, cLat + 0.005);
  const minLng = Math.min(...lngs, cLng - 0.006), maxLng = Math.max(...lngs, cLng + 0.006);
  const pad = 56;
  const sx = (W - pad * 2) / Math.max(maxLng - minLng, 1e-6);
  const sy = (H - pad * 2) / Math.max(maxLat - minLat, 1e-6);
  const s = Math.min(sx, sy);
  const X = (lng: number) => W / 2 + (lng - (minLng + maxLng) / 2) * s;
  // Leave room above a labelled pin.
  const Y = (lat: number) => H / 2 + (pinLabel ? 22 : 0) - (lat - (minLat + maxLat) / 2) * s;

  const roads = ['M-20 40 L420 70', 'M-20 150 L420 175', 'M-20 245 L420 262', 'M70 -20 L95 320', 'M190 -20 L205 320', 'M310 -20 L330 320', 'M-20 300 L250 -20'];
  const minor = ['M-20 95 L420 120', 'M-20 205 L420 222', 'M130 -20 L150 320', 'M250 -20 L268 320', 'M365 -20 L380 320'];
  const d = line && line.length > 1 ? line.map((p, i) => `${i ? 'L' : 'M'}${X(p.lng)} ${Y(p.lat)}`).join(' ') : null;

  return (
    <View style={{ height, backgroundColor: color.mapGround, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={W} height={H} fill={color.mapGround} />
        {Array.from({ length: 24 }, (_, i) => {
          const r = Math.floor(i / 6), c = i % 6;
          if ((r * 7 + c * 3) % 5 === 0) return null;
          return <Rect key={i} x={8 + c * 66 + (r % 2) * 6} y={8 + r * 74 + c * 4} width={44} height={50} rx={4} fill={color.mapBlock} />;
        })}
        {minor.map((p, i) => <Path key={`m${i}`} d={p} stroke={color.mapRoad} strokeWidth={4} fill="none" />)}
        {roads.map((p, i) => <Path key={`r${i}`} d={p} stroke={color.mapRoad} strokeWidth={9} fill="none" />)}
        {d ? <Path d={d} stroke={color.surface} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {d ? <Path d={d} stroke={color.brand} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {stops.map((st) => (
          <G key={st.id} transform={`translate(${X(st.lng)} ${Y(st.lat)})`}>
            <Circle r={11} strokeWidth={2.5}
              fill={st.state === 'next' ? color.action : st.state === 'done' ? color.inkMuted : color.surface}
              stroke={st.state === 'upcoming' ? color.action : color.surface} />
            <SvgText y={4} textAnchor="middle" fontSize={11} fontWeight="600" fontFamily={font.semibold}
              fill={st.state === 'upcoming' ? color.actionInk : color.onAction}>{String(st.n)}</SvgText>
          </G>
        ))}
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
        {driver ? (
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
