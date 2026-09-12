'use client';

/**
 * The marketplace: carbon credits and the algae itself.
 *
 * Two tabs because they are two genuinely different trades. A tonne of CO₂
 * at Indian voluntary prices is worth a few hundred rupees; the same pond's
 * biomass sold as aquafeed is worth tens of thousands. Carbon is the
 * verification story, produce is the income, and a platform showing only the
 * first would be selling the smaller half.
 *
 * Style follows Chetan's front1.0 export — glass panels, soft background
 * glows, motion on entry. Every number under it is live.
 *
 * The column no competitor shows is "refused": how much of the seller's own
 * claim the evidence did not support. On credits it is the quality signal;
 * on produce the equivalent is `compositionSource`, because a protein figure
 * that was modelled rather than assayed is worth less trust and the buyer
 * should be told which they are getting.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getMarket, getProduce, orderProduce, retireCredits,
  type Listing, type Produce,
} from '@/lib/market-api';
import { RetirePanel } from '@/components/retire-panel';

const inr = (v: number) =>
  v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(2)} Cr`
    : v >= 100_000 ? `₹${(v / 100_000).toFixed(1)} L`
      : `₹${Math.round(v).toLocaleString('en-IN')}`;

type Tab = 'credits' | 'produce';

export default function MarketPage() {
  const [tab, setTab] = useState<Tab>('credits');
  const [credits, setCredits] = useState<Listing[]>([]);
  const [produce, setProduce] = useState<Produce[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');

  const load = () => {
    getMarket().then((l) => { setCredits(l); setSelected((s) => s ?? l[0] ?? null); }).catch(() => {});
    getProduce().then(setProduce).catch(() => {});
  };
  useEffect(load, []);

  const match = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  const shownCredits = credits.filter((c) => match(c.siteName));
  const shownProduce = produce.filter((p) => match(`${p.siteName} ${p.gradeLabel} ${p.pondLabel}`));

  const creditKg = credits.reduce((s, c) => s + c.availableKg, 0);
  const produceKg = produce.reduce((s, p) => s + p.availableKg, 0);
  const produceValue = produce.reduce((s, p) => s + p.availableKg * p.askingInrPerKg, 0);

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden p-4 sm:p-6 lg:p-10">
      {/* Decorative only — pointer-events-none so they never eat a tap. */}
      <div className="pointer-events-none absolute right-0 top-0 size-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 size-[420px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Marketplace
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Verified carbon credits and the algae itself. Everything here is
              priced in rupees at farm gate, and every figure is queried from
              the verification record.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search listings…"
            className="h-11 w-full rounded-xl border border-border bg-card/60 px-4 text-sm backdrop-blur sm:w-64"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Credits available', value: `${Math.round(creditKg).toLocaleString('en-IN')} kg` },
            { label: 'Algae available', value: `${Math.round(produceKg).toLocaleString('en-IN')} kg` },
            { label: 'Produce value at asking', value: inr(produceValue) },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border/60 bg-card/50 p-5 shadow-sm backdrop-blur-md"
            >
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
              <h3 className="mt-1.5 font-display text-2xl font-bold sm:text-3xl">{s.value}</h3>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-2 rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur-sm">
          {(['credits', 'produce'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'credits' ? 'Carbon credits' : 'Algae produce'}
            </button>
          ))}
        </div>

        {tab === 'credits' ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {shownCredits.map((c, i) => (
                <motion.button
                  key={c.batchId}
                  type="button"
                  onClick={() => setSelected(c)}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border bg-card/60 p-5 text-left shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    selected?.batchId === c.batchId ? 'border-primary' : 'border-border/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{c.siteName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.tier} · {c.disposition.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      c.divergenceBps < 500
                        ? 'bg-status-optimal/15 text-status-optimal'
                        : 'bg-status-warning/15 text-status-warning'
                    }`}>
                      {(c.divergenceBps / 100).toFixed(1)}% refused
                    </span>
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
                      <p className="font-display text-2xl font-bold">
                        {Math.round(c.availableKg).toLocaleString('en-IN')}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.anchored ? 'on chain' : 'hash verified'}
                    </p>
                  </div>
                </motion.button>
              ))}
              {shownCredits.length === 0 && (
                <p className="text-sm text-muted-foreground">No credits match that search.</p>
              )}
            </div>
            <RetirePanel listing={selected} onRetired={load} onRetire={retireCredits} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shownProduce.map((p, i) => (
              <ProduceCard key={p.harvestId} produce={p} index={i} onOrdered={load} />
            ))}
            {shownProduce.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing is listed for sale right now.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProduceCard({ produce: p, index, onOrdered }: {
  produce: Produce; index: number; onOrdered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kg: 100, buyerName: '', buyerEmail: '' });
  const [done, setDone] = useState<{ totalInr: number; kg: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      setDone(await orderProduce(p.harvestId, form));
      onOrdered();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order failed');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="flex flex-col rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-base font-semibold">{p.gradeLabel}</p>
          <p className="text-xs text-muted-foreground">
            {p.siteName} · {p.pondLabel} · cut {p.harvestedAt.slice(0, 10)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          ₹{p.askingInrPerKg}/kg
        </span>
      </div>

      {p.protein !== null && (
        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-secondary/60 p-3 text-center text-xs">
          {[['Protein', p.protein], ['Lipid', p.lipid], ['Carbs', p.carbohydrate]].map(([k, v]) => (
            <div key={k as string}>
              <dt className="uppercase tracking-wide text-muted-foreground">{k as string}</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold">
                {v === null ? '—' : `${((v as number) * 100).toFixed(0)}%`}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* A modelled figure is worth less trust than an assay, so say which. */}
      <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
        {p.compositionSource === 'lab' ? 'Composition from a lab assay.'
          : p.compositionSource === 'nir' ? 'Composition from an on-farm NIR meter.'
            : 'Composition estimated from pond conditions, not assayed. '
              + 'Ask for a lab report before buying on protein spec.'}
      </p>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
          <p className="font-display text-2xl font-bold">
            {Math.round(p.availableKg).toLocaleString('en-IN')}
            <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
          </p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          market ₹{p.priceLowInr}–{p.priceHighInr}
        </p>
      </div>

      <div className="mt-4">
        {done ? (
          <p className="rounded-xl border border-status-optimal/40 bg-status-optimal/5 p-3 text-sm">
            Ordered {done.kg} kg · {inr(done.totalInr)}
          </p>
        ) : open ? (
          <div className="space-y-2">
            <input type="number" min={1} max={Math.floor(p.availableKg)} value={form.kg}
              onChange={(e) => setForm({ ...form, kg: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm" />
            <input value={form.buyerName} placeholder="Your name"
              onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input value={form.buyerEmail} placeholder="Email"
              onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button type="button" onClick={submit}
              disabled={!form.buyerName.trim() || !form.buyerEmail.trim()}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              Order {inr(form.kg * p.askingInrPerKg)}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary">
            Buy this
          </button>
        )}
      </div>
    </motion.div>
  );
}
