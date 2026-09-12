/** Evidence-supported biomass, with explicit uncertainty and inventory balance. */
import { CO2_PER_KG_BIOMASS, type ObservationChannel } from '@rtz/types';
import type { ObservationRow, PondRow } from '../db/client.ts';

export interface HarvestEvidence {
  id: string;
  harvestedAt: string;
  dryMassKg: number;
  ref: string | null;
}

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

// Provisional uncertainty assumptions, not calibrated confidence intervals.
const FACTOR: Record<ObservationChannel, number> = {
  weighbridge: 1.1, field_sample: 1.2, drone: 1.6, sentinel2: 2.4,
};
const CHANNELS: ObservationChannel[] = ['weighbridge', 'field_sample', 'drone', 'sentinel2'];
const finiteMass = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function estimateFromObservations(
  observations: ObservationRow[],
  pond: PondRow,
  harvests: number | HarvestEvidence[] = [],
): Estimate | null {
  if (![pond.areaM2, pond.depthM].every((n) => Number.isFinite(n) && n > 0)) return null;
  const usable = observations.filter((o) => {
    if (!o.sourceRef.trim() || !Number.isFinite(Date.parse(o.observedAt))) return false;
    if (o.channel === 'weighbridge' || o.channel === 'field_sample') return finiteMass(o.measuredDryMassKg);
    if (!(o.channel === 'drone' || o.channel === 'sentinel2')) return false;
    if (o.channel === 'sentinel2' && pond.widthM < 40) return false;
    return typeof o.chlorophyllIndex === 'number' && Number.isFinite(o.chlorophyllIndex)
      && Math.abs(o.chlorophyllIndex) <= 1 && o.cloudFraction !== null
      && Number.isFinite(o.cloudFraction) && o.cloudFraction >= 0 && o.cloudFraction <= 0.3;
  });

  for (const channel of CHANNELS) {
    const unique = new Map<string, ObservationRow>();
    for (const o of usable.filter((item) => item.channel === channel)) {
      const previous = unique.get(o.sourceRef);
      // A source cannot support conflicting quantities. Do not choose a favourable revision.
      if (previous && (previous.measuredDryMassKg !== o.measuredDryMassKg ||
          previous.chlorophyllIndex !== o.chlorophyllIndex)) return null;
      unique.set(o.sourceRef, o);
    }
    const selected = [...unique.values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    if (!selected.length) continue;
    const factor = FACTOR[channel];
    let mass: number, low: number, high: number;
    if (channel === 'weighbridge') {
      // Tickets already measure harvested mass. Never add the harvest ledger again.
      mass = selected.reduce((sum, o) => sum + o.measuredDryMassKg!, 0);
      low = mass / factor; high = mass * factor;
    } else {
      if (selected.length < 2) continue;
      const first = selected[0]!, last = selected[selected.length - 1]!;
      if (Date.parse(last.observedAt) <= Date.parse(first.observedAt)) continue;
      const standing = (o: ObservationRow) => channel === 'field_sample'
        ? o.measuredDryMassKg!
        // Placeholder calibration. g/L equals kg/m³, multiplied by pond volume.
        : Math.max(0, o.chlorophyllIndex!) * 2.5 * pond.areaM2 * pond.depthM;
      const start = standing(first), end = standing(last);
      let harvested = 0;
      if (typeof harvests === 'number') {
        if (!finiteMass(harvests)) return null;
        harvested = harvests; // Legacy caller must supply the same observation interval.
      } else {
        const tickets = new Map<string, number>();
        for (const h of harvests) {
          const time = Date.parse(h.harvestedAt);
          if (!Number.isFinite(time) || time <= Date.parse(first.observedAt) || time > Date.parse(last.observedAt)) continue;
          // Unreferenced harvest assertions cannot raise independent evidence.
          if (!h.ref?.trim()) continue;
          if (!finiteMass(h.dryMassKg)) return null;
          if (tickets.has(h.ref) && tickets.get(h.ref) !== h.dryMassKg) return null;
          tickets.set(h.ref, h.dryMassKg);
        }
        harvested = [...tickets.values()].reduce((sum, n) => sum + n, 0);
      }
      // Preserve losses until after accounting for harvests. Propagate endpoint
      // uncertainty separately: a small difference of uncertain stocks is not precise.
      mass = Math.max(0, end - start + harvested);
      low = Math.max(0, end / factor - start * factor + harvested / FACTOR.weighbridge);
      high = Math.max(0, end * factor - start / factor + harvested * FACTOR.weighbridge);
    }
    if (![mass, low, high].every(finiteMass)) return null;
    return { biomassKg: mass, biomassLowKg: low, biomassHighKg: high,
      co2Kg: mass * CO2_PER_KG_BIOMASS, co2LowKg: low * CO2_PER_KG_BIOMASS,
      co2HighKg: high * CO2_PER_KG_BIOMASS, channel, observationIds: selected.map((o) => o.id) };
  }
  return null;
}
