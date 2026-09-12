//! Fault injection, and the boundary between truth and what anyone else sees.
//!
//! THIS FILE IS THE ENFORCEMENT POINT FOR DECISION #6.
//!
//! `sim::PondState` is the pond's true state. `Observation` is what leaves this
//! crate. The only way to get from one to the other is `observe()`, which adds
//! sensor noise, quantises to the ADC's actual resolution, and applies any
//! operator bias. There is deliberately no accessor that hands out truth.
//!
//! So when the reconciliation engine flags a divergence, it did so from a
//! degraded reading — not from a number it was quietly handed.

use crate::sim::{Pond, PondState, SimRng};

/// Things that go wrong in a real pond, plus one thing an operator does on
/// purpose. All are injectable so we can generate labelled training data for
/// `crash_classifier` and `divergence_classifier`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Fault {
    /// A competing organism takes over. Biomass collapses over ~3 days.
    ContaminationCrash { severity: f64 },
    /// Paddlewheel stops. Mixing fails, the culture stratifies and self-shades.
    PumpFailure,
    /// Influent nitrogen cut off. Growth tails away as the pond draws down.
    NitrogenStarvation,
    /// A cold night or a heatwave pushes the culture outside its range.
    ThermalShock { delta_c: f64 },
    /// The operator reports more CO₂ than was fixed.
    ///
    /// `factor` of 1.08 means they overstate by 8% — small enough to sit under
    /// the physics ceiling forever, which is exactly the case the hard rule
    /// cannot catch and `divergence_classifier` exists for.
    OverstatedUptake { factor: f64 },
}

/// A fault active over a window of simulated hours.
#[derive(Debug, Clone, Copy)]
pub struct ScheduledFault {
    pub fault: Fault,
    pub start_hour: u32,
    pub duration_hours: u32,
}

impl ScheduledFault {
    pub fn active_at(&self, hour: u32) -> bool {
        hour >= self.start_hour && hour < self.start_hour + self.duration_hours
    }
}

/// What the outside world receives. No field here is ground truth.
#[derive(Debug, Clone, Copy)]
pub struct Observation {
    pub ph: f64,
    pub dissolved_oxygen_mg_l: f64,
    pub temperature_c: f64,
    pub optical_density: f64,
    /// CO₂ uptake the operator REPORTS for this step, kg. Not what was fixed.
    pub reported_co2_kg: f64,
}

/// ESP32 ADC resolution — 12 bits over 3.3 V. Quantising here rather than
/// leaving clean floats matters: a reading that is too precise is a tell, and
/// downstream code should never depend on precision the hardware lacks.
const ADC_STEPS: f64 = 4095.0;
const ADC_VREF: f64 = 3.3;

fn quantise(value: f64, volts_per_unit: f64) -> f64 {
    let volts = (value * volts_per_unit).clamp(0.0, ADC_VREF);
    let step = (volts / ADC_VREF * ADC_STEPS).round();
    step / ADC_STEPS * ADC_VREF / volts_per_unit
}

/// Convert true pond state into an observation.
///
/// The only exit from ground truth. Applies, in order: fault effects on what
/// the sensor physically sees, Gaussian sensor noise, ADC quantisation, and
/// finally operator bias on the reported figure.
pub fn observe(
    state: &PondState,
    true_co2_this_step_kg: f64,
    faults: &[ScheduledFault],
    elapsed_hour: u32,
    rng: &mut SimRng,
) -> Observation {
    let mut ph = state.ph;
    let mut dissolved_oxygen = state.dissolved_oxygen_mg_l;
    let mut temperature = state.water_temp_c;
    let mut optical_density = state.biomass_g_per_l * 0.9;
    let mut report_factor = 1.0;

    for sf in faults.iter().filter(|f| f.active_at(elapsed_hour)) {
        match sf.fault {
            Fault::ContaminationCrash { severity } => {
                // A crashing culture goes acidic and the water clears as cells lyse.
                ph -= 0.6 * severity;
                optical_density *= 1.0 - 0.5 * severity;
                dissolved_oxygen -= 2.0 * severity;
            }
            Fault::PumpFailure => {
                // Stratified: the probe sits in a dead zone reading low.
                dissolved_oxygen *= 0.55;
                optical_density *= 0.7;
            }
            Fault::NitrogenStarvation => {
                // Chlorosis — the culture yellows and scatters less light.
                optical_density *= 0.85;
            }
            Fault::ThermalShock { delta_c } => {
                temperature += delta_c;
                dissolved_oxygen -= 1.0;
            }
            Fault::OverstatedUptake { factor } => {
                report_factor *= factor;
            }
        }
    }

    // Sensor noise. Values are typical manufacturer accuracy figures for the
    // cheap probes an operator at this scale would actually buy.
    ph += rng.normal() * 0.05;
    dissolved_oxygen += rng.normal() * 0.15;
    temperature += rng.normal() * 0.20;
    optical_density += rng.normal() * 0.01;

    Observation {
        ph: quantise(ph.clamp(0.0, 14.0), 0.2),
        dissolved_oxygen_mg_l: quantise(dissolved_oxygen.max(0.0), 0.15),
        temperature_c: quantise(temperature.clamp(-10.0, 60.0), 0.05),
        optical_density: quantise(optical_density.max(0.0), 0.9),
        reported_co2_kg: (true_co2_this_step_kg * report_factor).max(0.0),
    }
}

