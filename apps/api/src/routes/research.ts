/**
 * The researcher surface: a data catalogue, licences, and scoped delivery.
 *
 * Delivery is behind a bearer key rather than a download, so that a farm
 * withdrawing consent actually takes effect. See services/data-market.ts.
 */

import { Router, type Response } from 'express';
import { pool } from '../db/client.ts';
import { catalogue, issueLicence, licenceFor } from '../services/data-market.ts';

export const researchRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  if (status === 500) console.error('[research]', err);
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Unexpected error',
  });
}

/** What is for sale, with real row counts and an honest caveat each. */
researchRouter.get('/catalogue', async (_req, res) => {
  try {
    res.json(await catalogue());
  } catch (err) {
    send(res, err);
  }
});

researchRouter.post('/licence', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
    const months = Number(b.months ?? 12);

    for (const field of ['buyerName', 'buyerEmail', 'purpose', 'dataset']) {
      if (!str(field)) return res.status(400).json({ error: `${field} is required` });
    }
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      return res.status(400).json({ error: 'months must be between 1 and 36' });
    }

    res.status(201).json(await issueLicence({
      buyerName: str('buyerName'),
      buyerEmail: str('buyerEmail'),
      institution: str('institution') || null,
      purpose: str('purpose'),
      dataset: str('dataset'),
      months,
    }));
  } catch (err) {
    send(res, err);
  }
});

/**
 * Deliver the licensed data.
 *
 * Only sites with live consent are included, and identity is withheld unless
 * that site chose to share it — so a withdrawal between purchase and
 * download silently and correctly shrinks the result.
 */
researchRouter.get('/data', async (req, res) => {
  try {
    const key = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!key) return res.status(401).json({ error: 'Bearer API key required' });

    const licence = await licenceFor(key);
    if (!licence) {
      return res.status(403).json({ error: 'Key is unknown, expired or revoked' });
    }

    const limit = Math.min(5000, Number(req.query.limit ?? 1000));

    if (licence.dataset === 'telemetry') {
      const { rows } = await pool.query(
        `SELECT CASE WHEN dc.share_identity THEN s.name
                     ELSE 'site-' || left(md5(s.id::text), 6) END AS site,
                s.tier, p.area_m2, t.observed_at, t.ph, t.dissolved_oxygen_mgl,
                t.temperature_c, t.optical_density, t.energy_kwh
           FROM telemetry t
           JOIN ponds p ON p.id = t.pond_id
           JOIN sites s ON s.id = p.site_id
           JOIN data_consent dc ON dc.site_id = s.id AND dc.withdrawn_at IS NULL
          ORDER BY t.observed_at DESC LIMIT $1`,
        [limit],
      );
      return res.json({ dataset: 'telemetry', rows: rows.length, data: rows });
    }

    if (licence.dataset === 'reconciliation') {
      const { rows } = await pool.query(
        `SELECT CASE WHEN dc.share_identity THEN s.name
                     ELSE 'site-' || left(md5(s.id::text), 6) END AS site,
                s.tier, d.window_start, d.window_end, d.claimed_co2_kg,
                d.independent_co2_kg, d.independent_low_co2_kg,
                d.ceiling_co2_kg, d.creditable_co2_kg, d.divergence, d.verdict
           FROM divergence_checks d
           JOIN ponds p ON p.id = d.pond_id
           JOIN sites s ON s.id = p.site_id
           JOIN data_consent dc ON dc.site_id = s.id AND dc.withdrawn_at IS NULL
          ORDER BY d.window_end DESC LIMIT $1`,
        [limit],
      );
      return res.json({ dataset: 'reconciliation', rows: rows.length, data: rows });
    }

    const { rows } = await pool.query(
      `SELECT CASE WHEN dc.share_identity THEN s.name
                   ELSE 'site-' || left(md5(s.id::text), 6) END AS site,
              h.harvested_at, h.dry_mass_kg, h.disposition
         FROM harvest_records h
         JOIN ponds p ON p.id = h.pond_id
         JOIN sites s ON s.id = p.site_id
         JOIN data_consent dc ON dc.site_id = s.id AND dc.withdrawn_at IS NULL
        ORDER BY h.harvested_at DESC LIMIT $1`,
      [limit],
    );
    res.json({ dataset: 'harvests', rows: rows.length, data: rows });
  } catch (err) {
    send(res, err);
  }
});

/** An operator opting their site in or out. */
researchRouter.post('/consent', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.siteId !== 'string') {
      return res.status(400).json({ error: 'siteId is required' });
    }
    const share = b.shareIdentity === true;
    const withdraw = b.withdraw === true;

    await pool.query(
      `INSERT INTO data_consent (site_id, share_identity, withdrawn_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id) DO UPDATE
         SET share_identity = EXCLUDED.share_identity,
             withdrawn_at   = EXCLUDED.withdrawn_at`,
      [b.siteId, share, withdraw ? new Date() : null],
    );
    res.json({ siteId: b.siteId, shareIdentity: share, consented: !withdraw });
  } catch (err) {
    send(res, err);
  }
});
