/**
 * Model inference in TypeScript, from JSON model artifacts.
 *
 * No ONNX runtime. The trained models are exported as readable JSON and
 * evaluated directly in TypeScript.
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

  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ============================================================
// CRASH RISK
// ============================================================

interface CrashTree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[][][];
}

interface CrashForestModel {
  model_type: string;
  features: string[];
  imputer_median: number[];
  classes: number[];
  trees: CrashTree[];
  threshold: number;
}

const crashModel =
  load<CrashForestModel>('crash_classifier');

console.log('[ML] crash model loaded:', !!crashModel);
console.log('[ML] crash model features:', crashModel?.features?.length);
export interface CrashRisk {
  probability: number;

  /** Feature contributing most strongly to the crash signal. */
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

  do_od_ratio: 'oxygen-to-density ratio',
  od_trend_ratio: 'density decline relative to density',

  abs_ph_trend: 'pH instability',
  abs_do_trend: 'oxygen instability',
  abs_od_trend: 'density instability',
  abs_temp_trend: 'temperature instability',

  ph_deviation: 'pH deviation from recent average',
  od_deviation: 'density deviation from recent average',

  do_od_interaction: 'oxygen and density interaction',
  do_od_trend_interaction: 'oxygen and density decline',
  od_od_trend_interaction: 'density decline interaction',
  temp_od_interaction: 'temperature and density interaction',
};

/**
 * Walk one sklearn Random Forest tree.
 *
 * sklearn stores:
 *   feature  - feature index used for the split
 *   threshold - split value
 *   left/right - child node indexes
 *   value - class counts at each node
 *
 * A leaf has feature === -2.
 */
function walkCrashTree(
  tree: CrashTree,
  x: number[],
): number {
  let node = 0;

  while (
    tree.feature[node] !== -2 &&
    tree.left[node] !== -1
  ) {
    const featureIndex = tree.feature[node]!;

    if (
      x[featureIndex]! <=
      tree.threshold[node]!
    ) {
      node = tree.left[node]!;
    } else {
      node = tree.right[node]!;
    }
  }

  const counts =
    tree.value[node]?.[0] ?? [];

  const total =
    counts.reduce(
      (sum, value) => sum + value,
      0,
    ) || 1;

  // Class index 1 = crash.
  return (counts[1] ?? 0) / total;
}

/**
 * Build the exact 22 features used by the Python crash model.
 *
 * The order MUST remain identical to CRASH_FEATURES in train_all.py.
 */
function buildCrashFeatures(
  features: Record<string, number>,
): number[] {
  const ph = features.ph ?? 0;
  const doMgl = features.do_mgl ?? 0;
  const temp = features.temp_c ?? 0;
  const od = features.od ?? 0;

  const phTrend =
    features.ph_trend ?? 0;

  const doTrend =
    features.do_trend ?? 0;

  const odTrend =
    features.od_trend ?? 0;

  const tempTrend =
    features.temp_trend ?? 0;

  const phMean =
    features.ph_mean ?? ph;

  const odMean =
    features.od_mean ?? od;

  return [
    // --------------------------------------------------------
    // Base features
    // --------------------------------------------------------

    ph,
    doMgl,
    temp,
    od,

    phTrend,
    doTrend,
    odTrend,
    tempTrend,

    phMean,
    odMean,

    // --------------------------------------------------------
    // Engineered features
    // --------------------------------------------------------

    doMgl / (od + 0.05),

    odTrend / (od + 0.05),

    Math.abs(phTrend),
    Math.abs(doTrend),
    Math.abs(odTrend),
    Math.abs(tempTrend),

    ph - phMean,
    od - odMean,

    doMgl * od,
    doMgl * odTrend,
    od * odTrend,
    temp * od,
  ];
}

/**
 * Probability of culture collapse within 48 hours.
 *
 * The crash classifier is a Random Forest trained on real ATP3
 * pond data.
 *
 * The model is exported to JSON so the API does not require
 * Python, scikit-learn, ONNX, or another ML runtime.
 */
export function crashRisk(
  features: Record<string, number>,
): CrashRisk {
  if (!crashModel) {
    return {
      probability: 0,
      dominantFactor: '',
      modelAvailable: false,
    };
  }

  let x =
    buildCrashFeatures(features);

  // ----------------------------------------------------------
  // Apply the same median-imputation values used during
  // training.
  // ----------------------------------------------------------

  x = x.map((value, index) => {
    if (Number.isFinite(value)) {
      return value;
    }

    return (
      crashModel.imputer_median[index] ??
      0
    );
  });

  // ----------------------------------------------------------
  // Average probability across all Random Forest trees.
  // ----------------------------------------------------------

  let probability = 0;

  for (const tree of crashModel.trees) {
    probability +=
      walkCrashTree(tree, x);
  }

  probability /=
    crashModel.trees.length || 1;

  // Keep probability safely inside [0, 1].
  probability = Math.max(
    0,
    Math.min(1, probability),
  );

  // ----------------------------------------------------------
  // Determine the strongest feature signal for the operator.
  // ----------------------------------------------------------

  let dominantFactor = '';
  let strongestSignal = 0;

  crashModel.features.forEach(
    (name, index) => {
      const value =
        Math.abs(x[index] ?? 0);

      if (value > strongestSignal) {
        strongestSignal = value;
        dominantFactor = name;
      }
    },
  );

  return {
    probability,
    dominantFactor:
      FEATURE_LABELS[dominantFactor] ??
      dominantFactor,
    modelAvailable: true,
  };
}

