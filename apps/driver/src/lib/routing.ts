// Route optimization and ETAs. Online, the route-plan and route-etas edge
// functions do the work; the offline demo runs the same solver on the phone
// with straight-line drive times.
import { solveLocked, straightLineEtas, straightLinePlan, type RouteOptions, type RoutePlan } from '../../../../supabase/functions/_shared/solver';
import type { LatLng, Route } from './types';

export type { RouteOptions, RoutePlan, TravelMode } from '../../../../supabase/functions/_shared/solver';
export { SPEED } from '../../../../supabase/functions/_shared/solver';

/** The route's saved options (round trip, avoid highways / tolls, travel mode). */
export const optionsOf = (r: Route): RouteOptions => ({
  roundTrip: !!r.round_trip, avoidHighways: !!r.avoid_highways, avoidTolls: !!r.avoid_tolls, mode: r.travel_mode ?? 'drive',
});
export const localPlan = (route: Route, from: LatLng | null, options = optionsOf(route)): RoutePlan =>
  straightLinePlan(route.stops, route.day, from, undefined, options);
export const localEtas = (route: Route, from: LatLng | null) => straightLineEtas(route.stops, route.day, from, undefined, optionsOf(route));

/**
 * The plan's best order with the stops the driver locked (id → place) kept in
 * place. Solved on the phone from what the plan was solved from; a plan without
 * that (an older server) is solved again on straight-line times.
 */
export function lockedOrder(plan: RoutePlan, route: Route, from: LatLng | null, locked: Record<string, number>): string[] {
  if (!Object.keys(locked).length) return plan.order;
  const problem = plan.problem ?? straightLinePlan(route.stops, route.day, from, undefined, optionsOf(route)).problem!;
  return solveLocked(problem, locked);
}
