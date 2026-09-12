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

    /// Advance one hour and return what the sensor would report.
    pub fn step(&mut self) -> Reading {
        faults::apply_physical_effect(&mut self.pond, &self.faults, self.elapsed_hour);
        let co2 = self.pond.step(1.0);
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
}
