import { MAPBOX_TOKEN } from './config';
import type { LatLng } from './types';

export interface Place { id: string; name: string; detail: string; lat: number; lng: number }

const SAMPLE: Place[] = [
  { id: 'a', name: '12 Waterman St', detail: 'Providence, RI 02906', lat: 41.8268, lng: -71.4003 },
  { id: 'b', name: '120 Westminster St', detail: 'Providence, RI 02903', lat: 41.8243, lng: -71.4119 },
  { id: 'c', name: '215 Thayer St', detail: 'Providence, RI 02906', lat: 41.8269, lng: -71.4006 },
  { id: 'd', name: '1 Park Row W', detail: 'Providence, RI 02903', lat: 41.8287, lng: -71.4136 },
  { id: 'e', name: '48 Wickenden St', detail: 'Providence, RI 02903', lat: 41.8197, lng: -71.4012 },
  { id: 'f', name: '300 Hope St', detail: 'Providence, RI 02906', lat: 41.8338, lng: -71.3943 },
];

/** Address autocomplete (Mapbox Geocoding v6), biased toward the driver's position. */
export async function searchAddress(query: string, near: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  if (!MAPBOX_TOKEN) {
    return SAMPLE.filter((p) => `${p.name} ${p.detail}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
  }
  const params = new URLSearchParams({
    q, access_token: MAPBOX_TOKEN, autocomplete: 'true', country: 'us', limit: '5', types: 'address,poi',
  });
  if (near) params.set('proximity', `${near.lng},${near.lat}`);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const json = await res.json();
  return (json.features ?? []).map((f: any) => ({
    id: f.id,
    name: f.properties?.name ?? f.properties?.full_address ?? 'Address',
    detail: f.properties?.place_formatted ?? '',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}
