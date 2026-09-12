/** Transaction-local verification history and evidence reads. */
import type { Database } from './client.ts';
import type { HarvestEvidence } from '../reconcile/estimate.ts';
import type { ReconciliationRecord } from '../services/reconcile-service.ts';

export async function getHarvestRecords(db: Database, pondId: string, start: string, end: string): Promise<HarvestEvidence[]> {
  const { rows } = await db.query(
    `SELECT id, harvested_at, dry_mass_kg, weighbridge_ref FROM harvest_records
     WHERE pond_id = $1 AND harvested_at >= $2 AND harvested_at < $3 ORDER BY harvested_at, id`,
    [pondId, start, end]);
  return rows.map((r) => ({ id: r.id, harvestedAt: r.harvested_at.toISOString(),
    dryMassKg: Number(r.dry_mass_kg), ref: r.weighbridge_ref }));
}

export async function existingCheck(db: Database, pondId: string, start: string, end: string): Promise<ReconciliationRecord | null> {
  const { rows } = await db.query(
    `SELECT id, pond_id, window_start, window_end, verdict, creditable_co2_kg,
       claimed_co2_kg, independent_co2_kg, independent_low_co2_kg, independent_high_co2_kg,
       ceiling_co2_kg, divergence, consecutive_same_direction, reason
     FROM divergence_checks WHERE pond_id = $1 AND window_start = $2 AND window_end = $3
     ORDER BY computed_at DESC, id DESC LIMIT 1`, [pondId, start, end]);
  const r = rows[0];
  if (!r) return null;
  return { checkId: r.id, pondId: r.pond_id, windowStart: r.window_start.toISOString(),
    windowEnd: r.window_end.toISOString(), verdict: r.verdict,
    creditableCo2Kg: Number(r.creditable_co2_kg), claimedCo2Kg: Number(r.claimed_co2_kg),
    independentCo2Kg: Number(r.independent_co2_kg), independentLowCo2Kg: Number(r.independent_low_co2_kg),
    independentHighCo2Kg: Number(r.independent_high_co2_kg), ceilingCo2Kg: Number(r.ceiling_co2_kg),
    divergence: Number(r.divergence), consecutiveSameDirection: r.consecutive_same_direction, reason: r.reason };
}

export async function hasOverlappingCheck(db: Database, pondId: string, start: string, end: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM divergence_checks WHERE pond_id = $1 AND window_start < $3 AND window_end > $2 LIMIT 1`,
    [pondId, start, end]);
  return rows.length > 0;
}

/** Count only adjacent, non-overlapping previous windows outside the upper band. */
export async function priorContradictedRun(db: Database, pondId: string, start: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (window_start, window_end) window_start, window_end,
       claimed_co2_kg, independent_high_co2_kg, verdict
     FROM divergence_checks WHERE pond_id = $1 AND window_end <= $2
     ORDER BY window_start DESC, window_end DESC, computed_at DESC, id DESC LIMIT 12`, [pondId, start]);
  let boundary = Date.parse(start), count = 0;
  for (const r of rows) {
    if (r.window_end.getTime() !== boundary || r.verdict === 'insufficient_evidence' ||
        Number(r.claimed_co2_kg) <= Number(r.independent_high_co2_kg)) break;
    count++;
    boundary = r.window_start.getTime();
  }
  return count;
}
