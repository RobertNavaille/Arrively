import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 className="title" style={{ fontSize: 32, lineHeight: '38px' }}>Arrively</h1>
      <p className="body" style={{ color: 'var(--ink-muted)', margin: 0 }}>
        Know where your driver is, and get ready before they arrive.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" href="/console">Owner console</Link>
        <Link className="btn btn-secondary" href="/t/demo">See a demo tracking page</Link>
      </div>
    </main>
  );
}
