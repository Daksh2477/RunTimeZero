/**
 * API entrypoint. Routes stay thin: parse, call a service, return.
 * No SQL in this file, and no business logic.
 */

import express from 'express';
import { healthcheck } from './db/client.ts';
import { startMqttIngest } from './ingest/mqtt.ts';
import { batchesRouter } from './routes/batches.ts';
import { fleetRouter } from './routes/fleet.ts';
import { investRouter } from './routes/invest.ts';
import { marketRouter } from './routes/market.ts';
import { researchRouter } from './routes/research.ts';
import { summaryRouter } from './routes/summary.ts';
import { pondsRouter } from './routes/ponds.ts';
import { simulateRouter } from './routes/simulate.ts';
import { verifyRouter } from './routes/verify.ts';

const app = express();
app.use(express.json());

// The console runs on :3000 and the API on :4000, so the browser needs CORS.
// Wide open is fine: everything is local and there is nothing to protect yet.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'content-type');
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

app.use('/fleet', fleetRouter);
app.use('/ponds', pondsRouter);
app.use('/verify', verifyRouter);
app.use('/simulate', simulateRouter);
app.use('/batches', batchesRouter);
app.use('/market', marketRouter);
app.use('/research', researchRouter);
app.use('/invest', investRouter);
app.use('/summary', summaryRouter);

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
