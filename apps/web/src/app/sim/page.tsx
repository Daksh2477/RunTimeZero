'use client';

/**
 * Public pond simulator.
 *
 * Runs the same Rust twin the verification engine uses. That is the point: a
 * stranger can check our physics without an account and without trusting us,
 * and because both sides share one WASM build they cannot quietly disagree.
 *
 * The economics are shown with their assumptions visible. A projection whose
 * inputs you cannot see is not useful to someone deciding whether to build a
 * pond — and the honest answer here is usually that biomass and carbon alone
 * do not cover the cost, which is exactly why we site on wastewater.
 */

import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SimResult {
  daily: { day: number; co2Kg: number; opticalDensity: number; temperatureC: number }[];
  totals: {
    co2Kg: number;
    harvestedDryKg: number;
    ceilingCo2Kg: number;
    ceilingUtilisation: number;
    yieldGPerM2PerDay: number;
  };
  economics: {
    energyCostInr: number;
    labourCostInr: number;
    harvestCostInr: number;
    totalCostInr: number;
    biomassRevenueInr: number;
    creditRevenueInr: number;
    netInr: number;
    assumptions: Record<string, number>;
    note: string;
  };
}

const PRESETS = [
  { name: 'Smallholder plot', areaM2: 400, depthM: 0.22, latDeg: 21.76 },
  { name: 'Dairy co-op pond', areaM2: 1200, depthM: 0.25, latDeg: 22.56 },
  { name: 'Textile effluent works', areaM2: 8000, depthM: 0.3, latDeg: 21.17 },
  { name: 'CETP facility', areaM2: 33000, depthM: 0.3, latDeg: 23.07 },
];

const inr = (v: number) =>
  Math.abs(v) >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : `₹${Math.round(v).toLocaleString('en-IN')}`;

function Chart({ daily }: { daily: SimResult['daily'] }) {
  if (daily.length < 2) return null;
  const max = Math.max(...daily.map((d) => d.co2Kg)) || 1;
  const w = 100 / daily.length;
  return (
    <svg
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
      style={{ width: '100%', height: 120, display: 'block' }}
      role="img"
      aria-label="Daily CO2 fixed"
    >
      {daily.map((d) => (
        <rect
          key={d.day}
          x={(d.day - 1) * w}
          y={44 - (d.co2Kg / max) * 42}
          width={w * 0.82}
          height={Math.max(0.4, (d.co2Kg / max) * 42)}
          fill="var(--culture)"
        />
      ))}
    </svg>
  );
}

export default function SimPage() {
  const [areaM2, setArea] = useState(10000);
  const [depthM, setDepth] = useState(0.3);
  const [days, setDays] = useState(30);
  const [latDeg, setLat] = useState(23.03);
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ areaM2, depthM, days, latDeg }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setResult((await res.json()) as SimResult);
    } catch {
      setError('Could not reach the API. Start it with npm run api.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <div className="lede">
        <h1>Try a pond</h1>
        <p>
          This runs the same physics the verification engine uses — solar geometry,
          Monod growth kinetics, and self-shading through the water column. No account,
          and nothing here is tuned to flatter the result.
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>Configure</h2>
            <p className="sub">Start from a real site, or set your own.</p>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="preset"
                  onClick={() => {
                    setArea(p.areaM2);
                    setDepth(p.depthM);
                    setLat(p.latDeg);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <label className="field">
              <span>Pond area</span>
              <span className="field-value num">{areaM2.toLocaleString()} m²</span>
              <input type="range" min={400} max={50000} step={100} value={areaM2}
                onChange={(e) => setArea(Number(e.target.value))} />
            </label>

            <label className="field">
              <span>Depth</span>
              <span className="field-value num">{depthM.toFixed(2)} m</span>
              <input type="range" min={0.15} max={0.6} step={0.01} value={depthM}
                onChange={(e) => setDepth(Number(e.target.value))} />
            </label>

            <label className="field">
              <span>Latitude</span>
              <span className="field-value num">{latDeg.toFixed(2)}°</span>
              <input type="range" min={8} max={35} step={0.01} value={latDeg}
                onChange={(e) => setLat(Number(e.target.value))} />
            </label>

            <label className="field">
              <span>Run for</span>
              <span className="field-value num">{days} days</span>
              <input type="range" min={7} max={120} step={1} value={days}
                onChange={(e) => setDays(Number(e.target.value))} />
            </label>

            <button type="button" className="run" onClick={run} disabled={busy}>
              {busy ? 'Running…' : 'Run simulation'}
            </button>
            {error && <p className="err">{error}</p>}
          </section>
        </div>

        <div>
          {!result ? (
            <div className="empty">
              Set a pond size and run it. Deeper ponds shade themselves more; ponds
              nearer the equator get more light but also more heat stress.
            </div>
          ) : (
            <>
              <section className="panel">
                <h2>What it produces</h2>
                <p className="sub">Daily CO₂ fixed over {days} days.</p>
                <Chart daily={result.daily} />
                <dl className="kv" style={{ marginTop: 14 }}>
                  <dt>CO₂ fixed</dt>
                  <dd className="num">{result.totals.co2Kg.toLocaleString()} kg</dd>
                  <dt>Harvested, dry</dt>
                  <dd className="num">{result.totals.harvestedDryKg.toLocaleString()} kg</dd>
                  <dt>Yield</dt>
                  <dd className="num">{result.totals.yieldGPerM2PerDay} g/m²/day</dd>
                  <dt>Physics ceiling</dt>
                  <dd className="num">{result.totals.ceilingCo2Kg.toLocaleString()} kg</dd>
                  <dt>Ran at</dt>
                  <dd className="num">
                    {Math.round(result.totals.ceilingUtilisation * 100)}% of the ceiling
                  </dd>
                </dl>
                <p style={{ fontSize: 12.5, color: 'var(--silt)', margin: '10px 0 0' }}>
                  Real ponds land well under the ceiling. Anything approaching 100% would
                  mean the model had drifted, not that the pond was exceptional.
                </p>
              </section>

              <section className="panel">
                <h2>What it costs</h2>
                <p className="sub">Rough shape, with every rate shown so you can disagree.</p>
                <dl className="kv">
                  <dt>Electricity</dt>
                  <dd className="num">{inr(result.economics.energyCostInr)}</dd>
                  <dt>Harvesting</dt>
                  <dd className="num">{inr(result.economics.harvestCostInr)}</dd>
                  <dt>Labour</dt>
                  <dd className="num">{inr(result.economics.labourCostInr)}</dd>
                  <dt>Biomass revenue</dt>
                  <dd className="num">{inr(result.economics.biomassRevenueInr)}</dd>
                  <dt>Carbon credits</dt>
                  <dd className="num">{inr(result.economics.creditRevenueInr)}</dd>
                </dl>
                <div className={`net${result.economics.netInr < 0 ? ' is-negative' : ''}`}>
                  <span>Net over {days} days</span>
                  <span className="num">{inr(result.economics.netInr)}</span>
                </div>
                {result.economics.netInr < 0 && (
                  <p style={{ fontSize: 13, margin: '12px 0 0', lineHeight: 1.5 }}>
                    This is the normal result, and it is why we site ponds on somebody
                    else&rsquo;s wastewater. Nutrients arrive free, the host is already paying
                    to treat the effluent, and sunlight replaces the blowers that use most
                    of a treatment plant&rsquo;s electricity. A pond built to sell carbon does
                    not survive; one built to discharge an effluent obligation does.
                  </p>
                )}
                <p style={{ fontSize: 12, color: 'var(--silt)', margin: '10px 0 0' }}>
                  {result.economics.note}
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
