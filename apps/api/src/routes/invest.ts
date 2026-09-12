/**
 * The investor noticeboard.
 *
 * We carry listings and the verified production behind them; the investor
 * contacts the operator directly. No fee, no escrow, no introduction for
 * consideration — see services/investor-board.ts for why that boundary
 * matters.
 */

import { Router, type Response } from 'express';
import {
  createListing, enquire, getOpportunity, listOpportunities,
} from '../services/investor-board.ts';

export const investRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  if (status === 500) console.error('[invest]', err);
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Unexpected error',
  });
}

const str = (b: Record<string, unknown>, k: string) =>
  typeof b[k] === 'string' ? (b[k] as string).trim() : '';

investRouter.get('/', async (_req, res) => {
  try {
    res.json(await listOpportunities());
  } catch (err) {
    send(res, err);
  }
});

investRouter.get('/:id', async (req, res) => {
  try {
    const listing = await getOpportunity(req.params.id);
    if (!listing) return res.status(404).json({ error: 'No such listing' });
    res.json(listing);
  } catch (err) {
    send(res, err);
  }
});

/** A farm putting itself on the board. */
investRouter.post('/', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const seeking = Number(b.seekingInr);

    for (const f of ['siteId', 'headline', 'pitch', 'useOfFunds', 'contactName', 'contactEmail']) {
      if (!str(b, f)) return res.status(400).json({ error: `${f} is required` });
    }
    if (!Number.isFinite(seeking) || seeking <= 0) {
      return res.status(400).json({ error: 'seekingInr must be a positive number' });
    }

    res.status(201).json(await createListing({
      siteId: str(b, 'siteId'),
      headline: str(b, 'headline'),
      pitch: str(b, 'pitch'),
      seekingInr: seeking,
      useOfFunds: str(b, 'useOfFunds'),
      expandToM2: Number.isFinite(Number(b.expandToM2)) ? Number(b.expandToM2) : null,
      contactName: str(b, 'contactName'),
      contactEmail: str(b, 'contactEmail'),
      contactPhone: str(b, 'contactPhone') || null,
    }));
  } catch (err) {
    send(res, err);
  }
});

/** An investor registering interest; returns the operator's contact details. */
investRouter.post('/:id/enquire', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    for (const f of ['investorName', 'investorEmail', 'message']) {
      if (!str(b, f)) return res.status(400).json({ error: `${f} is required` });
    }
    res.status(201).json(await enquire({
      listingId: req.params.id,
      investorName: str(b, 'investorName'),
      investorEmail: str(b, 'investorEmail'),
      organisation: str(b, 'organisation') || null,
      message: str(b, 'message'),
    }));
  } catch (err) {
    send(res, err);
  }
});
