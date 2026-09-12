/**
 * The pond twin, running in the browser.
 *
 * WHY THIS RUNS CLIENT-SIDE
 *
 * Dragging a slider has to move the numbers immediately. A round trip to the
 * API is 100–300 ms on a good connection and far worse on rural mobile, which
 * turns "explore what happens if I go deeper" into "wait, then read". The
 * whole point of the simulator is that it responds while you are still moving
 * your thumb.
 *
 * It is also the same 33 KB WASM module the API runs, not a reimplementation —
 * so the browser and the verification engine cannot disagree about physics.
 * `docs/DECISIONS.md` #7 claimed this; until now it was not actually true.
 */

export interface Reading {
  ph: number;
  dissolved_oxygen_mg_l: number;
  temperature_c: number;
  optical_density: number;
  reported_co2_kg: number;
  /** Protein mass fraction of dry biomass, 0..1. */
  protein_frac: number;
  /** Lipid fraction. Climbs under nitrogen stress — the value lever. */
  lipid_frac: number;
  carbohydrate_frac: number;
  /** Paddlewheel draw this hour, kWh. Zero while the mixer is stopped. */
  energy_kwh: number;
  hour: number;
  day_of_year: number;
}

export interface DayPoint {
  day: number;
  co2Kg: number;
  biomassKg: number;
  opticalDensity: number;
  temperatureC: number;
  ph: number;
  dissolvedOxygenMgL: number;
  harvested: boolean;
}

export interface RunConfig {
  latDeg: number;
  areaM2: number;
  depthM: number;
  days: number;
  harvestEveryDays: number;
  harvestFraction: number;
  startDayOfYear: number;
  seed: number;
  /** Mean air temperature, °C. Water tracks it with damping. */
  meanAirTempC: number;
  /** Day-to-night swing, °C. Wide swings cost growth at both ends. */
  diurnalSwingC: number;
  /** Nitrogen in the influent, mg/L. On a wastewater site this is free. */
  influentNitrogenMgL: number;
  /** Optional injected fault, so an operator can ask "what if it crashes?". */
  crashOnDay?: number | null;
  /** False stops the paddlewheel — the pond stratifies and the meter reads 0. */
  mixerRunning: boolean;
}

export interface RunResult {
  daily: DayPoint[];
  totalCo2Kg: number;
  totalHarvestKg: number;
  ceilingCo2Kg: number;
  peakBiomassKg: number;
}

interface PhysicsModule {
  default: (input?: unknown) => Promise<unknown>;
  WasmPond: {
    new (lat: number, area: number, depth: number, seed: bigint, day: number): PondHandle;
    with_conditions(
      lat: number, area: number, depth: number, seed: bigint, day: number,
      meanAirTempC: number, diurnalSwingC: number, influentNitrogenMgL: number,
    ): PondHandle;
  };
  physics_ceiling_co2_kg: (
    lat: number, area: number, depth: number, startDay: number,
    days: number, meanTemp: number,
  ) => number;
}

interface PondHandle {
    step: () => Reading;
    harvest: (fraction: number) => number;
    standing_biomass_kg: () => number;
    inject_crash: (severity: number, startHour: number, durationHours: number) => void;
    inject_pump_failure: (startHour: number, durationHours: number) => void;
    free?: () => void;
}

let modulePromise: Promise<PhysicsModule> | null = null;

/**
 * Load the WASM module once and reuse it.
 *
 * Cached at module scope rather than in React state: re-initialising on every
 * mount would refetch and recompile the binary, which is the one genuinely
 * slow part of this.
 */
export function loadTwin(): Promise<PhysicsModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = (await import(
        /* webpackIgnore: true */ '/physics/rtz_physics.js' as string
      )) as unknown as PhysicsModule;
      await mod.default('/physics/rtz_physics_bg.wasm');
      return mod;
    })();
  }
  return modulePromise;
}

export function dayOfYear(d = new Date()): number {
  return Math.floor(
    (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000,
  );
}

/**
 * Run a pond forward and return one point per day.
 *
 * Daily rather than hourly on purpose: 120 days of hourly data is 2,880 points,
 * which is more than a phone screen can show and more than the eye can read.
 * CO₂ is still summed across every hour, so the totals are exact.
 */
export async function runTwin(cfg: RunConfig): Promise<RunResult> {
  const mod = await loadTwin();
  // with_conditions rather than the plain constructor: an operator asking
  // "what if my water runs colder" needs those inputs to actually reach the
  // model, not sit at a Gujarat default.
  const pond = mod.WasmPond.with_conditions(
    cfg.latDeg,
    cfg.areaM2,
    cfg.depthM,
    BigInt(cfg.seed),
    cfg.startDayOfYear,
    cfg.meanAirTempC,
    cfg.diurnalSwingC,
    cfg.influentNitrogenMgL,
  );

  if (cfg.crashOnDay != null && cfg.crashOnDay > 0) {
    pond.inject_crash(0.85, cfg.crashOnDay * 24, 72);
  }

  // Stopped for the whole run rather than a window: the operator is asking
  // "what does a dead paddlewheel cost me", not "what if it blips".
  if (!cfg.mixerRunning) pond.inject_pump_failure(0, cfg.days * 24);

  const daily: DayPoint[] = [];
  let totalCo2 = 0;
  let totalHarvest = 0;
  let peakBiomass = 0;

  for (let d = 0; d < cfg.days; d += 1) {
    let dayCo2 = 0;
    let last: Reading | null = null;
    for (let h = 0; h < 24; h += 1) {
      last = pond.step();
      dayCo2 += last.reported_co2_kg;
    }
    totalCo2 += dayCo2;

    const biomass = pond.standing_biomass_kg();
    peakBiomass = Math.max(peakBiomass, biomass);

    let harvested = false;
    if (cfg.harvestEveryDays > 0 && (d + 1) % cfg.harvestEveryDays === 0) {
      totalHarvest += pond.harvest(cfg.harvestFraction);
      harvested = true;
    }

    daily.push({
      day: d + 1,
      co2Kg: dayCo2,
      biomassKg: biomass,
      opticalDensity: last?.optical_density ?? 0,
      temperatureC: last?.temperature_c ?? 0,
      ph: last?.ph ?? 0,
      dissolvedOxygenMgL: last?.dissolved_oxygen_mg_l ?? 0,
      harvested,
    });
  }

  // WASM objects are not garbage collected by the JS heap; dropping this
  // explicitly matters when a slider re-runs the model dozens of times.
  pond.free?.();

  const ceilingCo2Kg = mod.physics_ceiling_co2_kg(
    cfg.latDeg, cfg.areaM2, cfg.depthM, cfg.startDayOfYear, cfg.days,
    cfg.meanAirTempC,
  );

  return {
    daily,
    totalCo2Kg: totalCo2,
    totalHarvestKg: totalHarvest,
    ceilingCo2Kg,
    peakBiomassKg: peakBiomass,
  };
}

/** Sensible defaults for someone who has not opened a specific pond. */
export const DEFAULT_CONFIG: RunConfig = {
  latDeg: 22.56,
  areaM2: 1200,
  depthM: 0.25,
  days: 30,
  harvestEveryDays: 7,
  harvestFraction: 0.45,
  startDayOfYear: dayOfYear(),
  seed: 42,
  meanAirTempC: 30,
  diurnalSwingC: 8,
  influentNitrogenMgL: 40,
  crashOnDay: null,
  mixerRunning: true,
};
