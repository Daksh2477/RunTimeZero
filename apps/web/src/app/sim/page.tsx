'use client';
import { useRef, useState } from 'react';
import { PRESETS, type SimInputs, type SimResult } from '@/lib/simulation';
import { SimResults } from '@/components/sim-results';
import { EmptyState } from '@/components/ui';

export default function SimPage() {
  const [inputs, setInputs] = useState<SimInputs>({ areaM2: 1200, depthM: 0.25, days: 30, latDeg: 22.56 });
  const [completed, setCompleted] = useState<{ inputs: SimInputs; result: SimResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const results = useRef<HTMLDivElement>(null);
  const change = (key: keyof SimInputs, value: number) => setInputs((current) => ({ ...current, [key]: value }));
  async function run(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const requested = { ...inputs };
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requested), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('The estimate could not be calculated. Please try again shortly.');
      const result = await response.json() as SimResult;
      if (!Array.isArray(result.daily) || !Number.isFinite(result.totals?.co2Kg) || !Number.isFinite(result.economics?.totalCostInr)) throw new Error('The estimate was incomplete. Please try again.');
      setCompleted({ inputs: requested, result });
      requestAnimationFrame(() => { results.current?.focus({ preventScroll: true }); results.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
    } catch (e) { setError(e instanceof Error && e.name === 'Error' ? e.message : 'We couldn’t reach the calculator. Please try again shortly.'); }
    finally { setBusy(false); }
  }
  const changed = !!completed && JSON.stringify(inputs) !== JSON.stringify(completed.inputs);
  return <main className="wrap"><div className="page-heading"><div><p className="eyebrow">TRY A POND</p><h1>A little planning. A clearer picture.</h1><p>Choose an example pond, adjust its size, and estimate its algae production and running costs.</p></div></div>
    <div className="detail-grid sim-layout"><form onSubmit={run} className="panel"><h2>1. Start with an example</h2><p className="sub">These sample sizes give you a starting point. No farm data is changed.</p><fieldset className="fieldset" disabled={busy}><legend className="sr-only">Sample pond and settings</legend><div className="preset-grid">{PRESETS.map((p) => <button key={p.name} type="button" className="preset" aria-pressed={p.areaM2 === inputs.areaM2 && p.depthM === inputs.depthM && p.latDeg === inputs.latDeg} onClick={() => setInputs((current) => ({ ...current, areaM2: p.areaM2, depthM: p.depthM, latDeg: p.latDeg }))}><strong>{p.name}</strong><small>{p.size}</small></button>)}</div>
      <h2>2. Make it your own</h2>
      <div className="field"><div className="field-head"><label htmlFor="pond-area">Pond size (square metres)</label><input id="pond-area" type="number" min="400" max="50000" step="100" required value={inputs.areaM2} onChange={(e) => change('areaM2', Number(e.target.value))} /></div><input type="range" aria-label="Adjust pond size in square metres" min="400" max="50000" step="100" value={inputs.areaM2} onChange={(e) => change('areaM2', Number(e.target.value))} /><div className="range-labels"><span>400 m²</span><span>50,000 m²</span></div></div>
      <div className="field"><div className="field-head"><label htmlFor="pond-depth">Water depth (centimetres)</label><input id="pond-depth" type="number" min="15" max="60" step="1" required value={Math.round(inputs.depthM * 100)} onChange={(e) => change('depthM', Number(e.target.value) / 100)} /></div><input type="range" aria-label="Adjust water depth in centimetres" min="15" max="60" step="1" value={Math.round(inputs.depthM * 100)} onChange={(e) => change('depthM', Number(e.target.value) / 100)} /><div className="range-labels"><span>Shallow · 15 cm</span><span>Deep · 60 cm</span></div></div>
      <div className="field"><div className="field-head"><label htmlFor="pond-days">How many days?</label><input id="pond-days" type="number" min="7" max="120" step="1" required value={inputs.days} onChange={(e) => change('days', Number(e.target.value))} /></div><input type="range" aria-label="Adjust number of days" min="7" max="120" value={inputs.days} onChange={(e) => change('days', Number(e.target.value))} /><div className="range-labels"><span>1 week</span><span>120 days</span></div></div>
      <details className="technical"><summary>Advanced: change the location</summary><label htmlFor="pond-latitude">Latitude, in degrees north</label><input id="pond-latitude" type="number" min="8" max="35" step="0.01" required value={inputs.latDeg} onChange={(e) => change('latDeg', Number(e.target.value))} /><p className="helper">Leave this unchanged to use the sample location. Latitude changes the sunlight available to the pond.</p></details>
      <button type="submit" className="button full-width">{busy ? 'Calculating your estimate…' : 'Calculate my estimate →'}</button></fieldset>{error && <p className="err" role="alert">{error}</p>}
    </form><div ref={results} tabIndex={-1} style={{ scrollMarginTop: 24 }}><span className="sr-only" role="status">{busy ? 'Calculating your estimate' : completed ? 'Your estimate is ready' : ''}</span>{completed ? <SimResults result={completed.result} inputs={completed.inputs} changed={changed} /> : <EmptyState title="Your estimate will appear here"><p>Pick an example on the left, or above on a phone. Then choose “Calculate my estimate”.</p><p className="helper">You’ll see estimated carbon absorption, algae harvested, and a simple cost breakdown.</p></EmptyState>}</div></div>
  </main>;
}
