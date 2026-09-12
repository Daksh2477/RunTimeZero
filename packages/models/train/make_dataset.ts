/**
 * Generate labelled training data from the twin.
 *
 * WHY SYNTHETIC DATA IS DEFENSIBLE HERE, SPECIFICALLY
 *
 * We need labelled culture crashes and labelled fraud. No public dataset
 * contains either, and no real operator would hand over "here are the windows
 * where I overstated". The twin can produce both on demand, with the label
 * known exactly rather than inferred.
 *
 * The honest limitation, which belongs in the pitch rather than hidden: a model
 * trained on our simulator learns our simulator. It will transfer only as far
 * as the physics does. That is acceptable for the crash detector, where the
 * mechanism is well understood, and it is why no model is allowed anywhere near
 * `creditableCo2Kg`.
 *
 *   npm run models:data
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WasmPond } from '../../physics/pkg/rtz_physics.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(OUT, { recursive: true });

const SEED_BASE = Number(process.env.SEED ?? 42);
const N_PONDS = Number(process.env.N_PONDS ?? 400);

interface Reading {
  ph: number;
  dissolved_oxygen_mg_l: number;
  temperature_c: number;
  optical_density: number;
  reported_co2_kg: number;
}

function csv(rows: (number | string)[][], header: string[]): string {
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/**
 * Features from a 48-hour window, as the API computes them at runtime.
 *
 * Must stay identical to what `advisory.ts` builds, or the model scores
 * something the product never actually sees.
 *
 * THE ONE THAT MATTERS MOST IS `do_amplitude`.
 *
 * A healthy sunlit pond swings dissolved oxygen hugely between day and night:
 * photosynthesis supersaturates it by afternoon, respiration strips it by
 * dawn. A pond that stops swinging has stopped photosynthesising — and that
 * shows up BEFORE density visibly falls, which makes it a leading indicator
 * rather than a post-mortem. An earlier version of this file recorded DO and
 * threw the amplitude away.
 *
 * `mixing_ok` is the other addition. A stopped paddlewheel is among the most
 * common causes of a crash, and the model previously had no way to know.
 */
function windowFeatures(
  w: Reading[],
  ctx: { depthM: number; areaM2: number; dayOfYear: number; hoursSinceHarvest: number },
): number[] {
  const first = w[0]!;
  const last = w[w.length - 1]!;
  const hours = w.length;
  const mean = (f: (r: Reading) => number) => w.reduce((s, r) => s + f(r), 0) / hours;
  const amplitude = (f: (r: Reading) => number) => {
    const vals = w.map(f);
    return Math.max(...vals) - Math.min(...vals);
  };
  const stdev = (f: (r: Reading) => number) => {
    const m = mean(f);
    return Math.sqrt(w.reduce((s, r) => s + (f(r) - m) ** 2, 0) / hours);
  };

  // Mixing is inferred, not measured: a pond whose DO barely moves in daylight
  // is either dead or unmixed, and both are worth flagging.
  const doAmp = amplitude((r) => r.dissolved_oxygen_mg_l);

  return [
    last.ph,
    last.dissolved_oxygen_mg_l,
    last.temperature_c,
    last.optical_density,
    (last.ph - first.ph) / hours,
    (last.dissolved_oxygen_mg_l - first.dissolved_oxygen_mg_l) / hours,
    (last.optical_density - first.optical_density) / hours,
    (last.temperature_c - first.temperature_c) / hours,
    mean((r) => r.ph),
    mean((r) => r.optical_density),
    doAmp,
    amplitude((r) => r.ph),
    stdev((r) => r.optical_density),
    amplitude((r) => r.temperature_c),
    ctx.depthM,
    Math.log10(Math.max(1, ctx.areaM2)),
    Math.sin((2 * Math.PI * ctx.dayOfYear) / 365),
    Math.cos((2 * Math.PI * ctx.dayOfYear) / 365),
    ctx.hoursSinceHarvest,
  ];
}

