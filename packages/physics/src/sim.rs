//! The digital twin — steps a pond forward in time.
//!
//! Produces the pond's TRUE state. Nothing downstream is ever handed this
//! struct directly: the API only ever sees what `observe()` emits, after noise
//! and quantisation, and after any operator bias from `faults`. That boundary
//! is the one in docs/DECISIONS.md #6, and it is enforced here by keeping
//! `PondState` separate from `Observation`.
//!
//! Fully deterministic: same seed, same trajectory, every time. A twin you
//! cannot replay is useless for debugging a divergence at 3am.

use crate::growth::{self, StrainParams, PAR_WM2_TO_UMOL};
use crate::solar;

/// Seeded PRNG — xorshift64*. Implemented inline rather than pulling in `rand`,
/// which needs extra plumbing under WASM and would be a new dependency for
/// twenty lines of arithmetic.
#[derive(Debug, Clone)]
pub struct SimRng {
    state: u64,
}

impl SimRng {
    pub fn new(seed: u64) -> Self {
        // Zero is a fixed point for xorshift, so never allow it.
        Self {
            state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed },
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Uniform in [0, 1).
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Standard normal via Box–Muller.
    pub fn normal(&mut self) -> f64 {
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PondConfig {
    pub lat_deg: f64,
    pub area_m2: f64,
    pub depth_m: f64,
    /// Daily mean air temperature, °C. Water tracks this with damping.
    pub mean_air_temp_c: f64,
    /// Peak-to-trough diurnal temperature swing, °C.
    pub diurnal_swing_c: f64,
    /// Nitrogen concentration held by the influent, mg/L. On a wastewater site
    /// this is effectively unlimited, which is the point of siting there.
    pub influent_nitrogen_mg_l: f64,
}

impl Default for PondConfig {
    fn default() -> Self {
        Self {
            lat_deg: 23.03, // Ahmedabad
            area_m2: 10_000.0,
            depth_m: 0.3,
            mean_air_temp_c: 30.0,
            diurnal_swing_c: 8.0,
            influent_nitrogen_mg_l: 40.0,
        }
    }
}

/// The pond's true state. **Never leaves this crate as-is.**
#[derive(Debug, Clone, Copy)]
pub struct PondState {
    pub biomass_g_per_l: f64,
    pub nitrogen_mg_l: f64,
    pub water_temp_c: f64,
    pub ph: f64,
    pub dissolved_oxygen_mg_l: f64,
    pub day_of_year: u32,
    pub hour: f64,
    /// Cumulative CO₂ fixed since the last reset, kg. Ground truth.
    pub cumulative_co2_kg: f64,
}

impl PondState {
    pub fn fresh(day_of_year: u32, nitrogen_mg_l: f64) -> Self {
        Self {
            biomass_g_per_l: 0.15, // inoculation density
            nitrogen_mg_l,
            water_temp_c: 28.0,
            ph: 9.2, // spirulina runs alkaline
            dissolved_oxygen_mg_l: 7.0,
            day_of_year,
            hour: 6.0,
            cumulative_co2_kg: 0.0,
        }
    }

    /// Pond volume in litres. Area in m² × depth in m × 1000 L/m³.
    pub fn volume_l(cfg: &PondConfig) -> f64 {
        cfg.area_m2 * cfg.depth_m * 1000.0
    }
}

pub struct Pond {
    pub cfg: PondConfig,
    pub params: StrainParams,
    pub state: PondState,
    pub rng: SimRng,
}

impl Pond {
    pub fn new(cfg: PondConfig, seed: u64, day_of_year: u32) -> Self {
        let state = PondState::fresh(day_of_year, cfg.influent_nitrogen_mg_l);
        Self {
            cfg,
            params: StrainParams::default(),
            state,
            rng: SimRng::new(seed),
        }
    }

    /// Water temperature at the current hour. Sinusoidal around the daily mean,
    /// lagging air temperature by ~3 h because water has thermal mass.
    fn water_temp(&self) -> f64 {
        let phase = (self.state.hour - 3.0) / 24.0 * 2.0 * std::f64::consts::PI;
        self.cfg.mean_air_temp_c + (self.cfg.diurnal_swing_c / 2.0) * phase.sin()
    }

    /// Advance the pond by `dt_hours`. Returns CO₂ fixed during the step, kg.
    pub fn step(&mut self, dt_hours: f64) -> f64 {
        let surface_par_wm2 =
            solar::clear_sky_par(self.cfg.lat_deg, self.state.day_of_year, self.state.hour);

        // Cloud cover: most days are mostly clear here, occasionally not.
        let cloud_factor = 1.0 - (self.rng.uniform() * 0.35);
        let surface_par_umol = surface_par_wm2 * PAR_WM2_TO_UMOL * cloud_factor;

        self.state.water_temp_c = self.water_temp();

        let mu = growth::specific_growth_rate(
            surface_par_umol,
            self.state.water_temp_c,
            self.state.nitrogen_mg_l,
            self.state.biomass_g_per_l,
            self.cfg.depth_m,
            &self.params,
        );

        let before = self.state.biomass_g_per_l;
        self.state.biomass_g_per_l = growth::step_biomass(before, mu, dt_hours);
        let delta_g_per_l = self.state.biomass_g_per_l - before;

        // Nitrogen drawdown. Algal biomass is ~7.6% N by dry weight, which is
        // also why wastewater-grown biomass makes a usable biofertiliser.
        let n_consumed_mg_l = delta_g_per_l.max(0.0) * 1000.0 * 0.076;
        self.state.nitrogen_mg_l = (self.state.nitrogen_mg_l - n_consumed_mg_l).max(0.0);

        // Photosynthesis consumes CO₂ and raises pH; respiration does the
        // reverse. Both are bounded so a long run cannot drift to nonsense.
        let growing = delta_g_per_l > 0.0;
        self.state.ph = (self.state.ph + if growing { 0.02 } else { -0.015 }).clamp(7.5, 10.8);
        self.state.dissolved_oxygen_mg_l =
            (self.state.dissolved_oxygen_mg_l + if growing { 0.3 } else { -0.25 }).clamp(0.5, 18.0);

        // g/L × litres = g, then to kg, then stoichiometry.
        let volume_l = PondState::volume_l(&self.cfg);
        let biomass_gain_kg = (delta_g_per_l * volume_l / 1000.0).max(0.0);
        let co2_kg = biomass_gain_kg * crate::CO2_PER_KG_BIOMASS;
        self.state.cumulative_co2_kg += co2_kg;

        self.state.hour += dt_hours;
        while self.state.hour >= 24.0 {
            self.state.hour -= 24.0;
            self.state.day_of_year = (self.state.day_of_year % 365) + 1;
        }

        co2_kg
    }

    /// Harvest a fraction of standing biomass. Returns dry mass removed, kg.
    ///
    /// This is what a weighbridge would see, and for the smallholder tier it is
    /// the entire independent channel.
    pub fn harvest(&mut self, fraction: f64) -> f64 {
        let f = fraction.clamp(0.0, 0.95);
        let removed_g_per_l = self.state.biomass_g_per_l * f;
        self.state.biomass_g_per_l -= removed_g_per_l;
        // Replenish nutrients — a wastewater site has fresh influent arriving.
        self.state.nitrogen_mg_l = self.cfg.influent_nitrogen_mg_l;
        removed_g_per_l * PondState::volume_l(&self.cfg) / 1000.0
    }

    /// Standing dry biomass in kg.
    pub fn standing_biomass_kg(&self) -> f64 {
        self.state.biomass_g_per_l * PondState::volume_l(&self.cfg) / 1000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rng_is_reproducible() {
        let a: Vec<f64> = (0..5).map(|_| SimRng::new(42).uniform()).collect();
        let b: Vec<f64> = (0..5).map(|_| SimRng::new(42).uniform()).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn rng_zero_seed_does_not_stick() {
        let mut r = SimRng::new(0);
        assert!(r.uniform() > 0.0);
        assert_ne!(r.uniform(), r.uniform());
    }

    #[test]
    fn same_seed_gives_identical_trajectory() {
        let run = || {
            let mut p = Pond::new(PondConfig::default(), 7, 100);
            for _ in 0..(24 * 7) {
                p.step(1.0);
            }
            p.state.cumulative_co2_kg
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn pond_grows_over_a_week() {
        let mut p = Pond::new(PondConfig::default(), 1, 100);
        let start = p.state.biomass_g_per_l;
        for _ in 0..(24 * 7) {
            p.step(1.0);
        }
        assert!(p.state.biomass_g_per_l > start, "pond should grow");
        assert!(p.state.cumulative_co2_kg > 0.0);
    }

    #[test]
    fn growth_stays_under_the_physics_ceiling() {
        // The twin must never out-produce the bound. If this fails, either the
        // ceiling is too tight or the kinetics are wrong — and a real operator
        // would be getting rejected for an honest claim.
        use crate::ceiling::{max_biomass_gain, CeilingInput};

        let cfg = PondConfig::default();
        let mut p = Pond::new(cfg, 3, 100);
        for _ in 0..(24 * 14) {
            p.step(1.0);
        }

        let bound = max_biomass_gain(
            &CeilingInput {
                lat_deg: cfg.lat_deg,
                area_m2: cfg.area_m2,
                depth_m: cfg.depth_m,
                day_of_year_start: 100,
                window_days: 14,
                mean_temp_c: cfg.mean_air_temp_c,
            },
            &StrainParams::default(),
        );

        assert!(
            p.state.cumulative_co2_kg <= bound.max_co2_kg,
            "twin produced {:.1} kg CO2, ceiling allows {:.1}",
            p.state.cumulative_co2_kg,
            bound.max_co2_kg
        );
    }

    #[test]
    fn nitrogen_depletes_without_replenishment() {
        let mut cfg = PondConfig::default();
        cfg.influent_nitrogen_mg_l = 5.0;
        let mut p = Pond::new(cfg, 2, 100);
        for _ in 0..(24 * 10) {
            p.step(1.0);
        }
        assert!(p.state.nitrogen_mg_l < 5.0, "nitrogen should draw down");
    }

    #[test]
    fn harvest_removes_biomass_and_resets_nutrients() {
        let mut p = Pond::new(PondConfig::default(), 5, 100);
        for _ in 0..(24 * 10) {
            p.step(1.0);
        }
        let before = p.standing_biomass_kg();
        let removed = p.harvest(0.5);
        assert!(removed > 0.0);
        assert!((p.standing_biomass_kg() - before * 0.5).abs() < 1e-6);
        assert_eq!(p.state.nitrogen_mg_l, p.cfg.influent_nitrogen_mg_l);
    }

    #[test]
    fn day_rolls_over_correctly() {
        let mut p = Pond::new(PondConfig::default(), 1, 365);
        for _ in 0..48 {
            p.step(1.0);
        }
        assert!(p.state.day_of_year >= 1 && p.state.day_of_year <= 365);
        assert!(p.state.hour >= 0.0 && p.state.hour < 24.0);
    }
}
