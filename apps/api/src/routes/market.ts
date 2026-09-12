/**
 * The marketplace and retirement.
 *
 * Every listing carries its evidence quality alongside its quantity. A buyer
 * who cannot tell a well-evidenced tonne from a claimed one is how worthless
 * credits get sold, so divergence, verification tier and anchor status are
 * first-class fields here rather than detail hidden behind a click.
 */

import { Router, type Response } from 'express';
import { getCertificate, listMarket, retire } from '../services/market-service.ts';

export const marketRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (status === 500) console.error('[market]', err);
  res.status(status).json({ error: message });
}

/** Everything issued, with what remains of it. */
marketRouter.get('/', async (_req, res) => {
  try {
    res.json(await listMarket());
  } catch (err) {
    send(res, err);
  }
});

/**
 * Retire part of a batch against a named beneficiary.
 *
 * The beneficiary is who the claim belongs to, which is not always who paid:
 * a broker retiring for a mill must name the mill, or the same tonne ends up
 * claimed twice in two different ledgers.
 */
marketRouter.post('/:batchId/retire', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kg = Number(body.kg);
    const beneficiary = typeof body.beneficiary === 'string' ? body.beneficiary.trim() : '';

    if (!Number.isFinite(kg) || kg <= 0) {
      return res.status(400).json({ error: 'kg must be a positive number' });
    }
    if (!beneficiary) {
      return res.status(400).json({
        error: 'beneficiary is required — a retirement with nobody to claim it is not a retirement',
      });
    }

    res.status(201).json(await retire({ batchId: req.params.batchId, kg, beneficiary }));
  } catch (err) {
    send(res, err);
  }
});

/** A retirement certificate, readable by anyone holding the link. */
marketRouter.get('/certificate/:id', async (req, res) => {
  try {
    const cert = await getCertificate(req.params.id);
    if (!cert) return res.status(404).json({ error: 'No such certificate' });
    res.json(cert);
  } catch (err) {
    send(res, err);
  }
});
