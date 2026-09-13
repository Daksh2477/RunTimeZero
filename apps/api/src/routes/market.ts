/**
 * The marketplace and retirement.
 *
 * Every listing carries its evidence quality alongside its quantity. A buyer
 * who cannot tell a well-evidenced tonne from a claimed one is how worthless
 * credits get sold, so divergence, verification tier and anchor status are
 * first-class fields here rather than detail hidden behind a click.
 */

import { Router, type Response } from 'express';
import { getCertificate, listMarket, retire, setListed } from '../services/market-service.ts';
import { matchesFor, mine, priceHistory, sellerTrust } from '../services/market-insights.ts';
import { requireAuth, type Authenticated } from './auth.ts';
import { approvePond, pondEligibility } from '../services/eligibility.ts';
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

/** The signed-in account's listings, retirements and orders. */
marketRouter.get('/mine', requireAuth, async (req: Authenticated, res) => {
  try {
    res.json(await mine(req.account!));
  } catch (err) {
    send(res, err);
  }
});

/** Traded prices by day, with a labelled projection. ?kind=credit|produce&batchId&harvestId&siteId */
marketRouter.get('/price-history', async (req, res) => {
  try {
    const kind = req.query.kind === 'produce' ? 'produce' : 'credit';
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    res.json(await priceHistory(kind, {
      batchId: str(req.query.batchId), harvestId: str(req.query.harvestId), siteId: str(req.query.siteId),
    }));
  } catch (err) {
    send(res, err);
  }
});

/** A seller's trust score and what it is made of. */
marketRouter.get('/trust/:siteId', async (req, res) => {
  try {
    const trust = await sellerTrust(req.params.siteId);
    if (!trust) return res.status(404).json({ error: 'No such site' });
    res.json(trust);
  } catch (err) {
    send(res, err);
  }
});

/** Investors: farms ranked by fit. Operators: who has shown interest in them. */
marketRouter.get('/matches', requireAuth, async (req: Authenticated, res) => {
  try {
    const maxInr = Number(req.query.maxInr);
    res.json(await matchesFor(req.account!, {
      maxInr: Number.isFinite(maxInr) && maxInr > 0 ? maxInr : undefined,
      tier: typeof req.query.tier === 'string' ? req.query.tier : undefined,
    }));
  } catch (err) {
    send(res, err);
  }
});

/** What this pond can sell now, from its verified readings. */
marketRouter.get('/eligible/pond/:pondId', requireAuth, async (req, res) => {
  try {
    const e = await pondEligibility(req.params.pondId as string);
    if (!e) return res.status(404).json({ error: 'No such pond' });
    res.json(e);
  } catch (err) {
    send(res, err);
  }
});

/** One approval: issue the verified credit and list the unsold harvest. */
marketRouter.post('/eligible/pond/:pondId/approve', async (req: Authenticated, res) => {
  try {
    res.status(201).json(await approvePond(req.params.pondId as string, req.account!));
  } catch (err) {
    send(res, err);
  }
});

for (const [path, listed] of [['unlist', false], ['relist', true]] as const) {
  marketRouter.post(`/:batchId/${path}`, async (req: Authenticated, res) => {
    try {
      const asking = Number((req.body ?? {}).askingInrPerTonne);
      res.json(await setListed(
        req.params.batchId as string, listed, req.account!,
        listed && Number.isFinite(asking) && asking > 0 ? asking : null,
      ));
    } catch (err) {
      send(res, err);
    }
  });
}

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

    res.status(201).json(await retire({
      batchId: req.params.batchId, kg, beneficiary, accountId: (req as Authenticated).account?.sub ?? null,
    }));
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
      accountId: (req as Authenticated).account?.sub ?? null,
    }));
  } catch (err) {
    send(res, err);
  }
});