// ============================================================
// DIVERGENCE PATTERN
// ============================================================

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

const divergenceModel =
  load<ForestModel>(
    'divergence_classifier',
  );

export type DivergencePattern =
  | 'honest'
  | 'drift'
  | 'systematic'
  | 'unknown';

export interface PatternResult {
  pattern: DivergencePattern;
  confidence: number;
  modelAvailable: boolean;
}

function walk(
  tree: Tree,
  x: number[],
): number[] {
  let node = 0;

  while (
    tree.feature[node] !== -2 &&
    tree.left[node] !== -1
  ) {
    const f =
      tree.feature[node]!;

    node =
      x[f]! <= tree.threshold[node]!
        ? tree.left[node]!
        : tree.right[node]!;
  }

  const counts =
    tree.value[node]!;

  const total =
    counts.reduce(
      (a, b) => a + b,
      0,
    ) || 1;

  return counts.map(
    (c) => c / total,
  );
}

/**
 * Classify a run of divergence values as noise, drift, or systematic.
 *
 * It influences the verdict.
 * It does not influence the credited amount.
 */
export function divergencePattern(
  series: number[],
): PatternResult {
  if (
    !divergenceModel ||
    series.length < 4
  ) {
    return {
      pattern: 'unknown',
      confidence: 0,
      modelAvailable:
        !!divergenceModel,
    };
  }

  const n = series.length;

  const mean =
    series.reduce(
      (a, b) => a + b,
      0,
    ) / n;

  const std = Math.sqrt(
    series.reduce(
      (s, v) =>
        s + (v - mean) ** 2,
      0,
    ) / n,
  );

  const maxAbs =
    Math.max(
      ...series.map(Math.abs),
    );

  const positiveFrac =
    series.filter(
      (v) => v > 0,
    ).length / n;

  let longestRun = 0;
  let run = 0;

  for (const v of series) {
    if (v > 0) {
      run += 1;
      longestRun =
        Math.max(
          longestRun,
          run,
        );
    } else {
      run = 0;
    }
  }

  const xMean =
    (n - 1) / 2;

  let num = 0;
  let den = 0;

  series.forEach(
    (v, x) => {
      num +=
        (x - xMean) *
        (v - mean);

      den +=
        (x - xMean) ** 2;
    },
  );

  const slope =
    den === 0
      ? 0
      : num / den;

  const x = [
    mean,
    std,
    maxAbs,
    positiveFrac,
    longestRun,
    series[n - 1]!,
    slope,
  ];

  const votes =
    divergenceModel.trees
      .map((tree) =>
        walk(tree, x),
      )
      .reduce(
        (
          acc,
          probabilities,
        ) =>
          acc.map(
            (value, index) =>
              value +
              probabilities[index]! /
                divergenceModel
                  .trees.length,
          ),
        new Array(
          divergenceModel
            .classes.length,
        ).fill(0) as number[],
      );

  let best = 0;

  votes.forEach(
    (value, index) => {
      if (
        value >
        votes[best]!
      ) {
        best = index;
      }
    },
  );

  return {
    pattern:
      divergenceModel
        .classes[best] as DivergencePattern,

    confidence:
      votes[best]!,

    modelAvailable: true,
  };
}

// ============================================================
// NDCI CALIBRATION
// ============================================================

interface LinearModel {
  features: string[];
  coef: number[];
  intercept: number;
  interval_low_ratio: number;
  interval_high_ratio: number;
}

const ndciModel =
  load<LinearModel>(
    'ndci_biomass',
  );

/**
 * Published NDCI mean absolute error factor.
 *
 * Our learned interval must never be tighter than this.
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
    const gPerL =
      Math.max(
        0,
        Math.min(1, ndci),
      ) * 2.5;

    return {
      gPerL,
      lowGPerL:
        gPerL /
        LITERATURE_ERROR_FACTOR,
      highGPerL:
        gPerL *
        LITERATURE_ERROR_FACTOR,
      modelAvailable: false,
    };
  }

  const x = [
    ndci,
    depthM,
    temperatureC,
  ];

  const gPerL =
    Math.max(
      0,
      ndciModel.intercept +
        x.reduce(
          (s, v, i) =>
            s +
            v *
              ndciModel
                .coef[i]!,
          0,
        ),
    );

  const learnedLow =
    gPerL *
    ndciModel.interval_low_ratio;

  const learnedHigh =
    gPerL *
    ndciModel.interval_high_ratio;

  const floorLow =
    gPerL /
    LITERATURE_ERROR_FACTOR;

  const floorHigh =
    gPerL *
    LITERATURE_ERROR_FACTOR;

  return {
    gPerL,

    lowGPerL:
      Math.min(
        learnedLow,
        floorLow,
      ),

    highGPerL:
      Math.max(
        learnedHigh,
        floorHigh,
      ),

    modelAvailable: true,
  };
}

// ============================================================
// MODEL STATUS
// ============================================================

export function modelsLoaded():
  Record<string, boolean> {
  return {
    crash_classifier:
      !!crashModel,

    divergence_classifier:
      !!divergenceModel,

    ndci_biomass:
      !!ndciModel,
  };
}