/**
 * In-process fan-out of freshly ingested telemetry to SSE subscribers.
 *
 * It sits AFTER the database insert on purpose: a reading reaches a browser
 * only once it is stored, so the live view can never show something the
 * verification record does not contain.
 */

import { pool } from '../db/client.ts';
import { getPondDetail } from './fleet-service.ts';
import { signalsFor, type PinSignal } from './circuit.ts';

export type LiveSource = 'sim' | 'device';

export interface LiveTelemetry {
  pondId: string;
  siteId: string | null;
  at: string;
  source: LiveSource;
  /** Null when the reading was unsigned. */
  deviceId: string | null;
  verified: boolean;
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
  /** What the simulated node's pins read to produce these values. */
  signals: PinSignal[];
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
  t: Omit<LiveTelemetry, 'siteId' | 'signals'>,
): Promise<void> {
  const siteId = await siteIdFor(t.pondId);
  const event: LiveTelemetry = { ...t, siteId, signals: signalsFor(t.readings) };
  lastSeen.set(t.pondId, { siteId, source: t.source, lastAt: t.at });
  for (const listener of listeners) listener('telemetry', event);
  void publishAdvisories(t.pondId, t.at);
}

// Advisories are computed on read, never stored, so the stream recomputes them.
// A full pond detail per reading is too heavy; once a minute per pond is plenty
// for conditions that develop over hours.
const ADVISORY_EVERY_MS = 60_000;
const advisoryCheckedAt = new Map<string, number>();
const advisorySent = new Map<string, Set<string>>();

async function publishAdvisories(pondId: string, at: string): Promise<void> {
  const now = Date.now();
  if (listeners.size === 0 || now - (advisoryCheckedAt.get(pondId) ?? 0) < ADVISORY_EVERY_MS) return;
  advisoryCheckedAt.set(pondId, now);
  try {
    const detail = await getPondDetail(pondId);
    if (!detail) return;
    const current = new Set<string>();
    const previous = advisorySent.get(pondId) ?? new Set<string>();
    for (const a of detail.advisories) {
      const id = `${pondId}:${a.kind}:${a.severity}`;
      current.add(id);
      if (previous.has(id)) continue;
      publish('advisory', {
        id, pondId, type: a.kind, severity: a.severity,
        message: `${a.title}. ${a.action}`, detectedAt: at,
      });
    }
    advisorySent.set(pondId, current);
  } catch (err) {
    console.error('[live] advisory recompute failed', err);
  }
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
