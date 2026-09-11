/**
 * The operator's cost base.
 *
 * This exists because an expense line the console cannot see is an expense the
 * operator will not trust it about. It is also where our own research landed
 * somewhere counter-intuitive: growing algae is cheap, and getting it out of
 * the water is not. Mixing is ~69% of a raceway's utilities, but harvesting and
 * dewatering an open-pond broth can reach 4.5 kWh per kg, and thermal drying
 * alone can be ~30% of total production cost.
 *
 * So the panel's real job is making the harvesting and drying method visible
 * BEFORE it is locked in concrete — not tallying receipts afterwards.
 */

export type ExpenseCategory =
  | 'paddlewheel' //  continuous mixing load, ~0.22–0.73 W/m²
  | 'pumping' //      influent, effluent, recirculation
  | 'harvesting' //   THE swing factor — flocculation vs centrifuge is an order of magnitude
  | 'drying' //       solar is near-free but weather-bound; thermal dominates where used
  | 'nutrients' //    zero on a wastewater site, which is the point of siting there
  | 'co2' //          zero unless a concentrated stream is purchased
  | 'make_up_water'
  | 'labour'
  | 'maintenance'
  | 'platform'; //    our own fee

/** How the biomass is separated from the water. Dominates total operating cost. */
export type HarvestMethod =
  | 'flocculation_settling' // cheap, slow, lower recovery
  | 'centrifuge' //           fast, high recovery, expensive to run
  | 'filtration'
  | 'manual';

export type DryingMethod = 'solar' | 'thermal' | 'none';

export interface ExpenseRecord {
  id: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  category: ExpenseCategory;
  amountInr: number;
  /** Present for electricity categories, so cost can be re-derived at a new tariff. */
  energyKwh: number | null;
  note: string | null;
}

/** Unit economics for a period. Computed, never stored. */
export interface UnitEconomics {
  siteId: string;
  periodStart: string;
  periodEnd: string;
  totalCostInr: number;
  biomassKg: number;
  co2Kg: number;
  costPerKgBiomassInr: number;
  costPerTonneCo2Inr: number;
  /** Share of total cost by category — where the money actually went. */
  breakdown: Record<ExpenseCategory, number>;
}

/**
 * Energy the site did NOT spend, versus conventional activated-sludge treatment.
 *
 * This is usually a larger and more defensible carbon line than the CO₂ the
 * algae absorbs. Aeration is 50–60% of a conventional plant's total energy, and
 * an algal pond oxygenates photosynthetically instead. It is auditable straight
 * from the host's existing meter data, which biological sequestration is not.
 */
export interface AvoidedEnergy {
  siteId: string;
  periodStart: string;
  periodEnd: string;
  /** What an activated-sludge line would have drawn for this effluent load. */
  baselineKwh: number;
  /** What the pond actually drew. */
  actualKwh: number;
  avoidedKwh: number;
  /** Grid emission factor used, kg CO₂ per kWh. Stated so it can be challenged. */
  gridFactorKgPerKwh: number;
  avoidedCo2Kg: number;
}
