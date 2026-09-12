'use client';

/**
 * The proof strip: live numbers from the running system.
 *
 * The headline is the refused figure — how much of what operators claimed
 * did not survive checking. It is the one number that distinguishes this
 * from a dashboard that believes whatever it is told, and no competitor
 * puts it on their front page because for most of them it would be zero.
 *
 * Every value is nullable-honest. Before anything has been verified this
 * renders dashes and says so, rather than showing zeroes that read like
 * measurements. A landing page that fabricates traction is the same lie as
 * a carbon claim that fabricates tonnes.
 */

import { useEffect, useState } from 'react';
import { getSummary, type Summary } from '@/lib/market-api';

const num = (v: number | null | undefined, unit = '') =>
  v === null || v === undefined ? '—' : `${Math.round(v).toLocaleString('en-IN')}${unit}`;

export function LiveProof() {
  const [s, setS] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getSummary().then(setS).catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  const verified = s?.checks ?? 0;

  return (
    <section className="border-y border-border bg-panel text-panel-foreground">
      <div className="home-shell py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.1em] opacity-70">
            Running right now
          </h2>
          {s?.lastReadingAt && (
            <span className="font-mono text-xs opacity-60">
              last reading {new Date(s.lastReadingAt).toLocaleString('en-IN', {
                dateStyle: 'medium', timeStyle: 'short',
              })}
            </span>
          )}
        </div>

        {verified === 0 ? (
          <p className="mt-4 text-sm opacity-80">
            Nothing has been verified on this deployment yet. The figures
            appear here once the first reconciliation runs — we would rather
            show you that than invent traction.
          </p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
              <Figure value={num(s?.claimedCo2Kg, ' kg')} label="CO₂ claimed by operators" />
              <Figure value={num(s?.creditedCo2Kg, ' kg')} label="CO₂ we could evidence" />
              <Figure
                value={num(s?.refusedCo2Kg, ' kg')}
                label="refused — claims the evidence did not support"
                tone="warn"
                big
              />
              <Figure value={String(s?.checks ?? '—')} label="verification windows" />
              <Figure value={String(s?.ponds ?? '—')} label="ponds monitored" />
              <Figure
                value={s ? `${(s.areaM2 / 10_000).toFixed(1)} ha` : '—'}
                label="under monitoring"
              />
            </div>

            {s?.refusedShare != null && (
              <p className="mt-5 max-w-3xl text-sm opacity-85">
                <strong className="font-semibold">
                  {(s.refusedShare * 100).toFixed(1)}% of what was claimed did not
                  survive checking.
                </strong>{' '}
                That figure is the entire point. A platform that always agreed
                with the farm would report 0% and be worth nothing to a buyer.
              </p>
            )}

            <p className="mt-2 text-xs opacity-60">
              {s?.batches ?? 0} batch{(s?.batches ?? 0) === 1 ? '' : 'es'} issued ·{' '}
              {num(s?.retiredCo2Kg, ' kg')} retired ·{' '}
              {s?.anchoredOnChain
                ? 'anchored on chain'
                : 'reports hashed and reproducible; chain anchoring not configured on this deployment'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Figure({ value, label, tone, big }: {
  value: string; label: string; tone?: 'warn'; big?: boolean;
}) {
  return (
    <div>
      <div className={`font-display font-semibold ${big ? 'text-2xl' : 'text-xl'} ${
        tone === 'warn' ? 'text-status-warning' : ''
      }`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs leading-snug opacity-65">{label}</div>
    </div>
  );
}
