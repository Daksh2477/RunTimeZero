/**
 * Fleet board.
 *
 * An operator with twelve ponds does not want twelve equal tiles — they want
 * to know which one to walk to first. So each row is itself the chart: full
 * width is what was claimed, the filled portion is what the evidence supports.
 * The shortfall is visible before you read a single number.
 */

import { getFleet, type FleetPond } from '@/lib/api';

export const dynamic = 'force-dynamic';

function kg(v: number | null): string {
  if (v === null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;
}

function fillRatio(p: FleetPond): number {
  if (!p.claimedCo2Kg || p.claimedCo2Kg <= 0) return 0;
  if (p.creditableCo2Kg === null) return 0;
  return Math.max(0, Math.min(1, p.creditableCo2Kg / p.claimedCo2Kg));
}

function PondRow({ pond }: { pond: FleetPond }) {
  const ratio = fillRatio(pond);
  const shortfall = 1 - ratio;
  // A tenth of the claim unsupported is worth noticing; below that it is noise.
  const isShort = shortfall > 0.1 && pond.claimedCo2Kg !== null;
  const verdict = pond.verdict ?? 'none';

  return (
    <a className="pond" href={`/console/pond/${pond.id}`}>
      <div className="pond-top">
        <span className="pond-label">{pond.label}</span>
        <span className={`verdict ${verdict}`}>
          {verdict === 'none' ? 'not yet checked' : verdict}
        </span>
        {pond.advisoryCount > 0 && (
          <span className="flagmark">
            {pond.advisoryCount} advisor{pond.advisoryCount === 1 ? 'y' : 'ies'}
          </span>
        )}
        <span className="pond-figures num">
          <strong>{kg(pond.creditableCo2Kg)}</strong> credited
        </span>
      </div>

      <div className={`bar${isShort ? ' is-short' : ''}`}>
        <div className="bar-fill" style={{ width: `${ratio * 100}%` }} />
      </div>

      <div className="bar-caption">
        <span className="num">{kg(pond.claimedCo2Kg)} claimed</span>
        <span className="num">
          {isShort
            ? `${Math.round(shortfall * 100)}% unsupported`
            : 'supported by evidence'}
        </span>
      </div>
    </a>
  );
}

export default async function ConsolePage() {
  const fleet = await getFleet();

  if (!fleet) {
    return (
      <main className="wrap">
        <div className="lede">
          <h1>Can&rsquo;t reach the API</h1>
          <p>Start it, then reload this page.</p>
        </div>
        <div className="empty">
          <p>
            <code>export DATABASE_URL=&quot;postgresql:///algacarbon?host=/var/run/postgresql&quot;</code>
          </p>
          <p>
            <code>npm run api</code>
          </p>
        </div>
      </main>
    );
  }

  const ponds = fleet.flatMap((s) => s.ponds);
  const unsupported = ponds.filter(
    (p) => p.claimedCo2Kg && p.creditableCo2Kg !== null && p.creditableCo2Kg < p.claimedCo2Kg * 0.9,
  ).length;

  return (
    <main className="wrap">
      <div className="lede">
        <h1>Fleet</h1>
        <p>
          {ponds.length} ponds across {fleet.length} sites.{' '}
          {unsupported > 0
            ? `${unsupported} claiming more than the evidence supports.`
            : 'Every claim is backed by independent evidence.'}
        </p>
      </div>

      {ponds.length === 0 ? (
        <div className="empty">
          <p>No ponds yet.</p>
          <p>
            Run <code>npm run db:seed</code> then <code>npm run replay</code>.
          </p>
        </div>
      ) : (
        fleet.map((site) => (
          <section className="site" key={site.id}>
            <div className="site-head">
              <div>
                <div className="site-name">{site.name}</div>
                <div className="site-meta">
                  {site.hostIndustry.replace(/_/g, ' ')} ·{' '}
                  <span className="num">{site.totalAreaM2.toLocaleString()} m²</span>
                </div>
              </div>
              <a className="tier tier-link" href={`/console/site/${site.id}`}>
                {site.tier} · costs
              </a>
            </div>
            {site.ponds.map((p) => (
              <PondRow key={p.id} pond={p} />
            ))}
          </section>
        ))
      )}
    </main>
  );
}
