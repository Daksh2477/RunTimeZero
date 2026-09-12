/**
 * What expanding actually costs.
 *
 * An operator asking "should I dig another pond" needs three numbers we can
 * genuinely derive: how much more algae, what equipment the bigger site now
 * requires, and how long before it pays back.
 *
 * The sensor requirements are not invented for this page — they come straight
 * from the verification tiers in docs/ARCHITECTURE.md. Crossing 2 ha moves you
 * from drone evidence to partial satellite, and crossing 10 ha to full
 * satellite, and each step needs different instrumentation. That is the honest
 * reason expansion costs step rather than scale smoothly.
 */

export type Tier = 'smallholder' | 'small' | 'mid' | 'facility';

export interface SensorItem {
  name: string;
  qty: number;
  unitInr: number;
  /** Why this is needed at this size — shown to the operator, not decoration. */
  because: string;
}

export interface SitePlan {
  areaM2: number;
  tier: Tier;
  tierLabel: string;
  /** Ponds needed. Above ~12,000 m² a single raceway stops being practical. */
  pondCount: number;
  sensors: SensorItem[];
  capexInr: number;
  /** Annual electricity, from area and the published 0.5 W/m² paddlewheel load. */
  annualEnergyKwh: number;
  annualOpexInr: number;
  verifiedBy: string;
  /** True once ponds are wide enough for Sentinel-2's 20 m bands. */
  satelliteEligible: boolean;
}

const TARIFF_INR_PER_KWH = 8;
const PADDLEWHEEL_W_PER_M2 = 0.5;
/** Beyond this a single raceway is impractical to mix evenly. */
const MAX_POND_M2 = 12_000;

export function tierForArea(areaM2: number): Tier {
  if (areaM2 < 5_000) return 'smallholder';
  if (areaM2 < 20_000) return 'small';
  if (areaM2 < 100_000) return 'mid';
  return 'facility';
}

const TIER_LABEL: Record<Tier, string> = {
  smallholder: 'Smallholder',
  small: 'Small farm',
  mid: 'Mid-size site',
  facility: 'Full facility',
};

const VERIFIED_BY: Record<Tier, string> = {
  smallholder: 'Weighbridge tickets and dated photos',
  small: 'Drone photos every week',
  mid: 'Drone, plus satellite on the wider ponds',
  facility: 'Satellite — ponds are large enough to see clearly',
};

/**
 * Build the equipment list for a site of this size.
 *
 * Per-pond items scale with pond count, not area: three ponds need three
 * probe sets regardless of how big each one is.
 */
export function planFor(areaM2: number): SitePlan {
  const tier = tierForArea(areaM2);
  const pondCount = Math.max(1, Math.ceil(areaM2 / MAX_POND_M2));
  const pondWidthM = Math.sqrt(areaM2 / pondCount / 7.5); // ~1:7.5 raceway
  const satelliteEligible = pondWidthM >= 40;

  const sensors: SensorItem[] = [];

  if (tier === 'smallholder') {
    sensors.push({
      name: 'Nothing to buy',
      qty: 0,
      unitInr: 0,
      because:
        'At this size your weighed harvests are the evidence. They are cruder than sensors but harder to dispute.',
    });
  } else {
    sensors.push(
      {
        name: 'pH and temperature probe',
        qty: pondCount,
        unitInr: 9_000,
        because: 'One per pond. pH falling alongside density is the crash warning.',
      },
      {
        name: 'Dissolved oxygen probe',
        qty: pondCount,
        unitInr: 12_000,
        because: 'Low oxygen in daylight almost always means the paddlewheel has stopped.',
      },
      {
        name: 'Optical density flow cell',
        qty: pondCount,
        unitInr: 8_000,
        because: 'Reading density through open water changes with the sun. A fixed cell does not.',
      },
      {
        name: 'Energy meter',
        qty: 1,
        unitInr: 4_500,
        because: 'Pays for itself twice: it tracks your bill, and it evidences the electricity you avoid.',
      },
    );
  }

  if (tier === 'mid' || tier === 'facility') {
    sensors.push(
      {
        name: 'Influent flow meter',
        qty: 1,
        unitInr: 18_000,
        because: 'At this size, nutrient supply is the thing most likely to stall growth without warning.',
      },
      {
        name: 'Sunlight (PAR) sensor',
        qty: 1,
        unitInr: 15_000,
        because: 'Lets us separate a bad week of weather from a real problem with the pond.',
      },
      {
        name: 'LoRa gateway',
        qty: 1,
        unitInr: 11_000,
        because: 'Wiring every pond back to one shed stops being practical past a couple of ponds.',
      },
    );
  }

  if (tier === 'facility') {
    sensors.push({
      name: 'CO₂ mass-flow meter',
      qty: 1,
      unitInr: 45_000,
      because: 'Only worth it if you are piping in a concentrated CO₂ stream.',
    });
  }

  const capexInr = sensors.reduce((s, i) => s + i.qty * i.unitInr, 0);
  const annualEnergyKwh = (PADDLEWHEEL_W_PER_M2 * areaM2 * 24 * 365) / 1000;
  // Labour scales sublinearly — one team covers several ponds.
  const labour = 400 * 365 * Math.max(1, Math.sqrt(areaM2 / 10_000));
  const maintenance = areaM2 * 2.4 + capexInr * 0.08;

  return {
    areaM2,
    tier,
    tierLabel: TIER_LABEL[tier],
    pondCount,
    sensors,
    capexInr,
    annualEnergyKwh,
    annualOpexInr: annualEnergyKwh * TARIFF_INR_PER_KWH + labour + maintenance,
    verifiedBy: VERIFIED_BY[tier],
    satelliteEligible,
  };
}

export interface ExpansionDelta {
  from: SitePlan;
  to: SitePlan;
  extraCapexInr: number;
  extraOpexInr: number;
  /** Extra dry biomass per year, from the simulated yield rate. */
  extraBiomassKgPerYear: number;
  extraRevenueInr: number;
  /** Years to recover the equipment spend. Null when it never does. */
  paybackYears: number | null;
  tierChanged: boolean;
}

const BIOMASS_INR_PER_KG = 12;

/**
 * Compare two site sizes, using a yield rate measured by the simulator rather
 * than a rule of thumb — so the projection and the model always agree.
 */
export function compareExpansion(
  currentAreaM2: number,
  targetAreaM2: number,
  yieldKgPerM2PerYear: number,
): ExpansionDelta {
  const from = planFor(currentAreaM2);
  const to = planFor(targetAreaM2);

  const extraCapexInr = Math.max(0, to.capexInr - from.capexInr);
  const extraOpexInr = to.annualOpexInr - from.annualOpexInr;
  const extraBiomassKgPerYear =
    Math.max(0, targetAreaM2 - currentAreaM2) * yieldKgPerM2PerYear;
  const extraRevenueInr = extraBiomassKgPerYear * BIOMASS_INR_PER_KG;

  const annualGain = extraRevenueInr - extraOpexInr;
  const paybackYears =
    annualGain > 0 && extraCapexInr > 0 ? extraCapexInr / annualGain : null;

  return {
    from,
    to,
    extraCapexInr,
    extraOpexInr,
    extraBiomassKgPerYear,
    extraRevenueInr,
    paybackYears,
    tierChanged: from.tier !== to.tier,
  };
}
