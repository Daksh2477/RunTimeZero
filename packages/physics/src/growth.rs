//! Microalgal growth kinetics.
//!
//! Three independent limitations — light, temperature, nutrients — combined
//! multiplicatively, plus self-shading through the water column.
//!
//! Self-shading is the part that matters most for the ceiling. A pond does not
//! grow faster forever as you add biomass: the culture shades itself, average
//! light through the column collapses, and areal productivity saturates. That
//! saturation is *why* an upper bound exists at all. Without Beer–Lambert here,
//! `ceiling.rs` would be a guess.
//!
//! Constants are published values for Spirulina platensis, cited inline. They
//! are strain parameters, not fitted coefficients — the distinction matters,
//! because `ceiling.rs` must stay free of anything we tuned.

use std::f64::consts::E;

/// Conversion from broadband PAR in W/m² to photon flux in µmol photons/m²/s.
/// Standard factor for daylight in the 400–700 nm band.
pub const PAR_WM2_TO_UMOL: f64 = 4.57;

/// Strain parameters. Defaults are Spirulina platensis, the most common
/// commercial open-pond organism in India.
#[derive(Debug, Clone, Copy)]
pub struct StrainParams {
    /// Maximum specific growth rate under ideal conditions, per hour.
    pub mu_max_per_hour: f64,
    /// Saturation irradiance Ik, µmol/m²/s — where light stops being limiting.
    pub ik_umol: f64,
    /// Photoinhibition onset, µmol/m²/s. Above this, excess light *reduces* growth.
    pub photoinhibition_umol: f64,
    pub temp_min_c: f64,
    pub temp_opt_c: f64,
    pub temp_max_c: f64,
    /// Half-saturation constant for nitrogen, mg/L (Monod Ks).
    pub ks_nitrogen_mg_l: f64,
    /// Biomass-specific light attenuation, m²/g. Drives self-shading.
    pub attenuation_m2_per_g: f64,
    /// Maintenance respiration as a fraction of mu_max. Paid day and night.
    pub respiration_frac: f64,
}

impl Default for StrainParams {
    fn default() -> Self {
        // Spirulina platensis. mu_max ~0.06/h is a mid-range literature value
        // (roughly a doubling every 12 h at optimum).
        Self {
            mu_max_per_hour: 0.06,
            ik_umol: 250.0,
            photoinhibition_umol: 1500.0,
            temp_min_c: 15.0,
            temp_opt_c: 35.0,
            temp_max_c: 42.0,
            ks_nitrogen_mg_l: 2.0,
            attenuation_m2_per_g: 0.12,
            respiration_frac: 0.10,
        }
    }
}

/// Light limitation factor in 0..=1, with photoinhibition.
///
/// Steele's equation rather than a saturating hyperbola, because it turns over
/// at high irradiance. A midday tropical pond genuinely does photoinhibit, and
/// a model that grows monotonically with light would overstate the ceiling at
/// exactly the time of day the ceiling matters most.
pub fn light_limitation(par_umol: f64, p: &StrainParams) -> f64 {
    if par_umol <= 0.0 {
        return 0.0;
    }
    let ratio = par_umol / p.photoinhibition_umol;
    let f = ratio * E.powf(1.0 - ratio);
    f.clamp(0.0, 1.0)
}

/// Temperature limitation in 0..=1 — a cardinal temperature model.
///
/// Zero outside [min, max], peaking at the optimum. Not a Gaussian: real
/// thermal response is asymmetric, falling off far more sharply above the
/// optimum than below it.
pub fn temperature_limitation(temp_c: f64, p: &StrainParams) -> f64 {
    if temp_c <= p.temp_min_c || temp_c >= p.temp_max_c {
        return 0.0;
    }
    let numerator = (temp_c - p.temp_min_c) * (temp_c - p.temp_max_c);
    let denominator = numerator - (temp_c - p.temp_opt_c).powi(2);
    if denominator.abs() < f64::EPSILON {
        return 0.0;
    }
    (numerator / denominator).clamp(0.0, 1.0)
}

/// Nutrient limitation in 0..=1 — Monod kinetics on the limiting nutrient.
///
/// On a wastewater site this is usually saturated, which is the whole economic
/// argument for siting there: the effluent supplies N and P for free.
pub fn nutrient_limitation(nitrogen_mg_l: f64, p: &StrainParams) -> f64 {
    if nitrogen_mg_l <= 0.0 {
        return 0.0;
    }
    nitrogen_mg_l / (p.ks_nitrogen_mg_l + nitrogen_mg_l)
}

