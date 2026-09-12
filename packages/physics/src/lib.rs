//! Deterministic pond physics, compiled to WASM.
//!
//! Everything in this crate is a pure function of its inputs and its seed: no
//! I/O, no clock, no unseeded randomness. Same input, same output, always.
//! That property is what makes the ceiling defensible — a judge can recompute
//! any figure we publish with a calculator and get our number back.
//!
//! Compiled to WASM so the API, the simulator driver and the public browser
//! simulator all run ONE implementation of the twin rather than three that
//! drift apart.

pub mod ceiling;
pub mod composition;
pub mod faults;
pub mod growth;
pub mod sim;
pub mod solar;

use wasm_bindgen::prelude::*;

/// Stoichiometry: 1 kg dry algal biomass fixes 1.83 kg CO2.
/// From the 44/12 CO2:C mass ratio at ~50% carbon by dry weight.
pub const CO2_PER_KG_BIOMASS: f64 = 1.83;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[wasm_bindgen]
pub fn co2_from_biomass(biomass_kg: f64) -> f64 {
    biomass_kg * CO2_PER_KG_BIOMASS
}

/// Physics ceiling for a pond over a window, in kg CO2.
///
/// Exposed so the API can compute a bound without reimplementing the maths in
/// TypeScript — reimplementation is how two versions of a "ceiling" end up
/// disagreeing, and then neither can be trusted.
#[wasm_bindgen]
pub fn physics_ceiling_co2_kg(
    lat_deg: f64,
    area_m2: f64,
    depth_m: f64,
    day_of_year_start: u32,
    window_days: u32,
    mean_temp_c: f64,
) -> f64 {
    let input = ceiling::CeilingInput {
        lat_deg,
        area_m2,
        depth_m,
        day_of_year_start,
        window_days,
        mean_temp_c,
    };
    ceiling::max_biomass_gain(&input, &growth::StrainParams::default()).max_co2_kg
}

/// Composition at a latitude and day of year, as JSON.
///
/// A convenience for callers outside Rust that only have a location and a
/// date — a backfill script, or the marketplace grading a harvest whose
/// nitrogen history was never recorded. Anything with real pond state should
/// call `composition::composition_at` with the nitrogen it actually measured.
///
/// Nitrogen is assumed mid-range here, so the result is an estimate and every
/// caller must label it as modelled rather than measured.
#[wasm_bindgen]
pub fn composition_at_json(lat_deg: f64, day_of_year: u32) -> String {
    let light = solar::daily_mean_par(lat_deg, day_of_year) * 86_400.0 / 1e6;
    let c = composition::composition_at(8.0, light);
    format!(
        "{{\"protein\":{:.4},\"lipid\":{:.4},\"carbohydrate\":{:.4},\"ash\":{:.4}}}",
        c.protein, c.lipid, c.carbohydrate, c.ash
    )
}

/// Paddlewheel draw per square metre of pond, W.
///
/// 0.5 W/m² is the figure used throughout the planning model; keeping one
/// constant means the simulated meter and the cost projection cannot disagree.
const PADDLEWHEEL_W_PER_M2: f64 = 0.5;

/// One step of simulated telemetry, as the sensor node would report it.
///
/// Note what is NOT here: true biomass, true CO2, nutrient state. This struct
/// is the twin's entire public surface for anything that will later reach the
/// reconciliation engine. See docs/DECISIONS.md #6.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct Reading {
    pub ph: f64,
    pub dissolved_oxygen_mg_l: f64,
    pub temperature_c: f64,
    pub optical_density: f64,
    pub reported_co2_kg: f64,
    /// Protein mass fraction of dry biomass, 0..1.
    pub protein_frac: f64,
    /// Lipid mass fraction. Climbs under nitrogen stress, which is the
    /// operator's main lever on what the crop is worth.
    pub lipid_frac: f64,
    pub carbohydrate_frac: f64,
    /// Sun's angle above the horizon, degrees. Negative means night.
    ///
    /// Exposed so the simulator can draw the sky honestly rather than
    /// guessing from the clock: at 23°N in December the sun is up for ten
    /// hours, in June for thirteen and a half, and the pond's behaviour
    /// follows that rather than a fixed 6am-to-6pm.
    pub solar_elevation_deg: f64,
    /// PAR reaching the water right now, µmol/m²/s. Zero at night.
    pub par_umol: f64,
    /// Hours between sunrise and sunset today, from the sunrise equation.
    pub daylight_hours: f64,
    /// Paddlewheel draw this hour, kWh.
    ///
    /// Not a biological quantity, which is why it is trustworthy: it comes off
    /// a meter on the supply, not off a probe in the water. A stopped mixer
    /// reads ~0 and that is unambiguous, where "dissolved oxygen is low" has
    /// half a dozen explanations.
    pub energy_kwh: f64,
    pub hour: f64,
    pub day_of_year: u32,
}

