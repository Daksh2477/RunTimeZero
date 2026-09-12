/**
 * Deterministic 14-day backfill — both streams from ONE twin run.
 *
 * `sim-driver.ts` streams live telemetry over MQTT; this fills in the history
 * the console and the engine need in order to have anything to show. The two
 * must agree, and the only way to guarantee that is to generate both from the
 * same twin, over the same window, in the same pass. Running two separate
 * simulations produced a 3x mismatch between claim and evidence — not because
 * anyone was lying, but because they were describing different fortnights.
 *
 * ON THE GROUND-TRUTH BOUNDARY
 *
 * This script writes to `telemetry` directly rather than going through MQTT.
 * That is safe, and here is why: every value it writes has already passed
 * through `observe()` in the Rust crate, so it is noisy, quantised, and carries
 * whatever operator bias was injected. The true cumulative CO2 never leaves the
 * twin. The database holds observations, never truth — which is the invariant
 * that actually matters (docs/DECISIONS.md #6).
 *
 *   npm run replay
 */

import pg from 'pg';
import { WasmPond } from '../packages/physics/pkg/rtz_physics.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql:///algacarbon?host=/var/run/postgresql',
});

const DAYS = 14;
const HARVEST_EVERY_DAYS = 7;
const HARVEST_FRACTION = 0.45;

/** Which pond overstates, and by how much. Targeted by label, so it's reproducible. */
const FRAUD_POND = process.env.SIM_FRAUD_POND ?? 'RW-02';
const FRAUD_FACTOR = Number(process.env.SIM_FRAUD_FACTOR ?? 1.3);
const CRASH_POND = process.env.SIM_CRASH_POND ?? 'TX-A';

/** 1-sigma relative error of each independent channel. */
const CHANNEL_SIGMA = { sentinel2: 0.45, drone: 0.22, weighbridge: 0.04 } as const;
const CHANNEL_INTERVAL_DAYS = { sentinel2: 5, drone: 7, weighbridge: 7 } as const;
type Channel = keyof typeof CHANNEL_SIGMA;

