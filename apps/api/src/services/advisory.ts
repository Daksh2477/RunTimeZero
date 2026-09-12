/**
 * Farm advisory — the half of the product an operator actually opens daily.
 *
 * Verification is why a *buyer* trusts us. This is why the *operator* logs in.
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
  /**
   * Site context the crash model needs beyond the probes themselves.
   *
   * Optional because the fleet list does not carry pond geometry and filling
   * it with a guess would be worse than letting the model fall back to the
   * training mean for these columns.
   */
  context?: Partial<CrashContext>;
}

export interface CrashContext {
  depthM: number;
  areaM2: number;
  dayOfYear: number;
  /** Hours since the last weighed harvest. A pond just cut looks thin. */
  hoursSinceHarvest: number;
}

/**
 * Build the crash-model feature vector.
 *
 * MUST stay in lockstep with `windowFeatures()` in
 * `packages/models/train/make_dataset.ts`. If the two drift, the model is
 * scoring something the product never sees and nothing will throw to tell us.
 *
 * The amplitudes are the part worth understanding. A healthy sunlit pond
 * swings dissolved oxygen hard between day and night — photosynthesis
 * supersaturates it by afternoon, respiration strips it by dawn. A pond that
 * stops swinging has stopped photosynthesising, and that shows up before the
 * density visibly falls. It is the one leading indicator the four probes can
 * give us, and an earlier version of this file threw it away.
 */
const minOf = (v: number[]) => (v.length ? Math.min(...v) : 0);
const maxOf = (v: number[]) => (v.length ? Math.max(...v) : 0);

