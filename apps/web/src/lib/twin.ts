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
  /** Sun's angle above the horizon, degrees. Negative means night. */
  solar_elevation_deg: number;
  /** PAR reaching the water now, µmol/m²/s. Zero at night. */
  par_umol: number;
  /** Hours between sunrise and sunset today. */
  daylight_hours: number;
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
  harvestKg: number;
  /** Midday sun angle for the day, degrees. Drives the sky in the scene. */
  solarElevationDeg: number;
  /** Peak PAR for the day, µmol/m²/s. */
  parUmol: number;
  /** Hours of daylight, from the sunrise equation rather than an estimate. */
  daylightHours: number;
  /** Mean lipid fraction — what the crop is worth per kg. */
  lipidFrac: number;
  proteinFrac: number;
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
/**
 * Import a URL at runtime, in a way no bundler can rewrite.
 *
 * `import(/* webpackIgnore *\/ '...')` is supposed to leave the request
 * alone, but the comment is fragile — it is lost the moment the specifier
 * stops being a plain literal, and the failure is silent: the promise never
 * settles and the simulator sits on "—" forever with no error anywhere.
 *
 * Building the import inside `new Function` makes the specifier invisible to
 * static analysis, so webpack, Turbopack and anything else must leave it to
 * the browser. The file is a plain ES module in `public/`, served as-is.
 */
const runtimeImport = (url: string): Promise<unknown> =>
  (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);

export function loadTwin(): Promise<PhysicsModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const mod = (await runtimeImport('/physics/rtz_physics.js')) as PhysicsModule;
        await mod.default('/physics/rtz_physics_bg.wasm');
        return mod;
      } catch (cause) {
        // Clear the cache so a retry can actually retry, rather than
        // re-awaiting a promise that already rejected.
        modulePromise = null;
        throw new Error(
          'Could not load the pond physics module. It is served from '
          + '/physics/ — check that `npm run physics:build` has run.',
          { cause },
        );
      }
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
    // Peak rather than mean: the scene shows midday, and a daily average sun
    // angle across a night would always read as dusk.
    let peakSun = -90;
    let peakPar = 0;
    for (let h = 0; h < 24; h += 1) {
      last = pond.step();
      dayCo2 += last.reported_co2_kg;
      if (last.solar_elevation_deg > peakSun) peakSun = last.solar_elevation_deg;
      if (last.par_umol > peakPar) peakPar = last.par_umol;
    }
    totalCo2 += dayCo2;

    const biomass = pond.standing_biomass_kg();
    peakBiomass = Math.max(peakBiomass, biomass);

    let harvested = false;
    let harvestKg = 0;
    if (cfg.harvestEveryDays > 0 && (d + 1) % cfg.harvestEveryDays === 0) {
      harvestKg = pond.harvest(cfg.harvestFraction);
      totalHarvest += harvestKg;
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
      harvestKg,
      solarElevationDeg: peakSun,
      parUmol: peakPar,
      daylightHours: last?.daylight_hours ?? 0,
      lipidFrac: last?.lipid_frac ?? 0,
      proteinFrac: last?.protein_frac ?? 0,
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
