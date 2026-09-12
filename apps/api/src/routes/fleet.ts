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

    /*
     * Three different quantities, and an earlier version of this route used the
     * narrowest one for unit economics.
     *
     *   verified  — carbon the engine was willing to credit, per check
     *   issued    — carbon packaged into a durable batch
     *   anchored  — batches whose proof is on chain
     *
     * Cost per tonne was being divided by `anchored`, which is zero at every
     * site until an oracle key is configured. So every operator saw their full
     * cost against nothing and the screen read as a total loss. Cost is
     * reported against issued inventory instead, with the basis named in the
     * response, and all three figures are returned so nothing is conflated.
     */
    const { rows: prod } = await pool.query(
      `SELECT COALESCE(SUM(b.creditable_co2_kg), 0) AS issued_kg,
              COALESCE(SUM(b.minted_tonnes) FILTER (WHERE b.tx_hash IS NOT NULL), 0) * 1000
                AS anchored_kg
         FROM batches b WHERE b.site_id = $1`,
      [req.params.id],
    );

    const { rows: checked } = await pool.query(
      `SELECT COALESCE(SUM(d.creditable_co2_kg), 0) AS verified_kg
         FROM divergence_checks d
         JOIN ponds p ON p.id = d.pond_id
        WHERE p.site_id = $1`,
      [req.params.id],
    );

    const breakdown = rows.map((r) => ({
      category: r.category,
      totalInr: Number(r.total_inr),
      energyKwh: r.kwh === null ? null : Number(r.kwh),
    }));
    const totalCostInr = breakdown.reduce((s, b) => s + b.totalInr, 0);
    const issuedCo2Kg = Number(prod[0]?.issued_kg ?? 0);
    const anchoredCo2Kg = Number(prod[0]?.anchored_kg ?? 0);
    const verifiedCo2Kg = Number(checked[0]?.verified_kg ?? 0);

    // Issued is the honest denominator: it is carbon this site can actually
    // sell. Verified is the fallback for a site that has not issued yet, and
    // saying which was used matters more than the number itself.
    const basisKg = issuedCo2Kg > 0 ? issuedCo2Kg : verifiedCo2Kg;
    const costBasis = issuedCo2Kg > 0
      ? 'issued'
      : verifiedCo2Kg > 0 ? 'verified_not_yet_issued' : 'none';

    return res.json({
      breakdown,
      totalCostInr,
      verifiedCo2Kg,
      issuedCo2Kg,
      anchoredCo2Kg,
      // Kept for the existing console, and it means what it always meant:
      // carbon whose proof is on chain.
      creditedCo2Kg: anchoredCo2Kg,
      costBasis,
      costBasisCo2Kg: basisKg,
      costPerTonneCo2Inr: basisKg > 0 ? (totalCostInr / basisKg) * 1000 : null,
      note: costBasis === 'issued'
        ? 'Cost per tonne is against carbon issued as durable batches.'
        : costBasis === 'verified_not_yet_issued'
          ? 'Nothing issued yet, so cost per tonne is against verified capture — '
            + 'it will change when batches are issued.'
          : 'No verified capture at this site yet, so there is no cost per tonne '
            + 'to report. The cost is real; the denominator is not there yet.',
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'failed' });
  }
});
