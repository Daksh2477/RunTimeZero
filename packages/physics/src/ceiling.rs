//! The physics ceiling — maximum biomass a pond could possibly gain.
//!
//! This is the single most important function in the repo, because it is the
//! only part of the verification argument that requires no trust at all. A
//! claim above this line is not "suspicious", it is impossible.
//!
//! THREE RULES FOR EDITING THIS FILE
//!
//! 1. **No fitted parameters, ever.** Every input is pond geometry, orbital
//!    mechanics, or a published strain constant. The moment a tuned coefficient
//!    appears here, the ceiling stops being arithmetic and becomes a model
//!    somebody can attack.
//!
//! 2. **Always err generous.** Every assumption is the most favourable one
//!    physically available: clear sky, optimal temperature, unlimited nutrients,
//!    perfect mixing, zero harvesting loss. A real pond can never beat this, so
//!    a claim that does is false regardless of who made it.
//!
//! 3. **Stay recomputable by hand.** A judge should be able to check any number
//!    we publish with a calculator and the inputs we echo back.

use crate::growth::{StrainParams, PAR_WM2_TO_UMOL};
use crate::solar;

/// Everything needed to bound a pond's growth over a window.
#[derive(Debug, Clone, Copy)]
pub struct CeilingInput {
    pub lat_deg: f64,
    /// Surface area in m². Areal productivity scales with this directly.
    pub area_m2: f64,
    pub depth_m: f64,
    pub day_of_year_start: u32,
    pub window_days: u32,
    /// Mean water temperature over the window, °C. The ONE observed input.
    pub mean_temp_c: f64,
}

/// The bound, plus every input echoed back so it can be recomputed externally.
#[derive(Debug, Clone, Copy)]
pub struct CeilingResult {
    pub max_biomass_kg: f64,
    pub max_co2_kg: f64,
    pub mean_par_wm2: f64,
    pub photosynthetic_efficiency: f64,
    pub window_days: u32,
}

/// Theoretical maximum conversion of PAR energy into biomass energy.
///
/// DERIVED, NOT FITTED — the derivation is the whole point, so it is written out
/// here and can be checked by hand:
///
///   - Fixing one mol of CO₂ requires a minimum of 8 photons (quantum yield).
///   - Mean PAR photon energy at ~550 nm is ~217 kJ/mol.
///   - Energy stored in biomass per mol CO₂ fixed is ~477 kJ/mol.
///
///   efficiency = 477 / (8 × 217) = 0.275
///
/// So ~27% of PAR is the photon-counting limit. This is equivalent to the more
/// commonly quoted "~9–11% of *total* solar", since PAR is ~45% of broadband —
/// and an earlier version of this file applied the 9% figure to PAR directly,
/// which produced a ceiling of 42.9 g/m²/day. That sits *below* achieved
/// open-pond yields of 30–77 g/m²/day, so it would have rejected honest
/// operators. The test `ceiling_is_above_real_world_productivity` exists to
/// catch exactly that, and did.
///
/// We use the theoretical limit rather than any achieved figure on purpose: an
/// achieved figure would be a fitted parameter, and this file must stay free of
/// anything an operator could dispute by attacking our tuning.
pub const MAX_PHOTOSYNTHETIC_EFFICIENCY: f64 = 0.275;

/// Energy content of dry algal biomass, MJ per kg. Published calorific value.
pub const BIOMASS_ENERGY_MJ_PER_KG: f64 = 21.0;

/// Maximum biomass gain over the window, in kg.
///
/// Works from an energy budget rather than by integrating growth kinetics:
/// total PAR landing on the pond, times the thermodynamic efficiency limit,
/// divided by the energy content of biomass.
///
/// This is deliberately cruder than the twin. The twin models what a pond
/// *will* do; the ceiling bounds what any pond *could* do. Using kinetics here
/// would import strain assumptions that a fraudster could dispute.
pub fn max_biomass_gain(input: &CeilingInput, params: &StrainParams) -> CeilingResult {
    let mut total_par_joules = 0.0;
    let mut par_sum_wm2 = 0.0;

    for d in 0..input.window_days {
        let day = ((input.day_of_year_start + d - 1) % 365) + 1;
        // Clear-sky daily mean PAR in W/m², averaged over all 24 hours.
        let mean_par = solar::daily_mean_par(input.lat_deg, day);
        par_sum_wm2 += mean_par;
        // W/m² × m² × seconds = joules.
        total_par_joules += mean_par * input.area_m2 * 86_400.0;
    }

    let mean_par_wm2 = if input.window_days > 0 {
        par_sum_wm2 / input.window_days as f64
    } else {
        0.0
    };

    // Temperature is the one place reality is allowed to reduce the bound —
    // it is measured, not assumed, and a pond at 5 °C genuinely cannot grow.
    // Nutrients and light are assumed ideal; see rule 2.
    let f_temp = crate::growth::temperature_limitation(input.mean_temp_c, params);

    let usable_joules = total_par_joules * MAX_PHOTOSYNTHETIC_EFFICIENCY * f_temp;
    let max_biomass_kg = usable_joules / (BIOMASS_ENERGY_MJ_PER_KG * 1.0e6);

    CeilingResult {
        max_biomass_kg,
        max_co2_kg: max_biomass_kg * crate::CO2_PER_KG_BIOMASS,
        mean_par_wm2,
        photosynthetic_efficiency: MAX_PHOTOSYNTHETIC_EFFICIENCY,
        window_days: input.window_days,
    }
}

