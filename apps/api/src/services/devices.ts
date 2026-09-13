/**
 * Sensor nodes as registered devices.
 *
 * Every pond gets its nodes the moment it is created: an id, a secret, and the
 * MQTT topic to publish on. A node signs each reading with its secret, so on a
 * public broker a reading for a pond is accepted as that pond's device only if
 * it carries a valid signature. Unsigned readings are still stored — they are
 * claims like any other — but the dashboard shows them as unverified.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from '../db/client.ts';
import { kitFor, nodesForPond } from './circuit.ts';

/**
 * Offline after a missed hourly report. Field nodes publish every 30 s, but the
 * simulator publishes one reading per simulated hour once caught up with the
 * clock, and a tighter window would show every simulated node offline.
 */
const ONLINE_WITHIN_MS = 70 * 60_000;

export interface Device {
  id: string;
  pondId: string;
  pondLabel: string;
  nodeIndex: number;
  kit: string;
  topic: string;
  lastSeenAt: string | null;
  online: boolean;
}

export function topicFor(pondId: string): string {
  const prefix = process.env.MQTT_TOPIC_PREFIX ?? 'rtz/9f3a/pond';
  return `${prefix}/${pondId}/telemetry`;
}

/** What a node signs. Short and field-ordered, so firmware can build it without JSON canonicalisation. */
export function signReading(secret: string, r: { deviceId: string; pondId: string; observedAt: string; seq: number }): string {
  return createHmac('sha256', secret)
    .update(`${r.deviceId}.${r.pondId}.${r.observedAt}.${r.seq}`)
    .digest('hex');
}

/** Create any missing nodes for a pond. Safe to call repeatedly. */
export async function ensureDevices(pondId: string): Promise<void> {
  const { rows } = await pool.query<{ area_m2: number; tier: string }>(
    `SELECT p.area_m2, s.tier FROM ponds p JOIN sites s ON s.id = p.site_id WHERE p.id = $1`,
    [pondId],
  );
  if (!rows[0]) return;
  const { nodes } = nodesForPond(Number(rows[0].area_m2));
  const kit = kitFor(Number(rows[0].area_m2), rows[0].tier);
  for (let i = 0; i < nodes; i += 1) {
    await pool.query(
      `INSERT INTO devices (id, pond_id, node_index, kit, secret)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (pond_id, node_index) DO NOTHING`,
      [`nd-${randomBytes(4).toString('hex')}`, pondId, i, kit, randomBytes(24).toString('hex')],
    );
  }
}

export async function ensureAllDevices(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM ponds WHERE active');
  for (const r of rows) await ensureDevices(r.id);
}

/** Checks a signed reading and records the sighting. Null = unsigned; false = forged. */
export async function verifyAndMarkSeen(
  m: { deviceId?: string; sig?: string; pondId: string; observedAt: string; seq?: number },
): Promise<boolean | null> {
  if (!m.deviceId || !m.sig) return null;
  const { rows } = await pool.query<{ pond_id: string; secret: string }>(
    'SELECT pond_id, secret FROM devices WHERE id = $1', [m.deviceId],
  );
  const d = rows[0];
  if (!d || d.pond_id !== m.pondId) return false;
  const expected = Buffer.from(signReading(d.secret, {
    deviceId: m.deviceId, pondId: m.pondId, observedAt: m.observedAt, seq: m.seq ?? 0,
  }));
  const given = Buffer.from(m.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  await pool.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [m.deviceId]);
  return true;
}

export async function listDevices(filter: { pondId?: string; siteId?: string } = {}): Promise<Device[]> {
  const params: string[] = [];
  let where = 'p.active';
  if (filter.pondId) { params.push(filter.pondId); where += ` AND p.id = $${params.length}`; }
  if (filter.siteId) { params.push(filter.siteId); where += ` AND p.site_id = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT d.id, d.pond_id, d.node_index, d.kit, d.last_seen_at, p.label
       FROM devices d JOIN ponds p ON p.id = d.pond_id
      WHERE ${where} ORDER BY p.label, d.node_index`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    pondId: r.pond_id,
    pondLabel: r.label,
    nodeIndex: r.node_index,
    kit: r.kit,
    topic: topicFor(r.pond_id),
    lastSeenAt: r.last_seen_at?.toISOString() ?? null,
    online: r.last_seen_at !== null && Date.now() - r.last_seen_at.getTime() < ONLINE_WITHIN_MS,
  }));
}

/** Everything a node needs to connect. The secret leaves the server only here, to the pond's operator. */
export async function deviceConfig(deviceId: string) {
  const { rows } = await pool.query(
    'SELECT id, pond_id, secret FROM devices WHERE id = $1', [deviceId],
  );
  const d = rows[0];
  if (!d) return null;
  const broker = process.env.MQTT_BROKER_URL ?? 'mqtt://broker.hivemq.com:1883';
  return {
    deviceId: d.id,
    pondId: d.pond_id,
    broker,
    topic: topicFor(d.pond_id),
    secret: d.secret,
    signing: 'hex(HMAC-SHA256(secret, `${deviceId}.${pondId}.${observedAt}.${seq}`)) sent as "sig"',
    firmwareDefines: [
      `#define DEVICE_ID "${d.id}"`,
      `#define POND_ID "${d.pond_id}"`,
      `#define DEVICE_SECRET "${d.secret}"`,
      `#define MQTT_TOPIC "${topicFor(d.pond_id)}"`,
    ].join('\n'),
  };
}
