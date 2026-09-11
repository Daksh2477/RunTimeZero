/**
 * MQTT ingestion — the API's ONLY source of pond telemetry.
 *
 * This is deliberate. The simulator and the Wokwi node both publish here, and
 * neither can hand us anything except a message on a wire. There is no import
 * path from the twin's internal state into this process, so the reconciliation
 * engine physically cannot see ground truth (docs/DECISIONS.md #6, #11).
 *
 * If you are ever tempted to add a "fast path" that writes telemetry directly
 * into Postgres from the simulator, that shortcut deletes the project's central
 * claim. Publish to the broker instead.
 */

import mqtt from 'mqtt';
import { insertTelemetry } from '../db/client.ts';

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://broker.hivemq.com:1883';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? 'rtz/9f3a/pond';

/** Shape the firmware publishes. Anything else is rejected, not coerced. */
interface TelemetryMessage {
  pondId: string;
  seq: number;
  uptimeMs: number;
  ph: number;
  dissolvedOxygenMgL: number;
  opticalDensity: number;
  temperatureC: number;
  co2UptakeKg?: number;
  energyKwh?: number;
  raw?: { vPh: number; vDo: number; vOd: number };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate a payload off the wire.
 *
 * A public broker means anyone can publish to our topic, so nothing here trusts
 * the sender. A malformed message is dropped and logged, never partially
 * inserted — a half-written reading is worse than a missing one.
 */
export function parseTelemetry(raw: string): TelemetryMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const m = parsed as Record<string, unknown>;
  if (typeof m.pondId !== 'string' || m.pondId.length === 0) return null;

  const required = ['ph', 'dissolvedOxygenMgL', 'opticalDensity', 'temperatureC'];
  for (const key of required) {
    if (!isFiniteNumber(m[key])) return null;
  }

  // Physically impossible readings mean a broken probe or a spoofed message.
  const ph = m.ph as number;
  const temp = m.temperatureC as number;
  if (ph < 0 || ph > 14) return null;
  if (temp < -20 || temp > 80) return null;

  return {
    pondId: m.pondId,
    seq: isFiniteNumber(m.seq) ? m.seq : 0,
    uptimeMs: isFiniteNumber(m.uptimeMs) ? m.uptimeMs : 0,
    ph,
    dissolvedOxygenMgL: m.dissolvedOxygenMgL as number,
    opticalDensity: m.opticalDensity as number,
    temperatureC: temp,
    co2UptakeKg: isFiniteNumber(m.co2UptakeKg) ? m.co2UptakeKg : undefined,
    energyKwh: isFiniteNumber(m.energyKwh) ? m.energyKwh : undefined,
  };
}

export interface IngestStats {
  received: number;
  stored: number;
  rejected: number;
}

export function startMqttIngest(onStats?: (s: IngestStats) => void) {
  const stats: IngestStats = { received: 0, stored: 0, rejected: 0 };
  const client = mqtt.connect(BROKER_URL, {
    clientId: `rtz-api-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
  });

  const topic = `${TOPIC_PREFIX}/+/telemetry`;

  client.on('connect', () => {
    client.subscribe(topic, (err) => {
      if (err) console.error('[mqtt] subscribe failed:', err.message);
      else console.log(`[mqtt] connected, listening on ${topic}`);
    });
  });

  client.on('message', async (_topic, payload) => {
    stats.received += 1;
    const msg = parseTelemetry(payload.toString());

    if (!msg) {
      stats.rejected += 1;
      console.warn('[mqtt] rejected malformed payload');
      onStats?.(stats);
      return;
    }

    try {
      await insertTelemetry({
        pondId: msg.pondId,
        observedAt: new Date().toISOString(),
        // Every reading is an assertion regardless of origin. Recording the
        // source is provenance, not a trust level — see DECISIONS.md #2.
        source: 'sensor',
        co2UptakeKg: msg.co2UptakeKg ?? null,
        ph: msg.ph,
        dissolvedOxygenMgL: msg.dissolvedOxygenMgL,
        temperatureC: msg.temperatureC,
        opticalDensity: msg.opticalDensity,
        energyKwh: msg.energyKwh ?? null,
      });
      stats.stored += 1;
    } catch (err) {
      stats.rejected += 1;
      // A foreign-key violation here almost always means an unknown pondId —
      // the node is publishing for a pond nobody seeded. Worth saying plainly.
      console.error(
        `[mqtt] insert failed for pond ${msg.pondId}:`,
        err instanceof Error ? err.message : err,
      );
    }
    onStats?.(stats);
  });

  client.on('error', (err) => console.error('[mqtt] error:', err.message));
  client.on('reconnect', () => console.log('[mqtt] reconnecting…'));

  return {
    stats,
    stop: () => client.end(),
  };
}
