'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PointsMap, type MapPoint } from '@/components/PointsMap';
import { api, e164, searchAddress, type ConsoleRoute, type ConsoleStop, type Driver, type DriverLocation, type Invite, type NewStop, type Org, type Place, type RoutePlan } from '@/lib/console';
import { OFFLINE_DEMO } from '@/lib/config';
import { fmtTime } from '@/lib/tracking';

type Tab = 'live' | 'stops' | 'drivers' | 'settings';
const dk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DONE = ['completed', 'no_show', 'skipped', 'cancelled'];

export default function ConsolePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => { api.signedIn().then(setSignedIn); }, []);
  if (signedIn === null) return null;
  if (!signedIn) return <SignIn onDone={() => setSignedIn(true)} />;
  return <Console onSignOut={async () => { await api.signOut(); setSignedIn(false); }} />;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (!sent) { await api.sendCode(phone); setSent(true); }
      else { await api.verify(phone, code); onDone(); }
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--surface-muted)', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16, padding: 32 }}>
        <div>
          <h1 className="title">Arrively console</h1>
          <p className="caption" style={{ margin: '4px 0 0' }}>{sent ? `Enter the code we texted to ${phone}.` : 'Sign in with your mobile number.'}</p>
          {OFFLINE_DEMO ? <p className="caption" style={{ color: 'var(--warning)', margin: '4px 0 0' }}>Offline demo: any number and code work.</p> : null}
        </div>
        <label className="field">
          <span className="label">{sent ? 'Code' : 'Mobile number'}</span>
          {sent
            ? <input className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            : <input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(401) 555-0100" autoFocus />}
        </label>
        {err ? <p className="caption" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p> : null}
        <button className="btn btn-primary" disabled={busy}>{sent ? 'Sign in' : 'Text me a code'}</button>
      </form>
    </main>
  );
}

function Console({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('live');
  const [org, setOrg] = useState<Org | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [day, setDay] = useState(dk(new Date()));
  const [routes, setRoutes] = useState<ConsoleRoute[]>([]);
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, d, r, l] = await Promise.all([api.me(), api.drivers(), api.routes(day), api.locations()]);
      setOrg(me.org); setDrivers(d.drivers); setInvites(d.invites); setRoutes(r); setLocations(l); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [day]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const nav: [Tab, string][] = [['live', 'Live'], ['stops', 'Stops'], ['drivers', 'Drivers'], ['settings', 'Settings']];
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-muted)' }}>
      <header className="console-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Arrively</span>
          <span className="caption">{org?.name}</span>
        </div>
        <nav className="console-nav" style={{ display: 'flex', gap: 4 }}>
          {nav.map(([k, label]) => (
            <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setTab(k); }}>{label}</a>
          ))}
        </nav>
        <button className="btn btn-text" onClick={onSignOut}>Sign out</button>
      </header>
      {err ? <p className="body" style={{ color: 'var(--danger)', padding: '12px 32px', margin: 0 }}>{err}</p> : null}
      <main className="console-main">
        {tab === 'live' ? <Live routes={routes} drivers={drivers} locations={locations} /> : null}
        {tab === 'stops' && org ? <Stops org={org} day={day} setDay={setDay} routes={routes} drivers={drivers} locations={locations} reload={load} /> : null}
        {tab === 'drivers' && org ? <Drivers org={org} drivers={drivers} invites={invites} reload={load} /> : null}
        {tab === 'settings' && org ? <Settings org={org} reload={load} /> : null}
      </main>
    </div>
  );
}

