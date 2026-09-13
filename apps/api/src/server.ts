/**
 * API entrypoint. Routes stay thin: parse, call a service, return.
 * No SQL in this file, and no business logic.
 */

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { healthcheck } from './db/client.ts';
import {
  authRouter, readToken, requireAuth, requireAuthForReads,
} from './routes/auth.ts';
import { startMqttIngest } from './ingest/mqtt.ts';
import { batchesRouter } from './routes/batches.ts';
import { financeRouter } from './routes/finance.ts';
import { fleetRouter } from './routes/fleet.ts';
import { harvestsRouter } from './routes/harvests.ts';
import { investRouter } from './routes/invest.ts';
import { landRouter } from './routes/land.ts';
import { liveRouter } from './routes/live.ts';
import { marketRouter } from './routes/market.ts';
import { researchRouter } from './routes/research.ts';
import { summaryRouter } from './routes/summary.ts';
import { pondsRouter } from './routes/ponds.ts';
import { simulateRouter } from './routes/simulate.ts';
import { verifyRouter } from './routes/verify.ts';
import { weatherRouter } from './routes/weather.ts';

const app = express();
app.use(express.json());

// The console runs on :3000 and the API on :4000, so the browser needs CORS.
// Wide open is fine: everything is local and there is nothing to protect yet.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  // `authorization` matters: without it the browser silently strips the bearer
  // token on every cross-origin request and every write looks unauthenticated.
  res.header('Access-Control-Allow-Headers', 'content-type, authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
});
app.options(/.*/, (_req, res) => res.sendStatus(204));

app.get('/health', async (_req, res) => {
  try {
    const db = await healthcheck();
    res.json({ ok: db, db });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
});

// Every request gets its caller attached when it carries a token; nothing is
// rejected here. See routes/auth.ts.
app.use(readToken);

/**
 * Writing needs an account. Reading mostly does not.
 *
 * The split is deliberate and it is the product's argument, not a shortcut:
 * verification, the market listing and the anonymous simulator are public
 * because a carbon claim nobody can check is worthless, and a stranger has to
 * be able to poke the physics without asking us for a login. Everything that
 * changes state — adding a pond, issuing a batch, retiring a tonne, licensing
 * data — belongs to somebody, so it needs to be signed in.
 *
 * Operator READ screens (fleet, land, a pond's own telemetry) are private too,
 * behind AUTH_ENFORCE_READS, which stays off until the console has a login
 * screen. Turning it on before that would show the user an empty dashboard and
 * no explanation.
 */
function writesNeedAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    next();
    return;
  }
  requireAuth(req, res, next);
}

app.use('/auth', authRouter);

app.use('/fleet', requireAuthForReads, fleetRouter);
app.use('/ponds', writesNeedAuth, pondsRouter);
app.use('/verify', verifyRouter);
// Not `writesNeedAuth`: the anonymous simulator is a POST and it stays open on
// purpose (docs/DECISIONS.md — anyone may check our physics without an
// account). Its per-pond sibling asks for a token in the route itself, because
// that one is about somebody's actual pond.
app.use('/simulate', simulateRouter);
app.use('/batches', writesNeedAuth, batchesRouter);
app.use('/market', writesNeedAuth, marketRouter);
app.use('/finance', financeRouter);
app.use('/research', writesNeedAuth, researchRouter);
app.use('/invest', writesNeedAuth, investRouter);
app.use('/summary', summaryRouter);
app.use('/land', requireAuthForReads, writesNeedAuth, landRouter);
app.use('/harvests', requireAuthForReads, writesNeedAuth, harvestsRouter);
app.use('/weather', weatherRouter);
app.use('/live', requireAuthForReads, liveRouter);

const port = Number(process.env.API_PORT ?? 4000);

const server = app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
  // Ingestion starts with the server: the API has no other source of pond data.
  startMqttIngest();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[api] port ${port} is already in use.\n` +
        `      Another API is probably still running. Kill it with:\n` +
        `        lsof -ti:${port} | xargs -r kill -9\n` +
        `      Or use a different port:  API_PORT=4001 npm run api\n`,
    );
    process.exit(1);
  }
  throw err;
});
