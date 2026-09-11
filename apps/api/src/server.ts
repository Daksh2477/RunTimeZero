/**
 * API entrypoint. Routes stay thin: parse, call a service, return.
 * No SQL in this file, and no business logic.
 */

import express from 'express';
import { healthcheck } from './db/client.ts';
import { startMqttIngest } from './ingest/mqtt.ts';
import { pondsRouter } from './routes/ponds.ts';

const app = express();
app.use(express.json());

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

app.use('/ponds', pondsRouter);

const port = Number(process.env.API_PORT ?? 4000);

app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
  // Ingestion starts with the server: the API has no other source of pond data.
  startMqttIngest();
});
