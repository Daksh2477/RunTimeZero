/**
 * Postgres access. Raw SQL, explicit column lists, no ORM.
 *
 * Every query in this file names its columns. `SELECT *` is banned not out of
 * pedantry but because it silently changes shape when someone adds a column,
 * and the first place you notice is production.
 */

import pg from 'pg';
import type {
  IndependentObservation,
  ObservationChannel,
  TelemetryPoint,
} from '@rtz/types';

const { Pool } = pg;
export type Database = pg.Pool | pg.PoolClient;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/algacarbon',
  max: 10,
});

export async function healthcheck(db: Database = pool): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

/** A pond, with the geometry the ceiling calculation needs. */
export interface PondRow {
  id: string;
  siteId: string;
  label: string;
  areaM2: number;
  depthM: number;
  widthM: number;
  latDeg: number;
  lonDeg: number;
}

export async function getPond(pondId: string, db: Database = pool): Promise<PondRow | null> {
  const { rows } = await db.query(
    `SELECT p.id, p.site_id, p.label, p.area_m2, p.depth_m, p.width_m,
            s.lat, s.lon
       FROM ponds p
       JOIN sites s ON s.id = p.site_id
      WHERE p.id = $1`,
    [pondId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    siteId: r.site_id,
    label: r.label,
    areaM2: Number(r.area_m2),
    depthM: Number(r.depth_m),
    widthM: Number(r.width_m),
    latDeg: Number(r.lat),
    lonDeg: Number(r.lon),
  };
}

/**
 * Insert one telemetry reading.
 *
 * APPEND-ONLY. There is deliberately no update or delete for this table: a
 * verification system that can rewrite its own inputs verifies nothing. A
 * later reading supersedes an earlier one; the original stays.
 */
export async function insertTelemetry(
  t: Omit<TelemetryPoint, 'id'>,
  db: Database = pool,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO telemetry
       (pond_id, observed_at, source, co2_uptake_kg, ph,
        dissolved_oxygen_mgl, temperature_c, optical_density, energy_kwh)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      t.pondId,
      t.observedAt,
      t.source,
      t.co2UptakeKg,
      t.ph,
      t.dissolvedOxygenMgL,
      t.temperatureC,
      t.opticalDensity,
      t.energyKwh,
    ],
  );
  return rows[0]!.id;
}

/** Sum of claimed CO₂ over a window. This is the operator's assertion. */
export async function sumClaimedCo2Kg(
  pondId: string,
  windowStart: string,
  windowEnd: string,
  db: Database = pool,
): Promise<number> {
  const { rows } = await db.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(co2_uptake_kg), 0) AS total
       FROM telemetry
      WHERE pond_id = $1
        AND observed_at >= $2
        AND observed_at < $3`,
    [pondId, windowStart, windowEnd],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Mean water temperature over a window — the one measured input to the ceiling. */
export async function meanTemperatureC(
  pondId: string,
  windowStart: string,
  windowEnd: string,
  db: Database = pool,
): Promise<number | null> {
  const { rows } = await db.query<{ avg: string | null }>(
    `SELECT AVG(temperature_c) AS avg
       FROM telemetry
      WHERE pond_id = $1
        AND observed_at >= $2
        AND observed_at < $3
        AND temperature_c IS NOT NULL`,
    [pondId, windowStart, windowEnd],
  );
  const v = rows[0]?.avg;
  return v === null || v === undefined ? null : Number(v);
}

/** APPEND-ONLY, same rule as telemetry. */
export async function insertObservation(
  o: Omit<IndependentObservation, 'id'>,
  db: Database = pool,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO imagery_observations
       (pond_id, observed_at, channel, chlorophyll_index,
        measured_dry_mass_kg, source_ref, cloud_fraction)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      o.pondId,
      o.observedAt,
      o.channel,
      o.chlorophyllIndex,
      o.measuredDryMassKg,
      o.sourceRef,
      o.cloudFraction,
    ],
  );
  return rows[0]!.id;
}

export interface ObservationRow {
  id: string;
  observedAt: string;
  channel: ObservationChannel;
  chlorophyllIndex: number | null;
  measuredDryMassKg: number | null;
  sourceRef: string;
  cloudFraction: number | null;
}

export async function getObservations(
  pondId: string,
  windowStart: string,
  windowEnd: string,
  db: Database = pool,
): Promise<ObservationRow[]> {
  const { rows } = await db.query(
    `SELECT id, observed_at, channel, chlorophyll_index,
            measured_dry_mass_kg, source_ref, cloud_fraction
       FROM imagery_observations
      WHERE pond_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      ORDER BY observed_at ASC`,
    [pondId, windowStart, windowEnd],
  );
  return rows.map((r) => ({
    id: r.id,
    observedAt: r.observed_at.toISOString(),
    channel: r.channel,
    chlorophyllIndex: r.chlorophyll_index === null ? null : Number(r.chlorophyll_index),
    measuredDryMassKg:
      r.measured_dry_mass_kg === null ? null : Number(r.measured_dry_mass_kg),
    sourceRef: r.source_ref,
    cloudFraction: r.cloud_fraction === null ? null : Number(r.cloud_fraction),
  }));
}

/**
 * Dry mass harvested in a window.
 *
 * Essential, not optional. A harvest physically removes the biomass a
 * satellite would otherwise have seen, so production over a window is
 * (change in standing biomass) + (everything taken out). Ignore this and every
 * harvesting pond looks like it produced almost nothing.
 */
export async function sumHarvestedDryKg(
  pondId: string,
  windowStart: string,
  windowEnd: string,
  db: Database = pool,
): Promise<{ totalDryKg: number; count: number }> {
  const { rows } = await db.query<{ total: string | null; n: string }>(
    `SELECT COALESCE(SUM(dry_mass_kg), 0) AS total, COUNT(*) AS n
       FROM harvest_records
      WHERE pond_id = $1
        AND harvested_at >= $2
        AND harvested_at < $3`,
    [pondId, windowStart, windowEnd],
  );
  return {
    totalDryKg: Number(rows[0]?.total ?? 0),
    count: Number(rows[0]?.n ?? 0),
  };
}

export async function insertDivergenceCheck(c: {
  pondId: string;
  windowStart: string;
  windowEnd: string;
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  independentHighCo2Kg: number;
  ceilingCo2Kg: number;
  divergence: number;
  consecutiveSameDirection: number;
  verdict: string;
  creditableCo2Kg: number;
  reason: string;
  evidenceSnapshot?: unknown;
}, db: Database = pool): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO divergence_checks
       (pond_id, window_start, window_end, claimed_co2_kg, independent_co2_kg,
        independent_low_co2_kg, independent_high_co2_kg, ceiling_co2_kg,
        divergence, consecutive_same_direction, verdict, creditable_co2_kg, reason, evidence_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      c.pondId, c.windowStart, c.windowEnd, c.claimedCo2Kg, c.independentCo2Kg,
      c.independentLowCo2Kg, c.independentHighCo2Kg, c.ceilingCo2Kg,
      c.divergence, c.consecutiveSameDirection, c.verdict, c.creditableCo2Kg, c.reason,
      c.evidenceSnapshot ? JSON.stringify(c.evidenceSnapshot) : null,
    ],
  );
  return rows[0]!.id;
}

