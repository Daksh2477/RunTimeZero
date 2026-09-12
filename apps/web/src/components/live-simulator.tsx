'use client';

/**
 * Live pond simulator.
 *
 * Runs the WASM twin in the browser and re-runs it on every slider movement,
 * so the numbers move while your thumb is still down. That immediacy is the
 * whole feature — the same thing behind a submit button is a calculator, and
 * nobody explores with a calculator.
 *
 * Built phone-first, because the people this is for do not own laptops. On a
 * narrow screen the results stay pinned to the top while the controls sit
 * underneath, so you can see what your change did without scrolling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG, runTwin, type RunConfig, type RunResult,
} from '@/lib/twin';
import { ExpansionPanel } from '@/components/expansion-panel';

interface Props {
  /** Seeded from a real pond when opened from the console. */
  initial?: Partial<RunConfig>;
  pondLabel?: string;
  siteName?: string;
}

const kg = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`;

export function LiveSimulator({ initial, pondLabel, siteName }: Props) {
  const [cfg, setCfg] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...initial });
  const [result, setResult] = useState<RunResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const pending = useRef<number | null>(null);

  /*
   * Re-run on the next animation frame rather than on every input event.
   * A drag fires far more often than the screen refreshes, so without this we
   * would compute several runs per visible frame and throw most away.
   */
  const schedule = useCallback((next: RunConfig) => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      runTwin(next)
        .then((r) => { setResult(r); setStatus('ready'); })
        .catch(() => setStatus('failed'));
    });
  }, []);

  useEffect(() => { schedule(cfg); }, [cfg, schedule]);

  const set = (key: keyof RunConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((c) => ({ ...c, [key]: Number(e.target.value) }));

  if (status === 'failed') {
    return (
      <div className="sim-failed">
        <p>The pond model could not load.</p>
        <button type="button" className="button" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const utilisation = result && result.ceilingCo2Kg > 0
    ? result.totalCo2Kg / result.ceilingCo2Kg
    : 0;

  return (
    <div className="sim">
      {/* Sticky on phones so the numbers stay in view while you drag below. */}
      <div className="sim-summary" aria-live="polite">
        {pondLabel && (
          <p className="sim-context">
            {pondLabel}{siteName ? ` · ${siteName}` : ''} — your pond&rsquo;s real setup
          </p>
        )}
        <div className="sim-figures">
          <div>
            <strong className="num">{result ? kg(result.totalHarvestKg) : '—'}</strong>
            <span>algae harvested</span>
          </div>
          <div>
            <strong className="num">{result ? kg(result.totalCo2Kg) : '—'}</strong>
            <span>CO₂ absorbed</span>
          </div>
          <div>
            <strong className="num">
              {result ? `${Math.round(utilisation * 100)}%` : '—'}
            </strong>
            <span>of what sunlight allows</span>
          </div>
        </div>
        {result && <Trace daily={result.daily} />}
      </div>

      <div className="sim-controls">
        <Slider
          id="area" label="Pond size" value={cfg.areaM2} min={200} max={50000} step={100}
          display={`${cfg.areaM2.toLocaleString('en-IN')} m²`} onChange={set('areaM2')}
          hint="Bigger ponds catch more sunlight, and cost more to harvest."
        />
        <Slider
          id="depth" label="Water depth" value={Math.round(cfg.depthM * 100)}
          min={15} max={60} step={1} display={`${Math.round(cfg.depthM * 100)} cm`}
          onChange={(e) => setCfg((c) => ({ ...c, depthM: Number(e.target.value) / 100 }))}
          hint="Deeper water shades itself. Past a point, more depth grows less."
        />
        <Slider
          id="harvest" label="Harvest every" value={cfg.harvestEveryDays}
          min={3} max={21} step={1} display={`${cfg.harvestEveryDays} days`}
          onChange={set('harvestEveryDays')}
          hint="Harvest too rarely and the pond shades itself; too often and it never builds up."
        />
        <Slider
          id="fraction" label="Take each time"
          value={Math.round(cfg.harvestFraction * 100)} min={15} max={80} step={5}
          display={`${Math.round(cfg.harvestFraction * 100)}%`}
          onChange={(e) => setCfg((c) => ({ ...c, harvestFraction: Number(e.target.value) / 100 }))}
          hint="Leaving more behind means the pond regrows faster."
        />
        <Slider
          id="days" label="Look ahead" value={cfg.days} min={7} max={120} step={1}
          display={`${cfg.days} days`} onChange={set('days')}
        />

        <details className="technical">
          <summary>Real-world conditions</summary>
          <p className="helper">
            Defaults match a Gujarat summer. Change them to match your site, or
            to ask what a cold month would cost you.
          </p>
          <Slider
            id="temp" label="Average air temperature" value={cfg.meanAirTempC}
            min={12} max={44} step={1} display={`${cfg.meanAirTempC} °C`}
            onChange={set('meanAirTempC')}
            hint="Algae stop growing below about 20 °C and are damaged above 38 °C."
          />
          <Slider
            id="swing" label="Day to night swing" value={cfg.diurnalSwingC}
            min={2} max={20} step={1} display={`${cfg.diurnalSwingC} °C`}
            onChange={set('diurnalSwingC')}
            hint="A wide swing costs growth at both ends of the day."
          />
          <Slider
            id="nitrogen" label="Nitrogen in the water" value={cfg.influentNitrogenMgL}
            min={2} max={80} step={1} display={`${cfg.influentNitrogenMgL} mg/L`}
            onChange={set('influentNitrogenMgL')}
            hint="Wastewater supplies this free. Drop it low to see growth stall."
          />
        </details>

        <details className="technical">
          <summary>What if it goes wrong?</summary>
          <p className="helper">
            Add a culture crash and see what it costs. This is the same failure
            the alerts on your pond page are watching for.
          </p>
          <Slider
            id="crash" label="Crash on day" value={cfg.crashOnDay ?? 0}
            min={0} max={Math.max(7, cfg.days - 3)} step={1}
            display={cfg.crashOnDay ? `day ${cfg.crashOnDay}` : 'no crash'}
            onChange={(e) => setCfg((c) => ({
              ...c, crashOnDay: Number(e.target.value) || null,
            }))}
          />
        </details>
      </div>

      {result && cfg.days >= 7 && (
        <div className="sim-expansion">
          <ExpansionPanel
            currentAreaM2={cfg.areaM2}
            // Annualised from what the model just produced, so the expansion
            // maths and the simulation can never tell different stories.
            yieldKgPerM2PerYear={
              (result.totalHarvestKg / cfg.areaM2) * (365 / cfg.days)
            }
          />
        </div>
      )}
    </div>
  );
}

function Slider({
  id, label, value, min, max, step, display, onChange, hint,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  return (
    <div className="sim-field">
      <label htmlFor={id}>
        <span>{label}</span>
        <strong className="num">{display}</strong>
      </label>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={onChange}
      />
      {hint && <p className="helper">{hint}</p>}
    </div>
  );
}

/**
 * Daily CO₂ as bars, with harvest days marked.
 *
 * Deliberately not a charting library: this is one series on a phone screen,
 * and a 40 KB dependency to draw rectangles is a bad trade on rural mobile.
 */
function Trace({ daily }: { daily: RunResult['daily'] }) {
  if (daily.length < 2) return null;
  const max = Math.max(...daily.map((d) => d.co2Kg)) || 1;
  const w = 100 / daily.length;
  return (
    <svg
      className="sim-trace" viewBox="0 0 100 32" preserveAspectRatio="none"
      role="img" aria-label={`Daily carbon absorbed over ${daily.length} days`}
    >
      {daily.map((d) => (
        <rect
          key={d.day} x={(d.day - 1) * w} y={32 - (d.co2Kg / max) * 30}
          width={w * 0.75} height={Math.max(0.5, (d.co2Kg / max) * 30)}
          fill={d.harvested ? 'var(--sun, #d9a02c)' : 'var(--culture, #4faf80)'}
        />
      ))}
    </svg>
  );
}
