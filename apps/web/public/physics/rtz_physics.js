/* @ts-self-types="./rtz_physics.d.ts" */

/**
 * One step of simulated telemetry, as the sensor node would report it.
 *
 * Note what is NOT here: true biomass, true CO2, nutrient state. This struct
 * is the twin's entire public surface for anything that will later reach the
 * reconciliation engine. See docs/DECISIONS.md #6.
 */
export class Reading {
    static __wrap(ptr) {
        const obj = Object.create(Reading.prototype);
        obj.__wbg_ptr = ptr;
        ReadingFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ReadingFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_reading_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get carbohydrate_frac() {
        const ret = wasm.__wbg_get_reading_carbohydrate_frac(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get day_of_year() {
        const ret = wasm.__wbg_get_reading_day_of_year(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Hours between sunrise and sunset today, from the sunrise equation.
     * @returns {number}
     */
    get daylight_hours() {
        const ret = wasm.__wbg_get_reading_daylight_hours(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get dissolved_oxygen_mg_l() {
        const ret = wasm.__wbg_get_reading_dissolved_oxygen_mg_l(this.__wbg_ptr);
        return ret;
    }
    /**
     * Paddlewheel draw this hour, kWh.
     *
     * Not a biological quantity, which is why it is trustworthy: it comes off
     * a meter on the supply, not off a probe in the water. A stopped mixer
     * reads ~0 and that is unambiguous, where "dissolved oxygen is low" has
     * half a dozen explanations.
     * @returns {number}
     */
    get energy_kwh() {
        const ret = wasm.__wbg_get_reading_energy_kwh(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get hour() {
        const ret = wasm.__wbg_get_reading_hour(this.__wbg_ptr);
        return ret;
    }
    /**
     * Lipid mass fraction. Climbs under nitrogen stress, which is the
     * operator's main lever on what the crop is worth.
     * @returns {number}
     */
    get lipid_frac() {
        const ret = wasm.__wbg_get_reading_lipid_frac(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get optical_density() {
        const ret = wasm.__wbg_get_reading_optical_density(this.__wbg_ptr);
        return ret;
    }
    /**
     * PAR reaching the water right now, µmol/m²/s. Zero at night.
     * @returns {number}
     */
    get par_umol() {
        const ret = wasm.__wbg_get_reading_par_umol(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ph() {
        const ret = wasm.__wbg_get_reading_ph(this.__wbg_ptr);
        return ret;
    }
    /**
     * Protein mass fraction of dry biomass, 0..1.
     * @returns {number}
     */
    get protein_frac() {
        const ret = wasm.__wbg_get_reading_protein_frac(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get reported_co2_kg() {
        const ret = wasm.__wbg_get_reading_reported_co2_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * Sun's angle above the horizon, degrees. Negative means night.
     *
     * Exposed so the simulator can draw the sky honestly rather than
     * guessing from the clock: at 23°N in December the sun is up for ten
     * hours, in June for thirteen and a half, and the pond's behaviour
     * follows that rather than a fixed 6am-to-6pm.
     * @returns {number}
     */
    get solar_elevation_deg() {
        const ret = wasm.__wbg_get_reading_solar_elevation_deg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get temperature_c() {
        const ret = wasm.__wbg_get_reading_temperature_c(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set carbohydrate_frac(arg0) {
        wasm.__wbg_set_reading_carbohydrate_frac(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set day_of_year(arg0) {
        wasm.__wbg_set_reading_day_of_year(this.__wbg_ptr, arg0);
    }
    /**
     * Hours between sunrise and sunset today, from the sunrise equation.
     * @param {number} arg0
     */
    set daylight_hours(arg0) {
        wasm.__wbg_set_reading_daylight_hours(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set dissolved_oxygen_mg_l(arg0) {
        wasm.__wbg_set_reading_dissolved_oxygen_mg_l(this.__wbg_ptr, arg0);
    }
    /**
     * Paddlewheel draw this hour, kWh.
     *
     * Not a biological quantity, which is why it is trustworthy: it comes off
     * a meter on the supply, not off a probe in the water. A stopped mixer
     * reads ~0 and that is unambiguous, where "dissolved oxygen is low" has
     * half a dozen explanations.
     * @param {number} arg0
     */
    set energy_kwh(arg0) {
        wasm.__wbg_set_reading_energy_kwh(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set hour(arg0) {
        wasm.__wbg_set_reading_hour(this.__wbg_ptr, arg0);
    }
    /**
     * Lipid mass fraction. Climbs under nitrogen stress, which is the
     * operator's main lever on what the crop is worth.
     * @param {number} arg0
     */
    set lipid_frac(arg0) {
        wasm.__wbg_set_reading_lipid_frac(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set optical_density(arg0) {
        wasm.__wbg_set_reading_optical_density(this.__wbg_ptr, arg0);
    }
    /**
     * PAR reaching the water right now, µmol/m²/s. Zero at night.
     * @param {number} arg0
     */
    set par_umol(arg0) {
        wasm.__wbg_set_reading_par_umol(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set ph(arg0) {
        wasm.__wbg_set_reading_ph(this.__wbg_ptr, arg0);
    }
    /**
     * Protein mass fraction of dry biomass, 0..1.
     * @param {number} arg0
     */
    set protein_frac(arg0) {
        wasm.__wbg_set_reading_protein_frac(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set reported_co2_kg(arg0) {
        wasm.__wbg_set_reading_reported_co2_kg(this.__wbg_ptr, arg0);
    }
    /**
     * Sun's angle above the horizon, degrees. Negative means night.
     *
     * Exposed so the simulator can draw the sky honestly rather than
     * guessing from the clock: at 23°N in December the sun is up for ten
     * hours, in June for thirteen and a half, and the pond's behaviour
     * follows that rather than a fixed 6am-to-6pm.
     * @param {number} arg0
     */
    set solar_elevation_deg(arg0) {
        wasm.__wbg_set_reading_solar_elevation_deg(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set temperature_c(arg0) {
        wasm.__wbg_set_reading_temperature_c(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) Reading.prototype[Symbol.dispose] = Reading.prototype.free;

/**
 * A simulated pond, driven from JavaScript.
 *
 * Used by `scripts/sim-driver.ts` to publish MQTT, and by the public browser
 * simulator. Both get readings only.
 */
export class WasmPond {
    static __wrap(ptr) {
        const obj = Object.create(WasmPond.prototype);
        obj.__wbg_ptr = ptr;
        WasmPondFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPondFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpond_free(ptr, 0);
    }
    /**
     * Ground truth. **Offline evaluation only — never call this from the API.**
     *
     * Needed to label training data for `divergence_classifier` and to score
     * the engine in tests. The long name is the guard: if this appears in a
     * diff under `apps/api/src/reconcile/`, the review stops there.
     * @returns {number}
     */
    ground_truth_co2_kg_offline_scoring_only() {
        const ret = wasm.wasmpond_ground_truth_co2_kg_offline_scoring_only(this.__wbg_ptr);
        return ret;
    }
    /**
     * Harvest a fraction of standing biomass; returns dry kg removed.
     *
     * This is legitimately observable — it is a mass on a weighbridge, and for
     * the smallholder tier it IS the independent channel.
     * @param {number} fraction
     * @returns {number}
     */
    harvest(fraction) {
        const ret = wasm.wasmpond_harvest(this.__wbg_ptr, fraction);
        return ret;
    }
    /**
     * Schedule a culture crash. Severity 0..1.
     * @param {number} severity
     * @param {number} start_hour
     * @param {number} duration_hours
     */
    inject_crash(severity, start_hour, duration_hours) {
        wasm.wasmpond_inject_crash(this.__wbg_ptr, severity, start_hour, duration_hours);
    }
    /**
     * Schedule an overstatement fault — the operator reports `factor`× what
     * was actually fixed, for a window of hours.
     * @param {number} factor
     * @param {number} start_hour
     * @param {number} duration_hours
     */
    inject_overstatement(factor, start_hour, duration_hours) {
        wasm.wasmpond_inject_overstatement(this.__wbg_ptr, factor, start_hour, duration_hours);
    }
    /**
     * Schedule a paddlewheel failure — the pond stratifies and self-shades.
     *
     * Exposed separately from `inject_crash` because it is the failure an
     * operator can actually fix in an afternoon, and because it is the one
     * the energy meter catches outright.
     * @param {number} start_hour
     * @param {number} duration_hours
     */
    inject_pump_failure(start_hour, duration_hours) {
        wasm.wasmpond_inject_pump_failure(this.__wbg_ptr, start_hour, duration_hours);
    }
    /**
     * @param {number} lat_deg
     * @param {number} area_m2
     * @param {number} depth_m
     * @param {bigint} seed
     * @param {number} day_of_year
     */
    constructor(lat_deg, area_m2, depth_m, seed, day_of_year) {
        const ret = wasm.wasmpond_new(lat_deg, area_m2, depth_m, seed, day_of_year);
        this.__wbg_ptr = ret;
        WasmPondFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Standing dry biomass, kg.
     *
     * Legitimately observable: this is what a satellite infers and what a
     * weighbridge weighs. Unlike cumulative CO2, it is not a secret — the
     * independent channel is *supposed* to see it, just imprecisely.
     * @returns {number}
     */
    standing_biomass_kg() {
        const ret = wasm.wasmpond_standing_biomass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * Advance one hour and return what the sensor would report.
     * @returns {Reading}
     */
    step() {
        const ret = wasm.wasmpond_step(this.__wbg_ptr);
        return Reading.__wrap(ret);
    }
    /**
     * Build a pond with the site conditions spelled out.
     *
     * The plain constructor uses sensible defaults for Gujarat. This one
     * exists because an operator planning an expansion genuinely needs to ask
     * "what if my water runs colder" or "what if the effluent thins out" —
     * and those are the inputs that actually move the answer.
     * @param {number} lat_deg
     * @param {number} area_m2
     * @param {number} depth_m
     * @param {bigint} seed
     * @param {number} day_of_year
     * @param {number} mean_air_temp_c
     * @param {number} diurnal_swing_c
     * @param {number} influent_nitrogen_mg_l
     * @returns {WasmPond}
     */
    static with_conditions(lat_deg, area_m2, depth_m, seed, day_of_year, mean_air_temp_c, diurnal_swing_c, influent_nitrogen_mg_l) {
        const ret = wasm.wasmpond_with_conditions(lat_deg, area_m2, depth_m, seed, day_of_year, mean_air_temp_c, diurnal_swing_c, influent_nitrogen_mg_l);
        return WasmPond.__wrap(ret);
    }
}
if (Symbol.dispose) WasmPond.prototype[Symbol.dispose] = WasmPond.prototype.free;

/**
 * @param {number} biomass_kg
 * @returns {number}
 */
export function co2_from_biomass(biomass_kg) {
    const ret = wasm.co2_from_biomass(biomass_kg);
    return ret;
}

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
 * @param {number} lat_deg
 * @param {number} day_of_year
 * @returns {string}
 */
export function composition_at_json(lat_deg, day_of_year) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.composition_at_json(lat_deg, day_of_year);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Physics ceiling for a pond over a window, in kg CO2.
 *
 * Exposed so the API can compute a bound without reimplementing the maths in
 * TypeScript — reimplementation is how two versions of a "ceiling" end up
 * disagreeing, and then neither can be trusted.
 * @param {number} lat_deg
 * @param {number} area_m2
 * @param {number} depth_m
 * @param {number} day_of_year_start
 * @param {number} window_days
 * @param {number} mean_temp_c
 * @returns {number}
 */
export function physics_ceiling_co2_kg(lat_deg, area_m2, depth_m, day_of_year_start, window_days, mean_temp_c) {
    const ret = wasm.physics_ceiling_co2_kg(lat_deg, area_m2, depth_m, day_of_year_start, window_days, mean_temp_c);
    return ret;
}

/**
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./rtz_physics_bg.js": import0,
    };
}

const ReadingFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_reading_free(ptr, 1));
const WasmPondFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpond_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('rtz_physics_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
