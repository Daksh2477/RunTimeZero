/**
 * Pond routes. Thin by design — parse, delegate, return.
 */

import { Router } from 'express';
import { RequestError, validatePondId } from '../reconcile/validation.ts';
import { getPond, pool } from '../db/client.ts';
import {
  fetchTrueColourPng, hasCredentials, MIN_RESOLVABLE_WIDTH_M,
} from '../ingest/sentinel.ts';
import { runReconciliation } from '../services/reconcile-service.ts';

export const pondsRouter = Router();

/** Real passes are named this way by the ingest script. */
const REAL_SCENE_PREFIX = 'S2_L2A_';

/**
 * Every independent observation of this pond, with a picture where one exists.
 *
 * A fixture observation gets `thumbnailUrl: null` and says why. Rendering the
 * real scene for a synthetic row would put a genuine photograph next to a made
 * up number, which is the one thing this product cannot afford to do.
 */
pondsRouter.get('/:id/imagery', async (req, res) => {
  try {
    validatePondId(req.params.id);
    const pond = await getPond(req.params.id);
    if (!pond) return res.status(404).json({ error: 'pond not found' });

    const { rows } = await pool.query(
      `SELECT observed_at, channel, chlorophyll_index, measured_dry_mass_kg,
              source_ref, cloud_fraction
         FROM imagery_observations
        WHERE pond_id = $1
        ORDER BY observed_at DESC`,
      [req.params.id],
    );

    const configured = hasCredentials();
    const resolvable = pond.widthM >= MIN_RESOLVABLE_WIDTH_M;

    return res.json({
      pond: {
        id: pond.id,
        label: pond.label,
        widthM: pond.widthM,
        areaM2: pond.areaM2,
        satelliteResolvable: resolvable,
      },
      thumbnailsAvailable: configured && resolvable,
      reason: configured
        ? resolvable
          ? null
          : `This pond is ${pond.widthM} m wide and Sentinel-2's red-edge band is 20 m, `
            + 'so there is no clean pixel to show. Its evidence is drone and weighbridge.'
        : 'No Copernicus credentials are configured for this deployment, so no scene '
          + 'can be rendered.',
      passes: rows.map((r) => {
        const date = r.observed_at.toISOString().slice(0, 10);
        const real = typeof r.source_ref === 'string'
          && r.source_ref.startsWith(REAL_SCENE_PREFIX);
        const renderable = real && configured && resolvable && r.channel === 'sentinel2';
        return {
          observedAt: r.observed_at.toISOString(),
          date,
          channel: r.channel,
          chlorophyllIndex:
            r.chlorophyll_index === null ? null : Number(r.chlorophyll_index),
          measuredDryMassKg:
            r.measured_dry_mass_kg === null ? null : Number(r.measured_dry_mass_kg),
          cloudFraction: r.cloud_fraction === null ? null : Number(r.cloud_fraction),
          sourceRef: r.source_ref,
          fromRealScene: real,
          thumbnailUrl: renderable
            ? `/ponds/${pond.id}/imagery/thumbnail?date=${date}`
            : null,
          thumbnailNote: renderable
            ? null
            : real
              ? 'No scene can be rendered for this pond.'
              : 'Fixture observation from `npm run replay`, not a real scene.',
        };
      }),
    });
  } catch (err) {
    if (err instanceof RequestError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[ponds/imagery]', err);
    return res.status(500).json({ error: 'Could not list imagery for this pond.' });
  }
});

/**
 * True-colour PNG of this pond on one date, rendered from the public scene.
 *
 * Served as an image so the UI can point an `<img>` at it. Cached a day by the
 * browser: a Sentinel-2 scene from a past date never changes.
 */
pondsRouter.get('/:id/imagery/thumbnail', async (req, res) => {
  try {
    validatePondId(req.params.id);
    const date = String(req.query.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date=YYYY-MM-DD is required' });
    }
    if (!hasCredentials()) {
      return res.status(503).json({
        error: 'No Copernicus credentials are configured for this deployment.',
      });
    }

    const pond = await getPond(req.params.id);
    if (!pond) return res.status(404).json({ error: 'pond not found' });
    if (pond.widthM < MIN_RESOLVABLE_WIDTH_M) {
      return res.status(422).json({
        error: `This pond is ${pond.widthM} m wide; Sentinel-2 cannot resolve it.`,
      });
    }

    const png = await fetchTrueColourPng({
      lat: pond.latDeg,
      lon: pond.lonDeg,
      sideM: Math.max(pond.widthM, pond.areaM2 / Math.max(1, pond.widthM)),
      date,
      pad: req.query.pad === undefined ? undefined : Number(req.query.pad),
      size: req.query.size === undefined ? undefined : Number(req.query.size),
    });

    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=86400');
    return res.end(Buffer.from(png));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 500) console.error('[ponds/thumbnail]', err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Could not render this scene.',
    });
  }
});

pondsRouter.get('/:id', async (req, res) => {
  try {
    validatePondId(req.params.id);
    const pond = await getPond(req.params.id);
    if (!pond) return res.status(404).json({ error: 'pond not found' });
    return res.json(pond);
  } catch (err) {
    return res.status(err instanceof RequestError ? err.status : 500).json({
      error: err instanceof RequestError ? err.message : 'Could not read pond.',
    });
  }
});

/**
 * Reconcile a window for this pond.
 *
 * The endpoint a judge will hit during the demo, so the response carries every
 * input as well as the verdict — a result nobody can recompute is not evidence.
 */
pondsRouter.post('/:id/reconcile', async (req, res) => {
  const { windowStart, windowEnd } = req.body ?? {};
  if (typeof windowStart !== 'string' || typeof windowEnd !== 'string') {
    return res
      .status(400)
      .json({ error: 'windowStart and windowEnd (ISO strings) are required' });
  }

  try {
    const result = await runReconciliation(
      req.params.id,
      new Date(windowStart),
      new Date(windowEnd),
    );
    if (!result) return res.status(404).json({ error: 'pond not found' });
    return res.json(result);
  } catch (err) {
    return res.status(err instanceof RequestError ? err.status : 500).json({
      error: err instanceof RequestError ? err.message : 'Reconciliation failed. Check server logs and schema setup.',
    });
  }
});
