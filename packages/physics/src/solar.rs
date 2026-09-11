//! Solar position and clear-sky irradiance.
//!
//! This module is the foundation of the physics ceiling, so it contains NO
//! fitted parameters. Every constant here is astronomical or a published
//! physical value, and every function can be checked against an almanac.
//!
//! That matters more than accuracy: a ceiling built on tuned coefficients is a
//! model somebody can argue with. A ceiling built on orbital mechanics is not.
//!
//! References: NOAA solar position algorithm; Duffie & Beckman, *Solar
//! Engineering of Thermal Processes*, for the clear-sky treatment.

use std::f64::consts::PI;

/// Solar constant — mean extraterrestrial irradiance at 1 AU, W/m².
pub const SOLAR_CONSTANT: f64 = 1361.0;

/// Fraction of broadband solar irradiance that is photosynthetically active
/// (400–700 nm). Standard value for daylight.
pub const PAR_FRACTION: f64 = 0.45;

fn to_radians(deg: f64) -> f64 {
    deg * PI / 180.0
}

fn to_degrees(rad: f64) -> f64 {
    rad * 180.0 / PI
}

/// Day of year, 1–365. Deliberately takes an integer so callers can't smuggle
/// a fractional day in and get a subtly wrong declination.
pub fn day_angle(day_of_year: u32) -> f64 {
    2.0 * PI * (day_of_year as f64 - 1.0) / 365.0
}

/// Solar declination in degrees — the sun's angle above the celestial equator.
///
/// Spencer's Fourier expansion. Accurate to ~0.01°, which is far tighter than
/// anything downstream needs.
pub fn declination_deg(day_of_year: u32) -> f64 {
    let b = day_angle(day_of_year);
    to_degrees(
        0.006918 - 0.399912 * b.cos() + 0.070257 * b.sin() - 0.006758 * (2.0 * b).cos()
            + 0.000907 * (2.0 * b).sin()
            - 0.002697 * (3.0 * b).cos()
            + 0.001480 * (3.0 * b).sin(),
    )
}

/// Equation of time in minutes — the discrepancy between apparent and mean
/// solar time, caused by orbital eccentricity and axial tilt.
pub fn equation_of_time_min(day_of_year: u32) -> f64 {
    let b = day_angle(day_of_year);
    229.18
        * (0.000075 + 0.001868 * b.cos()
            - 0.032077 * b.sin()
            - 0.014615 * (2.0 * b).cos()
            - 0.040849 * (2.0 * b).sin())
}

/// Hour angle in degrees. Zero at solar noon, negative in the morning,
/// +15° per hour after noon.
pub fn hour_angle_deg(solar_time_hours: f64) -> f64 {
    15.0 * (solar_time_hours - 12.0)
}

/// Solar elevation above the horizon, in degrees. Negative at night.
pub fn solar_elevation_deg(lat_deg: f64, day_of_year: u32, solar_time_hours: f64) -> f64 {
    let lat = to_radians(lat_deg);
    let decl = to_radians(declination_deg(day_of_year));
    let ha = to_radians(hour_angle_deg(solar_time_hours));

    let sin_elev = lat.sin() * decl.sin() + lat.cos() * decl.cos() * ha.cos();
    to_degrees(sin_elev.clamp(-1.0, 1.0).asin())
}

/// Day length in hours, from sunrise to sunset.
///
/// Returns 24.0 or 0.0 inside a polar day or night rather than producing NaN —
/// we will never site a pond there, but a silent NaN would poison a ceiling.
pub fn day_length_hours(lat_deg: f64, day_of_year: u32) -> f64 {
    let lat = to_radians(lat_deg);
    let decl = to_radians(declination_deg(day_of_year));

    let cos_ha = -lat.tan() * decl.tan();
    if cos_ha <= -1.0 {
        return 24.0; // sun never sets
    }
    if cos_ha >= 1.0 {
        return 0.0; // sun never rises
    }
    2.0 * to_degrees(cos_ha.acos()) / 15.0
}

