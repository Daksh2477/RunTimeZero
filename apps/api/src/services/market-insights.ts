/**
 * What a buyer or investor needs before trusting a seller: what things have
 * actually sold for, where that price is heading, and how much of this
 * seller's past claims survived checking.
 *
 * Every figure is derived from rows on this platform — trades, divergence
 * checks, orders. None of it is typed in by the seller, which is the point.
 */

import { pool } from '../db/client.ts';
import { DEFAULT_CREDIT_INR_PER_TONNE, listingsForSite } from './market-service.ts';
import { listOpportunities, type ListingSummary } from './investor-board.ts';

export interface PricePoint { day: string; volume: number; avgPrice: number }

export interface PriceHistory {
  kind: 'credit' | 'produce';
  unit: 'INR/tonne CO2' | 'INR/kg';
  points: PricePoint[];
  projection: {
    method: string;
    caveat: string;
    points: { day: string; price: number; low: number; high: number }[];
  } | null;
  projectionUnavailableReason: string | null;
}

const DAY_MS = 86_400_000;
const PROJECT_DAYS = [7, 14, 30, 60, 90];

export async function priceHistory(
  kind: 'credit' | 'produce',
  filter: { batchId?: string; harvestId?: string; siteId?: string },
): Promise<PriceHistory> {
  const params: string[] = [];
  const where: string[] = [];
  let sql: string;
  if (kind === 'credit') {
    where.push('r.inr_per_tonne IS NOT NULL');
    if (filter.batchId) { params.push(filter.batchId); where.push(`r.batch_id = $${params.length}`); }
    if (filter.siteId) { params.push(filter.siteId); where.push(`b.site_id = $${params.length}`); }
    sql = `SELECT date_trunc('day', r.retired_at) AS day, SUM(r.kg) / 1000 AS volume,
                  SUM(r.kg * r.inr_per_tonne) / SUM(r.kg) AS avg_price
             FROM retirements r JOIN batches b ON b.id = r.batch_id
            WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 1`;
  } else {
    where.push('true');
    if (filter.harvestId) { params.push(filter.harvestId); where.push(`o.harvest_id = $${params.length}`); }
    if (filter.siteId) { params.push(filter.siteId); where.push(`p.site_id = $${params.length}`); }
    sql = `SELECT date_trunc('day', o.placed_at) AS day, SUM(o.kg) AS volume,
                  SUM(o.kg * o.inr_per_kg) / SUM(o.kg) AS avg_price
             FROM produce_orders o
             JOIN harvest_records h ON h.id = o.harvest_id
             JOIN ponds p ON p.id = h.pond_id
            WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 1`;
  }
  const { rows } = await pool.query<{ day: Date; volume: string; avg_price: string }>(sql, params);
  const points = rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    volume: Number(r.volume),
    avgPrice: Math.round(Number(r.avg_price)),
  }));
  return {
    kind,
    unit: kind === 'credit' ? 'INR/tonne CO2' : 'INR/kg',
    points,
    ...project(points),
  };
}

/**
 * Volume-weighted least squares on price over time, with a band that widens
 * with distance. Deliberately simple: with a few dozen trades anything fancier
 * would be fitting noise and presenting it as insight.
 */
function project(points: PricePoint[]): Pick<PriceHistory, 'projection' | 'projectionUnavailableReason'> {
  if (points.length < 3) {
    return { projection: null, projectionUnavailableReason: 'Needs at least 3 trading days.' };
  }
  const t0 = Date.parse(points[0]!.day);
  const xs = points.map((p) => (Date.parse(p.day) - t0) / DAY_MS);
  const ws = points.map((p) => Math.max(p.volume, 1e-6));
  const W = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((s, x, i) => s + x * ws[i]!, 0) / W;
  const my = points.reduce((s, p, i) => s + p.avgPrice * ws[i]!, 0) / W;
  let sxx = 0; let sxy = 0;
  xs.forEach((x, i) => {
    sxx += ws[i]! * (x - mx) ** 2;
    sxy += ws[i]! * (x - mx) * (points[i]!.avgPrice - my);
  });
  const slope = sxx > 0 ? sxy / sxx : 0;
  const resid = Math.sqrt(
    points.reduce((s, p, i) => s + ws[i]! * (p.avgPrice - (my + slope * (xs[i]! - mx))) ** 2, 0) / W,
  );
  const lastX = xs[xs.length - 1]!;
  const span = Math.max(lastX, 1);
  return {
    projectionUnavailableReason: null,
    projection: {
      method: 'Volume-weighted linear trend of this platform\'s own trades',
      caveat: 'A projection of past trades on this platform, not a market forecast.',
      points: PROJECT_DAYS.map((d) => {
        const x = lastX + d;
        const price = Math.max(0, my + slope * (x - mx));
        const band = resid * (1 + d / span) + price * 0.05;
        return {
          day: new Date(t0 + x * DAY_MS).toISOString().slice(0, 10),
          price: Math.round(price),
          low: Math.max(0, Math.round(price - band)),
          high: Math.round(price + band),
        };
      }),
    },
  };
}

