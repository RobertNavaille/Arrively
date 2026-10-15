// Route optimization and ETAs. Online, the route-plan and route-etas edge
// functions do the work; the offline demo runs the same solver on the phone
// with straight-line drive times.
import { straightLineEtas, straightLinePlan, type RoutePlan } from '../../../../supabase/functions/_shared/solver';
import type { LatLng, Route } from './types';

export type { RoutePlan } from '../../../../supabase/functions/_shared/solver';

export const localPlan = (route: Route, from: LatLng | null): RoutePlan => straightLinePlan(route.stops, route.day, from);
export const localEtas = (route: Route, from: LatLng | null) => straightLineEtas(route.stops, route.day, from);
