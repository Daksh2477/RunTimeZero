/**
 * Costs, revenue and profit from recorded activity only.
 *
 * Build cost is the simulated hardware bill; running cost accrues from each
 * pond's creation or first harvest at the stated RATES; revenue is what buyers actually
 * paid. Nothing here is projected.
 */
import { pool } from '../db/client.ts';
import { kitFor, nodeCircuit, nodesForPond } from './circuit.ts';
import { RATES } from './economics.ts';

const GATEWAY_INR = 11_000;
const DAY_MS = 86_400_000;

async function siteOf(accountId: string): Promise<string | null> {
  const { rows } = await pool.query<{ site_id: string | null }>('SELECT site_id FROM accounts WHERE id = $1', [accountId]);
  return rows[0]?.site_id ?? null;
}

export async function siteFinance(siteId: string, account: { sub: string; role: string }) {
  if (account.role !== 'admin' && await siteOf(account.sub) !== siteId) {
    throw Object.assign(new Error('Only this site\'s operator can see its finances'), { status: 403 });
  }
  const { rows: site } = await pool.query('SELECT id, name, tier FROM sites WHERE id = $1', [siteId]);
  if (!site[0]) throw Object.assign(new Error('No such site'), { status: 404 });

  const now = Date.now();
  const [ponds, harvests, credits, produce] = await Promise.all([
    pool.query(
      `SELECT id, label, area_m2, paddlewheel_kw, created_at, retired_at
         FROM ponds WHERE site_id = $1 ORDER BY label`, [siteId]),
    pool.query(
      `SELECT h.pond_id, COALESCE(SUM(h.dry_mass_kg), 0) AS kg, MIN(h.harvested_at) AS first_at
         FROM harvest_records h JOIN ponds p ON p.id = h.pond_id
        WHERE p.site_id = $1 GROUP BY h.pond_id`, [siteId]),
    pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(r.kg), 0) AS kg,
              COALESCE(SUM(r.kg / 1000 * r.inr_per_tonne), 0) AS inr,
              COUNT(*) FILTER (WHERE r.inr_per_tonne IS NULL) AS unpriced
         FROM retirements r JOIN batches b ON b.id = r.batch_id
        WHERE b.site_id = $1`, [siteId]),
    pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(o.kg), 0) AS kg, COALESCE(SUM(o.kg * o.inr_per_kg), 0) AS inr
         FROM produce_orders o JOIN harvest_records h ON h.id = o.harvest_id
         JOIN ponds p ON p.id = h.pond_id
        WHERE p.site_id = $1`, [siteId]),
  ]);
  const harvestedKg = new Map(harvests.rows.map((h) => [h.pond_id, Number(h.kg)]));
  // Seeded and imported ponds carry harvests older than their row, so a pond
  // has been running since whichever came first.
  const firstHarvest = new Map(harvests.rows.map((h) => [h.pond_id, h.first_at.getTime() as number]));

  const pondRows = ponds.rows.map((p) => {
    const areaM2 = Number(p.area_m2);
    const kit = kitFor(areaM2, site[0].tier);
    const { nodes } = nodesForPond(areaM2);
    const circuit = nodeCircuit(kit);
    const items = circuit.parts.map((part) => ({
      ref: part.ref, part: part.part, qty: part.qty * nodes, unitInr: part.unitInr,
      totalInr: part.qty * nodes * part.unitInr,
    }));
    const end = p.retired_at ? p.retired_at.getTime() : now;
    const start = Math.min(p.created_at.getTime(), firstHarvest.get(p.id) ?? Infinity);
    const days = Math.max(0, (end - start) / DAY_MS);
    const kw = p.paddlewheel_kw === null ? (RATES.paddlewheelWPerM2 * areaM2) / 1000 : Number(p.paddlewheel_kw);
    const energyInr = kw * 24 * days * RATES.tariffInrPerKwh;
    const labourInr = RATES.labourInrPerDay * days * Math.max(1, areaM2 / 20_000);
    const harvestInr = (harvestedKg.get(p.id) ?? 0) * RATES.harvestInrPerKg;
    return {
      pondId: p.id, label: p.label, kit, nodes,
      build: { items, totalInr: nodes * circuit.bomInr },
      running: {
        days: Math.round(days),
        energyInr: Math.round(energyInr), labourInr: Math.round(labourInr), harvestInr: Math.round(harvestInr),
        totalInr: Math.round(energyInr + labourInr + harvestInr),
      },
    };
  });

  // Industrial nodes talk LoRa, so they need somewhere to land.
  const gatewayInr = pondRows.some((p) => p.kit === 'industrial') ? GATEWAY_INR : 0;
  const buildInr = pondRows.reduce((s, p) => s + p.build.totalInr, 0) + gatewayInr;
  const runningInr = pondRows.reduce((s, p) => s + p.running.totalInr, 0);
  const c = credits.rows[0];
  const o = produce.rows[0];
  const creditInr = Math.round(Number(c.inr));
  const produceInr = Math.round(Number(o.inr));
  const revenueInr = creditInr + produceInr;
  const costInr = buildInr + runningInr;

  // Where this is heading: the last 30 days' sales and running costs carried
  // forward a year, plus what is already sitting unsold. A projection of the
  // farm's own recent record, not a forecast of prices.
  const [recent, stock] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT COALESCE(SUM(r.kg / 1000 * r.inr_per_tonne), 0) FROM retirements r
            JOIN batches b ON b.id = r.batch_id
           WHERE b.site_id = $1 AND r.retired_at > now() - interval '30 days') AS credit_inr,
         (SELECT COALESCE(SUM(o.kg * o.inr_per_kg), 0) FROM produce_orders o
            JOIN harvest_records h ON h.id = o.harvest_id JOIN ponds p ON p.id = h.pond_id
           WHERE p.site_id = $1 AND o.placed_at > now() - interval '30 days') AS produce_inr`, [siteId]),
    pool.query(
      `SELECT
         (SELECT COALESCE(SUM(GREATEST(0, b.creditable_co2_kg - COALESCE(
             (SELECT SUM(r.kg) FROM retirements r WHERE r.batch_id = b.id), 0)) / 1000
             * COALESCE(b.asking_inr_per_tonne, 1500)), 0)
            FROM batches b WHERE b.site_id = $1 AND b.listed) AS credit_inr,
         (SELECT COALESCE(SUM(GREATEST(0, h.listed_kg - h.sold_kg) * COALESCE(h.asking_inr_per_kg, 240)), 0)
            FROM harvest_records h JOIN ponds p ON p.id = h.pond_id
           WHERE p.site_id = $1 AND h.listed_kg IS NOT NULL) AS produce_inr`, [siteId]),
  ]);
  const activeDaily = pondRows
    .filter((p) => ponds.rows.find((r) => r.id === p.pondId)?.retired_at === null && p.running.days > 0)
    .reduce((s, p) => s + (p.running.energyInr + p.running.labourInr + p.running.harvestInr) / p.running.days, 0);
  const dailyRevenueInr = (Number(recent.rows[0].credit_inr) + Number(recent.rows[0].produce_inr)) / 30;
  const dailyNetInr = dailyRevenueInr - activeDaily;
  const inventoryInr = Math.round(Number(stock.rows[0].credit_inr) + Number(stock.rows[0].produce_inr));
  const currentProfit = revenueInr - costInr;
  const HORIZON_DAYS = 365;
  const projection = {
    horizonDays: HORIZON_DAYS,
    dailyRevenueInr: Math.round(dailyRevenueInr),
    dailyRunningCostInr: Math.round(activeDaily),
    dailyNetInr: Math.round(dailyNetInr),
    unsoldInventoryInr: inventoryInr,
    projectedRevenueInr: Math.round(revenueInr + inventoryInr + dailyRevenueInr * HORIZON_DAYS),
    projectedCostInr: Math.round(costInr + activeDaily * HORIZON_DAYS),
    projectedProfitInr: Math.round(currentProfit + inventoryInr + dailyNetInr * HORIZON_DAYS),
    breakEvenInDays: currentProfit + inventoryInr >= 0
      ? 0
      : dailyNetInr > 0 ? Math.ceil(-(currentProfit + inventoryInr) / dailyNetInr) : null,
    basis: 'Last 30 days of sales and current running costs carried forward one year, plus unsold listed credits and produce at their asking prices. Not a price forecast.',
  };

  return {
    site: site[0],
    asOf: new Date(now).toISOString(),
    costs: { buildInr, gatewayInr, runningInr, totalInr: costInr },
    revenue: {
      credits: { retirements: Number(c.n), kg: Number(c.kg), inr: creditInr, unpricedRetirements: Number(c.unpriced) },
      produce: { orders: Number(o.n), kg: Number(o.kg), inr: produceInr },
      totalInr: revenueInr,
    },
    profitInr: revenueInr - costInr,
    projection,
    ponds: pondRows,
    assumptions: RATES,
    note: 'Recorded sales against the simulated hardware bill and running costs accrued since each pond was added or first harvested, whichever came first. Retirements recorded without a price add nothing to revenue.',
  };
}

/** Operators get their site's P&L; everyone else gets what they have spent. */
export async function myFinance(account: { sub: string; role: string }) {
  const siteId = await siteOf(account.sub);
  if (siteId) return { role: account.role, siteId, site: await siteFinance(siteId, account), spend: null };

  const { rows } = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(kg / 1000 * inr_per_tonne), 0) FROM retirements WHERE account_id = $1) AS credits,
       (SELECT COALESCE(SUM(kg * inr_per_kg), 0) FROM produce_orders WHERE account_id = $1) AS produce`,
    [account.sub],
  );
  const creditsInr = Math.round(Number(rows[0].credits));
  const produceInr = Math.round(Number(rows[0].produce));
  return {
    role: account.role, siteId: null, site: null,
    spend: { creditsInr, produceInr, totalInr: creditsInr + produceInr },
  };
}
