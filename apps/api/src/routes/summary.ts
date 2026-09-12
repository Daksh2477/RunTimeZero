/**
 * One call for the landing page.
 *
 * Exists because the homepage was arguing a thesis with no numbers behind
 * it. The single figure that proves this product works is the gap between
 * what operators claimed and what survived checking — so that is the first
 * thing this returns, and it is queried, never written down.
 *
 * Every field is nullable-honest: a deployment with no verified windows
 * returns nulls and the page must say "nothing verified yet" rather than
 * rendering zeroes as though they were measurements.
 */

import { Router } from 'express';
import { pool } from '../db/client.ts';

export const summaryRouter = Router();

summaryRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM sites)  AS sites,
        (SELECT COUNT(*)::int FROM ponds WHERE active) AS ponds,
        (SELECT COALESCE(SUM(total_area_m2), 0) FROM sites) AS area_m2,
        (SELECT COUNT(*)::int FROM divergence_checks) AS checks,
        (SELECT SUM(claimed_co2_kg)     FROM divergence_checks) AS claimed,
        (SELECT SUM(creditable_co2_kg)  FROM divergence_checks) AS credited,
        (SELECT COUNT(*)::int FROM divergence_checks WHERE verdict = 'flagged') AS flagged,
        (SELECT MAX(observed_at) FROM telemetry) AS last_reading,
        (SELECT COUNT(*)::int FROM batches) AS batches,
        (SELECT COALESCE(SUM(kg), 0) FROM retirements) AS retired_kg`);

    const r = rows[0];
    const claimed = r.claimed === null ? null : Number(r.claimed);
    const credited = r.credited === null ? null : Number(r.credited);

    res.json({
      sites: r.sites,
      ponds: r.ponds,
      areaM2: Number(r.area_m2),
      checks: r.checks,
      claimedCo2Kg: claimed,
      creditedCo2Kg: credited,
      // The headline. Positive means claims exceeded what evidence supported.
      refusedCo2Kg: claimed !== null && credited !== null ? claimed - credited : null,
      refusedShare:
        claimed && credited !== null && claimed > 0
          ? (claimed - credited) / claimed
          : null,
      flaggedChecks: r.flagged,
      batches: r.batches,
      retiredCo2Kg: Number(r.retired_kg),
      lastReadingAt: r.last_reading ? r.last_reading.toISOString() : null,
      // No chain key is configured anywhere yet; the page must not imply one.
      anchoredOnChain: false,
    });
  } catch (err) {
    console.error('[summary]', err);
    res.status(500).json({ error: 'Could not build summary' });
  }
});
