// Directions in the phone's own maps app, for the stop the driver is heading to,
// carrying as much of the route's options as that app takes from a link.
//
// What each app takes (checked 2026-10):
// - Google Maps on Android (google.navigation intent): travel mode, and avoid
//   highways / tolls.
// - Apple Maps: travel mode (driving, walking; cycling with the newer link).
//   It has no link option for avoiding highways or tolls; the driver turns
//   those on in its route options.
// - Google Maps by web link (other phones and browsers): travel mode only.
import { Linking, Platform } from 'react-native';
import type { RouteOptions } from './routing';
import { TRACKING_BASE_URL } from './config';
import type { LatLng, Stop } from './types';

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '');
const isApple = () => Platform.OS === 'ios' || (Platform.OS === 'web' && /iPhone|iPad|iPod|Macintosh/.test(ua()) && 'ontouchend' in (globalThis as object));

/** Highways and tolls to avoid, when driving. */
export function avoidList(o: RouteOptions): ('highways' | 'tolls')[] {
  if ((o.mode ?? 'drive') !== 'drive') return [];
  return [...(o.avoidHighways ? ['highways' as const] : []), ...(o.avoidTolls ? ['tolls' as const] : [])];
}

/** True when the maps app that Directions opens can't be told what to avoid (so the driver sets it there). */
export function avoidNotPassed(o: RouteOptions): boolean {
  return avoidList(o).length > 0 && Platform.OS !== 'android';
}

export function directionsUrl(to: LatLng, o: RouteOptions = {}): string {
  const mode = o.mode ?? 'drive';
  const at = `${to.lat},${to.lng}`;
  if (Platform.OS === 'android') {
    // Starts turn-by-turn in Google Maps; avoid: h highways, t tolls.
    const avoid = avoidList(o).map((a) => (a === 'highways' ? 'h' : 't')).join('');
    return `google.navigation:q=${at}&mode=${{ drive: 'd', walk: 'w', bike: 'b' }[mode]}${avoid ? `&avoid=${avoid}` : ''}`;
  }
  if (isApple()) {
    return mode === 'bike'
      ? `https://maps.apple.com/directions?destination=${at}&mode=cycling`
      : `https://maps.apple.com/?daddr=${at}&dirflg=${mode === 'walk' ? 'w' : 'd'}`;
  }
  const travel = { drive: 'driving', walk: 'walking', bike: 'bicycling' }[mode];
  return `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=${travel}&dir_action=navigate`;
}

export function openDirections(to: LatLng, o: RouteOptions = {}) {
  Linking.openURL(directionsUrl(to, o));
}

/**
 * Call or text the customer with the phone's own apps; a text can start with a
 * message. In the browser these go through the page's location (like
 * react-native-web does for tel:), so an sms: link doesn't leave a blank tab.
 */
export function contactCustomer(how: 'tel' | 'sms', phone: string | null, body?: string) {
  let url = `${how}:${phone ?? ''}`;
  // iPhones read the message after "&", Android after "?".
  if (how === 'sms' && body) url += `${isApple() ? '&' : '?'}body=${encodeURIComponent(body)}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = url;
  else Linking.openURL(url);
}

/** Share trip: the text the customer gets when the driver starts the trip to them. */
/**
 * The text the Message button starts with: who it's from and the customer's
 * live tracking link (the driver's ETA). On the way it says so; before the
 * drive it invites them to follow along. None once the driver has arrived or
 * the stop is done (no link, or no token: an empty message).
 */
/** `leaving`: sent as the driver sets off to this stop (Share ETA before the trip starts), so it says they're on the way. */
export function etaMessage(stop: Stop, driver?: string | null, business?: string | null, leaving = false): string | undefined {
  if (!stop.tracking_token || !['scheduled', 'queued', 'en_route'].includes(stop.status)) return undefined;
  const link = `${TRACKING_BASE_URL}${encodeURIComponent(stop.tracking_token)}`;
  const first = stop.customer_name.trim().split(/\s+/)[0];
  const who = [driver?.trim().split(/\s+/)[0], business?.trim() ? `from ${business.trim()}` : ''].filter(Boolean).join(' ');
  const hello = `Hi ${first}, ${who ? `${who} here. ` : ''}`;
  return stop.status === 'en_route' || leaving ? `${hello}I'm on my way. Follow along live: ${link}` : `${hello}You can see when I'll arrive here: ${link}`;
}
