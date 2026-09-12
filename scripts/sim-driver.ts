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
import {
  startControlServer, type ActiveFault, type FaultKind, type Rig, type RigPond,
} from './sim-control.ts';

const { Pool } = pg;

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://broker.hivemq.com:1883';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? 'rtz/9f3a/pond';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Simulated hours per real second.
 *
 * One MQTT message per pond per simulated HOUR, so speed sets the publish rate:
 * 4 × 7 ponds is ~28 messages a second, which a public broker tolerates and a
 * 30-day replay finishes in about three minutes. It was 200 with one message
 * per tick, which produced a single reading per eight simulated days — totals
 * came out right and everything else was ruined. The crash model reads the
 * DIURNAL SWING in dissolved oxygen; a pond sampled once a week has no swing to
 * read, and the one leading indicator four probes can give us disappears.
 */
const SPEED = arg('--speed', 4);

/**
 * How far back the simulated clock starts, in days.
 *
 * Readings carry the time they were SIMULATED for, not the instant they were
 * published. Without that, a run at 200× files a fortnight of production under
 * two minutes of timestamps, every claim dwarfs the physics ceiling for its own
 * window, and the verifier correctly refuses the lot. So the clock starts this
 * many days in the past and advances one simulated hour at a time, arriving at
 * roughly now — which is also what makes a live window on the dashboard line up
 * with what the rig actually did.
 *
 * It also sets how long the demo lasts. The rig replays this much history at
 * `--speed` and then drops to real time, which is one reading per pond per
 * hour and looks like nothing at all on a screen. Thirty days at 48× is about
 * fifteen minutes of continuous arrivals; pick the horizon to outlast the
 * presentation, not to be realistic.
 */
const BACKDATE_DAYS = arg('--backdate', 30);
/** Overstatement factor applied to ONE pond, so divergence has something to find. */
const FRAUD_FACTOR = arg('--fraud', 1.3);

/*
 * Feed and harvest cadence, calibrated rather than guessed.
 *
 * The twin only replenishes nitrogen when biomass is harvested — a batch
 * assumption — so cadence decides everything about how the fleet behaves, and
 * both obvious choices are wrong:
 *
 *   harvest weekly, never feed  → 8.0 g/m²/day, and every pond produces
 *                                 literally zero from day 5 to day 7
 *   feed daily, harvest weekly  → 44.7 g/m²/day, which is 105% OF THE PHYSICS
 *                                 CEILING. The rig would publish telemetry the
 *                                 verifier must refuse as impossible, and being
 *                                 refused by our own engine on stage is the one
 *                                 outcome worth avoiding.
 *
 * Feeding every 4 days and cutting 40% every 5 lands at 20 g/m²/day and 46% of
 * ceiling, with peak density 1.4 — a real Gujarat raceway does 10–25 g/m²/day
 * at OD 0.5–1.5. Three of twenty-one days still produce nothing, which is
 * honest: a pond does stall before its harvest.
 *
 * `harvest(0)` removes no biomass and resets nitrogen to influent strength.
 * These are CETP and dairy effluent ponds, so influent genuinely does arrive
 * between harvests.
 */
const FEED_EVERY_DAYS = 4;
const HARVEST_EVERY_DAYS = 5;
const HARVEST_FRACTION = 0.4;

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

/*
 * Reporting harvests to the API.
 *
 * Telemetry alone cannot be verified in a live window: the independent channel
 * is satellite chlorophyll, and Sentinel-2 passes every few days — in monsoon,
 * effectively never. A weighed harvest is the channel that always exists, and
 * it is legitimately observable (docs/DECISIONS.md #6 forbids the engine seeing
 * ground truth; a mass on a weighbridge is not ground truth, it is a
 * measurement anyone can repeat).
 *
 * Sent over HTTP as an operator would, not written to the database directly —
 * the rig must not have a privilege the demo is claiming nobody needs.
 */
const API_URL = process.env.SIM_API_URL ?? 'http://localhost:4000';
const API_USER = process.env.SIM_API_USER ?? 'admin';
const API_PASSWORD = process.env.SIM_API_PASSWORD ?? 'admin';

/** Fresh spirulina paste off a belt filter. Dry mass is derived from this. */
const HARVEST_MOISTURE = 0.88;

let apiToken: string | null = null;

async function signIn(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: API_USER, password: API_PASSWORD }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    apiToken = ((await res.json()) as { token: string }).token;
    console.log(`[sim] signed in to ${API_URL} as ${API_USER} — harvests will be reported`);
  } catch (err) {
    // Not fatal. Telemetry still flows over the broker, and a rig that dies
    // because an API was down would be a worse demo than one missing harvests.
    console.warn(
      `[sim] could not sign in to ${API_URL} (${err instanceof Error ? err.message : err})`
      + ' — harvests will NOT be reported, so live windows will have no'
      + ' independent evidence',
    );
  }
}

