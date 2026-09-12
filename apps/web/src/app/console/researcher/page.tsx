'use client';

/**
 * Researcher lab — datasets for sale, and what they honestly contain.
 *
 * Every row count here is queried, not advertised. A catalogue claiming
 * "19 months of data" while holding three weeks is the same overstatement
 * as an inflated carbon claim, and we would have no standing to object to
 * the second while doing the first.
 *
 * Each dataset carries a caveat written to be off-putting where it should
 * be: the telemetry set includes sensor dropouts and fouling and we do not
 * clean them. A researcher who buys expecting clean data and finds gaps
 * will not buy again.
 */

import { useEffect, useState } from 'react';
import { buyLicence, getCatalogue, type Dataset } from '@/lib/market-api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function ResearcherConsole() {
  const [sets, setSets] = useState<Dataset[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', institution: '', purpose: '' });
  const [issued, setIssued] = useState<{ apiKey: string; priceInr: number; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCatalogue().then((c) => { setSets(c); setChosen(c[0]?.id ?? null); })
      .catch((e) => setError(e.message));
  }, []);

  const set = sets?.find((s) => s.id === chosen) ?? null;

  const submit = async () => {
    if (!set) return;
    setBusy(true); setError(null);
    try {
      setIssued(await buyLicence({ ...form, dataset: set.id, months }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue licence');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Research lab</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pond data from consenting farms. Row counts are live, not advertised.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          {(sets ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setChosen(d.id)}
              className={`w-full rounded-xl border bg-card p-5 text-left shadow-sm transition-colors ${
                chosen === d.id ? 'border-accent' : 'border-border hover:border-accent/50'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-base font-semibold">{d.name}</h2>
                <span className="font-mono text-sm">
                  {d.rows === 0 ? '—' : `₹${d.priceInr.toLocaleString('en-IN')}/mo`}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.contents.map((c) => (
                  <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-medium">
                    {c}
                  </span>
                ))}
              </div>

              <dl className="mt-3 flex gap-6 text-xs">
                <div>
                  <dt className="uppercase tracking-wide text-muted-foreground">rows</dt>
                  <dd className="font-mono text-sm font-semibold">{d.rows.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-muted-foreground">consenting sites</dt>
                  <dd className="font-mono text-sm font-semibold">{d.sites}</dd>
                </div>
              </dl>

              <p className="mt-3 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                {d.caveat}
              </p>
            </button>
          ))}

          {sets?.every((d) => d.rows === 0) && (
            <p className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
              No farm has opted in yet, so there is nothing to license. That
              is the consent model working, not an outage — data is never
              sold without the operator agreeing first.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Take a licence</h2>

          {issued ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold">Licence issued</p>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">API key</p>
                <code className="mt-1 block font-mono text-xs break-all">{issued.apiKey}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Shown once — we store only its hash. ₹{issued.priceInr.toLocaleString('en-IN')},
                valid to {issued.expiresAt.slice(0, 10)}.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-panel p-3 font-mono text-[0.68rem] text-panel-foreground">
{`curl -H "Authorization: Bearer ${issued.apiKey.slice(0, 16)}…" \\
  ${API}/research/data?limit=1000`}
              </pre>
              <p className="text-xs text-muted-foreground">
                A key rather than a file, so that a farm withdrawing consent
                actually takes effect. A downloaded CSV cannot be recalled.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {([
                ['buyerName', 'Your name'],
                ['buyerEmail', 'Email'],
                ['institution', 'Institution (optional)'],
              ] as const).map(([k, ph]) => (
                <input
                  key={k}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  placeholder={ph}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              ))}
              <textarea
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="What will you use it for?"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Months
                </span>
                <input
                  type="number" min={1} max={36} value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                />
              </label>

              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={busy || !set || set.rows === 0 || !form.buyerName.trim()
                  || !form.buyerEmail.trim() || !form.purpose.trim()}
                onClick={submit}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {busy ? 'Issuing…' : set ? `License ${set.name}` : 'Pick a dataset'}
              </button>

              <p className="text-xs text-muted-foreground">
                Half of what you pay goes to the farms whose data you are
                using. They generated it.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