/// Apply a fault's effect on the pond's actual biology, as opposed to on what
/// the sensor reports. Crashes are real; overstatement is not.
pub fn apply_physical_effect(pond: &mut Pond, faults: &[ScheduledFault], elapsed_hour: u32) {
    for sf in faults.iter().filter(|f| f.active_at(elapsed_hour)) {
        match sf.fault {
            Fault::ContaminationCrash { severity } => {
                // Roughly a 50% loss per day at severity 1.0, applied hourly.
                pond.state.biomass_g_per_l *= 1.0 - (0.029 * severity);
            }
            Fault::NitrogenStarvation => {
                pond.state.nitrogen_mg_l = 0.0;
            }
            Fault::ThermalShock { delta_c } => {
                pond.state.water_temp_c += delta_c;
            }
            // Pump failure shows up through the sensor, not the biology, at
            // this timescale. Overstatement never touches the biology at all —
            // that is the entire point of it being fraud.
            Fault::PumpFailure | Fault::OverstatedUptake { .. } => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{Pond, PondConfig};

    fn run(faults: &[ScheduledFault], hours: u32, seed: u64) -> (Pond, Vec<Observation>) {
        let mut pond = Pond::new(PondConfig::default(), seed, 100);
        let mut obs = Vec::new();
        let mut rng = SimRng::new(seed ^ 0xABCD);
        for h in 0..hours {
            apply_physical_effect(&mut pond, faults, h);
            let co2 = pond.step(1.0);
            obs.push(observe(&pond.state, co2, faults, h, &mut rng));
        }
        (pond, obs)
    }

    #[test]
    fn clean_run_produces_plausible_readings() {
        let (_, obs) = run(&[], 24 * 5, 11);
        for o in &obs {
            assert!((6.0..=11.0).contains(&o.ph), "ph {} out of range", o.ph);
            assert!(o.dissolved_oxygen_mg_l >= 0.0);
            assert!(o.optical_density >= 0.0);
            assert!(o.reported_co2_kg >= 0.0);
        }
    }

    #[test]
    fn contamination_crashes_the_culture() {
        let f = [ScheduledFault {
            fault: Fault::ContaminationCrash { severity: 1.0 },
            start_hour: 24 * 5,
            duration_hours: 24 * 3,
        }];
        let (crashed, _) = run(&f, 24 * 10, 12);
        let (healthy, _) = run(&[], 24 * 10, 12);
        assert!(
            crashed.state.biomass_g_per_l < healthy.state.biomass_g_per_l * 0.6,
            "crash should cost at least 40% of biomass"
        );
    }

    #[test]
    fn overstatement_does_not_change_the_biology() {
        // The fraud is in the report, never in the pond. If this fails, the
        // simulator is lying to itself and divergence becomes meaningless.
        let f = [ScheduledFault {
            fault: Fault::OverstatedUptake { factor: 1.5 },
            start_hour: 0,
            duration_hours: 24 * 10,
        }];
        let (fraudulent, _) = run(&f, 24 * 10, 13);
        let (honest, _) = run(&[], 24 * 10, 13);
        assert!(
            (fraudulent.state.cumulative_co2_kg - honest.state.cumulative_co2_kg).abs() < 1e-9,
            "true CO2 must be identical — only the report differs"
        );
    }

    #[test]
    fn overstatement_inflates_only_the_report() {
        let f = [ScheduledFault {
            fault: Fault::OverstatedUptake { factor: 1.5 },
            start_hour: 0,
            duration_hours: 24 * 5,
        }];
        let (_, fraud_obs) = run(&f, 24 * 5, 14);
        let (_, honest_obs) = run(&[], 24 * 5, 14);

        let fraud_total: f64 = fraud_obs.iter().map(|o| o.reported_co2_kg).sum();
        let honest_total: f64 = honest_obs.iter().map(|o| o.reported_co2_kg).sum();
        assert!(
            fraud_total > honest_total * 1.4,
            "report should be inflated"
        );
    }

    #[test]
    fn quantisation_reduces_precision() {
        // A reading with more precision than the ADC can produce is a tell.
        let (_, obs) = run(&[], 24, 15);
        let temp = obs[12].temperature_c;
        let step = ADC_VREF / ADC_STEPS / 0.05;
        let remainder = (temp / step).fract();
        assert!(
            remainder < 1e-6 || remainder > 1.0 - 1e-6,
            "temperature {temp} is not on an ADC step"
        );
    }

    #[test]
    fn thermal_shock_shows_in_the_reading() {
        let f = [ScheduledFault {
            fault: Fault::ThermalShock { delta_c: -12.0 },
            start_hour: 10,
            duration_hours: 5,
        }];
        let (_, obs) = run(&f, 24, 16);
        assert!(obs[12].temperature_c < obs[5].temperature_c - 5.0);
    }

    #[test]
    fn faults_are_windowed() {
        let sf = ScheduledFault {
            fault: Fault::PumpFailure,
            start_hour: 10,
            duration_hours: 5,
        };
        assert!(!sf.active_at(9));
        assert!(sf.active_at(10));
        assert!(sf.active_at(14));
        assert!(!sf.active_at(15));
    }
}
