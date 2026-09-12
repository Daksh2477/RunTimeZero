/**
 * What a harvest is worth, and what it might be worth next quarter.
 *
 * WHERE THESE NUMBERS COME FROM
 *
 * Indian wholesale ranges, 2025-26. Spirulina powder from Indian producers
 * sits around ₹450-900/kg food grade depending on certification; aquafeed
 * grade ₹180-320/kg; crude algal oil tracks vegetable oil at roughly
 * ₹90-140/kg; and low-grade biomass sold as soil input is ₹8-18/kg.
 *
 * These are wholesale at the farm gate, not retail. Retail spirulina sells
 * for several times this and quoting retail would flatter the model badly,
 * which is the single easiest way to make a project like this look viable
 * when it is not.
 *
 * WHY THE FORECAST IS DELIBERATELY CRUDE
 *
 * We have no price feed. What we have is a seasonal pattern that Indian
 * producers consistently report — demand and price firm through the dry
 * months and soften in monsoon when quality drops and supply is erratic —
 * plus a long-run drift. Presenting that as a "prediction" with a tight
 * number would be dishonest, so every forecast here carries a band and the
 * band widens with distance. See `forecast()`.
 */

export type Grade = 'food' | 'lipid' | 'feed' | 'fertiliser';

export interface GradePrice {
  grade: Grade;
  label: string;
  /** Farm-gate wholesale, ₹/kg. */
  low: number;
  mid: number;
  high: number;
  buyer: string;
  requirement: string;
}

export const PRICES: Record<Grade, GradePrice> = {
  food: {
    grade: 'food',
    label: 'Food-grade spirulina',
    low: 450, mid: 650, high: 900,
    buyer: 'Nutraceutical packers, health-food brands',
    requirement: 'Protein ≥ 55%, FSSAI licence, heavy-metal testing per batch',
  },
  lipid: {
    grade: 'lipid',
    label: 'Oil-rich biomass',
    low: 90, mid: 115, high: 140,
    buyer: 'Biodiesel processors, oleochemical plants',
    requirement: 'Lipid ≥ 25%. Paid on extractable oil, not on mass',
  },
  feed: {
    grade: 'feed',
    label: 'Aquafeed / poultry feed',
    low: 180, mid: 240, high: 320,
    buyer: 'Shrimp hatcheries, feed mills',
    requirement: 'Protein ≥ 40%, consistent supply matters more than peak quality',
  },
  fertiliser: {
    grade: 'fertiliser',
    label: 'Soil input',
    low: 8, mid: 12, high: 18,
    buyer: 'Local farms, compost blenders',
    requirement: 'None. This is the floor price for anything you can dry',
  },
};

export interface Composition {
  protein: number;
  lipid: number;
  carbohydrate: number;
}

/** Highest-value grade this biomass actually qualifies for. */
export function gradeFor(c: Composition): Grade {
  if (c.protein >= 0.55) return 'food';
  if (c.lipid >= 0.25) return 'lipid';
  if (c.protein >= 0.40) return 'feed';
  return 'fertiliser';
}

export interface Valuation {
  grade: GradePrice;
  /** What the whole harvest fetches at the mid price, ₹. */
  midInr: number;
  lowInr: number;
  highInr: number;
  /** What the same mass would fetch as fertiliser — the cost of missing spec. */
  floorInr: number;
  /** How much the operator gains by hitting this grade instead of the floor. */
  upliftInr: number;
}

export function value(dryKg: number, c: Composition): Valuation {
  const g = PRICES[gradeFor(c)];
  const floorInr = dryKg * PRICES.fertiliser.mid;
  const midInr = dryKg * g.mid;
  return {
    grade: g,
    midInr,
    lowInr: dryKg * g.low,
    highInr: dryKg * g.high,
    floorInr,
    upliftInr: Math.max(0, midInr - floorInr),
  };
}

/**
 * Seasonal multiplier on price, by month index (0 = January).
 *
 * Dry-season product is cleaner and buyers pay for it; monsoon biomass is
 * harder to dry, more often contaminated, and discounted. Amplitude here is
 * about ±12%, which matches what producers describe rather than anything we
 * have measured ourselves.
 */
const SEASONAL = [1.08, 1.10, 1.09, 1.05, 1.00, 0.92, 0.88, 0.89, 0.94, 1.02, 1.07, 1.09];

export interface ForecastPoint {
  month: string;
  /** Central estimate, ₹/kg. */
  mid: number;
  low: number;
  high: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Twelve months of indicative price.
 *
 * The band is the honest part. It starts at the published spread for the
 * grade and widens ~1.5% per month out, because nothing here is a market
 * feed and a narrow band twelve months out would be a lie. Anyone using
 * this to plan should read the band, not the line.
 */
export function forecast(grade: Grade, fromMonth = new Date().getMonth()): ForecastPoint[] {
  const g = PRICES[grade];
  const spread = (g.high - g.low) / 2 / g.mid;

  return Array.from({ length: 12 }, (_, i) => {
    const m = (fromMonth + i) % 12;
    // Modest real drift: algae demand in India is growing, but a hockey
    // stick here would be wishful thinking dressed as analysis.
    const drift = 1 + (i / 12) * 0.04;
    const mid = g.mid * SEASONAL[m]! * drift;
    const widen = spread * (1 + i * 0.015);
    return {
      month: MONTHS[m]!,
      mid: Math.round(mid),
      low: Math.round(mid * (1 - widen)),
      high: Math.round(mid * (1 + widen)),
    };
  });
}

/** The month a seller would do best to hold for, within the next year. */
export function bestMonth(grade: Grade, fromMonth = new Date().getMonth()): ForecastPoint {
  return forecast(grade, fromMonth).reduce((a, b) => (b.mid > a.mid ? b : a));
}