async function reportHarvest(
  pondId: string, label: string, dryMassKg: number, at: Date,
): Promise<void> {
  if (!apiToken || dryMassKg <= 0) return;
  try {
    const res = await fetch(`${API_URL}/harvests/pond/${pondId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        // The weighbridge weighs wet paste; dry mass is what the twin cut.
        wetMassKg: Number((dryMassKg / (1 - HARVEST_MOISTURE)).toFixed(1)),
        moistureFrac: HARVEST_MOISTURE,
        harvestedAt: at.toISOString(),
        weighbridgeRef: `SIM-${label}-${at.toISOString().slice(0, 16)}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[sim] harvest for ${label} rejected: ${res.status} ${await res.text()}`);
      return;
    }
    console.log(`[sim] ${label} harvested ${dryMassKg.toFixed(1)} kg dry — reported`);
  } catch (err) {
    console.warn(`[sim] harvest for ${label} not reported: ${err instanceof Error ? err.message : err}`);
  }
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

  await signIn();

  const client = mqtt.connect(BROKER_URL, {
    clientId: `rtz-sim-${Math.random().toString(16).slice(2, 10)}`,
  });

  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  console.log(`[sim] connected to ${BROKER_URL}`);
  console.log(`[sim] driving ${ponds.length} ponds at ${SPEED}x`);

  const today = dayOfYear(new Date());
  const simClockStart = new Date(Date.now() - BACKDATE_DAYS * 86_400_000);
  console.log(`[sim] simulated clock starts ${simClockStart.toISOString()}`);

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

  const tickMs = 1000;

  /*
   * Everything mutable about the run lives here so the control server can
   * change it mid-flight. Faults are injected from the pond's CURRENT hour
   * rather than hour zero: the twin schedules them against its own elapsed
   * clock, and a fault scheduled in the past would never fire.
   */
  const rig: Rig = {
    speed: SPEED,
    paused: false,
    simHour: 0,
    brokerUrl: BROKER_URL,
    ponds: twins.map((t): RigPond => ({
      id: t.meta.id,
      label: t.meta.label,
      get hoursLived() { return t.hoursLived; },
      faults: [] as ActiveFault[],
      latest: null,
      inject(kind: FaultKind, magnitude: number, durationHours: number) {
        const start = t.hoursLived;
        if (kind === 'mixer') t.pond.inject_pump_failure(start, durationHours);
        else if (kind === 'crash') t.pond.inject_crash(magnitude, start, durationHours);
        else t.pond.inject_overstatement(magnitude, start, durationHours);
        this.faults.push({
          kind, magnitude, startedAtSimHour: start, durationHours,
        });
      },
      harvest() {
        const dry = t.pond.harvest(0.45);
        void reportHarvest(t.meta.id, t.meta.label, dry, new Date());
        return dry;
      },
    })),
  };
  startControlServer(rig);

  let caughtUp = false;

  setInterval(() => {
    if (rig.paused) return;
    let hoursThisTick = Math.max(1, Math.round(rig.speed / (1000 / tickMs)));

    /*
     * Never publish a reading dated in the future.
     *
     * The rig backfills at `--speed` until the simulated clock reaches now,
     * then drops to real time — 12 days of history in half a minute, then a
     * live tail. Without the cap it sails past now, the API rejects every
     * reading as unbelievable, and the dashboard goes quiet mid-demo with no
     * obvious cause.
     */
    const hoursToNow = Math.floor(
      (Date.now() - (simClockStart.getTime() + rig.simHour * 3_600_000)) / 3_600_000,
    );
    if (hoursThisTick > hoursToNow) {
      hoursThisTick = Math.max(0, hoursToNow);
      if (!caughtUp && hoursThisTick === 0) {
        caughtUp = true;
        console.log(
          '[sim] caught up with the wall clock. From here it publishes one reading'
          + ' per pond per real hour, which looks static on a dashboard — restart'
          + ' with a larger --backdate to keep replaying.',
        );
      }
    }
    if (hoursThisTick === 0) return;

    for (const t of twins) {
      // One reading per simulated hour, each carrying its own timestamp. The
      // node in the field reports at its own cadence and the API stores what it
      // is told; batching an hour's worth into one message would flatten the
      // day-night cycle the models depend on.
      for (let h = 0; h < hoursThisTick; h += 1) {
        const reading = t.pond.step();
        t.hoursLived += 1;

        // Cadence and the reasoning behind it: see FEED_EVERY_DAYS above.
        if (t.hoursLived % (24 * FEED_EVERY_DAYS) === 0) {
          t.pond.harvest(0);
        }
        if (t.hoursLived % (24 * HARVEST_EVERY_DAYS) === 0) {
          const dry = t.pond.harvest(HARVEST_FRACTION);
          void reportHarvest(
            t.meta.id, t.meta.label, dry,
            new Date(simClockStart.getTime() + (rig.simHour + h) * 3_600_000),
          );
        }

        const telemetry = {
          ph: round(reading.ph, 2),
          dissolvedOxygenMgL: round(reading.dissolved_oxygen_mg_l, 2),
          opticalDensity: round(reading.optical_density, 3),
          temperatureC: round(reading.temperature_c, 2),
          co2UptakeKg: round(reading.reported_co2_kg, 4),
        };
        // Kept so `GET /state` can show what the rig last said about each pond
        // without anyone having to subscribe to the broker to find out.
        const rigPond = rig.ponds.find((x) => x.id === t.meta.id);
        if (rigPond) rigPond.latest = telemetry;

        client.publish(`${TOPIC_PREFIX}/${t.meta.id}/telemetry`, JSON.stringify({
          pondId: t.meta.id,
          origin: 'sim',
          seq: rig.simHour + h,
          uptimeMs: (rig.simHour + h) * 3_600_000,
          observedAt: new Date(
            simClockStart.getTime() + (rig.simHour + h) * 3_600_000,
          ).toISOString(),
          ...telemetry,
        }));
      }
    }

    rig.simHour += hoursThisTick;
    if (rig.simHour % 24 === 0) {
      console.log(`[sim] simulated day ${rig.simHour / 24}`);
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