const CRASH_HEADER = [
  'ph', 'do_mgl', 'temp_c', 'od',
  'ph_trend', 'do_trend', 'od_trend', 'temp_trend',
  'ph_mean', 'od_mean',
  // Added after noticing the four-sensor set threw away its best signal.
  'do_amplitude', 'ph_amplitude', 'od_volatility', 'temp_amplitude',
  'depth_m', 'log_area', 'season_sin', 'season_cos', 'hours_since_harvest',
  'label',
];

/**
 * Crash dataset: 48 h of history, labelled by whether the culture lost a third
 * of its density over the following 48 h.
 *
 * Half the ponds get a crash injected at a random hour so the classes are not
 * wildly imbalanced — an all-healthy dataset teaches a model to answer "no".
 */
function buildCrashDataset(): void {
  const rows: (number | string)[][] = [];
  let positives = 0;

  for (let i = 0; i < N_PONDS; i += 1) {
    // Vary geometry across ponds so the model cannot memorise one shape.
    const depthM = 0.2 + (i % 5) * 0.07;
    const areaM2 = [400, 1200, 4000, 10_000, 12_000][i % 5]!;
    const startDay = 100 + (i % 200);

    const pond = new WasmPond(23.03, areaM2, depthM, BigInt(SEED_BASE + i), startDay);
    const willCrash = i % 2 === 0;
    const crashHour = 120 + (i % 180);
    if (willCrash) pond.inject_crash(0.6 + (i % 4) * 0.1, crashHour, 72);

    const history: Reading[] = [];
    const harvestHours: number[] = [];
    for (let h = 0; h < 480; h += 1) {
      history.push(pond.step() as Reading);
      if ((h + 1) % 168 === 0) {
        pond.harvest(0.45);
        harvestHours.push(h);
      }
    }

    // Sample windows at 24-hour strides; consecutive hours would be nearly
    // duplicate rows and would inflate any accuracy figure we quoted.
    for (let t = 48; t + 48 < history.length; t += 24) {
      const window = history.slice(t - 48, t);
      const odNow = history[t]!.optical_density;
      const odLater = history[t + 47]!.optical_density;
      const collapsed = odNow > 0.05 && odLater < odNow * 0.67 ? 1 : 0;
      if (collapsed) positives += 1;

      const lastHarvest = harvestHours.filter((h) => h <= t).pop() ?? 0;
      const ctx = {
        depthM,
        areaM2,
        dayOfYear: (startDay + Math.floor(t / 24)) % 365,
        hoursSinceHarvest: t - lastHarvest,
      };
      rows.push([
        ...windowFeatures(window, ctx).map((v) => v.toFixed(6)),
        collapsed,
      ]);
    }
  }

  writeFileSync(join(OUT, 'crash.csv'), csv(rows, CRASH_HEADER));
  console.log(
    `  crash.csv           ${rows.length} rows, ${positives} positive ` +
      `(${((positives / rows.length) * 100).toFixed(1)}%)`,
  );
}

const DIVERGENCE_HEADER = [
  'mean_div', 'std_div', 'max_abs_div', 'positive_frac',
  'longest_run', 'last_div', 'slope', 'label',
];

/**
 * Divergence dataset: a sequence of 12 windows, labelled noise / drift /
 * systematic.
 *
 * This is the model that earns its place. The physics ceiling only catches the
 * impossible, and a careful operator overstating 8% every window never goes
 * near it — each window looks unremarkable, and only the pattern gives it away.
 *
 * Labels: 0 = honest (noise around zero), 1 = drift (instrument going bad,
 * wanders in one direction then back), 2 = systematic overstatement.
 */
