/* tslint:disable */
/* eslint-disable */

/**
 * One step of simulated telemetry, as the sensor node would report it.
 *
 * Note what is NOT here: true biomass, true CO2, nutrient state. This struct
 * is the twin's entire public surface for anything that will later reach the
 * reconciliation engine. See docs/DECISIONS.md #6.
 */
export class Reading {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    carbohydrate_frac: number;
    day_of_year: number;
    /**
     * Hours between sunrise and sunset today, from the sunrise equation.
     */
    daylight_hours: number;
    dissolved_oxygen_mg_l: number;
    /**
     * Paddlewheel draw this hour, kWh.
     *
     * Not a biological quantity, which is why it is trustworthy: it comes off
     * a meter on the supply, not off a probe in the water. A stopped mixer
     * reads ~0 and that is unambiguous, where "dissolved oxygen is low" has
     * half a dozen explanations.
     */
    energy_kwh: number;
    hour: number;
    /**
     * Lipid mass fraction. Climbs under nitrogen stress, which is the
     * operator's main lever on what the crop is worth.
     */
    lipid_frac: number;
    optical_density: number;
    /**
     * PAR reaching the water right now, µmol/m²/s. Zero at night.
     */
    par_umol: number;
    ph: number;
    /**
     * Protein mass fraction of dry biomass, 0..1.
     */
    protein_frac: number;
    reported_co2_kg: number;
    /**
     * Sun's angle above the horizon, degrees. Negative means night.
     *
     * Exposed so the simulator can draw the sky honestly rather than
     * guessing from the clock: at 23°N in December the sun is up for ten
     * hours, in June for thirteen and a half, and the pond's behaviour
     * follows that rather than a fixed 6am-to-6pm.
     */
    solar_elevation_deg: number;
    temperature_c: number;
}

/**
 * A simulated pond, driven from JavaScript.
 *
 * Used by `scripts/sim-driver.ts` to publish MQTT, and by the public browser
 * simulator. Both get readings only.
 */
export class WasmPond {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Ground truth. **Offline evaluation only — never call this from the API.**
     *
     * Needed to label training data for `divergence_classifier` and to score
     * the engine in tests. The long name is the guard: if this appears in a
     * diff under `apps/api/src/reconcile/`, the review stops there.
     */
    ground_truth_co2_kg_offline_scoring_only(): number;
    /**
     * Harvest a fraction of standing biomass; returns dry kg removed.
     *
     * This is legitimately observable — it is a mass on a weighbridge, and for
     * the smallholder tier it IS the independent channel.
     */
    harvest(fraction: number): number;
    /**
     * Schedule a culture crash. Severity 0..1.
     */
    inject_crash(severity: number, start_hour: number, duration_hours: number): void;
    /**
     * Schedule an overstatement fault — the operator reports `factor`× what
     * was actually fixed, for a window of hours.
     */
    inject_overstatement(factor: number, start_hour: number, duration_hours: number): void;
    /**
     * Schedule a paddlewheel failure — the pond stratifies and self-shades.
     *
     * Exposed separately from `inject_crash` because it is the failure an
     * operator can actually fix in an afternoon, and because it is the one
     * the energy meter catches outright.
     */
    inject_pump_failure(start_hour: number, duration_hours: number): void;
    constructor(lat_deg: number, area_m2: number, depth_m: number, seed: bigint, day_of_year: number);
    /**
     * Standing dry biomass, kg.
     *
     * Legitimately observable: this is what a satellite infers and what a
     * weighbridge weighs. Unlike cumulative CO2, it is not a secret — the
     * independent channel is *supposed* to see it, just imprecisely.
     */
    standing_biomass_kg(): number;
    /**
     * Advance one hour and return what the sensor would report.
     */
    step(): Reading;
    /**
     * Build a pond with the site conditions spelled out.
     *
     * The plain constructor uses sensible defaults for Gujarat. This one
     * exists because an operator planning an expansion genuinely needs to ask
     * "what if my water runs colder" or "what if the effluent thins out" —
     * and those are the inputs that actually move the answer.
     */
    static with_conditions(lat_deg: number, area_m2: number, depth_m: number, seed: bigint, day_of_year: number, mean_air_temp_c: number, diurnal_swing_c: number, influent_nitrogen_mg_l: number): WasmPond;
}

export function co2_from_biomass(biomass_kg: number): number;