/// Clear-sky global horizontal irradiance in W/m².
///
/// Uses air mass with the Kasten–Young correction near the horizon, and a
/// single atmospheric transmittance term. Deliberately simple: this is an upper
/// bound on available light, not a forecast. Real conditions are always dimmer,
/// which keeps the ceiling a ceiling.
pub fn clear_sky_ghi(lat_deg: f64, day_of_year: u32, solar_time_hours: f64) -> f64 {
    let elev = solar_elevation_deg(lat_deg, day_of_year, solar_time_hours);
    if elev <= 0.0 {
        return 0.0;
    }

    // Kasten–Young air mass. The correction term keeps this finite at low
    // elevation, where a plain 1/sin would blow up.
    let z = 90.0 - elev;
    let air_mass = 1.0 / (to_radians(elev).sin() + 0.50572 * (96.07995 - z).powf(-1.6364));

    // Eccentricity correction — Earth is ~3.3% closer to the sun in January.
    let b = day_angle(day_of_year);
    let e0 = 1.00011 + 0.034221 * b.cos() + 0.001280 * b.sin() + 0.000719 * (2.0 * b).cos();

    // Broadband clear-sky transmittance. 0.7 is the textbook value for a clear
    // dry atmosphere at sea level.
    const TRANSMITTANCE: f64 = 0.7;

    SOLAR_CONSTANT * e0 * TRANSMITTANCE.powf(air_mass) * to_radians(elev).sin()
}

/// Photosynthetically active radiation in W/m² — the part of the spectrum
/// algae can actually use.
pub fn clear_sky_par(lat_deg: f64, day_of_year: u32, solar_time_hours: f64) -> f64 {
    clear_sky_ghi(lat_deg, day_of_year, solar_time_hours) * PAR_FRACTION
}

/// Mean PAR over a day, W/m², averaged across all 24 hours including darkness.
///
/// Integrated at 10-minute steps rather than using a closed form: the extra
/// precision is free at this scale, and a loop is far easier for a teammate to
/// verify than an integral.
pub fn daily_mean_par(lat_deg: f64, day_of_year: u32) -> f64 {
    const STEPS: usize = 144; // 10-minute resolution
    let mut total = 0.0;
    for i in 0..STEPS {
        let hour = (i as f64) * 24.0 / (STEPS as f64);
        total += clear_sky_par(lat_deg, day_of_year, hour);
    }
    total / (STEPS as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Ahmedabad, roughly. The team is here, so these are numbers we can sanity
    // check against a weather app rather than trusting blindly.
    const AHMEDABAD_LAT: f64 = 23.03;

    #[test]
    fn declination_hits_the_solstices() {
        // Around 21 June declination peaks near +23.44°, and near -23.44° in December.
        assert!((declination_deg(172) - 23.44).abs() < 0.3);
        assert!((declination_deg(355) + 23.44).abs() < 0.3);
    }

    #[test]
    fn equinox_declination_is_near_zero() {
        assert!(declination_deg(80).abs() < 1.0); // ~21 March
        assert!(declination_deg(266).abs() < 1.0); // ~23 September
    }

    #[test]
    fn day_length_is_twelve_hours_at_equinox() {
        let len = day_length_hours(AHMEDABAD_LAT, 80);
        assert!((len - 12.0).abs() < 0.2, "got {len}");
    }

    #[test]
    fn summer_days_are_longer_than_winter_days() {
        let summer = day_length_hours(AHMEDABAD_LAT, 172);
        let winter = day_length_hours(AHMEDABAD_LAT, 355);
        assert!(summer > winter);
        assert!(summer > 13.0 && summer < 14.0, "got {summer}");
    }

    #[test]
    fn sun_is_below_horizon_at_midnight() {
        assert!(solar_elevation_deg(AHMEDABAD_LAT, 172, 0.0) < 0.0);
        assert_eq!(clear_sky_ghi(AHMEDABAD_LAT, 172, 0.0), 0.0);
    }

    #[test]
    fn noon_irradiance_is_physically_plausible() {
        // Clear-sky noon GHI in the tropics sits around 900–1050 W/m².
        // Anything outside that means the air mass term is wrong.
        let ghi = clear_sky_ghi(AHMEDABAD_LAT, 172, 12.0);
        assert!((850.0..=1100.0).contains(&ghi), "got {ghi}");
    }

    #[test]
    fn irradiance_never_exceeds_the_solar_constant() {
        for day in (1..=365).step_by(7) {
            for step in 0..24 {
                let ghi = clear_sky_ghi(AHMEDABAD_LAT, day, step as f64);
                assert!(ghi <= SOLAR_CONSTANT, "day {day} hour {step} gave {ghi}");
            }
        }
    }

    #[test]
    fn polar_night_does_not_produce_nan() {
        let len = day_length_hours(80.0, 355);
        assert!(len.is_finite());
        assert_eq!(len, 0.0);
    }
}
