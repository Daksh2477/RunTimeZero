/**
 * Farm advisory — the half of the product an operator actually opens daily.
 *
 * Verification is why a buyer trusts us. This is why the operator logs in.
 * If we only shipped the carbon half, nobody would run the platform long enough
 * to generate the carbon data.
 *
 * Every advisory here answers three questions in order:
 *   1. What is wrong, or about to be?
 *   2. How long do I have?
 *   3. What does acting cost, versus not acting?
 *
 * An alert that stops at (1) is noise. Operators ignore dashboards that shout
 * without telling them what to do.
 */

import type { TelemetryPoint } from '@rtz/types';
import { crashRisk } from '../models/infer.ts';

export type Severity = 'critical' | 'warning' | 'info';

export type AdvisoryKind =
  | 'culture_crash_imminent'
  | 'nitrogen_starvation'
  | 'ph_drift'
  | 'thermal_stress'
  | 'oxygen_depletion'
  | 'harvest_window'
  | 'underperforming';

export interface Advisory {
  kind: AdvisoryKind;
  severity: Severity;
  title: string;

  /** What we saw, in the operator's terms — never raw sensor jargon. */
  detail: string;

  /** Hours until this becomes irreversible. Null when not time-critical. */
  hoursToAct: number | null;

  /** Concrete instruction. Must be something a person can do today. */
  action: string;

  /** Rough cost of acting, INR. */
  costOfActingInr: number | null;

  /** Rough cost of NOT acting, INR — usually lost biomass. */
  costOfInactionInr: number | null;
}

/** Value of dry biomass, INR/kg. Conservative wastewater-grade biofertiliser. */
const BIOMASS_VALUE_INR_PER_KG = 12;

/** Healthy operating envelopes for spirulina in an open raceway. */
const PH_HEALTHY = { min: 8.5, max: 10.5 };
const TEMP_HEALTHY = { min: 20, max: 38 };
const DO_HEALTHY = { min: 4.0, max: 16.0 };

export interface AdvisoryInput {
  /** Recent readings, oldest first. At least 12 h for trends to mean anything. */
  recent: TelemetryPoint[];

  /** Standing biomass, kg — what is at risk. */
  standingBiomassKg: number;

  /** Forecast yield for the next 72 h, kg. From the physics model. */
  forecastYieldKg: number;

  /** Actual yield over the trailing 7 days, kg. */
  actualYield7dKg: number;
}

/**
 * Produce the advisories for one pond, most urgent first.
 *
 * The rule-based advisories remain the primary operator-facing signals.
 * The crash classifier is used as an additional support signal.
 */
