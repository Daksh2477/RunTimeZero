/**
 * Public verification endpoint — no account, no key, no login.
 *
 * A buyer holding a credit should be able to check it without asking us for
 * access. Provenance only anybody-but-the-public can read is not provenance.
 */

import { Router } from 'express';
import { pool } from '../db/client.ts';
import { RequestError, validatePondId } from '../reconcile/validation.ts';

export const verifyRouter = Router();

/**
 * Everything behind one batch: the claim, the evidence that checked it, the
 * ceiling it sat under, and the sources a third party can re-fetch themselves.
 */
verifyRouter.get('/:checkId', async (req, res) => {
  try {
    validatePondId(req.params.checkId);
    const { rows } = await pool.query(
      `SELECT d.id, d.window_start, d.window_end, d.claimed_co2_kg,
              d.independent_co2_kg, d.independent_low_co2_kg,
              d.independent_high_co2_kg, d.ceiling_co2_kg, d.divergence,
              d.verdict, d.creditable_co2_kg, d.reason, d.computed_at, d.evidence_snapshot,
              p.label AS pond_label, p.area_m2, p.width_m,
              s.name AS site_name, s.tier, s.host_industry
         FROM divergence_checks d
         JOIN ponds p ON p.id = d.pond_id
         JOIN sites s ON s.id = p.site_id
        WHERE d.id = $1`,
      [req.params.checkId],
    );
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'not found' });

    const snapshot = r.evidence_snapshot;
    const sources = snapshot?.observations ?? [];
    const harvests = snapshot?.harvests ?? [];

    return res.json({
      checkId: r.id,
      site: { name: r.site_name, tier: r.tier, hostIndustry: r.host_industry },
      pond: snapshot?.pond ?? { label: r.pond_label, areaM2: Number(r.area_m2), widthM: Number(r.width_m) },
      window: { start: r.window_start.toISOString(), end: r.window_end.toISOString() },
      claimedCo2Kg: Number(r.claimed_co2_kg),
      independentCo2Kg: Number(r.independent_co2_kg),
      independentLowCo2Kg: Number(r.independent_low_co2_kg),
      independentHighCo2Kg: Number(r.independent_high_co2_kg),
      ceilingCo2Kg: Number(r.ceiling_co2_kg),
      creditableCo2Kg: Number(r.creditable_co2_kg),
      divergence: Number(r.divergence),
      verdict: r.verdict,
      reason: r.reason,
      computedAt: r.computed_at.toISOString(),
      evidenceStatus: snapshot ? 'recorded_snapshot' : 'legacy_no_snapshot',
      method: snapshot?.method ?? 'legacy',
      inputs: snapshot ?? null,
      provenance: snapshot?.provenance ?? 'Legacy check has no immutable evidence snapshot.',
      sources: sources.map((s: { observedAt: string; channel: string; sourceRef: string; cloudFraction: number | null }) => ({
        observedAt: s.observedAt, channel: s.channel, ref: s.sourceRef, cloudFraction: s.cloudFraction,
      })),
      harvests,
    });
  } catch (err) {
    return res.status(err instanceof RequestError ? err.status : 500).json({ error: err instanceof RequestError ? err.message : 'Could not read verification.' });
  }
});

/** Recent checks, so someone landing on /verify has something to open. */
verifyRouter.get('/', async (_req, res) => {
  try {
  const { rows } = await pool.query(
    `SELECT d.id, d.verdict, d.claimed_co2_kg, d.creditable_co2_kg, d.computed_at,
            p.label AS pond_label, s.name AS site_name
       FROM divergence_checks d
       JOIN ponds p ON p.id = d.pond_id
       JOIN sites s ON s.id = p.site_id
      ORDER BY d.computed_at DESC LIMIT 20`,
  );
  res.json(
    rows.map((r) => ({
      checkId: r.id,
      verdict: r.verdict,
      pondLabel: r.pond_label,
      siteName: r.site_name,
      claimedCo2Kg: Number(r.claimed_co2_kg),
      creditableCo2Kg: Number(r.creditable_co2_kg),
      computedAt: r.computed_at.toISOString(),
    })),
  );
  } catch {
    res.status(500).json({ error: 'Could not read recent verifications.' });
  }
});
