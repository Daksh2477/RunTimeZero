/**
 * What a pond can sell right now, from what its sensors recorded.
 *
 * The operator should not have to know about windows, checks and batches. The
 * pond page asks "is there anything to sell?", this answers from the readings,
 * and one approval issues the credit and lists the harvest.
 *
 * Reading the eligibility runs the verification check on any fresh 24 h+ of
 * readings. That is a write behind a GET, on purpose: the check is a record of
 * what the sensors already said, and showing a sellable amount before it exists
 * would be quoting a number nobody has verified.
 */

import { pool } from '../db/client.ts';
import { runReconciliation } from './reconcile-service.ts';
import { createBatch, previewBatch } from './batch-service.ts';
import { sellerTrust } from './market-insights.ts';
import { listForSale, sellableHarvests } from './produce-service.ts';

const MIN_WINDOW_MS = 24 * 3_600_000;
const MAX_WINDOW_MS = 120 * 86_400_000;

async function pondContext(pondId: string) {
  const { rows } = await pool.query(
    `SELECT p.id, p.label, p.site_id,
            (SELECT MAX(window_end) FROM divergence_checks d WHERE d.pond_id = p.id) AS checked_to,
            (SELECT MIN(observed_at) FROM telemetry t WHERE t.pond_id = p.id) AS first_at,
            (SELECT MAX(observed_at) FROM telemetry t WHERE t.pond_id = p.id) AS last_at
       FROM ponds p WHERE p.id = $1`,
    [pondId],
  );
  return rows[0] ?? null;
}

/** Verify readings not yet covered by a check, if there is a day or more of them. */
async function checkFreshReadings(pondId: string): Promise<boolean> {
  const ctx = await pondContext(pondId);
  if (!ctx?.last_at) return false;
  const end = ctx.last_at.getTime();
  const start = Math.max((ctx.checked_to ?? ctx.first_at).getTime(), end - MAX_WINDOW_MS);
  if (end - start < MIN_WINDOW_MS) return false;
  await runReconciliation(pondId, new Date(start), new Date(end));
  return true;
}

async function unbatchedChecks(pondId: string) {
  const { rows } = await pool.query(
    `SELECT MIN(window_start) AS start, MAX(window_end) AS end, COUNT(*) AS n,
            COALESCE(SUM(creditable_co2_kg), 0) AS kg,
            COUNT(*) FILTER (WHERE verdict = 'flagged') AS flagged
       FROM divergence_checks d
      WHERE d.pond_id = $1
        AND NOT EXISTS (SELECT 1 FROM batches b WHERE d.id = ANY(b.divergence_check_ids))`,
    [pondId],
  );
  return rows[0];
}

export async function pondEligibility(pondId: string) {
  let ctx = await pondContext(pondId);
  if (!ctx) return null;
  const checkedNow = await checkFreshReadings(pondId);
  if (checkedNow) ctx = await pondContext(pondId);

  const checks = await unbatchedChecks(pondId);
  const trust = await sellerTrust(ctx.site_id);
  const creditableKg = Number(checks.kg);
  const priceT = trust?.suggestedInrPerTonne ?? 1500;
  const harvests = (await sellableHarvests(ctx.site_id))
    .filter((h) => h.pondLabel === ctx.label && (h.listedKg ?? h.soldKg) <= h.soldKg && h.dryMassKg - h.soldKg > 1)
    .map((h) => ({
      harvestId: h.harvestId,
      harvestedAt: h.harvestedAt,
      kg: Math.round((h.dryMassKg - h.soldKg) * 10) / 10,
      grade: h.gradeLabel,
      suggestedInrPerKg: Math.round(h.worthInr / h.dryMassKg),
      estInr: Math.round((h.dryMassKg - h.soldKg) * (h.worthInr / h.dryMassKg)),
    }));

  const blockers: string[] = [];
  if (!ctx.last_at) blockers.push('No readings from this pond yet. Start its device or the simulator.');
  if (creditableKg <= 0 && harvests.length === 0) blockers.push('Nothing verified to sell yet. Checks run once a day of readings has arrived.');

  return {
    pondId,
    label: ctx.label,
    siteId: ctx.site_id,
    readings: { firstAt: ctx.first_at?.toISOString() ?? null, lastAt: ctx.last_at?.toISOString() ?? null },
    checkedJustNow: checkedNow,
    credits: {
      checks: Number(checks.n),
      flaggedChecks: Number(checks.flagged),
      periodStart: checks.start?.toISOString() ?? null,
      periodEnd: checks.end?.toISOString() ?? null,
      creditableKg: Math.round(creditableKg * 10) / 10,
      suggestedInrPerTonne: priceT,
      estInr: Math.round((creditableKg / 1000) * priceT),
      disposition: 'biochar',
    },
    harvests,
    canApprove: blockers.length === 0,
    blockers,
  };
}

/** Issue the pond's verified credit and list its unsold harvests, in one approval. */
export async function approvePond(pondId: string, account: { sub: string; username: string; role: string }) {
  const e = await pondEligibility(pondId);
  if (!e) throw Object.assign(new Error('No such pond'), { status: 404 });
  if (account.role !== 'admin') {
    const { rows } = await pool.query('SELECT site_id FROM accounts WHERE id = $1', [account.sub]);
    if (rows[0]?.site_id !== e.siteId) {
      throw Object.assign(new Error('Only this pond\'s operator can list it'), { status: 403 });
    }
  }
  if (!e.canApprove) throw Object.assign(new Error(e.blockers.join(' ')), { status: 409 });

  let batch = null;
  let creditNote: string | null = null;
  if (e.credits.creditableKg > 0 && e.credits.periodStart && e.credits.periodEnd) {
    const args = {
      siteId: e.siteId,
      periodStart: e.credits.periodStart,
      periodEnd: e.credits.periodEnd,
      disposition: 'biochar' as const,
      // Declared by the operator at approval, and labelled as exactly that.
      dispositionEvidenceRef: `operator-declared:${account.username}:${new Date().toISOString().slice(0, 10)}`,
      askingInrPerTonne: e.credits.suggestedInrPerTonne,
    };
    const preview = await previewBatch(args);
    if (preview && preview.blockers.length === 0) batch = await createBatch(args);
    else creditNote = preview?.blockers.join(' ') ?? 'Could not preview the batch.';
  }

  const listed = [];
  for (const h of e.harvests) {
    listed.push(await listForSale(h.harvestId, h.kg, h.suggestedInrPerKg));
  }
  return { pondId, batch, creditNote, listedHarvests: listed };
}