function channelForTier(tier: string): Channel {
  if (tier === 'smallholder') return 'weighbridge';
  if (tier === 'small') return 'drone';
  return 'sentinel2';
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

function biomassGPerLToNdci(gPerL: number): number {
  return Math.max(0, Math.min(1, gPerL / 2.5));
}

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

async function main() {
  const { rows: ponds } = await pool.query(
    `SELECT p.id, p.label, p.area_m2, p.depth_m, s.lat, s.tier
       FROM ponds p JOIN sites s ON s.id = p.site_id
      WHERE p.active ORDER BY s.name, p.label`,
  );
  if (ponds.length === 0) {
    console.error('no ponds — run `npm run db:seed` first');
    process.exit(1);
  }

  await pool.query('DELETE FROM divergence_checks');
  await pool.query('DELETE FROM telemetry');
  await pool.query('DELETE FROM imagery_observations');
  await pool.query('DELETE FROM harvest_records');

  const startDay = dayOfYear(new Date()) - DAYS;
  const t0 = Date.now() - DAYS * 86_400_000;

  for (const [i, p] of ponds.entries()) {
    const channel = channelForTier(p.tier);
    const rng = seeded(9000 + i);
    const areaM2 = Number(p.area_m2);
    const depthM = Number(p.depth_m);
    const volumeL = areaM2 * depthM * 1000;

    const twin = new WasmPond(Number(p.lat), areaM2, depthM, BigInt(1000 + i), startDay);

    if (p.label === FRAUD_POND) {
      twin.inject_overstatement(FRAUD_FACTOR, 0, 24 * DAYS);
    }
    if (p.label === CRASH_POND) {
      twin.inject_crash(0.9, 24 * 9, 24 * 3);
    }

    let claimedTotal = 0;
    const telemetryRows: unknown[][] = [];

    for (let day = 0; day < DAYS; day += 1) {
      // Six readings a day — every four hours, like a real logger.
      let dayCo2 = 0;
      let last: any = null;
      for (let h = 0; h < 24; h += 1) {
        last = twin.step();
        dayCo2 += last.reported_co2_kg;

        if ((h + 1) % 4 === 0) {
          const at = new Date(t0 + day * 86_400_000 + h * 3_600_000).toISOString();
          telemetryRows.push([
            p.id, at, 'simulated',
            // CO2 is attributed to the last reading of each day so the daily
            // total is preserved without double counting.
            h === 23 ? Number(dayCo2.toFixed(4)) : null,
            Number(last.ph.toFixed(2)),
            Number(last.dissolved_oxygen_mg_l.toFixed(2)),
            Number(last.temperature_c.toFixed(2)),
            Number(last.optical_density.toFixed(3)),
          ]);
        }
      }
      claimedTotal += dayCo2;

      // Independent observation, on that channel's revisit cadence — plus one
      // on the final day. Without a recent observation, growth accumulated
      // since the last pass is invisible: it is neither in the standing-biomass
      // delta nor in a harvest record, so an honest pond reads as overstating.
      // Any real deployment has a recent pass; the demo should too.
      const isLastDay = day === DAYS - 1;
      if (day % CHANNEL_INTERVAL_DAYS[channel] === 0 || isLastDay) {
        const observedKg = Math.max(
          0,
          twin.standing_biomass_kg() * (1 + gaussian(rng) * CHANNEL_SIGMA[channel]),
        );
        const at = new Date(t0 + day * 86_400_000 + 10 * 3_600_000).toISOString();
        if (channel === 'weighbridge') {
          await pool.query(
            `INSERT INTO imagery_observations
               (pond_id, observed_at, channel, chlorophyll_index, measured_dry_mass_kg, source_ref, cloud_fraction)
             VALUES ($1,$2,'weighbridge',NULL,$3,$4,NULL)`,
            [p.id, at, observedKg.toFixed(2), `WB-${4000 + i * 10 + day}`],
          );
        } else {
          await pool.query(
            `INSERT INTO imagery_observations
               (pond_id, observed_at, channel, chlorophyll_index, measured_dry_mass_kg, source_ref, cloud_fraction)
             VALUES ($1,$2,$3,$4,NULL,$5,$6)`,
            [
              p.id, at, channel,
              biomassGPerLToNdci((observedKg * 1000) / volumeL).toFixed(4),
              channel === 'sentinel2' ? `S2A_MSIL2A_${at.slice(0, 10)}` : `DRONE_${at.slice(0, 10)}`,
              channel === 'sentinel2' ? (rng() * 0.2).toFixed(3) : null,
            ],
          );
        }
      }

      // Harvest removes the evidence imagery would have seen, so it is weighed
      // and recorded. Production = standing change + everything taken out.
      if ((day + 1) % HARVEST_EVERY_DAYS === 0) {
        const removedKg = twin.harvest(HARVEST_FRACTION);
        const weighed = Math.max(0, removedKg * (1 + gaussian(rng) * CHANNEL_SIGMA.weighbridge));
        await pool.query(
          `INSERT INTO harvest_records
             (pond_id, harvested_at, wet_mass_kg, moisture_frac, weighbridge_ref)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            p.id,
            new Date(t0 + day * 86_400_000 + 15 * 3_600_000).toISOString(),
            (weighed / 0.12).toFixed(2),
            0.88,
            `WB-${7000 + i * 10 + day}`,
          ],
        );
      }
    }

    for (const r of telemetryRows) {
      await pool.query(
        `INSERT INTO telemetry
           (pond_id, observed_at, source, co2_uptake_kg, ph, dissolved_oxygen_mgl, temperature_c, optical_density)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        r,
      );
    }

    const tag =
      p.label === FRAUD_POND ? '  ← overstating' : p.label === CRASH_POND ? '  ← crashes' : '';
    console.log(
      `  ${p.label.padEnd(6)} ${channel.padEnd(11)} claimed ${claimedTotal.toFixed(0).padStart(6)} kg CO2${tag}`,
    );
  }

  console.log(`\nreplayed ${DAYS} days across ${ponds.length} ponds`);
  await pool.end();
}

main().catch((err) => {
  console.error('replay failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
