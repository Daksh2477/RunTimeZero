/**
 * Verifying an issued batch — the thing a buyer actually holds.
 *
 * The older /verify/[id] resolves one pond-fortnight, which is the raw
 * material. This resolves the whole chain: what was claimed, what the
 * evidence supported, what was refused, the hash of the report that proves
 * it, every check that fed it, and who has retired against it since.
 *
 * No account required. Provenance that only the seller can read is not
 * provenance, so this page is deliberately public.
 *
 * Server-rendered with no interactive children, so there is nothing here to
 * hydrate — see components/sim-workspace.tsx for why that matters.
 */

import Link from 'next/link';
import { RelatedLinks, Breadcrumbs } from '@/components/related-links';
import { notFound } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Check {
  id: string; pondLabel: string; windowStart: string; windowEnd: string;
  claimedCo2Kg: number; independentCo2Kg: number; independentLowCo2Kg: number;
  ceilingCo2Kg: number; creditableCo2Kg: number; verdict: string; reason: string;
}
interface Batch {
  batchId: string; siteName: string; tier: string; hostIndustry: string;
  periodStart: string; periodEnd: string;
  claimedCo2Kg: number; creditableCo2Kg: number; refusedCo2Kg: number;
  ceilingCo2Kg: number; disposition: string; dispositionEvidenceRef: string | null;
  reportHash: string | null; anchored: boolean; txHash: string | null;
  issuedAt: string; retiredKg: number; outstandingKg: number;
  retirements: { id: string; kg: number; beneficiary: string; retiredAt: string }[];
  checks: Check[];
}

const kg = (v: number) => `${Math.round(v).toLocaleString('en-IN')} kg`;

export default async function BatchVerification({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BASE}/verify/batch/${id}`, { cache: 'no-store' })
    .catch(() => null);
  if (!res || !res.ok) notFound();
  const b: Batch = await res.json();

  const refusedPct = b.claimedCo2Kg > 0 ? (b.refusedCo2Kg / b.claimedCo2Kg) * 100 : 0;

  return (
    <main className="wrap verify-batch">
      <RelatedLinks batchId={id}/><Breadcrumbs items={[{href:"/console/market",label:"Market"},{href:`/verify/batch/${id}`,label:"Batch"}]}/>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BATCH VERIFICATION</p>
          <h1>{b.siteName}</h1>
          <p>
            {b.periodStart.slice(0, 10)} to {b.periodEnd.slice(0, 10)} ·{' '}
            {b.tier} · {b.hostIndustry.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      <section className="verify-ledger">
        <Row label="Operator claimed" value={kg(b.claimedCo2Kg)} />
        <Row label="Physics ceiling for this period" value={kg(b.ceilingCo2Kg)} muted
          note="The most photosynthesis could possibly fix on this area, at this latitude, in these weeks." />
        <Row label="Refused — evidence did not support it" value={kg(b.refusedCo2Kg)} tone="warn"
          note={`${refusedPct.toFixed(1)}% of the claim.`} />
        <Row label="Credited" value={kg(b.creditableCo2Kg)} tone="good" strong
          note="The lower of what was claimed and what the evidence supports, summed per check." />
      </section>

      <section className="verify-block">
        <h2>Is it still what was published?</h2>
        <p className="helper">
          The report is hashed over canonical JSON, so anyone holding these
          same checks can recompute it and compare. If a single figure below
          had been altered, this hash would not match.
        </p>
        <p className="verify-hash">{b.reportHash ?? 'not recorded'}</p>
        <p className="helper">
          {b.anchored
            ? `Anchored on chain: ${b.txHash}`
            : 'Not anchored on a public chain on this deployment — no signing '
              + 'key is configured. The hash above is still reproducible from '
              + 'the database, which is what makes the figures checkable.'}
        </p>
      </section>

      <section className="verify-block">
        <h2>What happened to the biomass</h2>
        <p>
          <strong>{b.disposition.replace(/_/g, ' ')}</strong>
          {b.dispositionEvidenceRef && <> · reference {b.dispositionEvidenceRef}</>}
        </p>
        <p className="helper">
          Only buried, biochar and bioplastic keep carbon out of the air. Feed
          and fertiliser return it within a season and cannot be issued as
          removal at all.
        </p>
      </section>

      <section className="verify-block">
        <h2>The {b.checks.length} windows behind this batch</h2>
        <div className="verify-table-wrap">
          <table className="verify-table">
            <thead>
              <tr>
                <th>Pond</th><th>Window</th>
                <th className="num-col">Claimed</th>
                <th className="num-col">Evidence, low</th>
                <th className="num-col">Ceiling</th>
                <th className="num-col">Credited</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {b.checks.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/verify/${c.id}`}>{c.pondLabel} report</Link></td>
                  <td className="nowrap">{c.windowStart.slice(0, 10)}</td>
                  <td className="num-col">{kg(c.claimedCo2Kg)}</td>
                  <td className="num-col">{kg(c.independentLowCo2Kg)}</td>
                  <td className="num-col">{kg(c.ceilingCo2Kg)}</td>
                  <td className="num-col strong">{kg(c.creditableCo2Kg)}</td>
                  <td>{c.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="helper">
          Credited is the lower of claimed, the bottom of the independent
          band, and the ceiling — per window. They are summed, never netted,
          so a pond that overstated cannot be cancelled out by one that did not.
        </p>
      </section>

      <section className="verify-block">
        <h2>Retirements against this batch</h2>
        <p className="helper">
          {kg(b.retiredKg)} retired · {kg(b.outstandingKg)} still outstanding.
          Retirement is permanent; retired tonnage can never be resold.
        </p>
        <ul className="verify-retirements">
          {b.retirements.map((r) => (
            <li key={r.id}>
              <strong>{kg(r.kg)}</strong> claimed by {r.beneficiary}{' '}
              <span className="helper">on {r.retiredAt.slice(0, 10)}</span>{' '}
              <Link href={`/verify/certificate/${r.id}`}>certificate →</Link>
            </li>
          ))}
          {b.retirements.length === 0 && <li className="helper">None yet.</li>}
        </ul>
      </section>

      <p className="helper page-note">
        <Link href="/console/market">Back to the marketplace</Link>
      </p>
    </main>
  );
}

function Row({ label, value, note, tone, strong, muted }: {
  label: string; value: string; note?: string;
  tone?: 'good' | 'warn'; strong?: boolean; muted?: boolean;
}) {
  return (
    <div className={`verify-row${strong ? ' is-strong' : ''}${muted ? ' is-muted' : ''}`}>
      <div>
        <span className="verify-row-label">{label}</span>
        {note && <span className="helper">{note}</span>}
      </div>
      <span className={`verify-row-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
    </div>
  );
}
