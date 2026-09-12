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
  /**
   * When the reading was taken, if the publisher knows.
   *
   * The ESP32 has no clock, so the firmware omits it and the API stamps
   * arrival — that stays the default. The simulator rig does know: it runs
   * simulated days in seconds of real time, and without this every reading
   * lands at "now", which crushes weeks of production into minutes of
   * timestamps and makes every claim exceed the physics ceiling for its own
   * window. A verifier refusing the demo on stage is not the demo.
   *
   * Bounded on read, because on a public broker anyone can claim any time.
   */
  observedAt?: string;
  raw?: { vPh: number; vDo: number; vOd: number };
}

/** How far from now a claimed observation time may sit before we ignore it. */
const OBSERVED_AT_PAST_LIMIT_MS = 90 * 24 * 60 * 60 * 1000;
const OBSERVED_AT_FUTURE_LIMIT_MS = 60 * 60 * 1000;

/**
 * A publisher-supplied timestamp, or null to fall back to arrival.
 *
 * Out-of-range times are dropped rather than clamped: a reading dated 2031 is
 * a broken or hostile sender, and silently moving it to now would file its
 * data under a window it has nothing to do with.
 */
function parseObservedAt(value: unknown): string | null | 'invalid' {
  if (value === undefined) return null;
  if (typeof value !== 'string') return 'invalid';
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return 'invalid';
  const drift = ms - Date.now();
  if (drift > OBSERVED_AT_FUTURE_LIMIT_MS) return 'invalid';
  if (drift < -OBSERVED_AT_PAST_LIMIT_MS) return 'invalid';
  return new Date(ms).toISOString();
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

  /*
   * A timestamp we cannot believe kills the whole message.
   *
   * Falling back to arrival time looked harmless and was not: a rig running
   * faster than the wall clock then had every reading past "now" quietly filed
   * under now, which compressed weeks of production into seconds of timestamps
   * — the exact problem `observedAt` exists to solve, reintroduced silently.
   * Rejecting is loud, and the counter in IngestStats shows it.
   */
  const observedAt = parseObservedAt(m.observedAt);
  if (observedAt === 'invalid') return null;

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
    observedAt: observedAt ?? undefined,
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
        observedAt: msg.observedAt ?? new Date().toISOString(),
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
