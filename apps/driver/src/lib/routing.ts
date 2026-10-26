// Route optimization and ETAs. Online, the route-plan and route-etas edge
// functions do the work; the offline demo runs the same solver on the phone
// with straight-line drive times.
import { solveLocked, straightLineEtas, straightLinePlan, type RoutePlan } from '../../../../supabase/functions/_shared/solver';
import type { LatLng, Route } from './types';

export type { RoutePlan } from '../../../../supabase/functions/_shared/solver';

export const localPlan = (route: Route, from: LatLng | null): RoutePlan => straightLinePlan(route.stops, route.day, from);
export const localEtas = (route: Route, from: LatLng | null) => straightLineEtas(route.stops, route.day, from);

/**
 * The plan's best order with the stops the driver locked (id → place) kept in
 * place. Solved on the phone from what the plan was solved from; a plan without
 * that (an older server) is solved again on straight-line times.
 */
export function lockedOrder(plan: RoutePlan, route: Route, from: LatLng | null, locked: Record<string, number>): string[] {
  if (!Object.keys(locked).length) return plan.order;
  const problem = plan.problem ?? straightLinePlan(route.stops, route.day, from).problem!;
  return solveLocked(problem, locked);
}
