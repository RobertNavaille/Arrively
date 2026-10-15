'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';
import { MAPBOX_TOKEN } from '@/lib/config';

export interface MapPoint { id: string; lat: number; lng: number; label: string; kind: 'driver' | 'stale' | 'stop' | 'done' }

/** Console map: drivers (blue, gray when stale) and stops (numbered). */
export function PointsMap({ height, points }: { height: number; points: MapPoint[] }) {
  return MAPBOX_TOKEN ? <Mapbox height={height} points={points} /> : <Drawn height={height} points={points} />;
}

function markerEl(p: MapPoint) {
  const el = document.createElement('div');
  if (p.kind === 'driver' || p.kind === 'stale') {
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <span style="width:18px;height:18px;border-radius:50%;background:${p.kind === 'driver' ? '#009DFE' : '#6B717B'};border:3px solid #fff;box-shadow:0 4px 12px rgba(26,26,26,.12)"></span>
      <span style="padding:3px 10px;border-radius:999px;background:#3C4043;color:#fff;font:500 11px/16px Poppins,sans-serif;white-space:nowrap">${p.label}</span></div>`;
  } else {
    el.innerHTML = `<span style="display:grid;place-items:center;min-width:22px;height:22px;padding:0 4px;box-sizing:border-box;border-radius:999px;border:2px solid ${p.kind === 'done' ? '#fff' : '#0077CC'};background:${p.kind === 'done' ? '#6B717B' : '#fff'};color:${p.kind === 'done' ? '#fff' : '#0072C6'};font:600 11px Poppins,sans-serif">${p.label}</span>`;
  }
  return el;
}

function Mapbox({ height, points }: { height: number; points: MapPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import('mapbox-gl').Map | null>(null);
  const markers = useRef<import('mapbox-gl').Marker[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !el.current || map.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map.current = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/light-v11', center: [-71.41, 41.826], zoom: 12 });
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      const m = map.current;
      if (!m) return;
      markers.current.forEach((x) => x.remove());
      markers.current = points.map((p) => new mapboxgl.Marker({ element: markerEl(p) }).setLngLat([p.lng, p.lat]).addTo(m));
      if (points.length && !fitted.current) {
        const b = new mapboxgl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]);
        points.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
        fitted.current = true;
      }
    })();
  }, [points]);

  return <div ref={el} style={{ height, borderRadius: 12, overflow: 'hidden' }} role="img" aria-label="Map of drivers and stops" />;
}

function Drawn({ height, points }: { height: number; points: MapPoint[] }) {
  const W = 800, H = 500;
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const cLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 41.826;
  const cLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -71.41;
  const s = Math.min((W - 160) / Math.max(Math.max(...lngs, cLng) - Math.min(...lngs, cLng), 0.02), (H - 140) / Math.max(Math.max(...lats, cLat) - Math.min(...lats, cLat), 0.015));
  const X = (lng: number) => W / 2 + (lng - cLng) * s;
  const Y = (lat: number) => H / 2 + 10 - (lat - cLat) * s;
  return (
    <div style={{ height, background: '#ECEDEF', borderRadius: 12, overflow: 'hidden' }} role="img" aria-label="Map of drivers and stops">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
        {Array.from({ length: 48 }, (_, i) => {
          const r = Math.floor(i / 8), c = i % 8;
          return (r * 7 + c * 3) % 5 === 0 ? null : <rect key={i} x={10 + c * 100 + (r % 2) * 8} y={10 + r * 84 + c * 3} width={70} height={56} rx={5} fill="#E1E3E6" />;
        })}
        {[60, 170, 280, 390].map((y) => <path key={y} d={`M-20 ${y} L820 ${y + 30}`} stroke="#fff" strokeWidth={10} />)}
        {[90, 290, 490, 690].map((x) => <path key={x} d={`M${x} -20 L${x + 25} 520`} stroke="#fff" strokeWidth={10} />)}
        {points.filter((p) => p.kind === 'stop' || p.kind === 'done').map((p) => (
          <g key={p.id} transform={`translate(${X(p.lng)} ${Y(p.lat)})`}>
            <rect x={-Math.max(11, p.label.length * 4 + 4)} y={-11} width={Math.max(22, p.label.length * 8 + 8)} height={22} rx={11} fill={p.kind === 'done' ? '#6B717B' : '#fff'} stroke={p.kind === 'done' ? '#fff' : '#0077CC'} strokeWidth={2.5} />
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill={p.kind === 'done' ? '#fff' : '#0072C6'} fontFamily="Poppins, sans-serif">{p.label}</text>
          </g>
        ))}
        {points.filter((p) => p.kind === 'driver' || p.kind === 'stale').map((p) => (
          <g key={p.id} transform={`translate(${X(p.lng)} ${Y(p.lat)})`}>
            {p.kind === 'driver' ? <circle r={20} fill="#009DFE" opacity={0.18} /> : null}
            <circle r={9} fill="#fff" /><circle r={6.5} fill={p.kind === 'driver' ? '#009DFE' : '#6B717B'} />
            <g transform="translate(0 26)">
              <rect x={-(p.label.length * 3.4 + 10)} y={-10} width={p.label.length * 6.8 + 20} height={20} rx={10} fill="#3C4043" />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#fff" fontFamily="Poppins, sans-serif">{p.label}</text>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
