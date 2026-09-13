'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_CONFIG, runTwin, type DayPoint, type RunConfig, type RunResult } from '@/lib/twin';
import { ExpansionPanel } from '@/components/expansion-panel';
import { PondView } from '@/components/pond-view';
import { SkyStrip } from '@/components/sky-strip';
import { SimulatorControls } from '@/components/simulator-controls';
import './simulation-workspace.css';

interface Props { initial?: Partial<RunConfig>; pondLabel?: string; siteName?: string; }
const kg = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`;
const scenarios = [
  { id: 'mild', label: 'Mild day', temperature: 28, swing: 8, mixing: true },
  { id: 'heat', label: 'Heat stress', temperature: 38, swing: 12, mixing: true },
  { id: 'cool', label: 'Cool spell', temperature: 18, swing: 6, mixing: true },
  { id: 'outage', label: 'Mixer outage', temperature: 28, swing: 8, mixing: false },
];
// One node carries all four probes, matching the hardware on /hardware.
const initialSensors = [{ id: 'node', x: .72, y: .24, label: 'Sensor node' }];
/** Simulated hours per real second. 75 ms per hour made a day pass in under 2 s. */
const SPEEDS = [1, 3, 6, 12, 24];

/**
 * The model reports one value per day. Within the day we shape light from the
 * sunrise equation's day length, and swing oxygen, pH and water temperature on
 * the photosynthesis cycle: up through the afternoon, down overnight on
 * respiration. The shape is illustrative; the daily figures are the model's.
 */
function atHour(point: DayPoint, hour: number, swingC: number, mixing: boolean): DayPoint {
  const rise = 12 - point.daylightHours / 2;
  const t = (hour - rise) / point.daylightHours;
  const light = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  const cycle = Math.sin(2 * Math.PI * (hour - 9) / 24);
  const dense = Math.min(1, point.opticalDensity / .8);
  return {
    ...point,
    solarElevationDeg: light > 0 ? point.solarElevationDeg * light : -12,
    parUmol: point.parUmol * light,
    dissolvedOxygenMgL: Math.max(0, point.dissolvedOxygenMgL * (1 + cycle * (.2 + .35 * dense) * (mixing ? 1 : 1.4))),
    ph: point.ph + cycle * (.1 + .35 * dense),
    temperatureC: point.temperatureC + cycle * swingC * .25,
  };
}

export function LiveSimulator({ initial, pondLabel, siteName }: Props) {
  const [cfg, setCfg] = useState<RunConfig>({ ...DEFAULT_CONFIG, ...initial });
  const [result, setResult] = useState<RunResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  /* Swallowing this made a broken simulator indistinguishable from a slow
   * one, twice. Whatever went wrong is now shown to the user and logged. */
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(12);
  const playDay = Math.floor(clock / 24), hour = clock % 24;
  const setPlayDay = useCallback((day: number) => setClock(day * 24 + 12), []);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [sensors, setSensors] = useState(initialSensors);
  const [selectedSensor, setSelectedSensor] = useState('ph');
  const [controls, setControls] = useState('pond');
  const moveSensor = useCallback((id: string, x: number, y: number) => {
    setSensors(prev => prev.map(sensor => sensor.id === id ? { ...sensor, x, y } : sensor));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setFailure(null);
    const timeout = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setFailure('The model did not finish within 15 seconds.');
        setStatus('failed');
      }
    }, 15000);
    async function calculate() {
      try {
        const r = await runTwin(cfg);
        if (!cancelled) { setResult(r); setStatus('ready'); setPlayDay(0); setPlaying(true); }
      } catch (err) {
        if (!cancelled) { setFailure(err instanceof Error ? err.message : String(err)); setStatus('failed'); }
      } finally { clearTimeout(timeout); }
    }
    void calculate();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [cfg, retry]);

  useEffect(() => {
    if (!playing || !result?.daily.length || status !== 'ready') return;
    const timer = setInterval(() => setClock(c => (c + 1) % (result.daily.length * 24)), 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, result, status, speed]);
  useEffect(() => { if (result && playDay >= result.daily.length) setPlayDay(0); }, [result, playDay]);

  const set = (key: keyof RunConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg(c => ({ ...c, [key]: Number(e.target.value) }));
  const dayPoint = result?.daily[Math.min(playDay, result.daily.length - 1)];
  const point = dayPoint && atHour(dayPoint, hour, cfg.diurnalSwingC, cfg.mixerRunning);
  const airNow = cfg.meanAirTempC + Math.sin(2 * Math.PI * (hour - 9) / 24) * cfg.diurnalSwingC / 2;
  const darkness = point ? Math.max(0, Math.min(1, -point.solarElevationDeg / 12)) : 0;
  const time = `${String(hour).padStart(2, '0')}:00`;
  const selectedScenario = scenarios.find(s => s.temperature === cfg.meanAirTempC && s.swing === cfg.diurnalSwingC && s.mixing === cfg.mixerRunning);
  const measurements = [
    { id: 'ph', name: 'Acidity', raw: point?.ph, range: [8.5, 10.5], use: 'Falling pH with falling density = culture dying.', value: point?.ph.toFixed(2) ?? '—', unit: 'pH', description: 'Pond-wide acidity. It rises in the afternoon as algae draw down CO₂ and falls overnight.' },
    { id: 'do', name: 'Oxygen', raw: point?.dissolvedOxygenMgL, range: [4, 16], use: 'Below 4 mg/L before dawn the culture suffocates. Check the mixer.', value: point?.dissolvedOxygenMgL.toFixed(1) ?? '—', unit: 'mg/L', description: 'Dissolved oxygen peaks mid-afternoon from photosynthesis and is lowest before dawn, when a stopped mixer is most dangerous.' },
    { id: 'temp', name: 'Water temperature', raw: point?.temperatureC, range: [20, 38], use: 'Above 38 °C growth stops; below 20 °C it slows.', value: point?.temperatureC.toFixed(1) ?? '—', unit: '°C', description: 'Water temperature follows the air conditions and the pond model.' },
    { id: 'od', name: 'Algae density', raw: point?.opticalDensity, range: [0.3, 1.2], use: 'How much algae is in the water: decides when to harvest and how much CO₂ was captured.', value: point?.opticalDensity.toFixed(2) ?? '—', unit: 'OD', description: 'Optical density describes how much light the culture blocks. Darker water represents a denser culture.' },
  ];
  const elapsed = result?.daily.slice(0, playDay + 1);
  const totals = elapsed && { co2: elapsed.reduce((n,d) => n+d.co2Kg,0), harvest: elapsed.reduce((n,d) => n+d.harvestKg,0), peak: Math.max(...elapsed.map(d=>d.biomassKg)) };
  const selected = measurements.find(m => m.id === selectedSensor)!;
  const reset = () => { setCfg({ ...DEFAULT_CONFIG, ...initial }); setPlayDay(0); setPlaying(false); setSensors(initialSensors); setSelectedSensor('ph'); };

  return <div className="sim-workspace">
    <div className="simulation-grid">
      <section className="simulation-stage" aria-label="Pond simulation scene">
        {/* Sky sits directly above the water so the two read as one picture,
            and so day length — the biggest seasonal driver of yield — is
            visible rather than buried in the conditions panel. */}
        <SkyStrip point={point} airTempC={airNow} time={time} />
        <div className="stage-header"><div><h2>{pondLabel ?? 'Your virtual pond'}</h2><p>{siteName ? `${siteName} · ` : ''}{selectedScenario?.label ?? 'Custom conditions'} · model simulation</p></div><span className={`mixing-indicator ${cfg.mixerRunning ? '' : 'is-stopped'}`}>{cfg.mixerRunning ? 'Water mixing' : 'Mixer stopped'}</span></div>
        <div className="scene-dimensions"><span><strong>{Math.sqrt(cfg.areaM2 * 3).toFixed(1)} m</strong> length</span><span><strong>{Math.sqrt(cfg.areaM2 / 3).toFixed(1)} m</strong> width</span><span><strong>{Math.round(cfg.depthM * 100)} cm</strong> depth</span></div>
        <PondView daily={result?.daily ?? []} areaM2={cfg.areaM2} depthM={cfg.depthM} mixing={cfg.mixerRunning} sensors={sensors} onMoveSensor={moveSensor} day={playDay} current={point} darkness={darkness} airTemperature={cfg.meanAirTempC} selectedSensor="node" onSelectSensor={() => undefined} />
        <div className="simulation-playback"><div className="playback-top"><button className="button" disabled={!result || status !== 'ready'} onClick={() => setPlaying(p => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play days'} <span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span></button><strong>Day {point?.day ?? 1} <span>of {cfg.days} · {time}</span></strong><label style={{display:'flex',alignItems:'center',gap:'.35rem',fontSize:'.85rem'}}>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Simulation speed">{SPEEDS.map(v => <option key={v} value={v}>{v === 24 ? '1 day' : `${v} h`}/s</option>)}</select></label><button className="button secondary" onClick={() => setCfg(c => ({ ...c, mixerRunning: !c.mixerRunning }))}>{cfg.mixerRunning ? 'Stop mixer' : 'Start mixer'}</button></div><input type="range" aria-label="Simulation day" aria-valuetext={`Day ${point?.day ?? 1} of ${cfg.days}`} min={0} max={Math.max(0, (result?.daily.length ?? 1) - 1)} value={Math.min(playDay, Math.max(0, (result?.daily.length ?? 1) - 1))} disabled={!result} onChange={e => { setPlaying(false); setPlayDay(Number(e.target.value)); }} /><div className="timeline-labels"><span>Day 1</span><span>Scrub to see readings for any day</span><span>Day {cfg.days}</span></div></div>
        <div className="simulation-totals" aria-busy={status === 'loading'}><div className="totals-heading"><h3>Through day {point?.day ?? 1}</h3><span role="status">{status === 'loading' ? 'Updating estimate…' : status === 'failed' ? 'Calculation unavailable' : 'Model estimate'}</span></div>{status === 'failed' ? <div role="alert"><p>The model could not finish. Your settings are still here.</p>{failure && <p className="sim-failure-detail">{failure}</p>}<button className="button secondary" onClick={() => setRetry(n => n+1)}>Try again</button></div> : <div className="sim-figures"><div><strong>{totals ? kg(totals.harvest) : '—'}</strong><span>algae harvested</span></div><div><strong>{totals ? kg(totals.co2) : '—'}</strong><span>CO₂ absorbed</span></div><div><strong>{totals ? kg(totals.peak) : '—'}</strong><span>peak algae biomass</span></div></div>}{result && <Trace daily={result.daily} day={playDay} />}</div>
      </section>
      <SimulatorControls scenario={<>    <div className="scenario-toolbar"><div><div className="scenario-options" role="group" aria-label="Environmental scenarios">{scenarios.map(s => <button key={s.id} aria-pressed={selectedScenario?.id === s.id} onClick={() => { setCfg(c => ({ ...c, meanAirTempC: s.temperature, diurnalSwingC: s.swing, mixerRunning: s.mixing, crashOnDay: null })); setPlayDay(0); setPlaying(true); }}>{s.label}</button>)}</div></div><button className="button secondary reset-simulation" onClick={reset}>Reset simulation</button></div>
<p>Sample conditions run through the pond physics model. Estimates are not verified credits.</p></>}
        conditions={<section className="setup-panel"><div className="setup-heading"><h2>Adjust conditions</h2><span>Updates automatically</span></div><div className="setup-switch" role="group" aria-label="Simulation settings"><button aria-pressed={controls === 'pond'} onClick={() => setControls('pond')}>Pond setup</button><button aria-pressed={controls === 'environment'} onClick={() => setControls('environment')}>Environment</button></div>
          {controls === 'pond' ? <div className="setup-fields">
            <Slider id="area" label="Pond area" value={cfg.areaM2} min={200} max={50000} step={100} display={`${cfg.areaM2.toLocaleString('en-IN')} m²`} onChange={set('areaM2')} hint="Dimensions and the scale bar follow this area." />
            <Slider id="depth" label="Water depth" value={Math.round(cfg.depthM * 100)} min={15} max={60} step={1} display={`${Math.round(cfg.depthM * 100)} cm`} onChange={e => setCfg(c => ({ ...c, depthM: Number(e.target.value) / 100 }))} />
            <Slider id="days" label="Simulation duration" value={cfg.days} min={7} max={120} step={1} display={`${cfg.days} days`} onChange={e => { const days=Number(e.target.value); setCfg(c=>({...c,days,crashOnDay:c.crashOnDay && c.crashOnDay>=days ? null : c.crashOnDay})); }} />
            <details className="advanced-setup"><summary>Harvest schedule</summary><Slider id="harvest" label="Harvest every" value={cfg.harvestEveryDays} min={3} max={21} step={1} display={`${cfg.harvestEveryDays} days`} onChange={set('harvestEveryDays')} /><Slider id="fraction" label="Amount harvested" value={Math.round(cfg.harvestFraction * 100)} min={15} max={80} step={5} display={`${Math.round(cfg.harvestFraction * 100)}%`} onChange={e=>setCfg(c=>({...c,harvestFraction:Number(e.target.value)/100}))} /></details>
          </div> : <div className="setup-fields">
            <Slider id="temp" label="Average air temperature" value={cfg.meanAirTempC} min={12} max={44} step={1} display={`${cfg.meanAirTempC} °C`} onChange={set('meanAirTempC')} hint="Changes the scene and the model’s growing conditions." />
            <Slider id="swing" label="Day–night temperature swing" value={cfg.diurnalSwingC} min={2} max={20} step={1} display={`${cfg.diurnalSwingC} °C`} onChange={set('diurnalSwingC')} />
            <Slider id="nitrogen" label="Nitrogen in the water" value={cfg.influentNitrogenMgL} min={2} max={80} step={1} display={`${cfg.influentNitrogenMgL} mg/L`} onChange={set('influentNitrogenMgL')} />
            <details className="advanced-setup"><summary>Simulate a culture crash</summary><Slider id="crash" label="Crash starts" value={cfg.crashOnDay ?? 0} min={0} max={cfg.days - 1} step={1} display={cfg.crashOnDay ? `Day ${cfg.crashOnDay}` : 'No crash'} onChange={e=>setCfg(c=>({...c,crashOnDay:Number(e.target.value)||null}))} /></details>
          </div>}
        </section>} sensors={<section className="sensor-panel" aria-busy={status === 'loading'}><div className="sensor-readings">{measurements.map(m => <button key={m.id} className="sensor-reading" aria-pressed={selectedSensor === m.id} onClick={() => setSelectedSensor(m.id)}><span>{m.name}</span><strong>{m.value}<small>{m.unit}</small></strong></button>)}</div><div className="sensor-explanation"><strong>{selected.name} probe</strong><p>{selected.description}</p></div><p className="sensor-note">One sensor node carries all four probes; drag it on the plan. Readings describe the whole pond at {time}; the hourly swing is illustrated around the model’s daily values. <Link href="/hardware">See the node’s circuit →</Link></p></section>} details={<><SkyStrip point={point} airTempC={airNow} time={time} /><p>Illustrative 3:1 footprint. One movable sensor node; readings describe the entire pond. <Link href="/hardware">See its circuit →</Link></p>{result && <details className="workspace-expansion"><summary>Planning a bigger farm? Explore expansion costs <span aria-hidden="true">↗</span></summary><ExpansionPanel currentAreaM2={cfg.areaM2} yieldKgPerM2PerYear={(result.totalHarvestKg/cfg.areaM2)*(365/cfg.days)} /></details>}</>} />
    </div>
  </div>;
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
        onChange={onChange} aria-valuetext={display}
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
function Trace({ daily, day }: { daily: RunResult['daily']; day: number }) {
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
          opacity={d.day - 1 <= day ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}