export function buildAdvisories(input: AdvisoryInput): Advisory[] {
  const out: Advisory[] = [];
  const { recent } = input;

  if (recent.length < 2) return out;

  const latest = recent[recent.length - 1]!;
  const previous = recent[recent.length - 2]!;

  // ----------------------------------------------------------
  // Crash-model feature calculation
  //
  // The ATP3 training pipeline calculates trends using the
  // current point against the previous available point.
  //
  // The previous implementation used the first point in the
  // entire 48-hour telemetry window, which smoothed out rapid
  // changes and did not match the training feature definition.
  // ----------------------------------------------------------

  const hours = spanHours(previous, latest) || 1;

  const phTrend =
    delta(previous.ph, latest.ph) / hours;

  const doTrend =
    delta(
      previous.dissolvedOxygenMgL,
      latest.dissolvedOxygenMgL,
    ) / hours;

  const odTrend =
    delta(
      previous.opticalDensity,
      latest.opticalDensity,
    ) / hours;

  const tempTrend =
    delta(
      previous.temperatureC,
      latest.temperatureC,
    ) / hours;

  // Match the training pipeline's rolling history:
  // current point + previous two available points.
  const history =
    recent.slice(
      Math.max(0, recent.length - 3),
    );

  const phMean =
    meanOf(
      history,
      (t) => t.ph,
    );

  const odMean =
    meanOf(
      history,
      (t) => t.opticalDensity,
    );

  // --- culture crash -------------------------------------------------------
  //
  // Two independent signals, and the rule comes first on purpose.
  //
  // The rule: pH falling AND density falling together. Photosynthesis normally
  // pushes pH up, so a culture doing both is dying rather than resting.
  // An operator can check that themselves.
  //
  // The model catches cases the rule misses, but it is a support signal,
  // not the authority.
  const risk = crashRisk({
    ph: latest.ph ?? 0,
    do_mgl:
      latest.dissolvedOxygenMgL ?? 0,
    temp_c:
      latest.temperatureC ?? 0,
    od:
      latest.opticalDensity ?? 0,

    ph_trend: phTrend,
    do_trend: doTrend,
    od_trend: odTrend,
    temp_trend: tempTrend,

    ph_mean: phMean,
    od_mean: odMean,
  });

  // Temporary diagnostic logging while validating the real ATP3 model.
  console.log('[CRASH INPUT]', {
    ph: latest.ph,
    do_mgl: latest.dissolvedOxygenMgL,
    temp_c: latest.temperatureC,
    od: latest.opticalDensity,
    ph_trend: phTrend,
    do_trend: doTrend,
    od_trend: odTrend,
    temp_trend: tempTrend,
    ph_mean: phMean,
    od_mean: odMean,
  });

  console.log('[CRASH ML]', {
    probability: risk.probability,
    modelAvailable: risk.modelAvailable,
    dominantFactor: risk.dominantFactor,
  });

  const ruleFired =
    phTrend < -0.02 &&
    odTrend < -0.002;

  // Conservative threshold:
  // the model alone must be quite sure before creating a crash warning.
  const modelFired =
    risk.modelAvailable &&
    risk.probability >= 0.75;

  if (!ruleFired && modelFired) {
    out.push({
      kind: 'culture_crash_imminent',
      severity: 'warning',
      title: 'Crash risk rising',
      detail:
        `Conditions resemble ponds that collapsed within two days — the strongest ` +
        `signal is ${risk.dominantFactor}. The usual pH-and-density signature is not ` +
        `showing yet, so treat this as worth a look rather than an emergency.`,
      hoursToAct: 48,
      action:
        'Inspect the pond and check the paddlewheel. If density starts falling ' +
        'alongside pH, harvest early rather than lose the culture.',
      costOfActingInr: 0,
      costOfInactionInr:
        Math.round(
          input.standingBiomassKg *
            0.4 *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  if (ruleFired) {
    const hoursToAct =
      estimateHoursToCollapse(
        latest.opticalDensity,
        odTrend,
      );

    const atRisk =
      input.standingBiomassKg * 0.6;

    out.push({
      kind: 'culture_crash_imminent',
      severity: 'critical',
      title: 'Culture is crashing',
      detail:
        `pH is falling (${fmt(phTrend * 24, 2)}/day) while density drops ` +
        `(${fmt(odTrend * 24, 3)}/day). Together these mean cells are dying, ` +
        `not merely growing slowly.` +
        (risk.modelAvailable
          ? ` The model puts collapse within 48 h at ` +
            `${Math.round(risk.probability * 100)}%.`
          : ''),
      hoursToAct,
      action:
        'Harvest what you can within the next shift, then drain and re-inoculate. ' +
        'Partial recovery is rare once density has fallen this fast.',
      costOfActingInr:
        Math.round(
          input.standingBiomassKg * 2,
        ),
      costOfInactionInr:
        Math.round(
          atRisk *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  // --- nitrogen starvation -------------------------------------------------
  //
  // Growth stalling while conditions are otherwise fine almost always means
  // the pond has drawn its nitrogen down.
  const growthStalled =
    Math.abs(odTrend) < 0.0005;

  const conditionsFine =
    inRange(
      latest.ph,
      PH_HEALTHY,
    ) &&
    inRange(
      latest.temperatureC,
      TEMP_HEALTHY,
    );

  if (
    growthStalled &&
    conditionsFine &&
    input.actualYield7dKg > 0
  ) {
    const lost =
      input.forecastYieldKg * 0.4;

    out.push({
      kind: 'nitrogen_starvation',
      severity: 'warning',
      title:
        'Growth has stalled — likely nutrient limited',
      detail:
        'Light, temperature and pH are all in range, but density has been flat. ' +
        'On a wastewater-fed pond this usually means influent has slowed or the ' +
        'nitrogen has been drawn down.',
      hoursToAct: 48,
      action:
        'Check influent flow first — it is free nitrogen and the cheapest fix. ' +
        'Only dose urea if the effluent supply has genuinely stopped.',
      costOfActingInr: 0,
      costOfInactionInr:
        Math.round(
          lost *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  // --- pH drift ------------------------------------------------------------

  if (
    !inRange(
      latest.ph,
      PH_HEALTHY,
    )
  ) {
    const low =
      (latest.ph ?? 0) <
      PH_HEALTHY.min;

    out.push({
      kind: 'ph_drift',
      severity:
        low
          ? 'warning'
          : 'info',
      title:
        low
          ? 'pH below healthy range'
          : 'pH above healthy range',
      detail:
        `pH is ${fmt(latest.ph, 2)}; spirulina runs best between ` +
        `${PH_HEALTHY.min} and ${PH_HEALTHY.max}. Outside it, competing organisms ` +
        `gain an advantage.`,
      hoursToAct:
        low ? 24 : null,
      action:
        low
          ? 'Add sodium bicarbonate to bring pH back above 8.5. Low pH is what lets ' +
            'contaminants take hold.'
          : 'Increase CO₂ injection or harvest — a very alkaline pond is usually an ' +
            'over-dense one.',
      costOfActingInr:
        low ? 1500 : 0,
      costOfInactionInr: null,
    });
  }

  // --- thermal stress ------------------------------------------------------

  if (
    !inRange(
      latest.temperatureC,
      TEMP_HEALTHY,
    )
  ) {
    const cold =
      (latest.temperatureC ?? 0) <
      TEMP_HEALTHY.min;

    out.push({
      kind: 'thermal_stress',
      severity: 'warning',
      title:
        cold
          ? 'Pond too cold for growth'
          : 'Pond overheating',
      detail:
        `Water is at ${fmt(latest.temperatureC, 1)} °C. Growth effectively stops ` +
        `below ${TEMP_HEALTHY.min} °C and cells are damaged above ${TEMP_HEALTHY.max} °C.`,
      hoursToAct: 12,
      action:
        cold
          ? 'Reduce depth to warm faster during daylight, and expect no net growth ' +
            'until conditions recover.'
          : 'Increase depth and mixing rate. If a heatwave is forecast, harvest early ' +
            'rather than lose the culture.',
      costOfActingInr: 500,
      costOfInactionInr:
        Math.round(
          input.forecastYieldKg *
            0.5 *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  // --- oxygen --------------------------------------------------------------

  if (
    latest.dissolvedOxygenMgL !== null &&
    latest.dissolvedOxygenMgL <
      DO_HEALTHY.min
  ) {
    out.push({
      kind: 'oxygen_depletion',
      severity:
        doTrend < 0
          ? 'critical'
          : 'warning',
      title:
        'Dissolved oxygen low',
      detail:
        `DO is ${fmt(latest.dissolvedOxygenMgL, 1)} mg/L and ` +
        `${doTrend < 0 ? 'still falling' : 'stable'}. In a healthy sunlit pond this ` +
        `should be well above ${DO_HEALTHY.min}.`,
      hoursToAct: 6,
      action:
        'Check the paddlewheel is turning. Low DO in daylight almost always means ' +
        'mixing has failed and the culture has stratified.',
      costOfActingInr: 0,
      costOfInactionInr:
        Math.round(
          input.standingBiomassKg *
            0.3 *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  // --- harvest window ------------------------------------------------------

  //
  // Past a certain density the culture shades itself and growth flattens.
  // Harvesting then is not just revenue, it restores productivity.
  if (
    latest.opticalDensity !== null &&
    latest.opticalDensity > 1.6 &&
    odTrend < 0.001
  ) {
    out.push({
      kind: 'harvest_window',
      severity: 'info',
      title:
        'Harvest window open',
      detail:
        'Density is high and growth has flattened — the culture is now shading ' +
        'itself, so additional biomass costs more light than it gains.',
      hoursToAct: null,
      action:
        'Harvest 40–50% of standing biomass. Growth rate recovers within a day ' +
        'once self-shading is relieved.',
      costOfActingInr:
        Math.round(
          input.standingBiomassKg * 1.5,
        ),
      costOfInactionInr:
        Math.round(
          input.forecastYieldKg *
            0.25 *
            BIOMASS_VALUE_INR_PER_KG,
        ),
    });
  }

  // --- underperformance ----------------------------------------------------

  if (
    input.forecastYieldKg > 0
  ) {
    const ratio =
      input.actualYield7dKg /
      input.forecastYieldKg;

    if (ratio < 0.7) {
      out.push({
        kind: 'underperforming',
        severity: 'info',
        title:
          `Yield is ${Math.round((1 - ratio) * 100)}% below forecast`,
        detail:
          `This pond produced ${fmt(input.actualYield7dKg, 0)} kg against a ` +
          `physics forecast of ${fmt(input.forecastYieldKg, 0)} kg. Persistent ` +
          `shortfall usually points to fouling, shading or a mixing problem ` +
          `rather than weather.`,
        hoursToAct: null,
        action:
          'Compare against your other ponds this week. Same strain and same ' +
          'weather with different output is a maintenance signal.',
        costOfActingInr: null,
        costOfInactionInr:
          Math.round(
            (input.forecastYieldKg -
              input.actualYield7dKg) *
              BIOMASS_VALUE_INR_PER_KG,
          ),
      });
    }
  }

  // Most urgent first.
  const rank: Record<
    Severity,
    number
  > = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return out.sort(
    (a, b) =>
      rank[a.severity] -
      rank[b.severity],
  );
}

/**
 * Hours until density reaches a point the culture cannot recover from.
 *
 * Linear extrapolation, deliberately. A fancier curve would imply a precision
 * we do not have, and the operator only needs to know "tonight" versus "this
 * week".
 */
function estimateHoursToCollapse(
  od: number | null,
  odTrendPerHour: number,
): number | null {
  if (
    od === null ||
    odTrendPerHour >= 0
  ) {
    return null;
  }

  const COLLAPSE_OD = 0.1;

  const hours =
    (od - COLLAPSE_OD) /
    Math.abs(odTrendPerHour);

  return Math.max(
    1,
    Math.min(
      168,
      Math.round(hours),
    ),
  );
}

function spanHours(
  a: TelemetryPoint,
  b: TelemetryPoint,
): number {
  return (
    Date.parse(b.observedAt) -
    Date.parse(a.observedAt)
  ) / 3_600_000;
}

function delta(
  a: number | null,
  b: number | null,
): number {
  if (
    a === null ||
    b === null
  ) {
    return 0;
  }

  return b - a;
}

function meanOf(
  t: TelemetryPoint[],
  f: (
    p: TelemetryPoint,
  ) => number | null,
): number {
  const vals =
    t
      .map(f)
      .filter(
        (v): v is number =>
          v !== null,
      );

  return vals.length === 0
    ? 0
    : vals.reduce(
        (a, b) => a + b,
        0,
      ) / vals.length;
}

function inRange(
  v: number | null,
  r: {
    min: number;
    max: number;
  },
): boolean {
  return (
    v !== null &&
    v >= r.min &&
    v <= r.max
  );
}

function fmt(
  v: number | null,
  dp: number,
): string {
  return v === null
    ? '—'
    : v.toFixed(dp);
}