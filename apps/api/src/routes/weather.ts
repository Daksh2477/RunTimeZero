/**
 * Weather for a site or a pond.
 *
 * Separate from the projection endpoint on purpose: an operator opening the
 * farm screen wants to know whether tomorrow is a problem without waiting for a
 * twin to run, and the forecast is cheap and cached.
 */

import { Router, type Response } from 'express';
import { pool } from '../db/client.ts';
import { RequestError, validatePondId } from '../reconcile/validation.ts';
import { getForecast } from '../services/weather.ts';

export const weatherRouter = Router();

/** Open-Meteo being down is not our fault and not a 500. */
function fail(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 502;
  return res.status(status).json({
    error: err instanceof Error ? err.message : 'Weather unavailable',
  });
}

weatherRouter.get('/site/:siteId', async (req, res) => {
  try {
    validatePondId(req.params.siteId);
    const { rows } = await pool.query(
      'SELECT id, name, lat, lon FROM sites WHERE id = $1',
      [req.params.siteId],
    );
    const site = rows[0];
    if (!site) return res.status(404).json({ error: 'No such site' });

    const days = Number(req.query.days ?? 7);
    const forecast = await getForecast(Number(site.lat), Number(site.lon), days);
    return res.json({ site: { id: site.id, name: site.name }, ...forecast });
  } catch (err) {
    if (err instanceof RequestError) {
      return res.status(err.status).json({ error: err.message });
    }
    return fail(res, err);
  }
});

weatherRouter.get('/pond/:pondId', async (req, res) => {
  try {
    validatePondId(req.params.pondId);
    const { rows } = await pool.query(
      `SELECT p.id, p.label, s.id AS site_id, s.name AS site_name, s.lat, s.lon
         FROM ponds p JOIN sites s ON s.id = p.site_id
        WHERE p.id = $1`,
      [req.params.pondId],
    );
    const pond = rows[0];
    if (!pond) return res.status(404).json({ error: 'No such pond' });

    const days = Number(req.query.days ?? 7);
    const forecast = await getForecast(Number(pond.lat), Number(pond.lon), days);
    return res.json({
      pond: { id: pond.id, label: pond.label },
      site: { id: pond.site_id, name: pond.site_name },
      ...forecast,
    });
  } catch (err) {
    if (err instanceof RequestError) {
      return res.status(err.status).json({ error: err.message });
    }
    return fail(res, err);
  }
});
