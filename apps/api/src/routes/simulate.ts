/**
 * Public simulator endpoint.
 *
 * Runs the same Rust twin the verification engine uses, so a stranger can check
 * our physics without an account and without taking our word for anything. If
 * the simulator and the engine ever disagreed, one of them would be lying —
 * sharing one WASM build is what prevents that.
 *
 * Deliberately unauthenticated. The whole point is that anybody can poke it.
 */

import { Router } from 'express';

import { WasmPond, physics_ceiling_co2_kg } from '../../../../packages/physics/pkg/rtz_physics.js';

export const simulateRouter = Router();

/** Guard rails, so a stray request cannot spin the twin for a decade. */
const LIMITS = {
  areaM2: { min: 50, max: 500_000 },
  depthM: { min: 0.1, max: 1.0 },
  days: { min: 1, max: 120 },
  latDeg: { min: -60, max: 60 },
};

function clamp(v: unknown, r: { min: number; max: number }, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(r.min, Math.min(r.max, n));
}

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

/**
 * Project a pond forward and return daily output plus rough economics.
 *
 * The economics are deliberately blunt and the assumptions are returned with
 * the answer, because a number whose inputs you cannot see is not useful to
 * somebody deciding whether to build a pond.
 */
simulateRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const areaM2 = clamp(body.areaM2, LIMITS.areaM2, 10_000);
  const depthM = clamp(body.depthM, LIMITS.depthM, 0.3);
  const days = Math.round(clamp(body.days, LIMITS.days, 30));
  const latDeg = clamp(body.latDeg, LIMITS.latDeg, 23.03);
  const harvestEvery = Math.round(clamp(body.harvestEveryDays, { min: 2, max: 30 }, 7));

  const startDay = dayOfYear(new Date());
  const pond = new WasmPond(latDeg, areaM2, depthM, BigInt(body.seed ?? 42), startDay);

  const daily: { day: number; co2Kg: number; opticalDensity: number; temperatureC: number }[] = [];
  let totalCo2 = 0;
  let totalHarvestKg = 0;

  for (let d = 0; d < days; d += 1) {
    let dayCo2 = 0;
    let last: { optical_density: number; temperature_c: number } | null = null;
    for (let h = 0; h < 24; h += 1) {
      const r = pond.step();
      dayCo2 += r.reported_co2_kg;
      last = r;
    }
    totalCo2 += dayCo2;
    if ((d + 1) % harvestEvery === 0) totalHarvestKg += pond.harvest(0.45);

    daily.push({
      day: d + 1,
      co2Kg: Number(dayCo2.toFixed(2)),
      opticalDensity: Number((last?.optical_density ?? 0).toFixed(3)),
      temperatureC: Number((last?.temperature_c ?? 0).toFixed(1)),
    });
  }

  const ceilingCo2Kg: number = physics_ceiling_co2_kg(latDeg, areaM2, depthM, startDay, days, 30);

  // Blunt economics. Every rate is stated in the response so the caller can
  // disagree with our assumptions rather than with our arithmetic.
  const RATES = {
    biofertiliserInrPerKg: 12,
    paddlewheelWPerM2: 0.5,
    tariffInrPerKwh: 8,
    creditInrPerTonne: 1500,
    labourInrPerDay: 400,
    burialInrPerKg: 2,
  };

  const paddlewheelKwh = (RATES.paddlewheelWPerM2 * areaM2 * 24 * days) / 1000;
  const energyCost = paddlewheelKwh * RATES.tariffInrPerKwh;
  const labourCost = RATES.labourInrPerDay * days * Math.max(1, areaM2 / 20_000);
  // Harvesting and drying dominate real operating cost, and the method chosen
  // swings it by an order of magnitude. We use a mid-range figure and say so.
  const harvestCost = totalHarvestKg * 6;
  const totalCost = energyCost + labourCost + harvestCost;

  /*
   * Biomass revenue and carbon revenue are MUTUALLY EXCLUSIVE, and an earlier
   * version of this endpoint added them together.
   *
   * That was not a rounding error, it contradicted the central argument of the
   * whole project: selling biomass as fertiliser puts the carbon back into the
   * atmosphere within a season, so it is utilisation and earns no removal
   * credit. Burying it or converting it to biochar earns the credit but
   * forfeits the sale. You pick one.
   *
   * So we return both scenarios and let the operator see the trade-off, which
   * is the decision they actually face.
   */
  const sellRevenue = totalHarvestKg * RATES.biofertiliserInrPerKg;
  const sequesterRevenue = (totalCo2 / 1000) * RATES.creditInrPerTonne;
  // Burial costs money that selling does not — transport and covering.
  const burialCost = totalHarvestKg * RATES.burialInrPerKg;

  res.json({
    inputs: { areaM2, depthM, days, latDeg, harvestEveryDays: harvestEvery },
    daily,
    totals: {
      co2Kg: Number(totalCo2.toFixed(1)),
      harvestedDryKg: Number(totalHarvestKg.toFixed(1)),
      ceilingCo2Kg: Number(ceilingCo2Kg.toFixed(1)),
      // How close the pond ran to what physics allowed. Real ponds land well
      // under; anything near 1.0 means the model has drifted.
      ceilingUtilisation: Number((totalCo2 / ceilingCo2Kg).toFixed(3)),
      yieldGPerM2PerDay: Number(((totalHarvestKg * 1000) / areaM2 / days).toFixed(1)),
    },
    economics: {
      energyCostInr: Math.round(energyCost),
      labourCostInr: Math.round(labourCost),
      harvestCostInr: Math.round(harvestCost),
      totalCostInr: Math.round(totalCost),
      biomassRevenueInr: Math.round(sellRevenue),
      creditRevenueInr: Math.round(sequesterRevenue),
      // Defaults to selling, because that is what almost every operator
      // actually does. The sequester figure is the alternative, not an addition.
      netInr: Math.round(sellRevenue - totalCost),
      scenarios: {
        sellAsFertiliser: {
          revenueInr: Math.round(sellRevenue),
          costInr: Math.round(totalCost),
          netInr: Math.round(sellRevenue - totalCost),
          creditableCo2Kg: 0,
          note: 'Carbon returns to the atmosphere, so nothing is creditable.',
        },
        sequester: {
          revenueInr: Math.round(sequesterRevenue),
          costInr: Math.round(totalCost + burialCost),
          netInr: Math.round(sequesterRevenue - totalCost - burialCost),
          creditableCo2Kg: Number(totalCo2.toFixed(1)),
          note: 'Buried or converted to biochar. Earns credits, forfeits the sale.',
        },
      },
      assumptions: RATES,
      note:
        'Biomass and carbon revenue are alternatives, never both — selling the ' +
        'biomass releases the carbon. Harvesting and drying dominate cost and ' +
        'swing by an order of magnitude with the method chosen. A shape, not a quote.',
    },
  });
});