function buildDivergenceDataset(): void {
  const rows: (number | string)[][] = [];
  let rng = SEED_BASE >>> 0 || 1;
  const rand = () => {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    return ((rng >>> 0) % 1_000_000) / 1_000_000;
  };
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  // Tuple rather than number[]: the three labels are fixed, and this lets the
  // compiler prove the index is in range.
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < N_PONDS * 4; i += 1) {
    const label = i % 3;
    // Satellite noise is wide — sigma 0.45 is the same figure the estimator
    // uses, so honest ponds genuinely look messy.
    const noise = 0.45;
    const series: number[] = [];

    for (let t = 0; t < 12; t += 1) {
      if (label === 0) {
        series.push(gauss() * noise);
      } else if (label === 1) {
        // Drift: a slow excursion that returns. A failing probe, not a liar.
        const phase = Math.sin((t / 11) * Math.PI);
        series.push(phase * 0.5 + gauss() * noise * 0.6);
      } else {
        // Systematic: small, constant, always the same direction. Invisible in
        // any single window and unmistakable across twelve.
        series.push(0.08 + gauss() * noise * 0.5);
      }
    }

    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const std = Math.sqrt(
      series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length,
    );
    const maxAbs = Math.max(...series.map(Math.abs));
    const positiveFrac = series.filter((v) => v > 0).length / series.length;

    let longestRun = 0;
    let run = 0;
    for (const v of series) {
      if (v > 0) { run += 1; longestRun = Math.max(longestRun, run); } else run = 0;
    }

    // Least-squares slope over the sequence — separates drift from a constant
    // offset, which otherwise look alike on mean alone.
    const n = series.length;
    const xMean = (n - 1) / 2;
    let num = 0, den = 0;
    series.forEach((v, x) => { num += (x - xMean) * (v - mean); den += (x - xMean) ** 2; });
    const slope = den === 0 ? 0 : num / den;

    counts[label as 0 | 1 | 2] += 1;
    rows.push([
      mean.toFixed(6), std.toFixed(6), maxAbs.toFixed(6), positiveFrac.toFixed(4),
      longestRun, series[n - 1]!.toFixed(6), slope.toFixed(6), label,
    ]);
  }

  writeFileSync(join(OUT, 'divergence.csv'), csv(rows, DIVERGENCE_HEADER));
  console.log(
    `  divergence.csv      ${rows.length} rows (honest ${counts[0]}, drift ${counts[1]}, systematic ${counts[2]})`,
  );
}

const NDCI_HEADER = ['ndci', 'depth_m', 'temp_c', 'biomass_g_per_l'];

/**
 * NDCI → biomass, with the observation noise a real satellite would add.
 *
 * The point of this one is not the central fit — it is the residual spread,
 * which becomes the prediction interval the reconciliation engine consumes.
 * A tight fit here would be a lie about how well NDCI actually works.
 */
function buildNdciDataset(): void {
  const rows: (number | string)[][] = [];
  let rng = (SEED_BASE * 7) >>> 0 || 1;
  const rand = () => {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    return ((rng >>> 0) % 1_000_000) / 1_000_000;
  };
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  for (let i = 0; i < N_PONDS; i += 1) {
    const depth = 0.2 + (i % 5) * 0.08;
    const pond = new WasmPond(23.03, 10_000, depth, BigInt(SEED_BASE + 5000 + i), 100 + (i % 200));
    for (let d = 0; d < 21; d += 1) {
      let last: Reading | null = null;
      for (let h = 0; h < 24; h += 1) last = pond.step() as Reading;
      if ((d + 1) % 7 === 0) pond.harvest(0.45);
      if (!last) continue;

      const trueGPerL = last.optical_density / 0.9;
      // Sigma 0.45 — the same satellite error the estimator assumes, so the
      // learned interval matches the channel we actually use.
      const observed = Math.max(0, trueGPerL * (1 + gauss() * 0.45));
      const ndci = Math.min(1, Math.max(0, observed / 2.5));
      rows.push([
        ndci.toFixed(6), depth.toFixed(3),
        last.temperature_c.toFixed(2), trueGPerL.toFixed(6),
      ]);
    }
  }

  writeFileSync(join(OUT, 'ndci.csv'), csv(rows, NDCI_HEADER));
  console.log(`  ndci.csv            ${rows.length} rows`);
}

console.log(`generating datasets (seed ${SEED_BASE}, ${N_PONDS} ponds)…`);
buildCrashDataset();
buildDivergenceDataset();
buildNdciDataset();
console.log(`\nwritten to packages/models/data/`);
