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
import {
  listForSale, listProduce, orderProduce, sellableHarvests,
} from '../services/produce-service.ts';

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


/* ------------------------------------------------------------- produce
 * The algae itself, not the carbon. A tonne of CO2 is worth a few hundred
 * rupees; the same pond's biomass sold as feed is worth tens of thousands,
 * so this is where the farm's income actually comes from.
 */

/** Everything currently offered for sale. */
marketRouter.get('/produce', async (_req, res) => {
  try {
    res.json(await listProduce());
  } catch (err) {
    send(res, err);
  }
});

/** A farmer's own harvests, with what each grade is worth. */
marketRouter.get('/produce/site/:siteId', async (req, res) => {
  try {
    res.json(await sellableHarvests(req.params.siteId));
  } catch (err) {
    send(res, err);
  }
});

/** Put a harvest up for sale. */
marketRouter.post('/produce/:harvestId/list', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const kg = Number(b.kg);
    if (!Number.isFinite(kg) || kg <= 0) {
      return res.status(400).json({ error: 'kg must be a positive number' });
    }
    const asking = Number.isFinite(Number(b.askingInrPerKg))
      ? Number(b.askingInrPerKg) : null;
    res.status(201).json(await listForSale(req.params.harvestId, kg, asking));
  } catch (err) {
    send(res, err);
  }
});

/** Buy some. */
marketRouter.post('/produce/:harvestId/order', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const kg = Number(b.kg);
    const buyerName = typeof b.buyerName === 'string' ? b.buyerName.trim() : '';
    const buyerEmail = typeof b.buyerEmail === 'string' ? b.buyerEmail.trim() : '';

    if (!Number.isFinite(kg) || kg <= 0) {
      return res.status(400).json({ error: 'kg must be a positive number' });
    }
    if (!buyerName || !buyerEmail) {
      return res.status(400).json({ error: 'buyerName and buyerEmail are required' });
    }
    res.status(201).json(await orderProduce({
      harvestId: req.params.harvestId, buyerName, buyerEmail, kg,
    }));
  } catch (err) {
    send(res, err);
  }
});
