/**
 * Recording a weighed harvest.
 *
 * This is the independent channel that does not depend on the weather. A
 * satellite passes every few days and monsoon cloud can hide a fortnight of
 * them; a weighbridge ticket exists the moment the crop leaves the pond, and
 * for the smallholder tier it is the ONLY independent evidence there is —
 * Sentinel-2's red-edge band cannot resolve a 10 m pond at all.
 *
 * Wet mass and moisture are recorded separately and dry mass is a generated
 * column, because those are the two numbers a weighbridge and a moisture meter
 * actually produce. Asking an operator for dry mass invites them to do the
 * arithmetic in their head, and the error lands in a credit.
 */

import { Router, type Response } from 'express';

import { pool } from '../db/client.ts';
import { RequestError, validatePondId } from '../reconcile/validation.ts';

export const harvestsRouter = Router();

/** Spirulina leaves the pond as a wet paste: 85–92% water is normal. */
const MOISTURE_MIN = 0.5;
const MOISTURE_MAX = 0.98;

function send(res: Response, err: unknown) {
  if (err instanceof RequestError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[harvests]', err);
  return res.status(500).json({ error: 'Could not record that harvest.' });
}

harvestsRouter.post('/pond/:id', async (req, res) => {
  try {
    const pondId = String(req.params.id);
    validatePondId(pondId);
    const b = (req.body ?? {}) as Record<string, unknown>;

    const wetMassKg = Number(b.wetMassKg);
    if (!Number.isFinite(wetMassKg) || wetMassKg <= 0) {
      return res.status(400).json({ error: 'wetMassKg must be a positive number' });
    }

    const moistureFrac = Number.isFinite(Number(b.moistureFrac))
      ? Number(b.moistureFrac) : 0.88;
    if (moistureFrac < MOISTURE_MIN || moistureFrac > MOISTURE_MAX) {
      return res.status(422).json({
        error: `moistureFrac must be between ${MOISTURE_MIN} and ${MOISTURE_MAX} — `
          + 'fresh spirulina paste is 85–92% water.',
      });
    }

    // Defaults to now, but a ticket written up an hour later must be able to
    // say when the crop actually came out: the verification window it falls in
    // is decided by this timestamp, not by when somebody typed it in.
    const harvestedAt = typeof b.harvestedAt === 'string' && !Number.isNaN(Date.parse(b.harvestedAt))
      ? new Date(b.harvestedAt) : new Date();
    if (harvestedAt.getTime() > Date.now() + 60 * 60 * 1000) {
      return res.status(422).json({ error: 'harvestedAt cannot be in the future' });
    }

    const { rows: pond } = await pool.query(
      'SELECT id, label, area_m2 FROM ponds WHERE id = $1', [pondId],
    );
    if (!pond[0]) return res.status(404).json({ error: 'No such pond' });

    const { rows } = await pool.query(
      `INSERT INTO harvest_records
         (pond_id, harvested_at, wet_mass_kg, moisture_frac, weighbridge_ref,
          photo_ref, protein_frac, lipid_frac)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, harvested_at, wet_mass_kg, moisture_frac, dry_mass_kg,
                 weighbridge_ref`,
      [
        pondId,
        harvestedAt,
        wetMassKg,
        moistureFrac,
        typeof b.weighbridgeRef === 'string' ? b.weighbridgeRef.trim() || null : null,
        typeof b.photoRef === 'string' ? b.photoRef.trim() || null : null,
        Number.isFinite(Number(b.proteinFrac)) ? Number(b.proteinFrac) : null,
        Number.isFinite(Number(b.lipidFrac)) ? Number(b.lipidFrac) : null,
      ],
    );
    const r = rows[0];
    const dryMassKg = Number(r.dry_mass_kg);
    const areaM2 = Number(pond[0].area_m2);

    return res.status(201).json({
      id: r.id,
      pondId,
      pondLabel: pond[0].label,
      harvestedAt: r.harvested_at.toISOString(),
      wetMassKg: Number(r.wet_mass_kg),
      moistureFrac: Number(r.moisture_frac),
      dryMassKg,
      weighbridgeRef: r.weighbridge_ref,
      // Areal yield is the number an operator can sanity-check against any
      // textbook: a working raceway runs 10–25 g/m²/day.
      yieldGPerM2: areaM2 > 0 ? Number(((dryMassKg * 1000) / areaM2).toFixed(1)) : null,
      note: 'Recorded as independent evidence. It will be used to check claims '
        + 'for the window it falls in.',
    });
  } catch (err) {
    return send(res, err);
  }
});

/** Every weighed harvest for a pond, newest first. */
harvestsRouter.get('/pond/:id', async (req, res) => {
  try {
    const pondId = String(req.params.id);
    validatePondId(pondId);
    const { rows } = await pool.query(
      `SELECT id, harvested_at, wet_mass_kg, moisture_frac, dry_mass_kg,
              weighbridge_ref, photo_ref
         FROM harvest_records
        WHERE pond_id = $1
        ORDER BY harvested_at DESC
        LIMIT 200`,
      [pondId],
    );
    return res.json(rows.map((r) => ({
      id: r.id,
      harvestedAt: r.harvested_at.toISOString(),
      wetMassKg: Number(r.wet_mass_kg),
      moistureFrac: Number(r.moisture_frac),
      dryMassKg: Number(r.dry_mass_kg),
      weighbridgeRef: r.weighbridge_ref,
      photoRef: r.photo_ref,
    })));
  } catch (err) {
    return send(res, err);
  }
});