/**
 * Composition at a latitude and day of year, as JSON.
 *
 * A convenience for callers outside Rust that only have a location and a
 * date — a backfill script, or the marketplace grading a harvest whose
 * nitrogen history was never recorded. Anything with real pond state should
 * call `composition::composition_at` with the nitrogen it actually measured.
 *
 * Nitrogen is assumed mid-range here, so the result is an estimate and every
 * caller must label it as modelled rather than measured.
 */
export function composition_at_json(lat_deg: number, day_of_year: number): string;

/**
 * Physics ceiling for a pond over a window, in kg CO2.
 *
 * Exposed so the API can compute a bound without reimplementing the maths in
 * TypeScript — reimplementation is how two versions of a "ceiling" end up
 * disagreeing, and then neither can be trusted.
 */
export function physics_ceiling_co2_kg(lat_deg: number, area_m2: number, depth_m: number, day_of_year_start: number, window_days: number, mean_temp_c: number): number;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_reading_carbohydrate_frac: (a: number) => number;
    readonly __wbg_get_reading_day_of_year: (a: number) => number;
    readonly __wbg_get_reading_daylight_hours: (a: number) => number;
    readonly __wbg_get_reading_dissolved_oxygen_mg_l: (a: number) => number;
    readonly __wbg_get_reading_energy_kwh: (a: number) => number;
    readonly __wbg_get_reading_hour: (a: number) => number;
    readonly __wbg_get_reading_lipid_frac: (a: number) => number;
    readonly __wbg_get_reading_optical_density: (a: number) => number;
    readonly __wbg_get_reading_par_umol: (a: number) => number;
    readonly __wbg_get_reading_ph: (a: number) => number;
    readonly __wbg_get_reading_protein_frac: (a: number) => number;
    readonly __wbg_get_reading_reported_co2_kg: (a: number) => number;
    readonly __wbg_get_reading_solar_elevation_deg: (a: number) => number;
    readonly __wbg_get_reading_temperature_c: (a: number) => number;
    readonly __wbg_reading_free: (a: number, b: number) => void;
    readonly __wbg_set_reading_carbohydrate_frac: (a: number, b: number) => void;
    readonly __wbg_set_reading_day_of_year: (a: number, b: number) => void;
    readonly __wbg_set_reading_daylight_hours: (a: number, b: number) => void;
    readonly __wbg_set_reading_dissolved_oxygen_mg_l: (a: number, b: number) => void;
    readonly __wbg_set_reading_energy_kwh: (a: number, b: number) => void;
    readonly __wbg_set_reading_hour: (a: number, b: number) => void;
    readonly __wbg_set_reading_lipid_frac: (a: number, b: number) => void;
    readonly __wbg_set_reading_optical_density: (a: number, b: number) => void;
    readonly __wbg_set_reading_par_umol: (a: number, b: number) => void;
    readonly __wbg_set_reading_ph: (a: number, b: number) => void;
    readonly __wbg_set_reading_protein_frac: (a: number, b: number) => void;
    readonly __wbg_set_reading_reported_co2_kg: (a: number, b: number) => void;
    readonly __wbg_set_reading_solar_elevation_deg: (a: number, b: number) => void;
    readonly __wbg_set_reading_temperature_c: (a: number, b: number) => void;
    readonly __wbg_wasmpond_free: (a: number, b: number) => void;
    readonly co2_from_biomass: (a: number) => number;
    readonly composition_at_json: (a: number, b: number) => [number, number];
    readonly physics_ceiling_co2_kg: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly version: () => [number, number];
    readonly wasmpond_ground_truth_co2_kg_offline_scoring_only: (a: number) => number;
    readonly wasmpond_harvest: (a: number, b: number) => number;
    readonly wasmpond_inject_crash: (a: number, b: number, c: number, d: number) => void;
    readonly wasmpond_inject_overstatement: (a: number, b: number, c: number, d: number) => void;
    readonly wasmpond_inject_pump_failure: (a: number, b: number, c: number) => void;
    readonly wasmpond_new: (a: number, b: number, c: number, d: bigint, e: number) => number;
    readonly wasmpond_standing_biomass_kg: (a: number) => number;
    readonly wasmpond_step: (a: number) => number;
    readonly wasmpond_with_conditions: (a: number, b: number, c: number, d: bigint, e: number, f: number, g: number, h: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
