/**
 * Model inference in TypeScript, from JSON coefficients.
 *
 * No ONNX runtime. These are a logistic regression, a depth-5 forest and a
 * linear fit — inference is arithmetic, and keeping it here means the API has
 * no ML runtime dependency and the weights stay readable by anyone who opens
 * the artifact files.
 *
 * THE BOUNDARY
 *
 * Nothing in this file may be imported by `reconcile/engine.ts` in a way that
 * changes `creditableCo2Kg`. Models set severity and verdict; arithmetic sets
 * the amount. See docs/DECISIONS.md #9.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACTS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/models/artifacts',
);

function load<T>(name: string): T | null {
  const path = join(ARTIFACTS, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ crash risk

interface LogisticModel {
  features: string[];
  mean: number[];
  scale: number[];
  coef: number[];
  intercept: number;
  threshold: number;
}

const crashModel = load<LogisticModel>('crash_classifier');

export interface CrashRisk {
  probability: number;
  /** Feature contributing most to the score, in the operator's language. */
  dominantFactor: string;
  modelAvailable: boolean;
}

const FEATURE_LABELS: Record<string, string> = {
  ph: 'pH level',
  do_mgl: 'dissolved oxygen',
  temp_c: 'water temperature',
  od: 'culture density',
  ph_trend: 'falling pH',
  do_trend: 'falling oxygen',
  od_trend: 'falling density',
  temp_trend: 'temperature change',
  ph_mean: 'average pH',
  od_mean: 'average density',
};

/**
 * Probability of culture collapse within 48 hours.
 *
 * Returns `modelAvailable: false` rather than throwing when the artifact is
 * missing — the platform must work without trained models, because the
 * rule-based advisories in `advisory.ts` are the real safety net and the model
 * only sharpens them.
 */
export function crashRisk(features: Record<string, number>): CrashRisk {
  if (!crashModel) {
    return { probability: 0, dominantFactor: '', modelAvailable: false };
  }

  let z = crashModel.intercept;
  let topContribution = 0;
  let topFeature = '';

  crashModel.features.forEach((name, i) => {
    const raw = features[name] ?? 0;
    const scaled = (raw - crashModel.mean[i]!) / (crashModel.scale[i]! || 1);
    const contribution = scaled * crashModel.coef[i]!;
    z += contribution;
    // Only positive contributions push toward a crash; the largest of those is
    // what the operator should actually be told about.
    if (contribution > topContribution) {
      topContribution = contribution;
      topFeature = name;
    }
  });

  return {
    probability: 1 / (1 + Math.exp(-z)),
    dominantFactor: FEATURE_LABELS[topFeature] ?? topFeature,
    modelAvailable: true,
  };
}

// ------------------------------------------------- divergence pattern

interface Tree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[][];
}
interface ForestModel {
  features: string[];
  classes: string[];
  trees: Tree[];
}

const divergenceModel = load<ForestModel>('divergence_classifier');

export type DivergencePattern = 'honest' | 'drift' | 'systematic' | 'unknown';

export interface PatternResult {
  pattern: DivergencePattern;
  confidence: number;
  modelAvailable: boolean;
}

function walk(tree: Tree, x: number[]): number[] {
  let node = 0;
  // A leaf is marked by feature === -2 in sklearn's representation.
  while (tree.feature[node] !== -2 && tree.left[node] !== -1) {
    const f = tree.feature[node]!;
    node = x[f]! <= tree.threshold[node]! ? tree.left[node]! : tree.right[node]!;
  }
  const counts = tree.value[node]!;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((c) => c / total);
}

/**
 * Classify a run of divergence values as noise, drift, or systematic.
 *
 * This is the model that earns its keep. The physics ceiling only catches the
 * impossible; an operator overstating 8% every window never approaches it, and
 * each window in isolation looks like measurement noise. Only the sequence
 * gives it away.
 *
 * It influences the verdict. It does not influence the credited amount.
 */
export function divergencePattern(series: number[]): PatternResult {
  if (!divergenceModel || series.length < 4) {
    return { pattern: 'unknown', confidence: 0, modelAvailable: !!divergenceModel };
  }

  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const maxAbs = Math.max(...series.map(Math.abs));
  const positiveFrac = series.filter((v) => v > 0).length / n;

  let longestRun = 0;
  let run = 0;
  for (const v of series) {
    if (v > 0) { run += 1; longestRun = Math.max(longestRun, run); } else run = 0;
  }

  const xMean = (n - 1) / 2;
  let num = 0, den = 0;
  series.forEach((v, x) => { num += (x - xMean) * (v - mean); den += (x - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;

  const x = [mean, std, maxAbs, positiveFrac, longestRun, series[n - 1]!, slope];

  const votes = divergenceModel.trees
    .map((t) => walk(t, x))
    .reduce((acc, p) => acc.map((v, i) => v + p[i]! / divergenceModel.trees.length),
      new Array(divergenceModel.classes.length).fill(0) as number[]);

  let best = 0;
  votes.forEach((v, i) => { if (v > votes[best]!) best = i; });

  return {
    pattern: divergenceModel.classes[best] as DivergencePattern,
    confidence: votes[best]!,
    modelAvailable: true,
  };
}

// ------------------------------------------------------ ndci calibration

interface LinearModel {
  features: string[];
  coef: number[];
  intercept: number;
  interval_low_ratio: number;
  interval_high_ratio: number;
}

const ndciModel = load<LinearModel>('ndci_biomass');

/**
 * Published NDCI mean absolute error factor. Our learned interval must never
 * be tighter than this.
 *
 * The trained model reports an interval around x0.72-x1.26, implying an error
 * factor near 1.3 — far tighter than the 2.4 validated on real lakes. That is
 * an artefact of learning from our own simulator, which is cleaner than
 * reality. Publishing the learned interval would make us more confident than
 * the literature justifies, so the floor below always wins.
 */
const LITERATURE_ERROR_FACTOR = 2.4;

export interface BiomassEstimate {
  gPerL: number;
  lowGPerL: number;
  highGPerL: number;
  modelAvailable: boolean;
}

export function biomassFromNdci(
  ndci: number,
  depthM: number,
  temperatureC: number,
): BiomassEstimate {
  if (!ndciModel) {
    // Same crude linear fallback the estimator uses, so behaviour is identical
    // with or without a trained model — just less well calibrated.
    const gPerL = Math.max(0, Math.min(1, ndci)) * 2.5;
    return {
      gPerL,
      lowGPerL: gPerL / LITERATURE_ERROR_FACTOR,
      highGPerL: gPerL * LITERATURE_ERROR_FACTOR,
      modelAvailable: false,
    };
  }

  const x = [ndci, depthM, temperatureC];
  const gPerL = Math.max(
    0,
    ndciModel.intercept + x.reduce((s, v, i) => s + v * ndciModel.coef[i]!, 0),
  );

  // Widen to the literature factor whenever the learned interval is tighter.
  const learnedLow = gPerL * ndciModel.interval_low_ratio;
  const learnedHigh = gPerL * ndciModel.interval_high_ratio;
  const floorLow = gPerL / LITERATURE_ERROR_FACTOR;
  const floorHigh = gPerL * LITERATURE_ERROR_FACTOR;

  return {
    gPerL,
    lowGPerL: Math.min(learnedLow, floorLow),
    highGPerL: Math.max(learnedHigh, floorHigh),
    modelAvailable: true,
  };
}

export function modelsLoaded(): Record<string, boolean> {
  return {
    crash_classifier: !!crashModel,
    divergence_classifier: !!divergenceModel,
    ndci_biomass: !!ndciModel,
  };
}
