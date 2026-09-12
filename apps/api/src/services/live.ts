/**
 * In-process fan-out of freshly ingested telemetry to SSE subscribers.
 *
 * It sits AFTER the database insert on purpose: a reading reaches a browser
 * only once it is stored, so the live view can never show something the
 * verification record does not contain.
 */

import { pool } from '../db/client.ts';

export type LiveSource = 'sim' | 'device';

export interface LiveTelemetry {
  pondId: string;
  siteId: string | null;
  at: string;
  source: LiveSource;
  readings: {
    tempC: number;
    ph: number;
    doMgL: number;
    od: number;
    co2UptakeKg: number | null;
    energyKwh: number | null;
    // The firmware has no paddlewheel channel yet; null means "not reported".
    paddlewheelOn: boolean | null;
  };
}

type Listener = (event: string, data: unknown) => void;

const listeners = new Set<Listener>();
const lastSeen = new Map<string, { siteId: string | null; source: LiveSource; lastAt: string }>();
const siteOfPond = new Map<string, string | null>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function siteIdFor(pondId: string): Promise<string | null> {
  if (siteOfPond.has(pondId)) return siteOfPond.get(pondId) ?? null;
  const { rows } = await pool.query<{ site_id: string }>(
    'SELECT site_id FROM ponds WHERE id = $1',
    [pondId],
  );
  const siteId = rows[0]?.site_id ?? null;
  siteOfPond.set(pondId, siteId);
  return siteId;
}

export async function publishTelemetry(
  t: Omit<LiveTelemetry, 'siteId'>,
): Promise<void> {
  const siteId = await siteIdFor(t.pondId);
  const event: LiveTelemetry = { ...t, siteId };
  lastSeen.set(t.pondId, { siteId, source: t.source, lastAt: t.at });
  for (const listener of listeners) listener('telemetry', event);
}

export function publish(event: string, data: unknown): void {
  for (const listener of listeners) listener(event, data);
}

/**
 * Last reading per pond. The in-memory map knows the source of anything seen
 * since boot; older ponds come from the table and report `source: null`.
 */
export async function liveStatus() {
  const { rows } = await pool.query<{ pond_id: string; site_id: string; observed_at: Date }>(
    `SELECT DISTINCT ON (t.pond_id) t.pond_id, p.site_id, t.observed_at
       FROM telemetry t
       JOIN ponds p ON p.id = t.pond_id
      ORDER BY t.pond_id, t.observed_at DESC`,
  );
  return {
    subscribers: listeners.size,
    sources: rows.map((r) => {
      const seen = lastSeen.get(r.pond_id);
      return {
        pondId: r.pond_id,
        siteId: r.site_id,
        source: seen?.source ?? null,
        lastAt: seen?.lastAt ?? r.observed_at.toISOString(),
      };
    }),
  };
}
