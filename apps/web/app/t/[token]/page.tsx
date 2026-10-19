'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TrackMap } from '@/components/TrackMap';
import { distanceM, fetchTracking, fmtTime, type Tracking } from '@/lib/tracking';

const POLL_MS = 3000;

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Tracking | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await fetchTracking(token);
        if (alive) { setData(d); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  if (data === undefined) return <Centered>{error ?? 'Loading your visit…'}</Centered>;
  if (data === null) return <Centered>We couldn&apos;t find this visit. Check the link in your text message.</Centered>;
  if (data.expired) return <Centered>This visit is finished. Thanks for choosing us.</Centered>;

  return <Visit data={data} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <p className="body" style={{ color: 'var(--ink-muted)', maxWidth: 320 }}>{children}</p>
    </main>
  );
}

function Visit({ data }: { data: Tracking }) {
  const { business, stop, driver, driver_location: loc } = data;
  const name = driver?.first_name || 'Your driver';
  const home = { lat: stop.lat, lng: stop.lng };
  const meters = loc ? distanceM(loc, home) : null;
  // The routed, traffic-aware ETA when the server has one; a straight-line guess otherwise.
  // Never "0 min" before the driver arrives (ETA-3).
  const guess = meters != null ? Math.max(1, Math.round(((meters * 1.3) / 1609.34 / 25) * 60)) : null;
  const minutes = stop.eta ? Math.max(1, Math.round((Date.parse(stop.eta) - Date.now()) / 60000)) : guess;
  const eta = stop.eta ?? (guess != null ? new Date(Date.now() + guess * 60000).toISOString() : null);
  const approx = !stop.eta || !!stop.eta_approx;
  const staleMin = loc ? Math.floor((Date.now() - new Date(loc.recorded_at).getTime()) / 60000) : 0;
  const done = ['completed', 'no_show', 'skipped', 'cancelled'].includes(stop.status);
  const initials = business.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 14 }}>{initials}</span>
        <div style={{ flex: 1 }}>
          <h1 className="heading">{business.name}</h1>
          <div className="caption">via Arrively</div>
        </div>
        {business.phone ? (
          <a className="btn btn-text" href={`tel:${business.phone}`} aria-label={`Call ${business.name}`}>Call</a>
        ) : null}
      </header>

      {!done ? (
        <TrackMap height={stop.status === 'scheduled' ? 300 : 360} home={home}
          driver={loc} showLine={stop.status === 'en_route'} />
      ) : null}

      <section style={{
        marginTop: done ? 0 : -20, position: 'relative', flex: 1, background: 'var(--surface)',
        borderRadius: done ? 0 : '20px 20px 0 0', boxShadow: done ? 'none' : 'var(--shadow-sheet)',
        padding: '8px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {!done ? <div aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto' }} /> : null}

        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          {stop.status === 'scheduled' ? (
            <>
              <span className="pill pill-neutral">Scheduled</span>
              {stop.window_start ? (
                <>
                  <div className="caption">Arriving between</div>
                  <div className="stat">{fmtTime(stop.window_start)} – {fmtTime(stop.window_end)}</div>
                </>
              ) : <h2 className="title">Your visit is scheduled</h2>}
              <p className="body" style={{ color: 'var(--ink-muted)', margin: 0 }}>
                We&apos;ll text you when you&apos;re next. This page updates live.
              </p>
            </>
          ) : null}

          {stop.status === 'queued' ? (
            <>
              <span className="pill pill-info">On the route</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="stat">{data.stops_ahead}</span>
                <span className="body" style={{ color: 'var(--ink-muted)' }}>{data.stops_ahead === 1 ? 'stop before yours' : 'stops before yours'}</span>
              </div>
              {eta ? <div className="body" style={{ color: 'var(--ink-muted)' }}>Estimated arrival {approx ? 'around ' : ''}<b style={{ color: 'var(--ink)' }}>{fmtTime(eta)}</b></div> : null}
            </>
          ) : null}

          {stop.status === 'en_route' ? (
            <>
              <span className="pill pill-info">You&apos;re next</span>
              <h2 className="title">{name} is on the way to you</h2>
              <div style={{ display: 'flex', gap: 24 }}>
                <Stat value={minutes != null ? String(minutes) : '–'} label="minutes" />
                <Stat value={meters != null ? (meters / 1609.34).toFixed(1) : '–'} label="miles" />
                <Stat value={eta ? fmtTime(eta).replace(/ (am|pm)$/, '') : '–'} label="eta" />
              </div>
            </>
          ) : null}

          {stop.status === 'arrived' ? (
            <div style={{ alignSelf: 'stretch', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <h2 className="title">{name} has arrived</h2>
              {stop.arrived_at ? <div className="caption">Arrived at {fmtTime(stop.arrived_at)}</div> : null}
            </div>
          ) : null}

          {done ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 24 }}>
              <span className={`pill ${stop.status === 'completed' ? 'pill-success' : 'pill-neutral'}`}>
                {stop.status === 'completed' ? 'Visit complete' : 'Visit closed'}
              </span>
              <h2 className="title">{stop.status === 'completed' ? 'Thanks, you’re all set' : 'This visit didn’t happen today'}</h2>
              <p className="body" style={{ color: 'var(--ink-muted)', margin: 0 }}>
                {stop.status === 'completed' ? `${business.name} has marked your visit complete.` : `${business.name} will be in touch to reschedule.`}
              </p>
            </div>
          ) : null}

          {loc && staleMin >= 2 && !done ? (
            <span className="pill pill-warning">Location updated {staleMin} min ago</span>
          ) : null}
        </div>

        {driver && !done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: '1px solid var(--divider)' }}>
            <span aria-hidden style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600 }}>
              {name[0]}
            </span>
            <div style={{ flex: 1 }}>
              <div className="heading">{name}</div>
              {driver.vehicle ? <div className="caption">{driver.vehicle}</div> : null}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="label">Your visit</div>
          <div className="body">{stop.address}</div>
          {stop.notes ? <div className="caption">{stop.notes}</div> : null}
        </div>

        {business.phone ? (
          <a className="btn btn-secondary" href={`tel:${business.phone}`}>Call {business.name}</a>
        ) : null}
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat">{value}</div>
      <div className="caption">{label}</div>
    </div>
  );
}
