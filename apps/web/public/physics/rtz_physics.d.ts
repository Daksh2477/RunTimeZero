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
    day_of_year: number;
    dissolved_oxygen_mg_l: number;
    hour: number;
    optical_density: number;
    ph: number;
    reported_co2_kg: number;
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
}

export function co2_from_biomass(biomass_kg: number): number;

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
    readonly __wbg_get_reading_day_of_year: (a: number) => number;
    readonly __wbg_get_reading_dissolved_oxygen_mg_l: (a: number) => number;
    readonly __wbg_get_reading_hour: (a: number) => number;
    readonly __wbg_get_reading_optical_density: (a: number) => number;
    readonly __wbg_get_reading_ph: (a: number) => number;
    readonly __wbg_get_reading_reported_co2_kg: (a: number) => number;
    readonly __wbg_get_reading_temperature_c: (a: number) => number;
    readonly __wbg_reading_free: (a: number, b: number) => void;
    readonly __wbg_set_reading_day_of_year: (a: number, b: number) => void;
    readonly __wbg_set_reading_dissolved_oxygen_mg_l: (a: number, b: number) => void;
    readonly __wbg_set_reading_hour: (a: number, b: number) => void;
    readonly __wbg_set_reading_optical_density: (a: number, b: number) => void;
    readonly __wbg_set_reading_ph: (a: number, b: number) => void;
    readonly __wbg_set_reading_reported_co2_kg: (a: number, b: number) => void;
    readonly __wbg_set_reading_temperature_c: (a: number, b: number) => void;
    readonly __wbg_wasmpond_free: (a: number, b: number) => void;
    readonly co2_from_biomass: (a: number) => number;
    readonly physics_ceiling_co2_kg: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly version: () => [number, number];
    readonly wasmpond_ground_truth_co2_kg_offline_scoring_only: (a: number) => number;
    readonly wasmpond_harvest: (a: number, b: number) => number;
    readonly wasmpond_inject_crash: (a: number, b: number, c: number, d: number) => void;
    readonly wasmpond_inject_overstatement: (a: number, b: number, c: number, d: number) => void;
    readonly wasmpond_new: (a: number, b: number, c: number, d: bigint, e: number) => number;
    readonly wasmpond_standing_biomass_kg: (a: number) => number;
    readonly wasmpond_step: (a: number) => number;
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
