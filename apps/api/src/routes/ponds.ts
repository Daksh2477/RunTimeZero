/**
 * Pond routes. Thin by design — parse, delegate, return.
 */

import { Router } from 'express';
import { RequestError, validatePondId } from '../reconcile/validation.ts';
import { getPond } from '../db/client.ts';
import { runReconciliation } from '../services/reconcile-service.ts';

export const pondsRouter = Router();

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
