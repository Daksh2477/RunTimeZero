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
import Link from 'next/link';
import {
  getMarket, getOpportunities, retireCredits,
  type Listing, type Opportunity,
} from '@/lib/market-api';
import { RetirePanel } from '@/components/retire-panel';
import { OpportunityCard } from '@/components/opportunity-card';
import { FinancePanel } from '@/components/finance-panel';

const kg = (v: number) => `${Math.round(v).toLocaleString('en-IN')} kg`;

export default function InvestorConsole() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [farms, setFarms] = useState<Opportunity[] | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const [market,opportunities]=await Promise.allSettled([getMarket(),getOpportunities()]);
    if(market.status==='fulfilled'){setListings(market.value);setSelected(s=>market.value.find(l=>l.batchId===s?.batchId)??market.value[0]??null);}else setError(market.reason instanceof Error?market.reason.message:'Market unavailable.');
    setFarms(opportunities.status==='fulfilled'?opportunities.value:[]);
  };
  useEffect(()=>{void load();}, []);
  // Match links arrive as #listing-<id>, but the cards render after the fetch, so the browser's own jump has already missed.
  useEffect(()=>{if(farms?.length&&location.hash.startsWith('#listing-'))document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'center'});},[farms]);

  const totalAvailable = (listings ?? []).reduce((s, l) => s + l.availableKg, 0);
  const totalRetired = (listings ?? []).reduce((s, l) => s + l.retiredKg, 0);

  if (error) {
    return (
      <main className="mx-auto max-w-[1800px] px-4 py-10 sm:px-6">
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Could not reach the market: {error}
        </p><button className="button secondary" onClick={()=>void load()}>Try again</button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6">
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
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-xl lg:col-span-2">
          <h2 className="font-display text-sm font-semibold">Credits available</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Trading lives on the marketplace, where listings also show the
            algae itself. This is the summary.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Listings', String(listings?.length ?? '—')],
              ['Available', kg(totalAvailable)],
              ['Retired', kg(totalRetired)],
              ['Farms raising', String(farms?.length ?? '—')],
            ].map(([label, v]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-display text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/console/market"
            className="mt-5 inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            Open the marketplace →
          </Link>
        </section>

        <RetirePanel
          key={selected?.batchId??"empty"}
          listing={selected}
          onRetired={load}
          onRetire={retireCredits}
        />
      </div>

      <FinancePanel />

      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold">Farms raising capital</h2>
        <p className="text-xs text-muted-foreground">
          We carry the listing and its verified production. You contact the
          operator directly — we take no fee and hold no money.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(farms ?? []).map((f) => <div id={`listing-${f.id}`} key={f.id}><OpportunityCard opportunity={f} /></div>)}
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
