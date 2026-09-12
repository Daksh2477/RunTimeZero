/**
 * Simulator driver — runs the Rust twin and publishes telemetry over MQTT.
 *
 * This exists so the fleet has data without needing the Wokwi tab open for
 * every pond. The Wokwi node is one pond a human can poke; this is the other
 * eleven.
 *
 * CRITICAL: this is a SEPARATE PROCESS from the API, and it talks to the API
 * only through the broker. That is not incidental — it is what makes
 * "the engine never sees ground truth" structural rather than a promise
 * (docs/DECISIONS.md #6, #11). This process knows the truth; the API cannot
 * ask it.
 *
 *   npm run sim
 *   npm run sim -- --fraud 1.3 --speed 200
 */

import mqtt from 'mqtt';
import pg from 'pg';
import { WasmPond } from '../packages/physics/pkg/rtz_physics.js';

const { Pool } = pg;

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://broker.hivemq.com:1883';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? 'rtz/9f3a/pond';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

/** Simulated hours per real second. 200 = a fortnight in about 100 seconds. */
const SPEED = arg('--speed', 200);
/** Overstatement factor applied to ONE pond, so divergence has something to find. */
const FRAUD_FACTOR = arg('--fraud', 1.3);

interface PondRow {
  id: string;
  label: string;
  areaM2: number;
  depthM: number;
  lat: number;
}

async function loadPonds(): Promise<PondRow[]> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/algacarbon',
  });
  const { rows } = await pool.query(
    `SELECT p.id, p.label, p.area_m2, p.depth_m, s.lat
       FROM ponds p
       JOIN sites s ON s.id = p.site_id
      WHERE p.active
      ORDER BY s.name, p.label`,
  );
  await pool.end();
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    areaM2: Number(r.area_m2),
    depthM: Number(r.depth_m),
    lat: Number(r.lat),
  }));
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

async function main() {
  const ponds = await loadPonds();
  if (ponds.length === 0) {
    console.error('no ponds found — run `npm run db:seed` first');
    process.exit(1);
  }

  const client = mqtt.connect(BROKER_URL, {
    clientId: `rtz-sim-${Math.random().toString(16).slice(2, 10)}`,
  });

  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  console.log(`[sim] connected to ${BROKER_URL}`);
  console.log(`[sim] driving ${ponds.length} ponds at ${SPEED}x`);

  const today = dayOfYear(new Date());

  // Targeted by LABEL, not array index, so the demo is reproducible. RW-02 is
  // a facility pond with dense Sentinel-2 coverage, which is what makes its
  // overstatement detectable — pick a weighbridge-only pond and you are just
  // testing that two observations disagree.
  const FRAUD_POND = process.env.SIM_FRAUD_POND ?? 'RW-02';
  const CRASH_POND = process.env.SIM_CRASH_POND ?? 'TX-A';

  const twins = ponds.map((p, i) => {
    const pond = new WasmPond(p.lat, p.areaM2, p.depthM, BigInt(1000 + i), today);

    // The pond itself grows normally — the fraud is only in what gets reported.
    const isFraudulent = p.label === FRAUD_POND;
    if (isFraudulent) {
      pond.inject_overstatement(FRAUD_FACTOR, 0, 24 * 30);
      console.log(
        `[sim] ${p.label} overstates by ${((FRAUD_FACTOR - 1) * 100).toFixed(0)}% (biology unaffected)`,
      );
    }

    // A real crash, to exercise the advisory engine rather than the verifier.
    if (p.label === CRASH_POND) {
      pond.inject_crash(0.9, 24 * 6, 24 * 3);
      console.log(`[sim] ${p.label} crashes on simulated day 6`);
    }

    return { meta: p, pond, isFraudulent, hoursLived: 0 };
  });

  let simHour = 0;
  const tickMs = 1000;

  setInterval(() => {
    const hoursThisTick = Math.max(1, Math.round(SPEED / (1000 / tickMs)));

    for (const t of twins) {
      let reading: any = null;
      // Accumulate CO2 across every simulated hour in this tick. Publishing
      // only the final hour would silently discard the rest and make every
      // claim look far smaller than the pond actually produced.
      let co2ThisTick = 0;
      for (let h = 0; h < hoursThisTick; h += 1) {
        reading = t.pond.step();
        co2ThisTick += reading.reported_co2_kg;

        // Harvest every 7 simulated days. Without this the pond draws its
        // nitrogen down to zero, growth stops permanently, and the whole fleet
        // sits dead at inoculation density — which is exactly what happened the
        // first time this ran.
        t.hoursLived += 1;
        if (t.hoursLived % (24 * 7) === 0) {
          t.pond.harvest(0.45);
        }
      }
      if (!reading) continue;

      const payload = JSON.stringify({
        pondId: t.meta.id,
        seq: simHour,
        uptimeMs: simHour * 3_600_000,
        ph: round(reading.ph, 2),
        dissolvedOxygenMgL: round(reading.dissolved_oxygen_mg_l, 2),
        opticalDensity: round(reading.optical_density, 3),
        temperatureC: round(reading.temperature_c, 2),
        co2UptakeKg: round(co2ThisTick, 4),
      });

      client.publish(`${TOPIC_PREFIX}/${t.meta.id}/telemetry`, payload);
    }

    simHour += hoursThisTick;
    if (simHour % 24 === 0) {
      console.log(`[sim] simulated day ${simHour / 24}`);
    }
  }, tickMs);
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

main().catch((err) => {
  console.error('[sim] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
