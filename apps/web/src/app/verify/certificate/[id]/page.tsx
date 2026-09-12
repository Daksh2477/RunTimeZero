/**
 * A retirement certificate.
 *
 * This is the page a company links to in a sustainability report, so it has
 * to stand on its own: who claimed how much, from where, and a route back to
 * the evidence. It is deliberately public and deliberately plain.
 *
 * It states what it is NOT, too. A retirement is a claim against the named
 * party's emissions; it is not an audit opinion and not a compliance
 * instrument under the CCTS. Saying so here costs nothing and stops the page
 * being used as something it is not.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Certificate {
  certificateId: string; kg: number; beneficiary: string; retiredAt: string;
  siteName: string; disposition: string; periodStart: string; periodEnd: string;
  batchId: string; reportHash: string | null; anchored: boolean;
  txHash: string | null; note: string;
}

export default async function CertificatePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BASE}/verify/certificate/${id}`, { cache: 'no-store' })
    .catch(() => null);
  if (!res || !res.ok) notFound();
  const c: Certificate = await res.json();

  return (
    <main className="wrap certificate">
      <article className="certificate-card">
        <p className="eyebrow">RETIREMENT CERTIFICATE</p>
        <h1>
          {Math.round(c.kg).toLocaleString('en-IN')} kg CO₂
          <span>retired permanently</span>
        </h1>

        <dl className="certificate-facts">
          <div><dt>Claimed by</dt><dd>{c.beneficiary}</dd></div>
          <div><dt>Retired on</dt><dd>{c.retiredAt.slice(0, 10)}</dd></div>
          <div><dt>Captured at</dt><dd>{c.siteName}</dd></div>
          <div><dt>During</dt><dd>{c.periodStart.slice(0, 10)} – {c.periodEnd.slice(0, 10)}</dd></div>
          <div><dt>Stored as</dt><dd>{c.disposition.replace(/_/g, ' ')}</dd></div>
          <div><dt>Certificate</dt><dd className="mono">{c.certificateId}</dd></div>
        </dl>

        <p className="certificate-hash">
          Evidence hash <span className="mono">{c.reportHash ?? 'not recorded'}</span>
        </p>

        <p className="helper">{c.note}</p>

        <p className="helper">
          {c.anchored
            ? `Anchored on chain: ${c.txHash}`
            : 'Recorded here and reproducible from the evidence hash. Not '
              + 'anchored on a public chain on this deployment.'}
        </p>

        <Link className="button" href={`/verify/batch/${c.batchId}`}>
          See the evidence it was issued against
        </Link>

        <p className="helper certificate-scope">
          This records a retirement on this platform. It is not an audit
          opinion, and it is not a compliance instrument under India&rsquo;s
          Carbon Credit Trading Scheme — offsets cannot discharge a
          compliance obligation there.
        </p>
      </article>
    </main>
  );
}