const etaText = (s: ConsoleStop) => `ETA ${s.eta_approx ? '~' : ''}${fmtTime(s.eta)}`;
const isLate = (s: ConsoleStop) => !!s.eta && !!s.window_end && Date.parse(s.eta) > Date.parse(s.window_end);
const minutes = (sec: number) => { const m = Math.max(1, Math.round(sec / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

function progress(r: ConsoleRoute) {
  const stops = r.stops.filter((s) => s.status !== 'cancelled');
  const done = stops.filter((s) => DONE.includes(s.status)).length;
  const current = stops.find((s) => s.status === 'en_route' || s.status === 'arrived') ?? stops.find((s) => !DONE.includes(s.status));
  return { stops, done, current };
}

function Live({ routes, drivers, locations }: { routes: ConsoleRoute[]; drivers: Driver[]; locations: DriverLocation[] }) {
  const name = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? 'Unassigned';
  const points: MapPoint[] = useMemo(() => [
    ...routes.flatMap((r) => r.stops.filter((s) => s.status !== 'cancelled').map((s, i) => (
      { id: `s-${s.id}`, lat: s.lat, lng: s.lng, label: `${routes.length > 1 ? name(r.driver_id)[0] : ''}${i + 1}`, kind: DONE.includes(s.status) ? 'done' as const : 'stop' as const }))),
    ...locations.map((l) => {
      const stale = Date.now() - new Date(l.recorded_at).getTime() > 2 * 60000;
      const first = name(l.driver_id).split(' ')[0];
      return { id: `d-${l.driver_id}`, lat: l.lat, lng: l.lng, kind: stale ? 'stale' as const : 'driver' as const, label: stale ? `${first} · ${Math.round((Date.now() - new Date(l.recorded_at).getTime()) / 60000)} min ago` : first };
    }),
  ], [routes, locations, drivers]); // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = routes.flatMap((r) => r.stops.filter((s) => s.marked_outside));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 340px', maxWidth: 440, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 className="title">Today</h1>
        {routes.length === 0 ? <p className="body" style={{ color: 'var(--ink-muted)' }}>No routes today. Add stops in the Stops tab.</p> : null}
        {routes.map((r) => {
          const { stops, done, current } = progress(r);
          const pct = stops.length ? Math.round((done / stops.length) * 100) : 0;
          return (
            <div key={r.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="heading">{name(r.driver_id)}</div>
                  <div className="caption">{done} of {stops.length} stops done</div>
                </div>
                <span className={`pill ${r.status === 'completed' ? 'pill-success' : r.status === 'active' ? 'pill-info' : 'pill-neutral'}`}>
                  {r.status === 'completed' ? 'Done' : r.status === 'active' ? 'On route' : 'Not started'}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden' }}>
                <div style={{ height: 6, width: `${pct}%`, background: 'var(--brand)', borderRadius: 999 }} />
              </div>
              {current ? (
                <div className="body">
                  {current.status === 'en_route' ? 'Heading to ' : current.status === 'arrived' ? 'At ' : 'Next: '}
                  <b>{current.customer_name}</b> <span className="caption">· {current.address}</span>
                  {current.eta && current.status !== 'arrived' ? <span className="caption"> · {etaText(current)}</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {flagged.length ? (
          <div className="card" style={{ background: 'var(--warning-tint)', borderColor: 'transparent' }}>
            <div className="heading" style={{ color: 'var(--warning)' }}>Marked away from the stop</div>
            {flagged.map((s) => <div key={s.id} className="body">{s.customer_name} · {s.address} · {fmtTime(s.marked_at)}</div>)}
          </div>
        ) : null}
      </section>
      <section style={{ flex: '999 1 560px', minWidth: 0 }}>
        <PointsMap height={560} points={points} />
      </section>
    </div>
  );
}

function AddressInput({ value, onPick }: { value: string; onPick: (p: Place) => void }) {
  const [q, setQ] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    if (!q.trim() || q === value) { setResults([]); return; }
    const t = setTimeout(() => { searchAddress(q).then(setResults).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, value]);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing an address" aria-label="Address" autoComplete="off" />
      {results.length ? (
        <div className="suggest" role="listbox">
          {results.map((p) => (
            <button type="button" role="option" aria-selected="false" key={p.id} onClick={() => { onPick(p); setResults([]); setQ(`${p.name}, ${p.detail}`); }}>
              <div className="body" style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="caption">{p.detail}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stops({ org, day, setDay, routes, drivers, locations, reload }: {
  org: Org; day: string; setDay: (d: string) => void; routes: ConsoleRoute[]; drivers: Driver[]; locations: DriverLocation[]; reload: () => Promise<void>;
}) {
  const [plans, setPlans] = useState<Record<string, RoutePlan | 'loading' | { error: string }>>({});
  async function optimize(r: ConsoleRoute) {
    setPlans((p) => ({ ...p, [r.id]: 'loading' }));
    try {
      const plan = await api.plan(r, locations.find((l) => l.driver_id === r.driver_id) ?? null);
      setPlans((p) => ({ ...p, [r.id]: plan }));
    } catch (x) { setPlans((p) => ({ ...p, [r.id]: { error: x instanceof Error ? x.message : String(x) } })); }
  }
  const closePlan = (id: string) => setPlans((p) => { const n = { ...p }; delete n[id]; return n; });
  async function usePlan(r: ConsoleRoute, order: string[]) {
    try { await api.applyPlan(r.id, order); closePlan(r.id); await reload(); }
    catch (x) { setPlans((p) => ({ ...p, [r.id]: { error: x instanceof Error ? x.message : String(x) } })); }
  }
  const drivable = drivers.filter((d) => d.role === 'driver' || d.role === 'admin');
  const blank = { name: '', phone: '', place: null as Place | null, from: '', to: '', minutes: '20', notes: '', driver: drivable[0]?.id ?? '', consent: true };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toIso = (t: string) => (t ? new Date(`${day}T${t}`).toISOString() : null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.place) { setMsg('Pick an address from the list.'); return; }
    if (!f.driver) { setMsg('Invite a driver first.'); return; }
    setBusy(true); setMsg(null);
    try {
      const s: NewStop = {
        day, driver_id: f.driver, customer_name: f.name, customer_phone: f.phone, address: `${f.place.name}, ${f.place.detail}`,
        lat: f.place.lat, lng: f.place.lng, window_start: toIso(f.from), window_end: toIso(f.to),
        service_minutes: Number(f.minutes) || 20, notes: f.notes, consent: f.consent,
      };
      await api.addStop(org.id, s);
      setF({ ...blank, driver: f.driver });
      setMsg(f.phone && f.consent ? 'Stop added. The customer gets a text with their tracking link.' : 'Stop added.');
      await reload();
    } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }

  async function importCsv(file: File) {
    setMsg('Importing…');
    const text = await file.text();
    const [header, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
    const cols = header.toLowerCase().split(',').map((c) => c.trim());
    const at = (row: string[], name: string) => row[cols.indexOf(name)]?.trim() ?? '';
    let ok = 0; const failed: string[] = [];
    for (const line of lines) {
      const row = line.split(',');
      const addr = at(row, 'address');
      try {
        const [p] = await searchAddress(addr);
        if (!p) throw new Error('address not found');
        const driver = drivers.find((d) => d.name.toLowerCase() === at(row, 'driver').toLowerCase())?.id ?? f.driver;
        await api.addStop(org.id, {
          day, driver_id: driver, customer_name: at(row, 'name'), customer_phone: at(row, 'phone'), address: `${p.name}, ${p.detail}`,
          lat: p.lat, lng: p.lng, window_start: toIso(at(row, 'from')), window_end: toIso(at(row, 'to')),
          service_minutes: Number(at(row, 'minutes')) || 20, notes: at(row, 'notes'), consent: at(row, 'consent').toLowerCase() === 'yes',
        });
        ok++;
      } catch (x) { failed.push(`${addr || '(blank)'}: ${x instanceof Error ? x.message : x}`); }
    }
    setMsg(`Imported ${ok} stop${ok === 1 ? '' : 's'}.${failed.length ? ` Not imported: ${failed.join('; ')}` : ''}`);
    await reload();
  }

  async function move(r: ConsoleRoute, i: number, dir: -1 | 1) {
    const stops = r.stops.filter((s) => s.status !== 'cancelled');
    const ids = stops.map((s) => s.id);
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    // Finished and in-progress stops stay put; only upcoming stops swap.
    const fixed = (s: ConsoleStop) => DONE.includes(s.status) || s.status === 'en_route' || s.status === 'arrived';
    if (fixed(stops[i]) || fixed(stops[j])) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.reorder(r.id, ids); await reload();
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <form onSubmit={add} className="card" style={{ flex: '1 1 400px', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
        <div>
          <h1 className="title">Add a stop</h1>
          <p className="caption" style={{ margin: '4px 0 0' }}>The customer gets a text with a tracking link once it&apos;s assigned.</p>
        </div>
        <label className="field"><span className="label">Day</span><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <label className="field"><span className="label">Customer name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" /></label>
          <label className="field"><span className="label">Mobile number</span><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(401) 555-0100" /></label>
        </div>
        <div className="field"><span className="label">Address</span><AddressInput value={f.place ? `${f.place.name}, ${f.place.detail}` : ''} onPick={(p) => setF({ ...f, place: p })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <label className="field"><span className="label">Window from</span><input className="input" type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="field"><span className="label">Window to</span><input className="input" type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="field"><span className="label">Minutes on site</span><input className="input" type="number" min={5} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></label>
        </div>
        <label className="field"><span className="label">Notes for the driver</span><textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Gate code, parking, pets" /></label>
        <label className="field"><span className="label">Assign to</span>
          <select className="input" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}>
            {drivable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 8, background: 'var(--surface-muted)' }}>
          <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} style={{ width: 20, height: 20, margin: 0, accentColor: '#0077CC' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="body" style={{ fontWeight: 600 }}>Customer agreed to get texts about this visit</span>
            <span className="caption">Required for texts. Without it, share the tracking link another way.</span>
          </span>
        </label>
        {msg ? <p className="body" style={{ margin: 0, color: 'var(--ink-muted)' }}>{msg}</p> : null}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={busy}>Add stop</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Import CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) importCsv(file); e.target.value = ''; }} />
          </label>
        </div>
        <p className="caption" style={{ margin: 0 }}>CSV columns: name, phone, address, from, to, minutes, notes, consent (yes/no), driver.</p>
      </form>

      <section style={{ flex: '999 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {routes.length === 0 ? <div className="card"><p className="body" style={{ margin: 0, color: 'var(--ink-muted)' }}>No stops on {day} yet.</p></div> : null}
        {routes.map((r) => {
          const stops = r.stops.filter((s) => s.status !== 'cancelled');
          const cur = progress(r).current;
          const canOptimize = r.status !== 'completed' && stops.filter((s) => s.status === 'scheduled' || s.status === 'queued').length >= 2;
          const plan = plans[r.id];
          return (
            <div key={r.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <div className="heading">{drivers.find((d) => d.id === r.driver_id)?.name ?? 'Unassigned'}</div>
                  <div className="caption">
                    {stops.length} stops · {r.status === 'active' ? 'on route' : r.status === 'completed' ? 'finished' : 'not started'}
                    {r.drive_s != null && r.status !== 'completed' ? ` · ${minutes(r.drive_s)} of driving left` : ''}
                  </div>
                </div>
                {canOptimize && !plan ? <button className="btn btn-text" onClick={() => optimize(r)}>Optimize order</button> : null}
              </div>
              {plan === 'loading' ? <p className="caption">Finding the best order…</p> : null}
              {plan && plan !== 'loading' && 'error' in plan ? (
                <p className="body" style={{ color: 'var(--danger)' }}>{plan.error} <button className="mini" onClick={() => closePlan(r.id)}>Dismiss</button></p>
              ) : null}
              {plan && plan !== 'loading' && !('error' in plan) ? (
                <PlanPanel route={r} plan={plan} onUse={() => usePlan(r, plan.order)} onClose={() => closePlan(r.id)} />
              ) : null}
              {stops.map((s, i) => <StopRow key={s.id} s={s} n={i + 1} isCurrent={s.id === cur?.id}
                onUp={() => move(r, i, -1)} onDown={() => move(r, i, 1)} onCancel={async () => { await api.cancelStop(s.id); await reload(); }} />)}
            </div>
          );
        })}
      </section>
    </div>
  );
}

const windowText = (s: Pick<ConsoleStop, 'window_start' | 'window_end'>) =>
  s.window_start ? `${fmtTime(s.window_start)} – ${fmtTime(s.window_end)}` : 'Any time';

/** The proposed order next to the current one (RTE-4). */
function PlanPanel({ route, plan, onUse, onClose }: { route: ConsoleRoute; plan: RoutePlan; onUse: () => void; onClose: () => void }) {
  const byId = new Map(route.stops.map((s) => [s.id, s]));
  const live = route.stops.filter((s) => s.status !== 'cancelled');
  const before = new Map(live.map((s, i) => [s.id, i + 1]));
  // Numbers after applying: upcoming stops take the slots upcoming stops hold.
  const slots = plan.order.filter((id) => ['scheduled', 'queued'].includes(byId.get(id)?.status ?? '')).map((id) => before.get(id)!).sort((a, b) => a - b);
  const after = new Map(before);
  plan.order.filter((id) => ['scheduled', 'queued'].includes(byId.get(id)?.status ?? '')).forEach((id, i) => after.set(id, slots[i]));
  const same = plan.order.join() === plan.current.order.join();
  const saved = plan.current.drive_s - plan.drive_s;
  const fewerLate = plan.current.late.length - plan.late.length;
  const headline = same ? 'This order is already the best'
    : saved >= 60 ? `Saves ${minutes(saved)} of driving`
    : fewerLate > 0 ? `${fewerLate} fewer late ${fewerLate === 1 ? 'arrival' : 'arrivals'}` : 'About the same drive time';
  return (
    <div style={{ margin: '8px 0 12px', padding: 16, borderRadius: 12, background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 24px' }}>
        <div className="heading" style={{ flex: '1 1 220px' }}>{headline}</div>
        <span className="caption"><b style={{ color: 'var(--ink)' }}>{minutes(plan.drive_s)}</b> driving (now {minutes(plan.current.drive_s)})</span>
        <span className="caption"><b style={{ color: 'var(--ink)' }}>{(plan.distance_m / 1609.34).toFixed(1)} mi</b></span>
        <span className="caption">Finish <b style={{ color: 'var(--ink)' }}>{fmtTime(plan.finish)}</b></span>
      </div>
      {plan.late.length ? (
        <div className="caption" style={{ color: 'var(--warning)', fontWeight: 600 }}>
          Can&apos;t make the window: {plan.late.map((id) => byId.get(id)?.customer_name).join(', ')}
        </div>
      ) : null}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {plan.order.map((id) => {
          const s = byId.get(id); if (!s) return null;
          const n = after.get(id)!, was = before.get(id)!;
          const late = plan.late.includes(id);
          return (
            <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
              <span className={`num ${s.status === 'en_route' ? 'next' : ''}`}>{n}</span>
              <span className="body" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{s.customer_name}</b> <span className="caption">· {s.status === 'en_route' ? 'on the way now · ' : n !== was ? `was ${was} · ` : ''}{windowText(s)}</span>
              </span>
              <span className="caption" style={{ fontWeight: 600, color: late ? 'var(--warning)' : 'var(--ink)' }}>{fmtTime(plan.etas[id])}{late ? ' · late' : ''}</span>
            </li>
          );
        })}
      </ol>
      {plan.approximate ? <div className="caption">Drive times are estimates.</div> : null}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {same ? <button className="btn btn-secondary" onClick={onClose}>Close</button> : (
          <>
            <button className="btn btn-primary" onClick={onUse}>Use this order</button>
            <button className="btn btn-text" onClick={onClose}>Keep current order</button>
          </>
        )}
      </div>
    </div>
  );
}

function StopRow({ s, n, isCurrent, onUp, onDown, onCancel }: { s: ConsoleStop; n: number; isCurrent: boolean; onUp: () => void; onDown: () => void; onCancel: () => void }) {
  const done = DONE.includes(s.status);
  const label = { completed: 'Done', no_show: 'No-show', skipped: 'Skipped', en_route: 'En route', arrived: 'Arrived', queued: 'Queued', scheduled: 'Scheduled' }[s.status] ?? s.status;
  return (
    <div className="row">
      <span className={`num ${done ? 'done' : isCurrent ? 'next' : ''}`}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="body" style={{ fontWeight: 600 }}>{s.customer_name}</div>
        <div className="caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.address}{s.notes ? ` · ${s.notes}` : ''}{!s.sms_consent_at ? ' · no texts' : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {!done && s.eta && s.status !== 'arrived'
          ? <div className="caption" style={{ fontWeight: 600, color: isLate(s) ? 'var(--warning)' : 'var(--ink)' }}>{etaText(s)}{isLate(s) ? ' · late' : ''}</div>
          : null}
        <div className="caption">{done ? fmtTime(s.marked_at) : windowText(s)}</div>
      </div>
      <span className={`pill ${done ? (s.status === 'completed' ? 'pill-success' : 'pill-neutral') : 'pill-info'}`} style={{ alignSelf: 'center' }}>{label}</span>
      {!done && s.status !== 'en_route' && s.status !== 'arrived' ? (
        <span style={{ display: 'flex' }}>
          <button className="mini" onClick={onUp} aria-label={`Move ${s.customer_name} up`}>↑</button>
          <button className="mini" onClick={onDown} aria-label={`Move ${s.customer_name} down`}>↓</button>
          <button className="mini danger" onClick={onCancel}>Cancel</button>
        </span>
      ) : <span style={{ width: 112 }} />}
      <a className="mini" href={`/t/${s.tracking_token}`} target="_blank" rel="noreferrer">Link</a>
    </div>
  );
}

function Drivers({ org, drivers, invites, reload }: { org: Org; drivers: Driver[]; invites: Invite[]; reload: () => Promise<void> }) {
  const [f, setF] = useState({ name: '', phone: '', vehicle: '', role: 'driver' as 'driver' | 'admin' });
  const [msg, setMsg] = useState<string | null>(null);
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      if (!f.name || e164(f.phone).length < 11) throw new Error('Enter a name and a full mobile number.');
      await api.invite(org.id, { name: f.name, phone: f.phone, vehicle: f.vehicle || null, role: f.role });
      setF({ name: '', phone: '', vehicle: '', role: 'driver' });
      setMsg('Invited. They sign in to the Arrively Driver app with this number.');
      await reload();
    } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <section className="card" style={{ flex: '999 1 420px' }}>
        <h1 className="title" style={{ marginBottom: 8 }}>Team</h1>
        {drivers.map((d) => (
          <div key={d.id} className="row">
            <div style={{ flex: 1 }}><div className="body" style={{ fontWeight: 600 }}>{d.name}</div><div className="caption">{d.phone}{d.vehicle ? ` · ${d.vehicle}` : ''}</div></div>
            <span className={`pill ${d.role === 'admin' ? 'pill-neutral' : 'pill-info'}`}>{d.role === 'admin' ? 'Admin' : 'Driver'}</span>
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.phone} className="row">
            <div style={{ flex: 1 }}><div className="body" style={{ fontWeight: 600 }}>{i.name}</div><div className="caption">{i.phone}</div></div>
            <span className="pill pill-warning">Invited</span>
          </div>
        ))}
      </section>
      <form onSubmit={invite} className="card" style={{ flex: '1 1 320px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
        <h2 className="heading">Invite someone</h2>
        <label className="field"><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span className="label">Mobile number</span><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="field"><span className="label">Vehicle (shown to customers)</span><input className="input" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} placeholder="White Ford Transit · 7KQ 204" /></label>
        <label className="field"><span className="label">Role</span>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'driver' | 'admin' })}>
            <option value="driver">Driver</option><option value="admin">Admin</option>
          </select>
        </label>
        {msg ? <p className="caption" style={{ margin: 0 }}>{msg}</p> : null}
        <button className="btn btn-primary">Send invite</button>
      </form>
    </div>
  );
}

function Settings({ org, reload }: { org: Org; reload: () => Promise<void> }) {
  const [f, setF] = useState(org);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="card" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}
      onSubmit={async (e) => { e.preventDefault(); try { await api.saveOrg(f); setMsg('Saved.'); await reload(); } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); } }}>
      <h1 className="title">Settings</h1>
      <label className="field"><span className="label">Business name (shown to customers)</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span className="label">Business phone (the Call button)</span><input className="input" type="tel" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="checkbox" checked={f.drivers_can_add_stops} onChange={(e) => setF({ ...f, drivers_can_add_stops: e.target.checked })} style={{ width: 20, height: 20, accentColor: '#0077CC' }} />
        <span className="body">Drivers can add stops from the app</span>
      </label>
      <p className="caption" style={{ margin: 0 }}>Customers get three texts per stop: when it&apos;s scheduled, when they&apos;re next (both with the tracking link), and when the driver arrives.</p>
      {msg ? <p className="caption" style={{ margin: 0 }}>{msg}</p> : null}
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Save</button>
    </form>
  );
}
