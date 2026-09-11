/**
 * Every API call goes through here so types stay honest and the base URL
 * lives in one place. Components never fetch directly.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface FleetPond {
  id: string;
  label: string;
  areaM2: number;
  widthM: number;
  satelliteResolvable: boolean;
  verdict: string | null;
  divergence: number | null;
  claimedCo2Kg: number | null;
  creditableCo2Kg: number | null;
  lastReadingAt: string | null;
  advisoryCount: number;
  worstSeverity: string | null;
}

export interface FleetSite {
  id: string;
  name: string;
  tier: string;
  hostIndustry: string;
  totalAreaM2: number;
  ponds: FleetPond[];
}

export interface Advisory {
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  hoursToAct: number | null;
  action: string;
  costOfActingInr: number | null;
  costOfInactionInr: number | null;
}

export interface PondDetail {
  pond: {
    id: string; label: string; siteName: string; tier: string;
    areaM2: number; depthM: number; widthM: number;
  };
  telemetry: {
    observedAt: string; ph: number | null; temperatureC: number | null;
    dissolvedOxygenMgL: number | null; opticalDensity: number | null;
    co2UptakeKg: number | null;
  }[];
  observations: {
    observedAt: string; channel: string;
    chlorophyllIndex: number | null; measuredDryMassKg: number | null;
    sourceRef: string;
  }[];
  harvests: { harvestedAt: string; dryMassKg: number; ref: string | null }[];
  advisories: Advisory[];
  latestCheck: Record<string, number | string> | null;
  ceilingCo2Kg: number;
}

/** `no-store` because the whole point is showing what the pond is doing now. */
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // The API not running is the most common local failure, and the page
    // handles it with instructions rather than a stack trace.
    return null;
  }
}

export const getFleet = () => get<FleetSite[]>('/fleet');
export const getPond = (id: string) => get<PondDetail>(`/fleet/pond/${id}`);
