/** Serialize each pond's checks; preserve the exact evidence used in the result. */
import { pool, getPond, insertDivergenceCheck } from '../db/client.ts';
import { existingCheck, hasOverlappingCheck, priorContradictedRun } from '../db/check-store.ts';
import { reconcile, type ReconcileResult } from '../reconcile/engine.ts';
import { RequestError, validatePondId, validateWindow } from '../reconcile/validation.ts';
import { physics_ceiling_co2_kg } from '../../../../packages/physics/pkg/rtz_physics.js';

export interface ReconciliationRecord extends ReconcileResult {
  checkId: string;
  pondId: string;
  windowStart: string;
  windowEnd: string;
}

export async function runReconciliation(pondId: string, windowStart: Date, windowEnd: Date): Promise<ReconciliationRecord | null> {
  validatePondId(pondId);
  validateWindow(windowStart, windowEnd);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Lock the pond row before checking history. Concurrent retries wait here,
    // then observe the first transaction's committed result at READ COMMITTED.
    const locked = await db.query('SELECT id FROM ponds WHERE id = $1 FOR UPDATE', [pondId]);
    if (!locked.rows.length) { await db.query('ROLLBACK'); return null; }
    const start = windowStart.toISOString(), end = windowEnd.toISOString();
    const previous = await existingCheck(db, pondId, start, end);
    if (previous) { await db.query('COMMIT'); return previous; }
    if (await hasOverlappingCheck(db, pondId, start, end)) {
      throw new RequestError('This period overlaps a recorded verification. Use its reference or a new non-overlapping period.', 409);
    }
    const pond = (await getPond(pondId, db))!;
    // All evidence reads share one SQL snapshot, even while ingestion continues.
    const { rows: snapshots } = await db.query(
      `SELECT
        (SELECT COALESCE(jsonb_agg(t ORDER BY t.observed_at, t.id), '[]'::jsonb)
          FROM (SELECT id, source, observed_at, co2_uptake_kg, temperature_c FROM telemetry
            WHERE pond_id = $1 AND observed_at >= $2 AND observed_at < $3) t) AS telemetry,
        (SELECT COALESCE(jsonb_agg(o ORDER BY o.observed_at, o.id), '[]'::jsonb)
          FROM (SELECT id, observed_at, channel, chlorophyll_index, measured_dry_mass_kg, source_ref, cloud_fraction
            FROM imagery_observations WHERE pond_id = $1 AND observed_at >= $2 AND observed_at < $3) o) AS observations,
        (SELECT COALESCE(jsonb_agg(h ORDER BY h.harvested_at, h.id), '[]'::jsonb)
          FROM (SELECT id, harvested_at, dry_mass_kg, weighbridge_ref FROM harvest_records
            WHERE pond_id = $1 AND harvested_at >= $2 AND harvested_at < $3) h) AS harvests`, [pondId, start, end]);
    const raw = snapshots[0]!;
    const telemetry = raw.telemetry as { id: string; source: string; observed_at: string; co2_uptake_kg: number | null; temperature_c: number | null }[];
    const observations = (raw.observations as Record<string, any>[]).map((o) => ({ id: o.id,
      observedAt: o.observed_at, channel: o.channel, chlorophyllIndex: o.chlorophyll_index,
      measuredDryMassKg: o.measured_dry_mass_kg, sourceRef: o.source_ref, cloudFraction: o.cloud_fraction }));
    const harvests = (raw.harvests as Record<string, any>[]).map((h) => ({ id: h.id,
      harvestedAt: h.harvested_at, dryMassKg: h.dry_mass_kg, ref: h.weighbridge_ref }));
    const claimedCo2Kg = telemetry.reduce((sum, t) => sum + (t.co2_uptake_kg ?? 0), 0);
    const temps = telemetry.flatMap((t) => t.temperature_c === null ? [] : [t.temperature_c]);
    const measuredTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    // Use optimum temperature for a generous bound. An operator's thermometer
    // must not be able to lower the ceiling and falsely reject an honest claim.
    const ceilingTemperatureC = 35;
    const startMidnight = Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate());
    const day = Math.floor((startMidnight - Date.UTC(windowStart.getUTCFullYear(), 0, 0)) / 86_400_000);
    const days = Math.ceil((windowEnd.getTime() - startMidnight) / 86_400_000);
    const ceilingCo2Kg = physics_ceiling_co2_kg(pond.latDeg, pond.areaM2, pond.depthM, day, days, ceilingTemperatureC);
    const result = reconcile({ pond, windowStart, windowEnd, claimedCo2Kg, observations,
      meanTempC: measuredTemp, priorRun: await priorContradictedRun(db, pondId, start),
      ceilingCo2Kg, harvestedDryKg: 0, harvestRecords: harvests });
    const evidenceSnapshot = { version: 1, method: 'conservative-inventory-v1', pond,
      window: { start, end }, telemetry, observations, harvests, measuredTemperatureC: measuredTemp,
      ceilingInputs: { dayOfYear: day, days, temperatureC: ceilingTemperatureC },
      provenance: 'Source references are recorded assertions; external authenticity has not been certified.' };
    const checkId = await insertDivergenceCheck({ pondId, windowStart: start, windowEnd: end, ...result, evidenceSnapshot }, db);
    await db.query('COMMIT');
    return { ...result, checkId, pondId, windowStart: start, windowEnd: end };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally { db.release(); }
}
