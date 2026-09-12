/**
 * Pull real Sentinel-2 observations for every satellite-resolvable pond.
 *
 * Replaces the synthetic observations `replay.ts` writes with actual imagery.
 * Ponds too narrow for Sentinel-2 are skipped and reported, not silently
 * dropped — a site quietly missing its independent channel would credit
 * nothing and nobody would know why.
 *
 *   npm run ingest:sentinel
 *
 * Needs COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET. Free account at
 * dataspace.copernicus.eu. Without them the system still runs on `npm run
 * replay` fixtures.
 */

import pg from 'pg';
import {
  fetchNdciSeries,
  getAccessToken,
  MIN_RESOLVABLE_WIDTH_M,
} from '../apps/api/src/ingest/sentinel.ts';

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql:///algacarbon?host=/var/run/postgresql',
});

const DAYS = Number(process.env.INGEST_DAYS ?? 30);

async function main() {
  // Check credentials once. Without this the loop below retries the token
  // fetch per pond and prints the same error seven times, which buries the
  // one line that actually tells you what to do.
  try {
    await getAccessToken();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  }

  const { rows: ponds } = await pool.query(
    `SELECT p.id, p.label, p.width_m, p.length_m, s.lat, s.lon
       FROM ponds p JOIN sites s ON s.id = p.site_id
      WHERE p.active ORDER BY p.label`,
  );

  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86_400_000);
  let written = 0;
  const skipped: string[] = [];

  for (const p of ponds) {
    if (Number(p.width_m) < MIN_RESOLVABLE_WIDTH_M) {
      skipped.push(`${p.label} (${p.width_m} m wide)`);
      continue;
    }

    try {
      const series = await fetchNdciSeries({
        lat: Number(p.lat),
        lon: Number(p.lon),
        widthM: Number(p.width_m),
        lengthM: Number(p.length_m),
        from,
        to,
      });

      for (const o of series) {
        // Append-only, and idempotent on (pond, source_ref): re-running must
        // not duplicate a pass we already hold.
        await pool.query(
          `INSERT INTO imagery_observations
             (pond_id, observed_at, channel, chlorophyll_index,
              measured_dry_mass_kg, source_ref, cloud_fraction)
           SELECT $1, $2, 'sentinel2', $3, NULL, $4, $5
            WHERE NOT EXISTS (
              SELECT 1 FROM imagery_observations
               WHERE pond_id = $1 AND source_ref = $4)`,
          [p.id, o.observedAt, o.ndci, o.sourceRef, o.cloudFraction],
        );
        written += 1;
      }
      console.log(`  ${p.label.padEnd(6)} ${series.length} usable passes`);
    } catch (err) {
      console.error(
        `  ${p.label.padEnd(6)} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (skipped.length > 0) {
    console.log(
      `\nskipped, too narrow for Sentinel-2: ${skipped.join(', ')}` +
        `\nthese ponds need drone or weighbridge evidence — see docs/DECISIONS.md #3`,
    );
  }
  console.log(`\n${written} observations written`);
  await pool.end();
}

main().catch((err) => {
  console.error('ingest failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
