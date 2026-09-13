'use client';

/**
 * A farm asking for investment.
 *
 * The pitch is the operator's own words. Everything under "verified" is not
 * — it is queried from the same divergence checks the credits use, so a farm
 * cannot advertise a yield its ponds did not produce. On any other farm
 * noticeboard those numbers are self-reported, and that difference is the
 * only reason this page is worth building.
 *
 * Claim accuracy is shown as null-safe on purpose: a farm with nothing
 * verified yet says "not verified yet", never 100%.
 */

import { useState } from 'react';
import { DetailSheet } from './detail-sheet';
import { RelatedLinks } from './related-links';
import { SellerTrust } from './market-insights';
import { enquire, type Opportunity } from '@/lib/market-api';

const inr = (v: number) =>
  v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(2)} Cr`
    : v >= 100_000 ? `₹${(v / 100_000).toFixed(1)} L`
      : `₹${Math.round(v).toLocaleString('en-IN')}`;

export function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ investorName: '', investorEmail: '', organisation: '', message: '' });
  const [sent, setSent] = useState<{ contact: Opportunity['contact']; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const v = o.verified;

  const submit = async () => {
    if(busy)return;
    setBusy(true); setError(null);
    try {
      setSent(await enquire(o.id, form));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">{o.headline}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {o.siteName} · {o.tier} · {o.hostIndustry.replace(/_/g, ' ')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
          {inr(o.seekingInr)}
        </span>
      </div>

      <p className="mt-3 text-sm">{o.pitch}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-secondary/50 p-3 text-xs sm:grid-cols-4">
        <Fact label="Credited" value={`${Math.round(v.creditedCo2Kg).toLocaleString('en-IN')} kg`} />
        <Fact
          label="Claim accuracy"
          value={v.claimAccuracy === null ? 'not verified yet' : `${(v.claimAccuracy * 100).toFixed(1)}%`}
          tone={v.claimAccuracy === null ? 'muted' : v.claimAccuracy > 0.95 ? 'good' : 'warn'}
        />
        <Fact label="Checks" value={String(v.checkCount)} />
        <Fact label="Harvested" value={`${Math.round(v.harvestedKg).toLocaleString('en-IN')} kg`} />
      </dl>
      <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
        Verified from our own records, not supplied by the operator.
      </p>

      <p className="mt-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Use of funds:</strong> {o.useOfFunds}
        {o.expandToM2 && ` · expanding to ${(o.expandToM2 / 10_000).toFixed(1)} ha`}
      </p>

      <RelatedLinks siteId={o.siteId}/><SellerTrust siteId={o.siteId}/>
      {sent ? (
        <div className="mt-4 rounded-lg border border-status-optimal/40 bg-status-optimal/5 p-3 text-sm">
          <p className="font-semibold">Contact them directly</p>
          <p className="mt-1">
            {sent.contact.name} · {sent.contact.email}
            {sent.contact.phone && ` · ${sent.contact.phone}`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{sent.note}</p>
        </div>
      ) : open ? (
        <DetailSheet title={`Contact ${o.siteName}`} onClose={()=>setOpen(false)}><form className="market-form" onSubmit={e=>{e.preventDefault();void submit();}}>
          {(['investorName', 'investorEmail', 'organisation'] as const).map((k) => (
            <input
              key={k} aria-label={k==='investorName'?'Your name':k==='investorEmail'?'Email':'Organisation (optional)'} type={k==='investorEmail'?'email':'text'} required={k!=='organisation'} disabled={busy}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={
                k === 'investorName' ? 'Your name'
                  : k === 'investorEmail' ? 'Email' : 'Organisation (optional)'
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          ))}
          <textarea aria-label="Your message" required disabled={busy}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="What would you like to know?"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit" disabled={busy||!form.investorName.trim()||!form.investorEmail.trim()||!form.message.trim()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Register interest'}
          </button>
        </form></DetailSheet>
      ) : (
        <button
          type="button" onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-md border border-border px-4 py-2 text-sm font-semibold hover:border-accent"
        >
          Contact this farm
        </button>
      )}
    </article>
  );
}

function Fact({ label, value, tone = 'default' }: {
  label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'muted';
}) {
  const cls = tone === 'good' ? 'text-status-optimal'
    : tone === 'warn' ? 'text-status-warning'
      : tone === 'muted' ? 'text-muted-foreground' : '';
  return (
    <div>
      <dt className="uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}
