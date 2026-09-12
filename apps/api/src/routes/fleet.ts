/**
 * Fleet and pond-detail endpoints — everything the console renders.
 *
 * Thin, as routes should be: parse, delegate, return. The interesting logic
 * lives in services/.
 */

import { Router } from 'express';
import { pool } from '../db/client.ts';
import { getPondDetail, getFleet } from '../services/fleet-service.ts';

export const fleetRouter = Router();

/** Every site and pond, with the numbers the fleet board ranks on. */
fleetRouter.get('/', async (_req, res) => {
  try {
    res.json(await getFleet());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'failed' });
  }
});

/**
 * One pond: recent telemetry, independent observations, advisories, and the
 * most recent divergence check.
 */
fleetRouter.get('/pond/:id', async (req, res) => {
  try {
    const detail = await getPondDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'pond not found' });
    return res.json(detail);
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'failed' });
  }
});

/**
 * Site-level expense rollup and unit economics.
 *
 * Kept alongside the fleet rather than in its own router because an operator
 * reads cost and yield on the same screen — the whole point of the expense
 * ledger is answering "is this pond worth running?".
 */
fleetRouter.get('/site/:id/economics', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.category, SUM(e.amount_inr) AS total_inr, SUM(e.energy_kwh) AS kwh
         FROM expenses e
        WHERE e.site_id = $1
        GROUP BY e.category
        ORDER BY SUM(e.amount_inr) DESC`,
      [req.params.id],
    );

    const { rows: prod } = await pool.query(
      `SELECT COALESCE(SUM(b.minted_tonnes) * 1000, 0) AS credited_kg
         FROM batches b WHERE b.site_id = $1 AND b.tx_hash IS NOT NULL`,
      [req.params.id],
    );

    const breakdown = rows.map((r) => ({
      category: r.category,
      totalInr: Number(r.total_inr),
      energyKwh: r.kwh === null ? null : Number(r.kwh),
    }));
    const totalCostInr = breakdown.reduce((s, b) => s + b.totalInr, 0);
    const creditedCo2Kg = Number(prod[0]?.credited_kg ?? 0);

    return res.json({
      breakdown,
      totalCostInr,
      creditedCo2Kg,
      costPerTonneCo2Inr:
        creditedCo2Kg > 0 ? (totalCostInr / creditedCo2Kg) * 1000 : null,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'failed' });
  }
});
