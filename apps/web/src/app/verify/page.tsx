/**
 * Landing page for public verification.
 *
 * Someone arriving here has usually been handed a credit and wants to know
 * whether it means anything. So the page leads with what we do to a claim,
 * then lists real checks they can open — including the ones that failed,
 * because a verifier that only shows its successes verifies nothing.
 */

export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Row {
  checkId: string;
  verdict: string;
  pondLabel: string;
  siteName: string;
  claimedCo2Kg: number;
  creditableCo2Kg: number;
  computedAt: string;
}

async function recent(): Promise<Row[] | null> {
  try {
    const r = await fetch(`${BASE}/verify`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as Row[];
  } catch {
    return null;
  }
}

const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`);

export default async function VerifyIndex() {
  const rows = await recent();

  return (
    <main className="wrap">
      <div className="lede">
        <h1>Check a carbon claim</h1>
        <p>
          Every credit here was checked against evidence the operator does not control
          — satellite imagery, weighed harvests, and the sunlight that actually fell on
          the pond. We credit the lower of what was claimed and what that evidence
          supports, so overstating earns nothing.
        </p>
      </div>

      {!rows ? (
        <div className="empty">
          The API isn&rsquo;t running. Start it with <code>npm run api</code>.
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          Nothing verified yet. Run <code>npm run replay</code> to generate history.
        </div>
      ) : (
        <section className="site">
          <div className="site-head">
            <div className="site-name">Recent verifications</div>
            <span className="site-meta">{rows.length} checks</span>
          </div>
          {rows.map((r) => {
            const ratio = r.claimedCo2Kg > 0 ? r.creditableCo2Kg / r.claimedCo2Kg : 0;
            const short = 1 - ratio > 0.1;
            return (
              <a className="pond" key={r.checkId} href={`/verify/${r.checkId}`}>
                <div className="pond-top">
                  <span className="pond-label">{r.pondLabel}</span>
                  <span className={`verdict ${r.verdict}`}>{r.verdict}</span>
                  <span className="pond-figures num">
                    <strong>{t(r.creditableCo2Kg)}</strong> verified
                  </span>
                </div>
                <div className={`bar${short ? ' is-short' : ''}`}>
                  <div className="bar-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
                <div className="bar-caption">
                  <span>{r.siteName}</span>
                  <span className="num">
                    {short ? `${Math.round((1 - ratio) * 100)}% unsupported` : 'fully supported'}
                  </span>
                </div>
              </a>
            );
          })}
        </section>
      )}
    </main>
  );
}
