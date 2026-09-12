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
              p.id AS pond_id, p.site_id, p.label AS pond_label, p.area_m2, p.width_m,
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
      site: { id: r.site_id, name: r.site_name, tier: r.tier, hostIndustry: r.host_industry },
      // Geometry comes from the snapshot when there is one — that is the evidence
      // and it must not drift if the pond is later resized. The ids come from the
      // live join regardless, so a report can link to its pond and to issuance
      // even for legacy checks that carry no snapshot.
      pond: {
        ...(snapshot?.pond ?? {
          label: r.pond_label, areaM2: Number(r.area_m2), widthM: Number(r.width_m),
        }),
        id: r.pond_id,
        siteId: r.site_id,
      },
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


/* ----------------------------------------------------- verifying a trade
 * The original /verify checked a single pond-fortnight. That is the raw
 * material, not the thing anyone actually holds — a buyer holds a BATCH, or
 * a retirement certificate, and wants the chain from that back to the water.
 *
 * These two endpoints walk it: certificate -> batch -> report hash -> the
 * checks that fed it -> the evidence behind each. No account required,
 * because provenance only the seller can read is not provenance.
 */

/** Everything behind an issued batch. */
verifyRouter.get('/batch/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.period_start, b.period_end, b.claimed_co2_kg,
              b.independent_co2_kg, b.ceiling_co2_kg, b.creditable_co2_kg,
              b.disposition, b.disposition_evidence_ref, b.mrv_report_cid,
              b.tx_hash, b.divergence_check_ids, b.created_at,
              s.name AS site_name, s.tier, s.host_industry
         FROM batches b JOIN sites s ON s.id = b.site_id
        WHERE b.id = $1`,
      [req.params.id],
    );
    const b = rows[0];
    if (!b) return res.status(404).json({ error: 'No such batch' });

    const { rows: checks } = await pool.query(
      `SELECT d.id, p.label AS pond_label, d.window_start, d.window_end,
              d.claimed_co2_kg, d.independent_co2_kg, d.independent_low_co2_kg,
              d.ceiling_co2_kg, d.creditable_co2_kg, d.verdict, d.reason
         FROM divergence_checks d JOIN ponds p ON p.id = d.pond_id
        WHERE d.id = ANY($1) ORDER BY d.window_start`,
      [b.divergence_check_ids],
    );

    const { rows: retirements } = await pool.query(
      `SELECT id, kg, beneficiary, retired_at FROM retirements
        WHERE batch_id = $1 ORDER BY retired_at`,
      [b.id],
    );

    const issued = Number(b.creditable_co2_kg);
    const retired = retirements.reduce((t, r) => t + Number(r.kg), 0);

    res.json({
      batchId: b.id,
      siteName: b.site_name,
      tier: b.tier,
      hostIndustry: b.host_industry,
      periodStart: b.period_start.toISOString(),
      periodEnd: b.period_end.toISOString(),
      claimedCo2Kg: Number(b.claimed_co2_kg),
      creditableCo2Kg: issued,
      refusedCo2Kg: Number(b.claimed_co2_kg) - issued,
      ceilingCo2Kg: Number(b.ceiling_co2_kg),
      disposition: b.disposition,
      dispositionEvidenceRef: b.disposition_evidence_ref,
      // The hash is over canonical JSON of the whole report, so anyone can
      // recompute it from these same checks and compare.
      reportHash: b.mrv_report_cid,
      anchored: b.tx_hash !== null,
      txHash: b.tx_hash,
      issuedAt: b.created_at.toISOString(),
      retiredKg: retired,
      outstandingKg: Math.max(0, issued - retired),
      retirements: retirements.map((r) => ({
        id: r.id, kg: Number(r.kg), beneficiary: r.beneficiary,
        retiredAt: r.retired_at.toISOString(),
      })),
      checks: checks.map((c) => ({
        id: c.id,
        pondLabel: c.pond_label,
        windowStart: c.window_start.toISOString(),
        windowEnd: c.window_end.toISOString(),
        claimedCo2Kg: Number(c.claimed_co2_kg),
        independentCo2Kg: Number(c.independent_co2_kg),
        independentLowCo2Kg: Number(c.independent_low_co2_kg),
        ceilingCo2Kg: Number(c.ceiling_co2_kg),
        creditableCo2Kg: Number(c.creditable_co2_kg),
        verdict: c.verdict,
        reason: c.reason,
      })),
    });
  } catch (err) {
    console.error('[verify/batch]', err);
    res.status(500).json({ error: 'Could not load that batch' });
  }
});

/** A retirement certificate, and the batch it came from. */
verifyRouter.get('/certificate/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.kg, r.beneficiary, r.retired_at, r.tx_hash,
              b.id AS batch_id, b.mrv_report_cid, b.disposition,
              b.period_start, b.period_end, s.name AS site_name
         FROM retirements r
         JOIN batches b ON b.id = r.batch_id
         JOIN sites s ON s.id = b.site_id
        WHERE r.id = $1`,
      [req.params.id],
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'No such certificate' });

    res.json({
      certificateId: c.id,
      kg: Number(c.kg),
      beneficiary: c.beneficiary,
      retiredAt: c.retired_at.toISOString(),
      siteName: c.site_name,
      disposition: c.disposition,
      periodStart: c.period_start.toISOString(),
      periodEnd: c.period_end.toISOString(),
      batchId: c.batch_id,
      reportHash: c.mrv_report_cid,
      anchored: c.tx_hash !== null,
      txHash: c.tx_hash,
      note:
        'This tonnage is retired permanently and claimed by the named '
        + 'beneficiary. It cannot be resold. Follow the batch link to see '
        + 'the evidence it was issued against.',
    });
  } catch (err) {
    console.error('[verify/certificate]', err);
    res.status(500).json({ error: 'Could not load that certificate' });
  }
});
