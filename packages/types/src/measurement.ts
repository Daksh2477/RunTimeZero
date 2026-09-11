/**
 * The two streams, kept deliberately separate in the type system.
 *
 * `Telemetry` is operator-controlled and is ALWAYS an unverified assertion,
 * whoever owns the sensor. `IndependentObservation` is evidence the operator
 * does not produce. Nothing in this file should ever let one be assigned to
 * the other — that separation is the whole product.
 */

/** The stoichiometric constant the entire project rests on. */
export const CO2_PER_KG_BIOMASS = 1.83;

/**
 * One reading from the operator's own instruments. Append-only in the database.
 *
 * Treated as a claim, not a fact. The `source` field records where it came
 * from, but does NOT raise its trust level — a SCADA feed and a typed-in number
 * are both assertions.
 */
export interface TelemetryPoint {
  id: string;
  pondId: string;
  observedAt: string;
  source: 'sensor' | 'manual' | 'scada' | 'simulated';
  /** Cumulative CO₂ uptake claimed for the window ending at observedAt, in kg. */
  co2UptakeKg: number | null;
  ph: number | null;
  dissolvedOxygenMgL: number | null;
  temperatureC: number | null;
  /** Optical density at 680 nm — a biomass proxy, needs a fixed-path flow cell. */
  opticalDensity: number | null;
  /** Paddlewheel + pump draw in kWh for the window. Feeds the expense ledger. */
  energyKwh: number | null;
}

/** Which independent channel produced an observation. Mirrors the site tier. */
export type ObservationChannel =
  | 'sentinel2'
  | 'drone'
  | 'weighbridge'
  | 'field_sample';

/**
 * Evidence the operator does not control.
 *
 * For satellite and drone this is a chlorophyll index. For the smallholder tier
 * it is a weighed harvest, which is cruder in frequency but far stronger in
 * kind — a mass on a public scale is harder to forge quietly than a sensor feed.
 */
export interface IndependentObservation {
  id: string;
  pondId: string;
  observedAt: string;
  channel: ObservationChannel;
  /** NDCI or equivalent. Null for weighbridge observations. */
  chlorophyllIndex: number | null;
  /** Directly weighed dry-equivalent mass in kg. Null for imagery channels. */
  measuredDryMassKg: number | null;
  /** Scene or flight identifier, so a third party can re-fetch the same source. */
  sourceRef: string;
  /** Fraction of the pond obscured by cloud. Above ~0.3 the sample is unusable. */
  cloudFraction: number | null;
}

/**
 * A biomass figure derived from an independent observation.
 *
 * Always carries a band. A point estimate without bounds is not usable for
 * verification: validated NDCI runs to a mean absolute error factor near 2.4,
 * so we compare intervals, never numbers.
 */
export interface IndependentEstimate {
  id: string;
  pondId: string;
  windowStart: string;
  windowEnd: string;
  channel: ObservationChannel;
  biomassKg: number;
  biomassLowKg: number;
  biomassHighKg: number;
  /** biomassKg × CO2_PER_KG_BIOMASS, carried for convenience. */
  co2Kg: number;
  co2LowKg: number;
  co2HighKg: number;
  observationIds: string[];
}

/**
 * The maximum biomass gain physically achievable for a pond in a window.
 *
 * Computed from pond geometry, incident light and temperature alone. It uses no
 * fitted model and no training data — only arithmetic — which is exactly why a
 * claim above it is not "suspicious" but impossible.
 */
export interface PhysicsCeiling {
  pondId: string;
  windowStart: string;
  windowEnd: string;
  maxBiomassKg: number;
  maxCo2Kg: number;
  /** Inputs echoed back so the figure can be recomputed by anyone. */
  inputs: {
    areaM2: number;
    meanIrradianceWM2: number;
    meanTempC: number;
    photosyntheticEfficiency: number;
  };
}

export function co2FromBiomass(biomassKg: number): number {
  return biomassKg * CO2_PER_KG_BIOMASS;
}

export function biomassFromCo2(co2Kg: number): number {
  return co2Kg / CO2_PER_KG_BIOMASS;
}