/// A simulated pond, driven from JavaScript.
///
/// Used by `scripts/sim-driver.ts` to publish MQTT, and by the public browser
/// simulator. Both get readings only.
#[wasm_bindgen]
pub struct WasmPond {
    pond: sim::Pond,
    faults: Vec<faults::ScheduledFault>,
    obs_rng: sim::SimRng,
    elapsed_hour: u32,
}

#[wasm_bindgen]
impl WasmPond {
    #[wasm_bindgen(constructor)]
    pub fn new(lat_deg: f64, area_m2: f64, depth_m: f64, seed: u64, day_of_year: u32) -> WasmPond {
        let cfg = sim::PondConfig {
            lat_deg,
            area_m2,
            depth_m,
            ..Default::default()
        };
        WasmPond {
            pond: sim::Pond::new(cfg, seed, day_of_year),
            faults: Vec::new(),
            obs_rng: sim::SimRng::new(seed ^ 0xA1_6A_CA_12),
            elapsed_hour: 0,
        }
    }

    /// Build a pond with the site conditions spelled out.
    ///
    /// The plain constructor uses sensible defaults for Gujarat. This one
    /// exists because an operator planning an expansion genuinely needs to ask
    /// "what if my water runs colder" or "what if the effluent thins out" —
    /// and those are the inputs that actually move the answer.
    #[allow(clippy::too_many_arguments)]
    pub fn with_conditions(
        lat_deg: f64,
        area_m2: f64,
        depth_m: f64,
        seed: u64,
        day_of_year: u32,
        mean_air_temp_c: f64,
        diurnal_swing_c: f64,
        influent_nitrogen_mg_l: f64,
    ) -> WasmPond {
        let cfg = sim::PondConfig {
            lat_deg,
            area_m2,
            depth_m,
            mean_air_temp_c,
            diurnal_swing_c,
            influent_nitrogen_mg_l,
        };
        WasmPond {
            pond: sim::Pond::new(cfg, seed, day_of_year),
            faults: Vec::new(),
            obs_rng: sim::SimRng::new(seed ^ 0xA1_6A_CA_12),
            elapsed_hour: 0,
        }
    }

    /// Schedule an overstatement fault — the operator reports `factor`× what
    /// was actually fixed, for a window of hours.
    pub fn inject_overstatement(&mut self, factor: f64, start_hour: u32, duration_hours: u32) {
        self.faults.push(faults::ScheduledFault {
            fault: faults::Fault::OverstatedUptake { factor },
            start_hour,
            duration_hours,
        });
    }

    /// Schedule a culture crash. Severity 0..1.
    pub fn inject_crash(&mut self, severity: f64, start_hour: u32, duration_hours: u32) {
        self.faults.push(faults::ScheduledFault {
            fault: faults::Fault::ContaminationCrash { severity },
            start_hour,
            duration_hours,
        });
    }

    /// Schedule a paddlewheel failure — the pond stratifies and self-shades.
    ///
    /// Exposed separately from `inject_crash` because it is the failure an
    /// operator can actually fix in an afternoon, and because it is the one
    /// the energy meter catches outright.
    pub fn inject_pump_failure(&mut self, start_hour: u32, duration_hours: u32) {
        self.faults.push(faults::ScheduledFault {
            fault: faults::Fault::PumpFailure,
            start_hour,
            duration_hours,
        });
    }

    /// Whether the paddlewheel is running at the current simulated hour.
    fn mixing_running(&self) -> bool {
        !self
            .faults
            .iter()
            .any(|f| f.fault == faults::Fault::PumpFailure && f.active_at(self.elapsed_hour))
    }

