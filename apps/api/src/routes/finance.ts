import { Router, type Response } from 'express';
import { myFinance, siteFinance } from '../services/finance.ts';
import { requireAuth, type Authenticated } from './auth.ts';

export const financeRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  if (status === 500) console.error('[finance]', err);
  res.status(status).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
}

financeRouter.get('/mine', requireAuth, async (req: Authenticated, res) => {
  try {
    res.json(await myFinance(req.account!));
  } catch (err) {
    send(res, err);
  }
});

financeRouter.get('/site/:siteId', requireAuth, async (req: Authenticated, res) => {
  try {
    res.json(await siteFinance(req.params.siteId as string, req.account!));
  } catch (err) {
    send(res, err);
  }
});
