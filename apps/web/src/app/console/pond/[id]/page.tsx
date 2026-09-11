/**
 * Pond detail.
 *
 * The depth chart is the one loud element on this page, and it earns it: three
 * bands scaled to the physics ceiling showing what was claimed, what the
 * evidence supports as a range, and what is physically possible. Whether the
 * claim sits inside the evidence is readable in about a second.
 */

import { getPond, type Advisory } from '@/lib/api';

export const dynamic = 'force-dynamic';

function kg(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} t` : `${Math.round(v)} kg`;
}

function inr(v: number | null): string {
  if (v === null) return '—';
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

/** Simple polyline over a series, normalised to its own range. */
function Spark({ values, colour }: { values: number[]; colour: string }) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pts = clean
    .map((v, i) => {
      const x = (i / (clean.length - 1)) * 100;
      const y = 46 - ((v - min) / span) * 40;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={colour} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Series({
  label, values, unit, colour,
}: { label: string; values: (number | null)[]; unit: string; colour: string }) {
  const nums = values.filter((v): v is number => v !== null);
  const latest = nums[nums.length - 1];
  return (
    <div className="spark-row">
      <div className="spark-head">
        <span>{label}</span>
        <b className="num">{latest === undefined ? '—' : `${latest.toFixed(1)}${unit}`}</b>
      </div>
      <Spark values={nums} colour={colour} />
    </div>
  );
}

function AdvisoryItem({ a }: { a: Advisory }) {
  return (
    <div className="advisory">
      <div className="advisory-head">
        <span className={`sev ${a.severity}`} />
        <span className="advisory-title">{a.title}</span>
        {a.hoursToAct !== null && (
          <span className="pond-figures num">{a.hoursToAct}h to act</span>
        )}
      </div>
      <p className="advisory-detail">{a.detail}</p>
      <div className="advisory-action">{a.action}</div>
      {a.costOfInactionInr !== null && (
        <div className="advisory-cost">
          Acting costs {inr(a.costOfActingInr)} · not acting costs{' '}
          <b>{inr(a.costOfInactionInr)}</b>
        </div>
      )}
    </div>
  );
}

export default async function PondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPond(id);

  if (!data) {
    return (
      <main className="wrap">
        <a className="back" href="/console">← Fleet</a>
        <div className="empty">Pond not found, or the API isn&rsquo;t running.</div>
      </main>
    );
  }

  const { pond, telemetry, observations, harvests, advisories, latestCheck, ceilingCo2Kg } = data;

  const claimed = Number(latestCheck?.claimed_co2_kg ?? 0);
  const indep = Number(latestCheck?.independent_co2_kg ?? 0);
  const low = Number(latestCheck?.independent_low_co2_kg ?? 0);
  const high = Number(latestCheck?.independent_high_co2_kg ?? 0);
  const ceiling = Number(latestCheck?.ceiling_co2_kg ?? ceilingCo2Kg);
  const credited = Number(latestCheck?.creditable_co2_kg ?? 0);
  const verdict = String(latestCheck?.verdict ?? 'none');

  // Everything is drawn against the ceiling, so the bands stay comparable and
  // you can see how much headroom an honest pond actually has.
  const scale = Math.max(ceiling, claimed, high) || 1;
  const pc = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;

  return (
    <main className="wrap">
      <a className="back" href="/console">← Fleet</a>

      <div className="lede">
        <h1>{pond.label}</h1>
        <p>
          {pond.siteName} · <span className="num">{pond.areaM2.toLocaleString()} m²</span> ·{' '}
          {pond.widthM >= 40
            ? 'wide enough for satellite'
            : `${pond.widthM} m wide — too narrow for satellite, verified by drone or weighbridge`}
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>Claim against evidence</h2>
            <p className="sub">
              Everything scaled to the physics ceiling — the most this pond could
              possibly have absorbed given its area, latitude and the sunlight it received.
            </p>

            <div className="depth">
              <div className="depth-row">
                <div className="depth-label">
                  <span>Operator claimed</span>
                  <span className="num">{kg(claimed)}</span>
                </div>
                <div className="depth-track">
                  <div className="depth-bar claimed" style={{ width: pc(claimed) }} />
                  <div className="depth-ceiling" style={{ left: pc(ceiling) }} />
                </div>
              </div>

              <div className="depth-row">
                <div className="depth-label">
                  <span>Independent evidence</span>
                  <span className="num">{kg(low)} – {kg(high)}</span>
                </div>
                <div className="depth-track">
                  <div
                    className="depth-bar evidence"
                    style={{ left: pc(low), width: pc(Math.max(0, high - low)) }}
                  />
                  <div className="depth-bar evidence-mid" style={{ left: pc(indep) }} />
                  <div className="depth-ceiling" style={{ left: pc(ceiling) }} />
                </div>
              </div>

              <div className="depth-row">
                <div className="depth-label">
                  <span>Credited</span>
                  <span className="num">{kg(credited)}</span>
                </div>
                <div className="depth-track">
                  <div className="depth-bar" style={{ width: pc(credited), background: 'var(--culture)' }} />
                  <div className="depth-ceiling" style={{ left: pc(ceiling) }} />
                </div>
              </div>
            </div>

            {latestCheck?.reason && (
              <div className={`reason${verdict === 'flagged' ? ' is-flagged' : ''}`}>
                {String(latestCheck.reason)}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Conditions</h2>
            <p className="sub">Last 14 days, as reported by the pond&rsquo;s own instruments.</p>
            <Series label="Temperature" unit="°C" colour="var(--rust)"
              values={telemetry.map((t) => t.temperatureC)} />
            <Series label="pH" unit="" colour="var(--water)"
              values={telemetry.map((t) => t.ph)} />
            <Series label="Dissolved oxygen" unit=" mg/L" colour="var(--culture)"
              values={telemetry.map((t) => t.dissolvedOxygenMgL)} />
            <Series label="Density" unit=" OD" colour="var(--sun)"
              values={telemetry.map((t) => t.opticalDensity)} />
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>What to do</h2>
            <p className="sub">
              {advisories.length === 0
                ? 'Nothing needs attention.'
                : `${advisories.length} item${advisories.length === 1 ? '' : 's'}, most urgent first.`}
            </p>
            {advisories.map((a) => (
              <AdvisoryItem key={a.kind} a={a} />
            ))}
          </section>

          <section className="panel">
            <h2>Evidence trail</h2>
            <p className="sub">Sources a verifier can re-fetch independently.</p>
            <dl className="kv">
              {observations.slice(-5).map((o) => (
                <div key={o.sourceRef} style={{ display: 'contents' }}>
                  <dt>{o.observedAt.slice(0, 10)}</dt>
                  <dd style={{ fontSize: 12 }}>{o.sourceRef}</dd>
                </div>
              ))}
              {harvests.map((h) => (
                <div key={h.harvestedAt} style={{ display: 'contents' }}>
                  <dt>{h.harvestedAt.slice(0, 10)}</dt>
                  <dd className="num" style={{ fontSize: 12 }}>
                    harvest {Math.round(h.dryMassKg)} kg dry
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
