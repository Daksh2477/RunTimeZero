//! What the biomass is actually made of, and therefore what it is worth.
//!
//! A kilogram of algae is not one commodity. Spirulina sold as food-grade
//! protein fetches many times what the same mass fetches as pond fertiliser,
//! and the difference is composition: protein, lipid, carbohydrate and ash.
//!
//! THE NITROGEN TRADE-OFF, WHICH IS THE WHOLE POINT
//!
//! Under nitrogen-replete conditions algae build protein and divide quickly.
//! Starve them of nitrogen and they cannot make more protein, so fixed carbon
//! goes into storage lipid instead — lipid fraction climbs steeply while
//! growth rate collapses. This is well established across species (Hu et al.
//! 2008; Griffiths & Harrison 2009).
//!
//! So the operator has a genuine decision with no free answer:
//!
//!   - Feed nitrogen hard  -> more total mass, high protein, low lipid.
//!   - Starve the pond     -> less mass, but each kg is worth more per kg as
//!     lipid, and carbon fixation per day drops.
//!
//! Getting this wrong in either direction costs real money, which is why it
//! belongs in the model rather than in a spreadsheet.
//!
//! Ranges below are for Spirulina platensis under Indian open-raceway
//! conditions and should be read as the shape of the response, not as a
//! guarantee for a particular strain.

/// Mass fractions of dry biomass. Sums to 1.0.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Composition {
    pub protein: f64,
    pub lipid: f64,
    pub carbohydrate: f64,
    /// Minerals and non-combustible residue.
    pub ash: f64,
}

impl Composition {
    /// Energy content, MJ/kg dry — the figure that matters for biodiesel.
    ///
    /// Atwater-style factors: lipid 37 MJ/kg, protein 17, carbohydrate 17.
    pub fn energy_mj_per_kg(&self) -> f64 {
        self.lipid * 37.0 + self.protein * 17.0 + self.carbohydrate * 17.0
    }

    /// Carbon mass fraction, needed to convert biomass to CO₂ honestly.
    ///
    /// Lipid is ~77% carbon, protein ~53%, carbohydrate ~44%, ash 0. A
    /// lipid-rich culture therefore locks away more CO₂ per kg than a
    /// protein-rich one, and using a flat 50% for both would misstate the
    /// carbon claim in whichever direction the pond happens to be running.
    pub fn carbon_fraction(&self) -> f64 {
        self.lipid * 0.77 + self.protein * 0.53 + self.carbohydrate * 0.44
    }

    fn normalised(mut self) -> Self {
        let total = self.protein + self.lipid + self.carbohydrate + self.ash;
        if total > 0.0 {
            self.protein /= total;
            self.lipid /= total;
            self.carbohydrate /= total;
            self.ash /= total;
        }
        self
    }
}

/// Ash is largely strain and medium, not growth conditions, so it is fixed.
const ASH_FRACTION: f64 = 0.08;

/// Nitrogen above this is replete — no stress response.
const N_REPLETE_MG_L: f64 = 12.0;

/// Composition at a given nitrogen availability and light dose.
///
/// `nitrogen_mg_l` is what the cells can actually reach; `daily_light_mol`
/// is the day's PAR dose in mol/m²/day, because carbon skeletons for storage
/// lipid have to come from somewhere and a dark week cannot fill them.
pub fn composition_at(nitrogen_mg_l: f64, daily_light_mol: f64) -> Composition {
    // 0 = fully replete, 1 = completely starved.
    let stress = (1.0 - (nitrogen_mg_l / N_REPLETE_MG_L).clamp(0.0, 1.0)).clamp(0.0, 1.0);

    // Lipid accumulation needs light as well as stress. Starving a pond in
    // monsoon overcast produces neither growth nor oil, which is a real and
    // frequently expensive mistake.
    let light_factor = (daily_light_mol / 30.0).clamp(0.3, 1.0);

    // Replete spirulina: ~60% protein, ~8% lipid. Fully stressed and well
    // lit: protein falls toward 25%, lipid climbs toward 35%.
    let protein = 0.60 - 0.35 * stress;
    let lipid = 0.08 + 0.27 * stress * light_factor;
    let carbohydrate = 1.0 - ASH_FRACTION - protein - lipid;

    Composition {
        protein,
        lipid,
        carbohydrate: carbohydrate.max(0.05),
        ash: ASH_FRACTION,
    }
    .normalised()
}

/// What a harvest can be sold as, given its composition.
///
/// Grades are ordered by value. The thresholds are commercial rather than
/// biological — a buyer paying food-grade prices is buying a protein
/// specification, and biodiesel processors quote on lipid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Grade {
    /// Protein ≥ 55%: human-grade spirulina powder.
    FoodGrade,
    /// Lipid ≥ 25%: worth extracting oil from.
    LipidRich,
    /// Protein ≥ 40%: aquaculture and poultry feed.
    FeedGrade,
    /// Everything else. Still carbon, still fertiliser, but low value.
    Fertiliser,
}

pub fn grade_for(c: &Composition) -> Grade {
    if c.protein >= 0.55 {
        Grade::FoodGrade
    } else if c.lipid >= 0.25 {
        Grade::LipidRich
    } else if c.protein >= 0.40 {
        Grade::FeedGrade
    } else {
        Grade::Fertiliser
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fractions_always_sum_to_one() {
        for n in [0.0, 3.0, 8.0, 12.0, 40.0] {
            for light in [5.0, 20.0, 45.0] {
                let c = composition_at(n, light);
                let total = c.protein + c.lipid + c.carbohydrate + c.ash;
                assert!(
                    (total - 1.0).abs() < 1e-9,
                    "n={n} light={light} total={total}"
                );
            }
        }
    }

    #[test]
    fn starving_the_pond_raises_lipid_and_drops_protein() {
        let replete = composition_at(40.0, 35.0);
        let starved = composition_at(0.5, 35.0);

        assert!(
            starved.lipid > replete.lipid * 2.0,
            "lipid must climb under stress"
        );
        assert!(
            starved.protein < replete.protein,
            "protein must fall under stress"
        );
    }

    #[test]
    fn starving_in_the_dark_produces_no_oil() {
        // The expensive mistake: cutting nitrogen during an overcast week.
        let bright = composition_at(0.5, 40.0);
        let dark = composition_at(0.5, 6.0);
        assert!(dark.lipid < bright.lipid, "lipid accumulation needs light");
    }

    #[test]
    fn lipid_rich_biomass_holds_more_carbon_per_kg() {
        let replete = composition_at(40.0, 35.0);
        let starved = composition_at(0.5, 35.0);
        assert!(starved.carbon_fraction() > replete.carbon_fraction());
        // Sanity: both must stay in the plausible 40-60% band for algae.
        for c in [replete, starved] {
            assert!((0.40..=0.60).contains(&c.carbon_fraction()), "{:?}", c);
        }
    }

    #[test]
    fn grades_follow_composition() {
        assert_eq!(grade_for(&composition_at(40.0, 35.0)), Grade::FoodGrade);
        assert_eq!(grade_for(&composition_at(0.5, 40.0)), Grade::LipidRich);
    }

    #[test]
    fn energy_content_is_in_the_published_range() {
        // Algal biomass runs roughly 15-25 MJ/kg depending on lipid.
        for n in [0.5, 12.0, 40.0] {
            let e = composition_at(n, 35.0).energy_mj_per_kg();
            assert!((14.0..=26.0).contains(&e), "n={n} energy={e}");
        }
    }
}
