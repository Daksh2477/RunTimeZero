/**
 * A farmer managing their own land: adding ponds and taking them out of use.
 *
 * PONDS ARE DISABLED, NEVER DELETED.
 *
 * A pond that produced credits in 2025 has to still resolve in 2030 when
 * somebody audits those credits. Deleting the row would orphan every
 * divergence check, harvest record and batch that referenced it, and the
 * evidence trail is the entire product. So `DELETE` is not offered at all;
 * there is only disable, which records when and why.
 *
 * Geometry is validated because it drives real conclusions — width decides
 * whether satellites can see the pond, depth decides self-shading, and a
 * typo in either quietly changes what the farm is told it can earn.
 */

import { Router, type Response } from 'express';
import { pool } from '../db/client.ts';

export const landRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  if (status === 500) console.error('[land]', err);
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Unexpected error',
  });
}

/** Beyond this a single raceway cannot be mixed evenly by one paddlewheel. */
const MAX_POND_M2 = 12_000;

/** Every pond at a site, disabled ones included and flagged. */
landRouter.get('/site/:siteId/ponds', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.label, p.area_m2, p.depth_m, p.length_m, p.width_m,
              p.strain, p.active, p.retired_at, p.retired_reason, p.created_at,
              (SELECT MAX(observed_at) FROM telemetry t WHERE t.pond_id = p.id)
                AS last_reading,
              (SELECT COUNT(*)::int FROM divergence_checks d WHERE d.pond_id = p.id)
                AS check_count
         FROM ponds p
        WHERE p.site_id = $1
        ORDER BY p.active DESC, p.label`,
      [req.params.siteId],
    );

    res.json(rows.map((r) => ({
      id: r.id,
      label: r.label,
      areaM2: Number(r.area_m2),
      depthM: Number(r.depth_m),
      lengthM: Number(r.length_m),
      widthM: Number(r.width_m),
      strain: r.strain,
      active: r.active,
      retiredAt: r.retired_at ? r.retired_at.toISOString() : null,
      retiredReason: r.retired_reason,
      createdAt: r.created_at ? r.created_at.toISOString() : null,
      lastReadingAt: r.last_reading ? r.last_reading.toISOString() : null,
      checkCount: r.check_count,
      // Below ~40 m wide, Sentinel-2's 20 m bands cannot give clean pixels.
      satelliteResolvable: Number(r.width_m) >= 40,
      // One multiparameter sonde and one node per pond. See lib/planning.ts.
      sensorsNeeded: r.active ? 1 : 0,
    })));
  } catch (err) {
    send(res, err);
  }
});

/** Add a pond. */
landRouter.post('/site/:siteId/ponds', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const label = typeof b.label === 'string' ? b.label.trim() : '';
    const lengthM = Number(b.lengthM);
    const widthM = Number(b.widthM);
    const depthM = Number(b.depthM);
    const strain = typeof b.strain === 'string' && b.strain.trim()
      ? b.strain.trim() : 'spirulina';

    if (!label) return res.status(400).json({ error: 'Give the pond a name' });
    for (const [name, v] of [['length', lengthM], ['width', widthM], ['depth', depthM]] as const) {
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({ error: `${name} must be a positive number of metres` });
      }
    }

    const areaM2 = lengthM * widthM;
    if (areaM2 > MAX_POND_M2) {
      return res.status(422).json({
        error:
          `${Math.round(areaM2).toLocaleString('en-IN')} m² is too large for one `
          + `raceway — a single paddlewheel cannot mix it evenly past about `
          + `${MAX_POND_M2.toLocaleString('en-IN')} m². Split it into two ponds.`,
      });
    }
    if (depthM > 0.6) {
      return res.status(422).json({
        error:
          'Deeper than 60 cm and the culture shades itself faster than the '
          + 'extra volume earns. Most working raceways run 20–30 cm.',
      });
    }

    const { rows: siteRows } = await pool.query('SELECT id FROM sites WHERE id = $1', [req.params.siteId]);
    if (!siteRows[0]) return res.status(404).json({ error: 'No such site' });

    const { rows } = await pool.query(
      `INSERT INTO ponds (site_id, label, area_m2, depth_m, length_m, width_m, strain)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.siteId, label, areaM2, depthM, lengthM, widthM, strain],
    );

    // Keep the site's headline area consistent with the ponds under it.
    await pool.query(
      `UPDATE sites SET total_area_m2 =
         (SELECT COALESCE(SUM(area_m2), 0) FROM ponds WHERE site_id = $1 AND active)
       WHERE id = $1`,
      [req.params.siteId],
    );

    res.status(201).json({
      id: rows[0].id,
      label,
      areaM2,
      satelliteResolvable: widthM >= 40,
      note: widthM >= 40
        ? 'Wide enough for satellite verification.'
        : `At ${widthM} m wide this pond is below the 40 m satellites need, so it `
          + 'will be verified by drone or weighbridge instead.',
    });
  } catch (err) {
    send(res, err);
  }
});

/**
 * Take a pond out of use, or bring it back.
 *
 * There is deliberately no delete. History stays.
 */
landRouter.patch('/ponds/:id', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.active !== 'boolean') {
      return res.status(400).json({ error: 'active must be true or false' });
    }
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (!b.active && !reason) {
      return res.status(400).json({
        error:
          'Say why it is going out of use — it appears in the audit trail for '
          + 'any credits this pond produced.',
      });
    }

    const { rows } = await pool.query(
      `UPDATE ponds
          SET active = $2,
              retired_at = CASE WHEN $2 THEN NULL ELSE now() END,
              retired_reason = CASE WHEN $2 THEN NULL ELSE $3 END
        WHERE id = $1
      RETURNING id, site_id, label, active, retired_reason`,
      [req.params.id, b.active, reason || null],
    );
    if (!rows[0]) return res.status(404).json({ error: 'No such pond' });

    await pool.query(
      `UPDATE sites SET total_area_m2 =
         (SELECT COALESCE(SUM(area_m2), 0) FROM ponds WHERE site_id = $1 AND active)
       WHERE id = $1`,
      [rows[0].site_id],
    );

    res.json({
      id: rows[0].id,
      label: rows[0].label,
      active: rows[0].active,
      retiredReason: rows[0].retired_reason,
      note: rows[0].active
        ? 'Back in use. New readings will be checked again.'
        : 'Out of use. Its history and any credits it produced are unchanged.',
    });
  } catch (err) {
    send(res, err);
  }
});
