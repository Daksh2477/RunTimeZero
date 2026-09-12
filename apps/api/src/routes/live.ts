/**
 * Live telemetry for dashboards.
 *
 *   GET /live/stream   Server-Sent Events: telemetry, advisory, heartbeat
 *   GET /live/status   last reading per pond
 *
 * SSE rather than WebSockets: one direction is all a dashboard needs, it rides
 * plain HTTP through the Next proxy and nginx, and EventSource reconnects on
 * its own.
 */

import { Router } from 'express';
import { liveStatus, subscribe } from '../services/live.ts';

export const liveRouter = Router();

const HEARTBEAT_MS = 15_000;

liveRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers proxied responses by default, which holds every event
    // until the buffer fills — a stream that never arrives.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const unsubscribe = subscribe(send);
  const heartbeat = setInterval(
    () => send('heartbeat', { at: new Date().toISOString() }),
    HEARTBEAT_MS,
  );

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

liveRouter.get('/status', async (_req, res) => {
  try {
    res.json(await liveStatus());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not read live status',
    });
  }
});
