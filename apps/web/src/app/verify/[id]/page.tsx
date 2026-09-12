/**
 * Public verification page.
 *
 * No account, no key, no login. Someone holding a credit — or deciding whether
 * to buy one — should be able to check it without asking us for access.
 * Provenance that only we can read is not provenance.
 *
 * The page is written for a buyer, not an engineer: plain sentences first, the
 * numbers that back them second, and the re-fetchable sources last so a sceptic
 * can go and look for themselves.
 */

export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Check {
  checkId: string;
  site: { name: string; tier: string; hostIndustry: string };
  pond: { label: string; areaM2: number; widthM: number };
  window: { start: string; end: string };
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  independentHighCo2Kg: number;
  ceilingCo2Kg: number;
  creditableCo2Kg: number;
  divergence: number;
  verdict: string;
  reason: string;
  computedAt: string;
  sources: { observedAt: string; channel: string; ref: string; cloudFraction: number | null }[];
  harvests: { harvestedAt: string; dryMassKg: number; ref: string | null }[];
}

async function getCheck(id: string): Promise<Check | null> {
  try {
    const r = await fetch(`${BASE}/verify/${id}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as Check;
  } catch {
    return null;
  }
}

const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${Math.round(kg)} kg`);
const day = (iso: string) => iso.slice(0, 10);

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCheck(id);

  if (!c) {
    return (
      <main className="wrap">
        <div className="lede">
          <h1>No record with that reference</h1>
          <p>Check the identifier, or browse recent verifications from /verify.</p>
        </div>
      </main>
    );
  }

  const shortfall = c.claimedCo2Kg > 0 ? 1 - c.creditableCo2Kg / c.claimedCo2Kg : 0;
  const scale = Math.max(c.ceilingCo2Kg, c.claimedCo2Kg, c.independentHighCo2Kg) || 1;
  const pc = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;

  // The headline sentence changes with the outcome, because a buyer wants the
  // answer before the arithmetic.
  const headline =
    shortfall > 0.02
      ? `${t(c.creditableCo2Kg)} verified, against ${t(c.claimedCo2Kg)} claimed`
      : `${t(c.creditableCo2Kg)} verified`;

  return (
    <main className="wrap">
      <div className="lede">
        <h1>{headline}</h1>
        <p>
          {c.pond.label} at {c.site.name}, {day(c.window.start)} to {day(c.window.end)}.
          Checked {day(c.computedAt)}.
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>How this figure was reached</h2>
            <p className="sub">
              The operator reported one number. We computed a second from evidence
              they do not control, and credited the lower of the two.
            </p>

            <div className="depth">
              <div className="depth-row">
                <div className="depth-label">
                  <span>Operator claimed</span>
                  <span className="num">{t(c.claimedCo2Kg)}</span>
                </div>
                <div className="depth-track">
                  <div className="depth-bar claimed" style={{ width: pc(c.claimedCo2Kg) }} />
                  <div className="depth-ceiling" style={{ left: pc(c.ceilingCo2Kg) }} />
                </div>
              </div>

              <div className="depth-row">
                <div className="depth-label">
                  <span>Independent evidence supports</span>
                  <span className="num">
                    {t(c.independentLowCo2Kg)} – {t(c.independentHighCo2Kg)}
                  </span>
                </div>
                <div className="depth-track">
                  <div
                    className="depth-bar evidence"
                    style={{
                      left: pc(c.independentLowCo2Kg),
                      width: pc(Math.max(0, c.independentHighCo2Kg - c.independentLowCo2Kg)),
                    }}
                  />
                  <div className="depth-bar evidence-mid" style={{ left: pc(c.independentCo2Kg) }} />
                  <div className="depth-ceiling" style={{ left: pc(c.ceilingCo2Kg) }} />
                </div>
              </div>

              <div className="depth-row">
                <div className="depth-label">
                  <span>Credited</span>
                  <span className="num">{t(c.creditableCo2Kg)}</span>
                </div>
                <div className="depth-track">
                  <div
                    className="depth-bar"
                    style={{ width: pc(c.creditableCo2Kg), background: 'var(--culture)' }}
                  />
                  <div className="depth-ceiling" style={{ left: pc(c.ceilingCo2Kg) }} />
                </div>
              </div>
            </div>

            <div className={`reason${c.verdict === 'flagged' ? ' is-flagged' : ''}`}>
              {c.reason}
            </div>
          </section>

          <section className="panel">
            <h2>The ceiling</h2>
            <p className="sub">
              The most this pond could physically have absorbed in that period.
            </p>
            <p style={{ fontSize: 14, margin: '0 0 10px' }}>
              A pond of {c.pond.areaM2.toLocaleString()} m² at this latitude received a
              knowable amount of sunlight between {day(c.window.start)} and{' '}
              {day(c.window.end)}. Photosynthesis has a hard limit of roughly eight photons
              per molecule of CO₂ fixed, which puts an absolute bound of{' '}
              <strong className="num">{t(c.ceilingCo2Kg)}</strong> on this window.
            </p>
            <p style={{ fontSize: 14, margin: 0, color: 'var(--silt)' }}>
              No cultivation system can exceed it, so any claim above that line is rejected
              outright. This figure uses no model and no training data — only pond geometry,
              latitude and the date. You can recompute it yourself.
            </p>
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Sources you can check</h2>
            <p className="sub">
              Every piece of evidence behind this figure, re-fetchable without us.
            </p>
            <dl className="kv">
              {c.sources.map((s) => (
                <div key={s.ref} style={{ display: 'contents' }}>
                  <dt>{day(s.observedAt)}</dt>
                  <dd style={{ fontSize: 12 }}>
                    {s.ref}
                    {s.cloudFraction !== null && s.cloudFraction > 0.3 && ' (cloudy, unused)'}
                  </dd>
                </div>
              ))}
              {c.harvests.map((h) => (
                <div key={h.harvestedAt} style={{ display: 'contents' }}>
                  <dt>{day(h.harvestedAt)}</dt>
                  <dd className="num" style={{ fontSize: 12 }}>
                    {h.ref} · {Math.round(h.dryMassKg)} kg dry
                  </dd>
                </div>
              ))}
            </dl>
            {c.sources.length === 0 && c.harvests.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--silt)', margin: 0 }}>
                No independent evidence in this window, so nothing was credited.
              </p>
            )}
          </section>

          <section className="panel">
            <h2>Site</h2>
            <dl className="kv">
              <dt>Host</dt>
              <dd>{c.site.hostIndustry.replace(/_/g, ' ')}</dd>
              <dt>Tier</dt>
              <dd>{c.site.tier}</dd>
              <dt>Pond area</dt>
              <dd className="num">{c.pond.areaM2.toLocaleString()} m²</dd>
              <dt>Verified by</dt>
              <dd>
                {c.pond.widthM >= 40 ? 'satellite' : 'drone or weighbridge'}
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
