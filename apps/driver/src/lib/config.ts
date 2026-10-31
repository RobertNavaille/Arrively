// Environment (set in apps/driver/.env or EAS secrets):
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_MAPBOX_TOKEN
// Without a Supabase URL the app runs in offline demo mode with sample data.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
export const OFFLINE_DEMO = !SUPABASE_URL;
// The customer tracking page (the console's site); a stop's link is this plus its tracking token.
export const TRACKING_BASE_URL = process.env.EXPO_PUBLIC_TRACKING_BASE_URL ?? 'https://arrively-cyan.vercel.app/t/';
