/**
 * Client-side wrappers for the market, research and investment endpoints.
 *
 * Separate from lib/api.ts because these are called from client components
 * that mutate (retire a credit, buy a licence, post a listing), where
 * lib/api.ts is server-side reads for the console.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export interface Listing {
  batchId: string; siteName: string; tier: string; hostIndustry: string;
  periodStart: string; periodEnd: string; disposition: string;
  dispositionEvidenceRef: string | null;
  issuedKg: number; retiredKg: number; availableKg: number;
  divergenceBps: number; reportHash: string | null;
  anchored: boolean; txHash: string | null;
}

export interface Summary {
  sites: number; ponds: number; areaM2: number; checks: number;
  claimedCo2Kg: number | null; creditedCo2Kg: number | null;
  refusedCo2Kg: number | null; refusedShare: number | null;
  flaggedChecks: number; batches: number; retiredCo2Kg: number;
  lastReadingAt: string | null; anchoredOnChain: boolean;
}

export interface Dataset {
  id: string; name: string; description: string; contents: string[];
  rows: number; sites: number; priceInr: number; caveat: string;
}

export interface Opportunity {
  id: string; siteId: string; siteName: string; tier: string;
  hostIndustry: string; headline: string; pitch: string;
  seekingInr: number; useOfFunds: string; expandToM2: number | null;
  currentAreaM2: number; status: string; createdAt: string;
  verified: {
    creditedCo2Kg: number; claimedCo2Kg: number;
    claimAccuracy: number | null; checkCount: number;
    harvestedKg: number; firstCheckAt: string | null;
  };
  contact: { name: string; email: string; phone: string | null };
}

export const getSummary = () => json<Summary>('/summary');
export const getMarket = () => json<Listing[]>('/market');
export const getCatalogue = () => json<Dataset[]>('/research/catalogue');
export const getOpportunities = () => json<Opportunity[]>('/invest');

export const retireCredits = (batchId: string, kg: number, beneficiary: string) =>
  json<{ id: string; kg: number; beneficiary: string; anchored: boolean; note: string }>(
    `/market/${batchId}/retire`,
    { method: 'POST', body: JSON.stringify({ kg, beneficiary }) },
  );

export const buyLicence = (body: {
  buyerName: string; buyerEmail: string; institution?: string;
  purpose: string; dataset: string; months: number;
}) => json<{ id: string; dataset: string; priceInr: number; expiresAt: string; apiKey: string }>(
  '/research/licence', { method: 'POST', body: JSON.stringify(body) },
);

export const enquire = (listingId: string, body: {
  investorName: string; investorEmail: string; organisation?: string; message: string;
}) => json<{ contact: { name: string; email: string; phone: string | null }; note: string }>(
  `/invest/${listingId}/enquire`, { method: 'POST', body: JSON.stringify(body) },
);
