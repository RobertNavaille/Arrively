'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';
import { MAPBOX_TOKEN } from '@/lib/config';
import type { LatLng } from '@/lib/tracking';

interface Props {
  height: number;
  home: LatLng;            // the customer's own pin
  driver: LatLng | null;   // live driver position, when visible
  showLine: boolean;       // route line only when the driver is heading here
}

/** Mapbox map when a token is set; otherwise a drawn map in the same style. */
export function TrackMap(props: Props) {
  return MAPBOX_TOKEN ? <MapboxMap {...props} /> : <DrawnMap {...props} />;
}

function MapboxMap({ height, home, driver, showLine }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import('mapbox-gl').Map | null>(null);
  const markers = useRef<{ home?: import('mapbox-gl').Marker; driver?: import('mapbox-gl').Marker }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !el.current || map.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const m = new mapboxgl.Map({
        container: el.current, style: 'mapbox://styles/mapbox/light-v11', center: [home.lng, home.lat], zoom: 14,
        attributionControl: true,
      });
      map.current = m;
      const homeEl = document.createElement('div');
      homeEl.className = 'home-pin';
      markers.current.home = new mapboxgl.Marker({ element: homeEl, anchor: 'bottom' }).setLngLat([home.lng, home.lat]).addTo(m);
      m.on('load', () => {
        m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#FFFFFF', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#009DFE', 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      });
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [home.lat, home.lng]);

  useEffect(() => {
    (async () => {
      const m = map.current;
      if (!m) return;
      const mapboxgl = (await import('mapbox-gl')).default;
      if (driver) {
        if (!markers.current.driver) {
          const d = document.createElement('div');
          d.className = 'driver-dot';
          markers.current.driver = new mapboxgl.Marker({ element: d }).setLngLat([driver.lng, driver.lat]).addTo(m);
        } else {
          markers.current.driver.setLngLat([driver.lng, driver.lat]);
        }
        const b = new mapboxgl.LngLatBounds([home.lng, home.lat], [home.lng, home.lat]).extend([driver.lng, driver.lat]);
        m.fitBounds(b, { padding: { top: 60, bottom: 50, left: 40, right: 40 }, maxZoom: 16, duration: 800 });
      } else {
        markers.current.driver?.remove();
        markers.current.driver = undefined;
      }
      const src = m.getSource('route') as import('mapbox-gl').GeoJSONSource | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: showLine && driver ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[driver.lng, driver.lat], [home.lng, home.lat]] } }] : [],
      });
    })();
  }, [driver?.lat, driver?.lng, showLine, home.lat, home.lng, driver]);

  return (
    <div style={{ height, position: 'relative', background: 'var(--map-ground)' }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Map showing your address and your driver" />
      <style>{`
        .home-pin { width: 22px; height: 30px; background: no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-12 -32 24 34'%3E%3Cpath d='M0 0 C-3 -6 -11 -12 -11 -20 A11 11 0 0 1 11 -20 C11 -12 3 -6 0 0 Z' fill='%233C4043' stroke='white' stroke-width='2'/%3E%3Ccircle cy='-20' r='4' fill='white'/%3E%3C/svg%3E"); }
        .driver-dot { width: 18px; height: 18px; border-radius: 50%; background: #009DFE; border: 3px solid white; box-shadow: 0 0 0 12px rgba(0,157,254,.18); transition: transform .9s linear; }
      `}</style>
    </div>
  );
}

function DrawnMap({ height, home, driver, showLine }: Props) {
  const W = 400, H = 300;
  const pts = [home, ...(driver ? [driver] : [])];
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2, cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.008);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.01);
  // The map is cropped to the container's shape, so keep points well inside.
  const s = Math.min((W - 190) / spanLng, (H - 120) / spanLat);
  const X = (lng: number) => W / 2 + (lng - cLng) * s;
  const Y = (lat: number) => H / 2 + 12 - (lat - cLat) * s;
  const roads = ['M-20 40 L420 70', 'M-20 150 L420 175', 'M-20 245 L420 262', 'M70 -20 L95 320', 'M190 -20 L205 320', 'M310 -20 L330 320', 'M-20 300 L250 -20'];
  const minor = ['M-20 95 L420 120', 'M-20 205 L420 222', 'M130 -20 L150 320', 'M250 -20 L268 320', 'M365 -20 L380 320'];
  return (
    <div style={{ height, background: 'var(--map-ground)', overflow: 'hidden' }} role="img" aria-label="Map showing your address and your driver">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
        <rect width={W} height={H} fill="#ECEDEF" />
        {Array.from({ length: 24 }, (_, i) => {
          const r = Math.floor(i / 6), c = i % 6;
          return (r * 7 + c * 3) % 5 === 0 ? null : <rect key={i} x={8 + c * 66 + (r % 2) * 6} y={8 + r * 74 + c * 4} width={44} height={50} rx={4} fill="#E1E3E6" />;
        })}
        {minor.map((d) => <path key={d} d={d} stroke="#fff" strokeWidth={4} fill="none" />)}
        {roads.map((d) => <path key={d} d={d} stroke="#fff" strokeWidth={9} fill="none" />)}
        {showLine && driver ? (
          <>
            <path d={`M${X(driver.lng)} ${Y(driver.lat)} L${X(home.lng)} ${Y(home.lat)}`} stroke="#fff" strokeWidth={8} strokeLinecap="round" />
            <path d={`M${X(driver.lng)} ${Y(driver.lat)} L${X(home.lng)} ${Y(home.lat)}`} stroke="#009DFE" strokeWidth={4.5} strokeLinecap="round" />
          </>
        ) : null}
        <g transform={`translate(${X(home.lng)} ${Y(home.lat)})`}>
          <path d="M0 0 C-3 -6 -11 -12 -11 -20 A11 11 0 0 1 11 -20 C11 -12 3 -6 0 0 Z" fill="#3C4043" stroke="#fff" strokeWidth={2} />
          <circle cy={-20} r={4} fill="#fff" />
          <g transform="translate(0 -44)">
            <rect x={-44} y={-10} width={88} height={20} rx={10} fill="#3C4043" />
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#fff" fontFamily="Poppins, sans-serif">Your address</text>
          </g>
        </g>
        {driver ? (
          <g transform={`translate(${X(driver.lng)} ${Y(driver.lat)})`} style={{ transition: 'transform 1s linear' }}>
            <circle r={20} fill="#009DFE" opacity={0.18} />
            <circle r={9} fill="#fff" />
            <circle r={6.5} fill="#009DFE" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
