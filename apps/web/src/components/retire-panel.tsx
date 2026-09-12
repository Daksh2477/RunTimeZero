'use client';

/**
 * Retiring credits.
 *
 * Retirement is one-way and that is the whole point of it: once retired, a
 * tonne is claimed against somebody's emissions and can never be sold again,
 * which is the only thing stopping the same tonne being sold down a chain of
 * brokers. So the form says so before the button, not after.
 *
 * The beneficiary field is required by the API and explained here, because
 * it is the part people get wrong: it is who the claim belongs to, not who
 * paid. A broker retiring for a mill must name the mill.
 */

import Link from 'next/link';
import { useState } from 'react';
import type { Listing } from '@/lib/market-api';

interface Props {
  listing: Listing | null;
  onRetired: () => void;
  onRetire: (batchId: string, kg: number, beneficiary: string) => Promise<{
    id: string; kg: number; beneficiary: string; anchored: boolean; note: string;
  }>;
}

export function RetirePanel({ listing, onRetired, onRetire }: Props) {
  const [kg, setKg] = useState(50);
  const [beneficiary, setBeneficiary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; kg: number; beneficiary: string; note: string } | null>(null);

  if (!listing) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold">Retire credits</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Pick a batch from the table to retire against it.
        </p>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await onRetire(listing.batchId, kg, beneficiary);
      setDone(r);
      setBeneficiary('');
      onRetired();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retirement failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-display text-sm font-semibold">Retire credits</h2>
      <p className="text-xs text-muted-foreground">
        {listing.siteName} · {Math.round(listing.availableKg).toLocaleString('en-IN')} kg left
      </p>

      {done ? (
        <div className="mt-4 rounded-lg border border-status-optimal/40 bg-status-optimal/5 p-4">
          <p className="text-sm font-semibold">
            {Math.round(done.kg)} kg retired for {done.beneficiary}
          </p>
          <p className="mt-1 font-mono text-[0.68rem] break-all text-muted-foreground">
            {done.id}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{done.note}</p>
          <Link className="button mt-3" href={`/verify/certificate/${done.id}`}>Open retirement certificate →</Link>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Retire more
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              How much
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number" min={1} max={Math.floor(listing.availableKg)} value={kg}
                onChange={(e) => setKg(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="text-sm text-muted-foreground">kg</span>
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Retired on behalf of
            </span>
            <input
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="Surat Textiles Pvt Ltd"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Whose emissions this offsets — not who paid. A broker retiring
              for a mill names the mill, or the same tonne gets claimed twice.
            </span>
          </label>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
              {error}
            </p>
          )}

          <p className="rounded-md bg-secondary/60 p-2.5 text-xs text-muted-foreground">
            Retirement cannot be undone. These credits leave the market
            permanently and are claimed against the named party.
          </p>

          <button
            type="button"
            disabled={busy || !beneficiary.trim() || !Number.isFinite(kg) || kg < 1 || kg > listing.availableKg}
            onClick={submit}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Retiring…' : `Retire ${kg} kg`}
          </button>
        </div>
      )}
    </section>
  );
}
