//! Deterministic pond physics, compiled to WASM.
//!
//! Everything in this crate is a pure function: no I/O, no clock, no
//! randomness that isn't seeded explicitly. Same input, same output, always.
//! That property is what makes the ceiling defensible — a judge can recompute
//! any figure we publish with a calculator and get our number back.
//!
//! Compiled to WASM so the API and the public simulator run ONE implementation
//! of the twin rather than two that drift apart.

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stoichiometry_is_exact() {
        assert!((co2_from_biomass(1000.0) - 1830.0).abs() < 1e-9);
    }
}
