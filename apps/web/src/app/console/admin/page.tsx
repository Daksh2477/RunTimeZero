'use client';

/**
 * Operator console — issuance and consent.
 *
 * Two jobs nobody else can do: turning verified windows into a batch, and
 * recording which farms have agreed to their data being sold.
 *
 * The issue flow is preview-then-commit rather than a single button. The
 * preview lists blockers in the operator's own terms — a non-durable
 * disposition, a missing evidence reference, windows already issued — so
 * that a refusal teaches instead of just failing.
 */

import { useEffect, useState } from 'react';
import { getSummary, type Summary } from '@/lib/market-api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Site { id: string; name: string; tier: string }
interface Preview {
  siteName: string; checkCount: number; reportHash: string;
  blockers: string[];
  report: { totals: { claimedCo2Kg: number; creditableCo2Kg: number; divergenceBps: number } };
}

const DURABLE = ['biochar', 'buried', 'bioplastic'];
const ALL = [...DURABLE, 'sold_as_feed', 'sold_as_fertiliser', 'undisclosed'];

export default function AdminConsole() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState({
    siteId: '', periodStart: '2026-08-01', periodEnd: '2026-10-01',
    disposition: 'biochar', dispositionEvidenceRef: '',
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<Record<string, boolean>>({});

  const refresh = () => { getSummary().then(setSummary).catch(() => {}); };

  useEffect(() => {
    refresh();
    fetch(`${API}/fleet`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((s: Site[]) => {
        setSites(s);
        setForm((f) => ({ ...f, siteId: f.siteId || s[0]?.id || '' }));
      })
      .catch(() => {});
  }, []);

  const call = async (path: string, body: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json;
  };

  const body = () => ({
    siteId: form.siteId,
    periodStart: new Date(form.periodStart).toISOString(),
    periodEnd: new Date(form.periodEnd).toISOString(),
    disposition: form.disposition,
    dispositionEvidenceRef: form.dispositionEvidenceRef || null,
  });

  const doPreview = async () => {
    setError(null); setResult(null);
    try { setPreview(await call('/batches/preview', body())); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  const doIssue = async () => {
    setError(null);
    try {
      const r = await call('/batches', body());
      setResult(`Issued ${Math.round(r.creditableCo2Kg).toLocaleString('en-IN')} kg · ${r.note}`);
      setPreview(null);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  const toggleConsent = async (siteId: string, on: boolean) => {
    await call('/research/consent', { siteId, shareIdentity: false, withdraw: !on });
    setConsent((c) => ({ ...c, [siteId]: on }));
  };

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Operator console</h1>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Tile label="Sites" value={summary?.sites} />
        <Tile label="Ponds" value={summary?.ponds} />
        <Tile label="Checks" value={summary?.checks} />
        <Tile label="Batches" value={summary?.batches} />
        <Tile label="Claimed kg" value={summary?.claimedCo2Kg} round />
        <Tile label="Refused kg" value={summary?.refusedCo2Kg} round tone="warn" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Issue a batch</h2>
          <p className="text-xs text-muted-foreground">
            Preview first. The blockers are the product rules, in plain words.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Site</span>
              <select
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.tier})</option>)}
              </select>
            </label>
            {(['periodStart', 'periodEnd'] as const).map((k) => (
              <label key={k}>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {k === 'periodStart' ? 'From' : 'To'}
                </span>
                <input
                  type="date" value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Disposition</span>
              <select
                value={form.disposition}
                onChange={(e) => setForm({ ...form, disposition: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ALL.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, ' ')}{DURABLE.includes(d) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Evidence ref</span>
              <input
                value={form.dispositionEvidenceRef}
                onChange={(e) => setForm({ ...form, dispositionEvidenceRef: e.target.value })}
                placeholder="PYRO-2026-0431"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={doPreview}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:border-accent">
              Preview
            </button>
            <button type="button" onClick={doIssue}
              disabled={!preview || preview.blockers.length > 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              Issue
            </button>
          </div>

          {preview && (
            <div className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">
              <p>
                <strong>{preview.checkCount}</strong> windows ·{' '}
                claimed <strong>{Math.round(preview.report.totals.claimedCo2Kg).toLocaleString('en-IN')}</strong> kg ·{' '}
                creditable <strong>{Math.round(preview.report.totals.creditableCo2Kg).toLocaleString('en-IN')}</strong> kg
              </p>
              <p className="mt-1 font-mono text-[0.68rem] break-all text-muted-foreground">
                {preview.reportHash}
              </p>
              {preview.blockers.map((b) => (
                <p key={b} className="mt-2 border-l-2 border-status-critical pl-2 text-xs">{b}</p>
              ))}
            </div>
          )}
          {result && <p className="mt-3 rounded-lg border border-status-optimal/40 bg-status-optimal/5 p-3 text-sm">{result}</p>}
          {error && <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Data consent</h2>
          <p className="text-xs text-muted-foreground">
            Which farms have agreed their data may be licensed to researchers.
            Opt in, never opt out — and withdrawal takes effect immediately,
            including for keys already sold.
          </p>
          <ul className="mt-4 space-y-2">
            {sites.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.tier}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleConsent(s.id, !consent[s.id])}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                    consent[s.id]
                      ? 'border-status-optimal text-status-optimal'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {consent[s.id] ? 'Sharing' : 'Not sharing'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Tile({ label, value, round, tone }: {
  label: string; value?: number | null; round?: boolean; tone?: 'warn';
}) {
  const shown = value === null || value === undefined ? '—'
    : round ? Math.round(value).toLocaleString('en-IN') : String(value);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`font-display text-xl font-semibold ${tone === 'warn' ? 'text-status-warning' : ''}`}>
        {shown}
      </div>
      <div className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
