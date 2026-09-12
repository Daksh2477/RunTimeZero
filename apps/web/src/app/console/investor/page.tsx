'use client';

/**
 * Investor hub — credits to buy, and farms raising money.
 *
 * Layout follows Chetan's Lovable design: dense, multi-panel, everything
 * visible at once rather than behind tabs. That density is deliberate. The
 * buyer's question is "which of these is actually good", and you cannot
 * answer it by clicking through listings one at a time — you answer it by
 * seeing the evidence column next to the price column.
 *
 * The one thing this shows that a normal carbon marketplace does not is the
 * divergence figure: how far the operator's claim was from what the evidence
 * supported. A listing with 0 bps had nothing refused. That is the number
 * that separates a real tonne from a claimed one, so it sits in the table
 * rather than behind a detail page.
 */

import { useEffect, useState } from 'react';
import {
  getMarket, getOpportunities, retireCredits,
  type Listing, type Opportunity,
} from '@/lib/market-api';
import { RetirePanel } from '@/components/retire-panel';
import { OpportunityCard } from '@/components/opportunity-card';

const kg = (v: number) => `${Math.round(v).toLocaleString('en-IN')} kg`;

/** Divergence in basis points, as something a buyer can act on. */
function quality(bps: number): { label: string; cls: string } {
  if (bps <= 0) return { label: 'Nothing refused', cls: 'text-status-optimal' };
  if (bps < 500) return { label: `${(bps / 100).toFixed(1)}% refused`, cls: 'text-status-optimal' };
  if (bps < 2000) return { label: `${(bps / 100).toFixed(1)}% refused`, cls: 'text-status-warning' };
  return { label: `${(bps / 100).toFixed(1)}% refused`, cls: 'text-status-critical' };
}

export default function InvestorConsole() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [farms, setFarms] = useState<Opportunity[] | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getMarket().then((l) => { setListings(l); setSelected((s) => s ?? l[0] ?? null); })
      .catch((e) => setError(e.message));
    getOpportunities().then(setFarms).catch(() => setFarms([]));
  };
  useEffect(load, []);

  const totalAvailable = (listings ?? []).reduce((s, l) => s + l.availableKg, 0);
  const totalRetired = (listings ?? []).reduce((s, l) => s + l.retiredKg, 0);

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Could not reach the market: {error}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Investor hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified credits and farms raising capital. Every figure below is
            queried from the verification record, not entered by the seller.
          </p>
        </div>
        <div className="flex gap-5">
          <Stat label="available" value={kg(totalAvailable)} />
          <Stat label="retired" value={kg(totalRetired)} />
          <Stat label="listings" value={String(listings?.length ?? '—')} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="font-display text-sm font-semibold">Credits for sale</h2>
          <p className="text-xs text-muted-foreground">
            Sorted newest first. &ldquo;Refused&rdquo; is how much of the
            operator&rsquo;s own claim the evidence did not support.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-semibold">Site</th>
                  <th className="pb-2 font-semibold">Period</th>
                  <th className="pb-2 font-semibold">Evidence</th>
                  <th className="pb-2 text-right font-semibold">Available</th>
                  <th className="pb-2 text-right font-semibold">Quality</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {(listings ?? []).map((l) => {
                  const q = quality(l.divergenceBps);
                  return (
                    <tr key={l.batchId} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{l.siteName}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.tier} · {l.disposition.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                        {l.periodStart.slice(0, 10)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {l.anchored ? (
                          <span className="text-status-optimal">on chain</span>
                        ) : (
                          <span className="text-muted-foreground" title={l.reportHash ?? ''}>
                            hash only
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono">{kg(l.availableKg)}</td>
                      <td className={`py-2.5 pr-3 text-right text-xs font-semibold ${q.cls}`}>
                        {q.label}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(l)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent"
                        >
                          Retire
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {listings?.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Nothing has been issued yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <RetirePanel
          listing={selected}
          onRetired={load}
          onRetire={retireCredits}
        />
      </div>

      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold">Farms raising capital</h2>
        <p className="text-xs text-muted-foreground">
          We carry the listing and its verified production. You contact the
          operator directly — we take no fee and hold no money.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(farms ?? []).map((f) => <OpportunityCard key={f.id} opportunity={f} />)}
          {farms?.length === 0 && (
            <p className="text-sm text-muted-foreground">No farms are listed right now.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
