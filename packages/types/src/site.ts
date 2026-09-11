/**
 * Sites, ponds, and the tier that decides how a site is verified.
 *
 * The tier is not cosmetic. It selects which independent channel we trust for
 * this site, which in turn sets how wide the divergence band is before we
 * refuse to mint. See docs/ARCHITECTURE.md, "Verification tiers".
 */

/** How a site's independent estimate is obtained. Drives band width, not eligibility. */
export type VerificationTier =
  | 'smallholder' // < 0.5 ha — weighbridge slip + geotagged harvest photos
  | 'small' //       0.5–2 ha — drone or pole-mounted imagery, weekly
  | 'mid' //         2–10 ha  — drone + partial Sentinel-2
  | 'facility'; //   10 ha+   — Sentinel-2, ponds are several clean pixels across

/** Industry supplying the effluent. Determines nutrient profile and contamination risk. */
export type HostIndustry =
  | 'textile_dyeing'
  | 'pulp_paper'
  | 'distillery'
  | 'dairy_food'
  | 'cetp'
  | 'municipal_stp'
  | 'none';

/** What happened to harvested biomass. Only durable outcomes are creditable as removal. */
export type Disposition =
  | 'buried'
  | 'biochar'
  | 'bioplastic'
  | 'sold_as_feed' //   not a removal — utilisation only
  | 'sold_as_fertiliser' // not a removal — utilisation only
  | 'undisclosed';

/** The three dispositions the contract will accept for a removal credit. */
export const DURABLE_DISPOSITIONS: readonly Disposition[] = [
  'buried',
  'biochar',
  'bioplastic',
] as const;

export function isDurable(d: Disposition): boolean {
  return DURABLE_DISPOSITIONS.includes(d);
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Site {
  id: string;
  name: string;
  location: GeoPoint;
  /** IANA zone, e.g. "Asia/Kolkata". Needed for diurnal light, not just display. */
  timezone: string;
  tier: VerificationTier;
  hostIndustry: HostIndustry;
  /** Sum of pond areas in m². Denormalised for fast fleet queries. */
  totalAreaM2: number;
  createdAt: string;
}

export interface Pond {
  id: string;
  siteId: string;
  label: string;
  /** Surface area in m². The single most important number for the ceiling. */
  areaM2: number;
  /** Operating depth in metres. Typical HRAP is 0.25–0.4. */
  depthM: number;
  /** Long axis in metres — decides whether Sentinel-2 can resolve this pond at all. */
  lengthM: number;
  /** Short axis in metres. Below ~40 m, satellite is not a usable channel. */
  widthM: number;
  strain: string;
  active: boolean;
}

/**
 * Whether a pond is wide enough for Sentinel-2 to give clean pixels.
 *
 * NDCI needs band B5 at 20 m. A pond narrower than two clean pixels is
 * contaminated by adjacency from the surrounding land on every sample, so we
 * fall back to drone or weighbridge evidence instead of pretending otherwise.
 */
export const MIN_SATELLITE_WIDTH_M = 40;

export function satelliteResolvable(pond: Pond): boolean {
  return pond.widthM >= MIN_SATELLITE_WIDTH_M;
}

/** Site-level rollup for the fleet board. Computed, never stored. */
export interface FleetRow {
  site: Site;
  pondCount: number;
  /** Most recent divergence verdict across the site's ponds. */
  worstVerdict: 'ok' | 'watch' | 'flagged' | 'unknown';
  /** Yield against forecast over the trailing 7 days, as a ratio. 1.0 is on target. */
  yieldRatio7d: number | null;
  daysToHarvest: number | null;
  openAlerts: number;
}