    /// Advance one hour and return what the sensor would report.
    pub fn step(&mut self) -> Reading {
        // Read before elapsed_hour advances, so the meter and the probes
        // describe the same hour.
        let energy = if self.mixing_running() {
            PADDLEWHEEL_W_PER_M2 * self.pond.cfg.area_m2 / 1000.0
        } else {
            0.0
        };
        faults::apply_physical_effect(&mut self.pond, &self.faults, self.elapsed_hour);
        let co2 = self.pond.step(1.0);

        // Composition responds to what the cells can reach right now, and to
        // the light they have to build storage lipid with.
        // daily_mean_par is µmol/m²/s averaged over 24 h; the composition
        // model wants the day's total dose in mol/m²/day.
        let daily_light_mol =
            solar::daily_mean_par(self.pond.cfg.lat_deg, self.pond.state.day_of_year) * 86_400.0
                / 1e6;
        let comp = composition::composition_at(self.pond.state.nitrogen_mg_l, daily_light_mol);
        let obs = faults::observe(
            &self.pond.state,
            co2,
            &self.faults,
            self.elapsed_hour,
            &mut self.obs_rng,
        );
        self.elapsed_hour += 1;

        Reading {
            ph: obs.ph,
            dissolved_oxygen_mg_l: obs.dissolved_oxygen_mg_l,
            temperature_c: obs.temperature_c,
            optical_density: obs.optical_density,
            reported_co2_kg: obs.reported_co2_kg,
            protein_frac: comp.protein,
            lipid_frac: comp.lipid,
            carbohydrate_frac: comp.carbohydrate,
            solar_elevation_deg: solar::solar_elevation_deg(
                self.pond.cfg.lat_deg,
                self.pond.state.day_of_year,
                self.pond.state.hour,
            ),
            par_umol: solar::clear_sky_par(
                self.pond.cfg.lat_deg,
                self.pond.state.day_of_year,
                self.pond.state.hour,
            ),
            daylight_hours: solar::daylight_hours(
                self.pond.cfg.lat_deg,
                self.pond.state.day_of_year,
            ),
            energy_kwh: energy,
            hour: self.pond.state.hour,
            day_of_year: self.pond.state.day_of_year,
        }
    }

    /// Harvest a fraction of standing biomass; returns dry kg removed.
    ///
    /// This is legitimately observable — it is a mass on a weighbridge, and for
    /// the smallholder tier it IS the independent channel.
    pub fn harvest(&mut self, fraction: f64) -> f64 {
        self.pond.harvest(fraction)
    }

    /// Standing dry biomass, kg.
    ///
    /// Legitimately observable: this is what a satellite infers and what a
    /// weighbridge weighs. Unlike cumulative CO2, it is not a secret — the
    /// independent channel is *supposed* to see it, just imprecisely.
    pub fn standing_biomass_kg(&self) -> f64 {
        self.pond.standing_biomass_kg()
    }

    /// Ground truth. **Offline evaluation only — never call this from the API.**
    ///
    /// Needed to label training data for `divergence_classifier` and to score
    /// the engine in tests. The long name is the guard: if this appears in a
    /// diff under `apps/api/src/reconcile/`, the review stops there.
    pub fn ground_truth_co2_kg_offline_scoring_only(&self) -> f64 {
        self.pond.state.cumulative_co2_kg
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stoichiometry_is_exact() {
        assert!((co2_from_biomass(1000.0) - 1830.0).abs() < 1e-9);
    }

    #[test]
    fn wasm_pond_runs_and_reports() {
        let mut p = WasmPond::new(23.03, 10_000.0, 0.3, 42, 100);
        let mut total = 0.0;
        for _ in 0..(24 * 7) {
            total += p.step().reported_co2_kg;
        }
        assert!(total > 0.0);
        assert!(total <= physics_ceiling_co2_kg(23.03, 10_000.0, 0.3, 100, 7, 30.0));
    }

    #[test]
    fn injected_overstatement_beats_the_honest_report() {
        let honest: f64 = {
            let mut p = WasmPond::new(23.03, 10_000.0, 0.3, 7, 100);
            (0..24 * 7).map(|_| p.step().reported_co2_kg).sum()
        };
        let inflated: f64 = {
            let mut p = WasmPond::new(23.03, 10_000.0, 0.3, 7, 100);
            p.inject_overstatement(1.3, 0, 24 * 7);
            (0..24 * 7).map(|_| p.step().reported_co2_kg).sum()
        };
        assert!(inflated > honest * 1.25, "{inflated} vs {honest}");
    }

    #[test]
    fn energy_meter_reads_zero_while_the_paddlewheel_is_stopped() {
        let mut p = WasmPond::new(23.0, 10_000.0, 0.3, 7, 150);
        p.inject_pump_failure(10, 5);

        let running = p.step().energy_kwh;
        assert!(running > 0.0, "a mixing pond must draw power");

        for _ in 1..10 {
            p.step();
        }
        // Hours 10..15 are the failure window.
        assert_eq!(p.step().energy_kwh, 0.0);

        for _ in 11..15 {
            p.step();
        }
        assert!(
            p.step().energy_kwh > 0.0,
            "draw must resume once the fault window closes"
        );
    }
}
