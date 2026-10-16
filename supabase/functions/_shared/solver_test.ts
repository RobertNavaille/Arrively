import { _cost, _localSearch, evaluate, solve, straightLineMatrix, type SolverStop } from "./solver.ts";

function check(ok: boolean, msg: string) { if (!ok) throw new Error(msg); }
const T0 = 1_700_000_000;
// Deterministic pseudo-random numbers so failures reproduce.
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

Deno.test("stops along a street are visited in street order", () => {
  const pts = [0, 4, 1, 3, 2].map((k) => ({ lat: 41.82, lng: -71.41 + k * 0.01 }));
  const stops: SolverStop[] = pts.map((_, i) => ({ id: `s${i}`, serviceS: 600 }));
  const m = straightLineMatrix([{ lat: 41.82, lng: -71.42 }, ...pts]);
  check(solve(stops, m, T0).order.join() === "s0,s2,s4,s3,s1", "expected west-to-east order");
});

Deno.test("an early window beats being nearest", () => {
  const m = [
    [0, 60, 600],
    [60, 0, 600],
    [600, 600, 0],
  ];
  const stops: SolverStop[] = [
    { id: "near", serviceS: 1800 },
    { id: "far-but-due", serviceS: 600, windowEnd: T0 + 900 },
  ];
  const s = solve(stops, m, T0);
  check(s.order[0] === "far-but-due", `due stop should go first, got ${s.order}`);
  check(s.late.length === 0, "nobody should be late");
});

Deno.test("waiting for a window: ETA is when the window opens", () => {
  const m = [[0, 300], [300, 0]];
  const s = evaluate([{ id: "a", serviceS: 600, windowStart: T0 + 3600 }], m, T0, [0]);
  check(s.etas.a === T0 + 3600 && s.waitS === 3300, "should wait for the window");
});

Deno.test("the stop the driver is heading to stays first", () => {
  const pts = [3, 0, 1, 2].map((k) => ({ lat: 41.82, lng: -71.41 + k * 0.01 }));
  const stops: SolverStop[] = pts.map((_, i) => ({ id: `s${i}`, serviceS: 300, fixed: i === 0 }));
  const m = straightLineMatrix([{ lat: 41.82, lng: -71.42 }, ...pts]);
  const s = solve(stops, m, T0);
  check(s.order[0] === "s0", "fixed stop must stay first");
  check(s.order.join() === "s0,s3,s2,s1", `then nearest onward from s0, got ${s.order}`);
});

Deno.test("local search matches brute force on small random routes", () => {
  const r = rng(7);
  let worst = 0;
  for (let k = 0; k < 40; k++) {
    const pts = Array.from({ length: 8 }, () => ({ lat: 41.8 + r() * 0.06, lng: -71.45 + r() * 0.08 }));
    const stops: SolverStop[] = pts.map((_, i) => {
      const w = r() < 0.4 ? T0 + Math.floor(r() * 4) * 3600 : null;
      return { id: `s${i}`, serviceS: 900, windowStart: w, windowEnd: w != null ? w + 7200 : null };
    });
    const m = straightLineMatrix([{ lat: 41.83, lng: -71.41 }, ...pts]);
    const exact = solve(stops, m, T0); // n = 8 takes the exact path
    const local = _localSearch(stops, m, T0);
    worst = Math.max(worst, _cost(local) / _cost(exact));
  }
  console.log(`worst local/optimal: ${worst.toFixed(3)}`);
  check(worst < 1.05, `local search should be within 5% of optimal, worst was ${worst.toFixed(3)}`);
});

Deno.test("24 stops solve quickly and beat the given order", () => {
  const r = rng(3);
  const pts = Array.from({ length: 24 }, () => ({ lat: 41.78 + r() * 0.1, lng: -71.48 + r() * 0.14 }));
  const stops: SolverStop[] = pts.map((_, i) => ({ id: `s${i}`, serviceS: 900 }));
  const m = straightLineMatrix([{ lat: 41.83, lng: -71.41 }, ...pts]);
  const t = performance.now();
  const s = solve(stops, m, T0);
  const ms = performance.now() - t;
  const given = evaluate(stops, m, T0, stops.map((_, i) => i));
  check(ms < 500, `took ${ms.toFixed(0)} ms`);
  check(s.driveS < given.driveS * 0.6, "should cut drive time well below a random order");
  check(new Set(s.order).size === 24, "every stop exactly once");
});
