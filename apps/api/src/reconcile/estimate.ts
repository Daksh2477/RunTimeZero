/**
 * Turning independent observations into a biomass estimate — always with a band.
 *
 * The band is not a nicety. Validated NDCI carries a mean absolute error factor
 * near 2.4, so a point estimate would be dishonest. We compare intervals, and a
 * wide interval simply means we credit less. That is the correct incentive: an
 * operator who wants a tighter band installs better instrumentation.
 */

import { CO2_PER_KG_BIOMASS, type ObservationChannel } from '@rtz/types';
import type { ObservationRow, PondRow } from '../db/client.ts';

export interface Estimate {
  biomassKg: number;
  biomassLowKg: number;
  biomassHighKg: number;
  co2Kg: number;
  co2LowKg: number;
  co2HighKg: number;
  channel: ObservationChannel;
  observationIds: string[];
}

/**
 * Band width by channel, as a multiplicative factor.
 *
 * These encode how much we trust each independent channel, and they are the
 * honest reason a smallholder with no instruments still gets credits — just
 * fewer of them.
 */
const BAND_FACTOR: Record<ObservationChannel, number> = {
  // A mass on a public weighbridge is the strongest evidence we accept:
  // crude in frequency, very hard to forge quietly. ±10%.
  weighbridge: 1.1,
  // A physical sample, measured in a lab. ±20%.
  field_sample: 1.2,
  // Close-range imagery, controlled distance and lighting. ±60%.
  drone: 1.6,
  // Sentinel-2 NDCI. Published error factor ~2.4 — we use it as-is rather than
  // pretending our pipeline is better than the literature.
  sentinel2: 2.4,
};

/** Cloud cover above this makes a satellite observation unusable. */
const MAX_CLOUD_FRACTION = 0.3;

/**
 * Empirical NDCI → biomass density mapping, g/L.
 *
 * A placeholder linear fit until `packages/models/ndci_biomass` is trained on a
 * dilution series. Deliberately kept crude and obviously provisional: an
 * over-confident curve here would be worse than an honest straight line,
 * because the band is doing the real work.
 */
function ndciToBiomassGPerL(ndci: number): number {
  const clamped = Math.max(0, Math.min(1, ndci));
  return clamped * 2.5;
}

/**
 * Build an estimate from whatever independent evidence exists in the window.
 *
 * Returns null when there is nothing usable — the caller must then refuse to
 * credit rather than fall back to the operator's own number.
 */
export function estimateFromObservations(
  observations: ObservationRow[],
  pond: PondRow,
): Estimate | null {
  const usable = observations.filter(isUsable);
  if (usable.length === 0) return null;

  // Prefer the strongest channel present. A weighbridge ticket beats a
  // satellite pass for the same window, every time.
  const channel = strongestChannel(usable);
  const relevant = usable.filter((o) => o.channel === channel);

  const biomassKg =
    channel === 'weighbridge' || channel === 'field_sample'
      ? sumDirectMass(relevant)
      : inferFromImagery(relevant, pond);

  if (!Number.isFinite(biomassKg) || biomassKg < 0) return null;

  const factor = BAND_FACTOR[channel];
  const biomassLowKg = biomassKg / factor;
  const biomassHighKg = biomassKg * factor;

  return {
    biomassKg,
    biomassLowKg,
    biomassHighKg,
    co2Kg: biomassKg * CO2_PER_KG_BIOMASS,
    co2LowKg: biomassLowKg * CO2_PER_KG_BIOMASS,
    co2HighKg: biomassHighKg * CO2_PER_KG_BIOMASS,
    channel,
    observationIds: relevant.map((o) => o.id),
  };
}

function isUsable(o: ObservationRow): boolean {
  if (o.channel === 'weighbridge' || o.channel === 'field_sample') {
    return o.measuredDryMassKg !== null && o.measuredDryMassKg >= 0;
  }
  if (o.chlorophyllIndex === null) return false;
  // A cloudy scene tells us about the cloud, not the pond.
  if (o.cloudFraction !== null && o.cloudFraction > MAX_CLOUD_FRACTION) return false;
  return true;
}

const CHANNEL_RANK: ObservationChannel[] = [
  'weighbridge',
  'field_sample',
  'drone',
  'sentinel2',
];

function strongestChannel(observations: ObservationRow[]): ObservationChannel {
  for (const c of CHANNEL_RANK) {
    if (observations.some((o) => o.channel === c)) return c;
  }
  return 'sentinel2';
}

/** Directly weighed mass needs no inference — just add it up. */
function sumDirectMass(observations: ObservationRow[]): number {
  return observations.reduce((sum, o) => sum + (o.measuredDryMassKg ?? 0), 0);
}

/**
 * Growth implied by imagery: the change in standing biomass across the window.
 *
 * We use first-to-last rather than averaging, because what we need is the
 * *gain* over the window, not the level. A pond that sat at a constant density
 * grew nothing, however dense it was.
 */
function inferFromImagery(observations: ObservationRow[], pond: PondRow): number {
  if (observations.length < 2) {
    // A single scene gives a level, not a gain. Treating one observation as
    // growth would manufacture carbon out of a photograph.
    return 0;
  }

  const sorted = [...observations].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const startGPerL = ndciToBiomassGPerL(first.chlorophyllIndex ?? 0);
  const endGPerL = ndciToBiomassGPerL(last.chlorophyllIndex ?? 0);
  const deltaGPerL = Math.max(0, endGPerL - startGPerL);

  // g/L × litres → g → kg. Pond volume is area × depth × 1000 L/m³.
  const volumeL = pond.areaM2 * pond.depthM * 1000;
  return (deltaGPerL * volumeL) / 1000;
}