/// Mean PAR experienced by a cell in a fully mixed pond, µmol/m²/s.
///
/// Beer–Lambert attenuation integrated over depth and divided by depth. In a
/// paddlewheel-mixed raceway every cell circulates through the whole column, so
/// the depth-average is what the culture actually sees.
///
/// This is the term that makes areal productivity saturate: doubling biomass
/// does not double growth, because the extra biomass shades itself.
pub fn mean_par_in_column(
    surface_par_umol: f64,
    biomass_g_per_l: f64,
    depth_m: f64,
    p: &StrainParams,
) -> f64 {
    if surface_par_umol <= 0.0 || depth_m <= 0.0 {
        return 0.0;
    }

    // Background attenuation of the water itself, before any algae.
    const WATER_ATTENUATION_PER_M: f64 = 0.15;

    // Total diffuse attenuation coefficient, per metre. g/L is numerically
    // equal to kg/m³, so the biomass term is already in the right units.
    let kd = p.attenuation_m2_per_g * biomass_g_per_l.max(0.0) + WATER_ATTENUATION_PER_M;

    let tau = kd * depth_m;
    if tau < 1e-9 {
        return surface_par_umol;
    }
    // (1/D) ∫₀ᴰ I₀ e^{-kd·z} dz  =  I₀ (1 - e^{-kd·D}) / (kd·D)
    surface_par_umol * (1.0 - (-tau).exp()) / tau
}

/// Net specific growth rate, per hour. May be negative when respiration
/// exceeds photosynthesis — which is exactly what happens overnight.
pub fn specific_growth_rate(
    surface_par_umol: f64,
    temp_c: f64,
    nitrogen_mg_l: f64,
    biomass_g_per_l: f64,
    depth_m: f64,
    p: &StrainParams,
) -> f64 {
    let mean_par = mean_par_in_column(surface_par_umol, biomass_g_per_l, depth_m, p);

    let f_light = light_limitation(mean_par, p);
    let f_temp = temperature_limitation(temp_c, p);
    let f_nutrient = nutrient_limitation(nitrogen_mg_l, p);

    let gross = p.mu_max_per_hour * f_light * f_temp * f_nutrient;
    // Respiration is paid whether or not the sun is up, but scales with how
    // metabolically active the culture is at that temperature.
    let respiration = p.mu_max_per_hour * p.respiration_frac * f_temp;

    gross - respiration
}

/// Biomass after one timestep, g/L. Never returns negative.
pub fn step_biomass(biomass_g_per_l: f64, mu_per_hour: f64, dt_hours: f64) -> f64 {
    let next = biomass_g_per_l * (mu_per_hour * dt_hours).exp();
    next.max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p() -> StrainParams {
        StrainParams::default()
    }

    #[test]
    fn darkness_gives_no_light_limitation() {
        assert_eq!(light_limitation(0.0, &p()), 0.0);
    }

    #[test]
    fn light_limitation_peaks_then_photoinhibits() {
        let at_peak = light_limitation(1500.0, &p());
        let above = light_limitation(3000.0, &p());
        assert!(at_peak > 0.99, "peak should be ~1.0, got {at_peak}");
        assert!(above < at_peak, "excess light must reduce growth");
    }

    #[test]
    fn temperature_is_zero_outside_cardinal_range() {
        assert_eq!(temperature_limitation(10.0, &p()), 0.0);
        assert_eq!(temperature_limitation(45.0, &p()), 0.0);
    }

    #[test]
    fn temperature_peaks_at_optimum() {
        let opt = temperature_limitation(35.0, &p());
        assert!(opt > 0.95, "got {opt}");
        assert!(temperature_limitation(25.0, &p()) < opt);
        assert!(temperature_limitation(40.0, &p()) < opt);
    }

    #[test]
    fn nutrient_limitation_saturates() {
        let params = p();
        assert!((nutrient_limitation(params.ks_nitrogen_mg_l, &params) - 0.5).abs() < 1e-9);
        assert!(nutrient_limitation(1000.0, &params) > 0.99);
    }

    #[test]
    fn self_shading_reduces_mean_light() {
        let params = p();
        let clear = mean_par_in_column(1000.0, 0.0, 0.3, &params);
        let dense = mean_par_in_column(1000.0, 2.0, 0.3, &params);
        assert!(dense < clear, "dense culture must see less light");
        assert!(dense > 0.0);
    }

    #[test]
    fn deeper_ponds_shade_more() {
        let params = p();
        let shallow = mean_par_in_column(1000.0, 1.0, 0.2, &params);
        let deep = mean_par_in_column(1000.0, 1.0, 0.6, &params);
        assert!(deep < shallow);
    }

    #[test]
    fn culture_loses_biomass_overnight() {
        let mu = specific_growth_rate(0.0, 30.0, 50.0, 0.5, 0.3, &p());
        assert!(mu < 0.0, "respiration must exceed zero photosynthesis");
        let after = step_biomass(0.5, mu, 8.0);
        assert!(after < 0.5 && after > 0.0);
    }

    #[test]
    fn good_conditions_grow_the_culture() {
        let mu = specific_growth_rate(800.0, 35.0, 50.0, 0.4, 0.3, &p());
        assert!(mu > 0.0, "got {mu}");
        assert!(step_biomass(0.4, mu, 12.0) > 0.4);
    }

    #[test]
    fn growth_saturates_with_density() {
        // Areal productivity must not scale linearly with biomass — if it does,
        // self-shading is broken and the ceiling becomes meaningless.
        let params = p();
        let g = |x: f64| specific_growth_rate(1200.0, 35.0, 50.0, x, 0.3, &params) * x;
        let low = g(0.2);
        let high = g(2.0);
        assert!(
            high < low * 10.0,
            "productivity scaled too close to linearly"
        );
    }
}
