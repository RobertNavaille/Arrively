// Optimize route (its own sheet) tells the trip screen underneath what's happening, so the
// trip can play the new order in: `hold` before the new order is saved (the trip keeps
// showing the old order), `go` once it's saved and the sheet is closing, `cancel` if saving failed.
export type OptimizeSignal = 'hold' | 'go' | 'cancel';
const listeners = new Set<(s: OptimizeSignal) => void>();
export function onOptimizeSignal(cb: (s: OptimizeSignal) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function sendOptimizeSignal(s: OptimizeSignal) { listeners.forEach((l) => l(s)); }
