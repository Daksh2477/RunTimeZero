/**
 * Site economics.
 *
 * The panel exists to answer one question — where is the money going — and the
 * answer is usually surprising: growing the algae is cheap, and getting it out
 * of the water is not. Separation and drying dominate, and which method you
 * chose swings the total by an order of magnitude.
 *
 * So the page leads with that split rather than with a total, because the total
 * is not actionable and the split is.
 */

export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Economics {
  breakdown: { category: string; totalInr: number; energyKwh: number | null }[];
  totalCostInr: number;
  creditedCo2Kg: number;
  costPerTonneCo2Inr: number | null;
}

async function getEconomics(id: string): Promise<Economics | null> {
  try {
    const r = await fetch(`${BASE}/fleet/site/${id}/economics`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as Economics;
  } catch {
    return null;
  }
}

const LABELS: Record<string, string> = {
  paddlewheel: 'Paddlewheel mixing',
  pumping: 'Pumping',
  harvesting: 'Harvesting',
  drying: 'Drying',
  nutrients: 'Nutrients',
  co2: 'CO₂',
  make_up_water: 'Make-up water',
  labour: 'Labour',
  maintenance: 'Maintenance',
  platform: 'Monitoring',
};

/** Separation is harvesting plus drying — the pair that dominates. */
const SEPARATION = new Set(['harvesting', 'drying']);

const inr = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : `₹${Math.round(v).toLocaleString('en-IN')}`;

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getEconomics(id);

  if (!e || e.breakdown.length === 0) {
    return (
      <main className="wrap">
        <a className="back" href="/console">← Fleet</a>
        <div className="empty">
          No expenses recorded. Run <code>npm run db:expenses</code>.
        </div>
      </main>
    );
  }

  const separationCost = e.breakdown
    .filter((b) => SEPARATION.has(b.category))
    .reduce((s, b) => s + b.totalInr, 0);
  const separationShare = e.totalCostInr > 0 ? separationCost / e.totalCostInr : 0;
  const max = Math.max(...e.breakdown.map((b) => b.totalInr)) || 1;
  const totalKwh = e.breakdown.reduce((s, b) => s + (b.energyKwh ?? 0), 0);

  return (
    <main className="wrap">
      <a className="back" href="/console">← Fleet</a>

      <div className="lede">
        <h1>{Math.round(separationShare * 100)}% of cost is getting algae out of the water</h1>
        <p>
          Growing it is the cheap part. Harvesting and drying came to{' '}
          {inr(separationCost)} of {inr(e.totalCostInr)} over the last 14 days — and
          which method you use swings that by an order of magnitude.
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>Where the money went</h2>
            <p className="sub">Derived from pond area and the mass actually harvested.</p>
            {e.breakdown.map((b) => (
              <div className="cost-row" key={b.category}>
                <div className="cost-head">
                  <span>
                    {LABELS[b.category] ?? b.category}
                    {SEPARATION.has(b.category) && <em className="sep-tag">separation</em>}
                  </span>
                  <span className="num">{inr(b.totalInr)}</span>
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(b.totalInr / max) * 100}%`,
                      background: SEPARATION.has(b.category) ? 'var(--rust)' : 'var(--culture)',
                    }}
                  />
                </div>
                {b.energyKwh !== null && b.energyKwh > 0 && (
                  <div className="bar-caption">
                    <span className="num">{b.energyKwh.toLocaleString()} kWh</span>
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Per tonne</h2>
            <dl className="kv">
              <dt>Total cost</dt>
              <dd className="num">{inr(e.totalCostInr)}</dd>
              <dt>Electricity</dt>
              <dd className="num">{totalKwh.toLocaleString()} kWh</dd>
              <dt>CO₂ credited</dt>
              <dd className="num">{Math.round(e.creditedCo2Kg).toLocaleString()} kg</dd>
              <dt>Cost per tonne</dt>
              <dd className="num">
                {e.costPerTonneCo2Inr ? inr(e.costPerTonneCo2Inr) : '—'}
              </dd>
            </dl>
            {e.costPerTonneCo2Inr && (
              <p style={{ fontSize: 13, margin: '12px 0 0', lineHeight: 1.5 }}>
                Roughly ${Math.round(e.costPerTonneCo2Inr / 83)} per tonne. Brilliant
                Planet&rsquo;s desert pilot runs near $850 — the difference is that they
                pay for nutrients and we are treating somebody&rsquo;s effluent, which
                they were already paying to treat.
              </p>
            )}
          </section>

          <section className="panel">
            <h2>What costs nothing</h2>
            <p className="sub">And why the pond is sited here rather than on open land.</p>
            <dl className="kv">
              <dt>Nutrients</dt>
              <dd>supplied by the effluent</dd>
              <dt>CO₂</dt>
              <dd>atmospheric and effluent-borne</dd>
            </dl>
            <p style={{ fontSize: 13, margin: '12px 0 0', lineHeight: 1.5 }}>
              Nitrogen and phosphorus would otherwise be a real purchase — CO₂ and
              nutrients together exceed $110 per tonne of biomass on a conventional
              site. Here the host was already paying to remove them.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