/// Convenience: is a claimed CO₂ figure physically possible for this pond?
///
/// The only question the reconciliation engine asks of this module.
pub fn claim_is_possible(claimed_co2_kg: f64, ceiling: &CeilingResult) -> bool {
    claimed_co2_kg <= ceiling.max_co2_kg
}

/// Peak instantaneous PAR in µmol/m²/s, for display and for the simulator.
pub fn peak_par_umol(lat_deg: f64, day_of_year: u32) -> f64 {
    solar::clear_sky_par(lat_deg, day_of_year, 12.0) * PAR_WM2_TO_UMOL
}

#[cfg(test)]
mod tests {
    use super::*;

    const AHMEDABAD_LAT: f64 = 23.03;

    fn one_hectare(days: u32, temp_c: f64) -> CeilingInput {
        CeilingInput {
            lat_deg: AHMEDABAD_LAT,
            area_m2: 10_000.0,
            depth_m: 0.3,
            day_of_year_start: 100,
            window_days: days,
            mean_temp_c: temp_c,
        }
    }

    #[test]
    fn ceiling_is_above_real_world_productivity() {
        // Literature puts optimised open-pond yield at 30–77 g/m²/day. Our
        // bound must sit comfortably above the top of that range — if it lands
        // inside it, we would be rejecting honest operators.
        let c = max_biomass_gain(&one_hectare(1, 35.0), &StrainParams::default());
        let g_per_m2_day = c.max_biomass_kg * 1000.0 / 10_000.0;
        assert!(
            g_per_m2_day > 77.0,
            "ceiling {g_per_m2_day:.1} g/m²/day is below achieved yields — too tight"
        );
    }

    #[test]
    fn ceiling_is_not_absurdly_loose() {
        // A bound 100× reality is useless: a fraudster just stays under it.
        // Somewhere in 1–5× achieved best is the useful band.
        let c = max_biomass_gain(&one_hectare(1, 35.0), &StrainParams::default());
        let g_per_m2_day = c.max_biomass_kg * 1000.0 / 10_000.0;
        assert!(
            g_per_m2_day < 400.0,
            "ceiling {g_per_m2_day:.1} g/m²/day is too loose to constrain anyone"
        );
    }

    #[test]
    fn ceiling_scales_with_area() {
        let params = StrainParams::default();
        let small = max_biomass_gain(&one_hectare(7, 35.0), &params);
        let mut big_input = one_hectare(7, 35.0);
        big_input.area_m2 = 100_000.0;
        let big = max_biomass_gain(&big_input, &params);
        assert!((big.max_biomass_kg / small.max_biomass_kg - 10.0).abs() < 1e-6);
    }

    #[test]
    fn cold_pond_cannot_grow() {
        let c = max_biomass_gain(&one_hectare(7, 5.0), &StrainParams::default());
        assert_eq!(c.max_biomass_kg, 0.0);
        assert!(!claim_is_possible(1.0, &c));
    }

    #[test]
    fn co2_follows_stoichiometry() {
        let c = max_biomass_gain(&one_hectare(30, 35.0), &StrainParams::default());
        let expected = c.max_biomass_kg * crate::CO2_PER_KG_BIOMASS;
        assert!((c.max_co2_kg - expected).abs() < 1e-9);
    }

    #[test]
    fn longer_windows_allow_more() {
        let params = StrainParams::default();
        let week = max_biomass_gain(&one_hectare(7, 35.0), &params);
        let month = max_biomass_gain(&one_hectare(30, 35.0), &params);
        assert!(month.max_biomass_kg > week.max_biomass_kg);
    }

    #[test]
    fn an_impossible_claim_is_rejected() {
        let c = max_biomass_gain(&one_hectare(7, 35.0), &StrainParams::default());
        assert!(claim_is_possible(c.max_co2_kg * 0.5, &c));
        assert!(!claim_is_possible(c.max_co2_kg * 1.01, &c));
    }

    #[test]
    fn window_wraps_across_year_end() {
        let params = StrainParams::default();
        let mut input = one_hectare(20, 35.0);
        input.day_of_year_start = 355; // runs into January
        let c = max_biomass_gain(&input, &params);
        assert!(c.max_biomass_kg.is_finite() && c.max_biomass_kg > 0.0);
    }
}