export function crashFeatures(
  recent: TelemetryPoint[],
  ctx: Partial<CrashContext> = {},
): Record<string, number> {
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const hours = spanHours(first, last) || 1;
  // A probe that dropped out leaves nulls; a gap must not read as a zero,
  // which would look to the model like a pond with no diurnal swing at all.
  const values = (f: (t: TelemetryPoint) => number | null) =>
    recent.map(f).filter((n): n is number => n !== null && Number.isFinite(n));
  const amp = (f: (t: TelemetryPoint) => number | null) => {
    const v = values(f);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const sd = (f: (t: TelemetryPoint) => number | null) => {
    const v = values(f);
    if (!v.length) return 0;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  const at = new Date(Date.parse(last.observedAt));
  const doy =
    ctx.dayOfYear ??
    Math.floor(
      (at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 0)) / 86_400_000,
    );

  return {
    ph: last.ph ?? 0,
    do_mgl: last.dissolvedOxygenMgL ?? 0,
    temp_c: last.temperatureC ?? 0,
    od: last.opticalDensity ?? 0,
    ph_trend: delta(first.ph, last.ph) / hours,
    do_trend: delta(first.dissolvedOxygenMgL, last.dissolvedOxygenMgL) / hours,
    od_trend: delta(first.opticalDensity, last.opticalDensity) / hours,
    temp_trend: delta(first.temperatureC, last.temperatureC) / hours,
    ph_mean: meanOf(recent, (t) => t.ph),
    od_mean: meanOf(recent, (t) => t.opticalDensity),
    do_amplitude: amp((t) => t.dissolvedOxygenMgL),
    ph_amplitude: amp((t) => t.ph),
    od_volatility: sd((t) => t.opticalDensity),
    temp_amplitude: amp((t) => t.temperatureC),
    depth_m: ctx.depthM ?? 0.25,
    log_area: Math.log10(Math.max(1, ctx.areaM2 ?? 1200)),
    season_sin: Math.sin((2 * Math.PI * doy) / 365),
    season_cos: Math.cos((2 * Math.PI * doy) / 365),
    hours_since_harvest: ctx.hoursSinceHarvest ?? 84,
    // The meter, not a probe. A stopped paddlewheel reads zero outright,
    // where "oxygen is low" has half a dozen explanations.
    energy_kwh_mean: meanOf(recent, (t) => t.energyKwh),
    mixing_uptime:
      recent.filter((t) => (t.energyKwh ?? 0) > 0).length / recent.length,
    do_min: minOf(values((t) => t.dissolvedOxygenMgL)),
    temp_max: maxOf(values((t) => t.temperatureC)),
    ph_max: maxOf(values((t) => t.ph)),
    od_rel_trend:
      delta(first.opticalDensity, last.opticalDensity) / hours
      / Math.max(0.05, meanOf(recent, (t) => t.opticalDensity)),
  };
}

/**
 * Produce the advisories for one pond, most urgent first.
 *
 * Deliberately rule-based rather than model-driven at this stage. A rule an
 * operator can argue with is better than a model they cannot — and once
 * `crash_classifier` is trained it slots in alongside these, not instead of
 * them. See docs/DECISIONS.md #9.
 */
export function buildAdvisories(input: AdvisoryInput): Advisory[] {
  const out: Advisory[] = [];
  const { recent } = input;
  if (recent.length < 2) return out;

  const latest = recent[recent.length - 1]!;
  const earliest = recent[0]!;
  const hours = spanHours(earliest, latest) || 1;

  const phTrend = delta(earliest.ph, latest.ph) / hours;
  const doTrend =
    delta(earliest.dissolvedOxygenMgL, latest.dissolvedOxygenMgL) / hours;
  const odTrend = delta(earliest.opticalDensity, latest.opticalDensity) / hours;

  // --- culture crash -------------------------------------------------------
  // Two independent signals, and the rule comes first on purpose.
  //
  // The rule: pH falling AND density falling together. Photosynthesis normally
  // pushes pH up, so a culture doing both is dying rather than resting. An
  // operator can check that themselves.
  //
  // The model (crash_classifier; metrics in its .meta.json) catches cases the rule misses, but
  // it is a support, not the authority — a model telling someone to drain a
  // pond without a reason they can verify is worse than no alert at all.
  const risk = crashRisk(crashFeatures(recent, input.context ?? {}));

  const ruleFired = phTrend < -0.02 && odTrend < -0.002;
  // 0.75 rather than the model's own 0.5: a false "drain your pond" costs the
  // operator real biomass, so the model alone has to be quite sure.
  // The trained threshold wins if it is stricter still.
  const modelFired = risk.modelAvailable && risk.probability >= Math.max(0.75, risk.threshold);

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
      costOfInactionInr: Math.round(input.standingBiomassKg * 0.4 * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  if (ruleFired) {
    const hoursToAct = estimateHoursToCollapse(latest.opticalDensity, odTrend);
    const atRisk = input.standingBiomassKg * 0.6;
    out.push({
      kind: 'culture_crash_imminent',
      severity: 'critical',
      title: 'Culture is crashing',
      detail:
        `pH is falling (${fmt(phTrend * 24, 2)}/day) while density drops ` +
        `(${fmt(odTrend * 24, 3)}/day). Together these mean cells are dying, ` +
        `not merely growing slowly.` +
        (risk.modelAvailable
          ? ` The model puts collapse within 48 h at ${Math.round(risk.probability * 100)}%.`
          : ''),
      hoursToAct,
      action:
        'Harvest what you can within the next shift, then drain and re-inoculate. ' +
        'Partial recovery is rare once density has fallen this fast.',
      costOfActingInr: Math.round(input.standingBiomassKg * 2),
      costOfInactionInr: Math.round(atRisk * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  // --- nitrogen starvation -------------------------------------------------
  // Growth stalling while conditions are otherwise fine almost always means
  // the pond has drawn its nitrogen down.
  const growthStalled = Math.abs(odTrend) < 0.0005;
  const conditionsFine =
    inRange(latest.ph, PH_HEALTHY) && inRange(latest.temperatureC, TEMP_HEALTHY);
  if (growthStalled && conditionsFine && input.actualYield7dKg > 0) {
    const lost = input.forecastYieldKg * 0.4;
    out.push({
      kind: 'nitrogen_starvation',
      severity: 'warning',
      title: 'Growth has stalled — likely nutrient limited',
      detail:
        'Light, temperature and pH are all in range, but density has been flat. ' +
        'On a wastewater-fed pond this usually means influent has slowed or the ' +
        'nitrogen has been drawn down.',
      hoursToAct: 48,
      action:
        'Check influent flow first — it is free nitrogen and the cheapest fix. ' +
        'Only dose urea if the effluent supply has genuinely stopped.',
      costOfActingInr: 0,
      costOfInactionInr: Math.round(lost * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  // --- pH drift ------------------------------------------------------------
  if (!inRange(latest.ph, PH_HEALTHY)) {
    const low = (latest.ph ?? 0) < PH_HEALTHY.min;
    out.push({
      kind: 'ph_drift',
      severity: low ? 'warning' : 'info',
      title: low ? 'pH below healthy range' : 'pH above healthy range',
      detail:
        `pH is ${fmt(latest.ph, 2)}; spirulina runs best between ` +
        `${PH_HEALTHY.min} and ${PH_HEALTHY.max}. Outside it, competing organisms ` +
        `gain an advantage.`,
      hoursToAct: low ? 24 : null,
      action: low
        ? 'Add sodium bicarbonate to bring pH back above 8.5. Low pH is what lets ' +
          'contaminants take hold.'
        : 'Increase CO₂ injection or harvest — a very alkaline pond is usually an ' +
          'over-dense one.',
      costOfActingInr: low ? 1500 : 0,
      costOfInactionInr: null,
    });
  }

  // --- thermal stress ------------------------------------------------------
  if (!inRange(latest.temperatureC, TEMP_HEALTHY)) {
    const cold = (latest.temperatureC ?? 0) < TEMP_HEALTHY.min;
    out.push({
      kind: 'thermal_stress',
      severity: 'warning',
      title: cold ? 'Pond too cold for growth' : 'Pond overheating',
      detail:
        `Water is at ${fmt(latest.temperatureC, 1)} °C. Growth effectively stops ` +
        `below ${TEMP_HEALTHY.min} °C and cells are damaged above ${TEMP_HEALTHY.max} °C.`,
      hoursToAct: 12,
      action: cold
        ? 'Reduce depth to warm faster during daylight, and expect no net growth ' +
          'until conditions recover.'
        : 'Increase depth and mixing rate. If a heatwave is forecast, harvest early ' +
          'rather than lose the culture.',
      costOfActingInr: 500,
      costOfInactionInr: Math.round(input.forecastYieldKg * 0.5 * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  // --- oxygen --------------------------------------------------------------
  if (latest.dissolvedOxygenMgL !== null && latest.dissolvedOxygenMgL < DO_HEALTHY.min) {
    out.push({
      kind: 'oxygen_depletion',
      severity: doTrend < 0 ? 'critical' : 'warning',
      title: 'Dissolved oxygen low',
      detail:
        `DO is ${fmt(latest.dissolvedOxygenMgL, 1)} mg/L and ` +
        `${doTrend < 0 ? 'still falling' : 'stable'}. In a healthy sunlit pond this ` +
        `should be well above ${DO_HEALTHY.min}.`,
      hoursToAct: 6,
      action:
        'Check the paddlewheel is turning. Low DO in daylight almost always means ' +
        'mixing has failed and the culture has stratified.',
      costOfActingInr: 0,
      costOfInactionInr: Math.round(input.standingBiomassKg * 0.3 * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  // --- harvest window ------------------------------------------------------
  // Past a certain density the culture shades itself and growth flattens.
  // Harvesting then is not just revenue, it restores productivity.
  if (latest.opticalDensity !== null && latest.opticalDensity > 1.6 && odTrend < 0.001) {
    out.push({
      kind: 'harvest_window',
      severity: 'info',
      title: 'Harvest window open',
      detail:
        'Density is high and growth has flattened — the culture is now shading ' +
        'itself, so additional biomass costs more light than it gains.',
      hoursToAct: null,
      action:
        'Harvest 40–50% of standing biomass. Growth rate recovers within a day ' +
        'once self-shading is relieved.',
      costOfActingInr: Math.round(input.standingBiomassKg * 1.5),
      costOfInactionInr: Math.round(input.forecastYieldKg * 0.25 * BIOMASS_VALUE_INR_PER_KG),
    });
  }

  // --- underperformance ----------------------------------------------------
  if (input.forecastYieldKg > 0) {
    const ratio = input.actualYield7dKg / input.forecastYieldKg;
    if (ratio < 0.7) {
      out.push({
        kind: 'underperforming',
        severity: 'info',
        title: `Yield is ${Math.round((1 - ratio) * 100)}% below forecast`,
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
        costOfInactionInr: Math.round(
          (input.forecastYieldKg - input.actualYield7dKg) * BIOMASS_VALUE_INR_PER_KG,
        ),
      });
    }
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Hours until density reaches a point the culture cannot recover from.
 *
 * Linear extrapolation, deliberately. A fancier curve would imply a precision
 * we do not have, and the operator only needs to know "tonight" versus "this
 * week".
 */
function estimateHoursToCollapse(od: number | null, odTrendPerHour: number): number | null {
  if (od === null || odTrendPerHour >= 0) return null;
  const COLLAPSE_OD = 0.1;
  const hours = (od - COLLAPSE_OD) / Math.abs(odTrendPerHour);
  return Math.max(1, Math.min(168, Math.round(hours)));
}

function spanHours(a: TelemetryPoint, b: TelemetryPoint): number {
  return (Date.parse(b.observedAt) - Date.parse(a.observedAt)) / 3_600_000;
}

function delta(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  return b - a;
}

function meanOf(t: TelemetryPoint[], f: (p: TelemetryPoint) => number | null): number {
  const vals = t.map(f).filter((v): v is number => v !== null);
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
}

function inRange(v: number | null, r: { min: number; max: number }): boolean {
  return v !== null && v >= r.min && v <= r.max;
}

function fmt(v: number | null, dp: number): string {
  return v === null ? '—' : v.toFixed(dp);
}