export interface TrustComponent { key: string; label: string; weight: number; value: number | null; points: number; detail: string }

export interface SellerTrust {
  siteId: string;
  score: number | null;
  components: TrustComponent[];
  suggestedInrPerTonne: number;
  note: string;
}

const TIER_VALUE: Record<string, number> = { smallholder: 0.4, small: 0.6, mid: 0.8, facility: 1 };

export async function sellerTrust(siteId: string): Promise<SellerTrust | null> {
  const { rows: siteRows } = await pool.query<{ tier: string }>('SELECT tier FROM sites WHERE id = $1', [siteId]);
  if (!siteRows[0]) return null;

  const [checks, batches, produce, market] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(d.claimed_co2_kg), 0) AS claimed,
              COALESCE(SUM(d.creditable_co2_kg), 0) AS credited,
              COUNT(*) FILTER (WHERE d.verdict = 'flagged') AS flagged
         FROM divergence_checks d JOIN ponds p ON p.id = d.pond_id WHERE p.site_id = $1`, [siteId]),
    pool.query(
      `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE tx_hash IS NOT NULL) AS anchored
         FROM batches WHERE site_id = $1`, [siteId]),
    pool.query(
      `SELECT COALESCE(SUM(h.listed_kg), 0) AS listed, COALESCE(SUM(h.sold_kg), 0) AS sold,
              (SELECT COUNT(*) FROM produce_orders o JOIN harvest_records h2 ON h2.id = o.harvest_id
                 JOIN ponds p2 ON p2.id = h2.pond_id WHERE p2.site_id = $1) AS orders
         FROM harvest_records h JOIN ponds p ON p.id = h.pond_id
        WHERE p.site_id = $1 AND h.listed_kg IS NOT NULL`, [siteId]),
    priceHistory('credit', {}),
  ]);
  const c = checks.rows[0]; const b = batches.rows[0]; const pr = produce.rows[0];
  const nChecks = Number(c.n); const claimed = Number(c.claimed);
  const accepted = claimed > 0 ? Number(c.credited) / claimed : null;
  const flaggedShare = nChecks > 0 ? Number(c.flagged) / nChecks : null;
  const anchoredShare = Number(b.n) > 0 ? Number(b.anchored) / Number(b.n) : null;
  const sellThrough = Number(pr.listed) > 0 ? Number(pr.sold) / Number(pr.listed) : null;

  const part = (key: string, label: string, weight: number, value: number | null, detail: string): TrustComponent => ({
    key, label, weight, value: value === null ? null : Math.round(value * 100) / 100,
    points: value === null ? 0 : Math.round(weight * Math.min(1, Math.max(0, value))), detail,
  });
  const components = [
    part('accepted', 'Claims that survived checking', 35, accepted,
      accepted === null ? 'No checks yet.' : `${Math.round((1 - accepted) * 100)}% of claimed CO2 was refused over ${nChecks} checks.`),
    part('clean', 'Checks not flagged', 20, flaggedShare === null ? null : 1 - flaggedShare,
      flaggedShare === null ? 'No checks yet.' : `${c.flagged} of ${nChecks} checks flagged.`),
    part('tier', 'Evidence tier', 20, TIER_VALUE[siteRows[0].tier] ?? null, `Verified as ${siteRows[0].tier}.`),
    part('anchored', 'Batches anchored on chain', 10, anchoredShare,
      anchoredShare === null ? 'No batches issued.' : `${b.anchored} of ${b.n} batches anchored.`),
    part('delivery', 'Produce orders filled', 15, sellThrough,
      sellThrough === null ? 'No produce listed.' : `${Math.round(Number(pr.sold))} of ${Math.round(Number(pr.listed))} kg listed has sold across ${pr.orders} orders.`),
  ];
  const known = components.filter((x) => x.value !== null);
  const knownWeight = known.reduce((s, x) => s + x.weight, 0);
  // Tier alone is a label, not a track record; don't score on it.
  const score = known.length >= 2 ? Math.round((known.reduce((s, x) => s + x.points, 0) / knownWeight) * 100) : null;

  const recent = market.points.slice(-10);
  const vol = recent.reduce((s, p) => s + p.volume, 0);
  const base = vol > 0 ? recent.reduce((s, p) => s + p.avgPrice * p.volume, 0) / vol : DEFAULT_CREDIT_INR_PER_TONNE;
  return {
    siteId,
    score,
    components,
    suggestedInrPerTonne: Math.round((base * (0.8 + 0.4 * ((score ?? 50) / 100))) / 10) * 10,
    note: score === null
      ? 'Not enough history to score yet. Shown as unscored, not as zero.'
      : 'Scored only on components with data; missing ones are excluded, not counted as failures.',
  };
}

export async function matchesFor(account: { sub: string; role: string }, q: { maxInr?: number; tier?: string }) {
  if (account.role === 'operator') {
    const siteId = await siteOf(account.sub);
    if (!siteId) return { role: 'operator', siteId: null, enquiries: [], buyers: [] };
    const [enquiries, buyers] = await Promise.all([
      pool.query(
        `SELECT e.id, e.investor_name, e.organisation, e.message, e.created_at, l.id AS listing_id, l.headline
           FROM investor_enquiries e JOIN investment_listings l ON l.id = e.listing_id
          WHERE l.site_id = $1 ORDER BY e.created_at DESC`, [siteId]),
      pool.query(
        `SELECT r.beneficiary, SUM(r.kg) AS kg, MAX(r.retired_at) AS last_at
           FROM retirements r JOIN batches b ON b.id = r.batch_id
          WHERE b.site_id = $1 GROUP BY r.beneficiary ORDER BY kg DESC`, [siteId]),
    ]);
    return {
      role: 'operator',
      siteId,
      enquiries: enquiries.rows.map((e) => ({
        id: e.id, investorName: e.investor_name, organisation: e.organisation, message: e.message,
        at: e.created_at.toISOString(), listingId: e.listing_id, headline: e.headline,
      })),
      buyers: buyers.rows.map((r) => ({ beneficiary: r.beneficiary, kg: Number(r.kg), lastAt: r.last_at.toISOString() })),
    };
  }

  const open = (await listOpportunities()).filter((l: ListingSummary) =>
    (q.maxInr === undefined || l.seekingInr <= q.maxInr) && (!q.tier || l.tier === q.tier));
  const ranked = await Promise.all(open.map(async (listing) => {
    const trust = await sellerTrust(listing.siteId);
    const reasons: string[] = [];
    if (trust?.score !== null && trust?.score !== undefined) reasons.push(`Trust ${trust.score}/100`);
    if (listing.verified.claimAccuracy !== null) reasons.push(`${Math.round(listing.verified.claimAccuracy * 100)}% of claims verified`);
    if (q.maxInr !== undefined) reasons.push(`Asks ₹${Math.round(listing.seekingInr).toLocaleString('en-IN')}, within budget`);
    const fit = (trust?.score ?? 40) * 0.6 + (listing.verified.claimAccuracy ?? 0.4) * 40;
    return { listing, trustScore: trust?.score ?? null, fit: Math.round(fit), reasons };
  }));
  ranked.sort((a, b) => b.fit - a.fit);
  return { role: account.role, matches: ranked };
}

async function siteOf(accountId: string): Promise<string | null> {
  const { rows } = await pool.query<{ site_id: string | null }>('SELECT site_id FROM accounts WHERE id = $1', [accountId]);
  return rows[0]?.site_id ?? null;
}

export async function mine(account: { sub: string; role: string }) {
  const siteId = await siteOf(account.sub);
  const [listings, retirements, orders, sales] = await Promise.all([
    siteId ? listingsForSite(siteId) : Promise.resolve([]),
    pool.query(
      `SELECT r.id, r.batch_id, r.kg, r.beneficiary, r.retired_at, r.inr_per_tonne, s.name AS site_name
         FROM retirements r JOIN batches b ON b.id = r.batch_id JOIN sites s ON s.id = b.site_id
        WHERE r.account_id = $1 ORDER BY r.retired_at DESC`, [account.sub]),
    pool.query(
      `SELECT o.id, o.harvest_id, o.kg, o.inr_per_kg, o.placed_at, s.name AS site_name
         FROM produce_orders o JOIN harvest_records h ON h.id = o.harvest_id
         JOIN ponds p ON p.id = h.pond_id JOIN sites s ON s.id = p.site_id
        WHERE o.account_id = $1 ORDER BY o.placed_at DESC`, [account.sub]),
    siteId
      ? pool.query(
        `SELECT o.id, o.harvest_id, o.kg, o.inr_per_kg, o.placed_at, o.buyer_name
           FROM produce_orders o JOIN harvest_records h ON h.id = o.harvest_id
           JOIN ponds p ON p.id = h.pond_id
          WHERE p.site_id = $1 ORDER BY o.placed_at DESC`, [siteId])
      : Promise.resolve({ rows: [] }),
  ]);
  const order = (o: Record<string, any>) => ({
    id: o.id, harvestId: o.harvest_id, kg: Number(o.kg), inrPerKg: Number(o.inr_per_kg),
    totalInr: Math.round(Number(o.kg) * Number(o.inr_per_kg)), placedAt: o.placed_at.toISOString(),
    ...(o.site_name ? { siteName: o.site_name } : { buyerName: o.buyer_name }),
  });
  return {
    siteId,
    listings,
    retirements: retirements.rows.map((r) => ({
      id: r.id, batchId: r.batch_id, siteName: r.site_name, kg: Number(r.kg), beneficiary: r.beneficiary,
      retiredAt: r.retired_at.toISOString(),
      inrPerTonne: r.inr_per_tonne === null ? null : Number(r.inr_per_tonne),
      totalInr: r.inr_per_tonne === null ? null : Math.round((Number(r.kg) / 1000) * Number(r.inr_per_tonne)),
    })),
    produceOrders: orders.rows.map(order),
    produceSales: sales.rows.map(order),
  };
}
