/**
 * Fleet and pond-detail assembly.
 *
 * The fleet board's job is to rank attention, not to list ponds. An operator
 * with twelve ponds does not want twelve equal tiles — they want to know which
 * one to walk to first. So every row carries a verdict, an advisory count and
 * a yield ratio, and the console sorts on those.
 */

import { pool, type PondRow } from '../db/client.ts';
import { buildAdvisories, type Advisory } from './advisory.ts';
import type { TelemetryPoint } from '@rtz/types';

import { physics_ceiling_co2_kg } from '../../../../packages/physics/pkg/rtz_physics.js';

export interface FleetPond {
  id: string;
  label: string;
  areaM2: number;
  widthM: number;
  /** False below ~40 m — the pond is narrower than two clean Sentinel-2 pixels. */
  satelliteResolvable: boolean;
  verdict: string | null;
  divergence: number | null;
  claimedCo2Kg: number | null;
  creditableCo2Kg: number | null;
  lastReadingAt: string | null;
  advisoryCount: number;
  worstSeverity: string | null;
}

export interface FleetSite {
  id: string;
  name: string;
  tier: string;
  hostIndustry: string;
  lat: number;
  lon: number;
  totalAreaM2: number;
  ponds: FleetPond[];
}

export async function getFleet(): Promise<FleetSite[]> {
  const { rows: siteRows } = await pool.query(
    `SELECT id, name, tier, host_industry, lat, lon, total_area_m2
       FROM sites ORDER BY total_area_m2 DESC`,
  );

  const { rows: pondRows } = await pool.query(
    `SELECT p.id, p.site_id, p.label, p.area_m2, p.width_m,
            d.verdict, d.divergence, d.claimed_co2_kg, d.creditable_co2_kg,
            (SELECT MAX(observed_at) FROM telemetry t WHERE t.pond_id = p.id) AS last_reading
       FROM ponds p
       LEFT JOIN LATERAL (
         SELECT verdict, divergence, claimed_co2_kg, creditable_co2_kg
           FROM divergence_checks dc
          WHERE dc.pond_id = p.id
          ORDER BY dc.window_end DESC
          LIMIT 1
       ) d ON true
      WHERE p.active
      ORDER BY p.label`,
  );

  // Advisories need a telemetry window per pond, so they are computed here
  // rather than in SQL. Seven ponds makes this cheap; if the fleet grows past
  // a few dozen this becomes a batched query.
  const advisoryByPond = new Map<string, Advisory[]>();
  for (const p of pondRows) {
    const recent = await recentTelemetry(p.id, 48);
    if (recent.length < 2) continue;
    advisoryByPond.set(
      p.id,
      buildAdvisories({
        recent,
        standingBiomassKg: estimateStandingKg(recent, Number(p.area_m2)),
        forecastYieldKg: 0,
        actualYield7dKg: 0,
      }),
    );
  }

  return siteRows.map((s) => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    hostIndustry: s.host_industry,
    lat: Number(s.lat),
    lon: Number(s.lon),
    totalAreaM2: Number(s.total_area_m2),
    ponds: pondRows
      .filter((p) => p.site_id === s.id)
      .map((p) => {
        const advisories = advisoryByPond.get(p.id) ?? [];
        return {
          id: p.id,
          label: p.label,
          areaM2: Number(p.area_m2),
          widthM: Number(p.width_m),
          satelliteResolvable: Number(p.width_m) >= 40,
          verdict: p.verdict ?? null,
          divergence: p.divergence === null ? null : Number(p.divergence),
          claimedCo2Kg: p.claimed_co2_kg === null ? null : Number(p.claimed_co2_kg),
          creditableCo2Kg:
            p.creditable_co2_kg === null ? null : Number(p.creditable_co2_kg),
          lastReadingAt: p.last_reading ? p.last_reading.toISOString() : null,
          advisoryCount: advisories.length,
          worstSeverity: advisories[0]?.severity ?? null,
        };
      }),
  }));
}

export interface PondDetail {
  pond: PondRow & { tier: string; siteName: string };
  telemetry: TelemetryPoint[];
  observations: {
    observedAt: string;
    channel: string;
    chlorophyllIndex: number | null;
    measuredDryMassKg: number | null;
    sourceRef: string;
  }[];
  harvests: { harvestedAt: string; dryMassKg: number; ref: string | null }[];
  advisories: Advisory[];
  latestCheck: Record<string, unknown> | null;
  ceilingCo2Kg: number;
}

export async function getPondDetail(pondId: string): Promise<PondDetail | null> {
  const { rows } = await pool.query(
    `SELECT p.id, p.site_id, p.label, p.area_m2, p.depth_m, p.width_m,
            s.lat, s.lon, s.tier, s.name AS site_name
       FROM ponds p JOIN sites s ON s.id = p.site_id
      WHERE p.id = $1`,
    [pondId],
  );
  const r = rows[0];
  if (!r) return null;

  const pond = {
    id: r.id,
    siteId: r.site_id,
    label: r.label,
    areaM2: Number(r.area_m2),
    depthM: Number(r.depth_m),
    widthM: Number(r.width_m),
    latDeg: Number(r.lat),
    lonDeg: Number(r.lon),
    tier: r.tier,
    siteName: r.site_name,
  };

  const telemetry = await recentTelemetry(pondId, 24 * 14);

  const { rows: obs } = await pool.query(
    `SELECT observed_at, channel, chlorophyll_index, measured_dry_mass_kg, source_ref
       FROM imagery_observations WHERE pond_id = $1 ORDER BY observed_at ASC`,
    [pondId],
  );

  const { rows: harvests } = await pool.query(
    `SELECT harvested_at, dry_mass_kg, weighbridge_ref
       FROM harvest_records WHERE pond_id = $1 ORDER BY harvested_at ASC`,
    [pondId],
  );

  const { rows: checks } = await pool.query(
    `SELECT id, claimed_co2_kg, independent_co2_kg, independent_low_co2_kg,
            independent_high_co2_kg, ceiling_co2_kg, divergence, verdict,
            creditable_co2_kg, reason, window_start, window_end
       FROM divergence_checks WHERE pond_id = $1
      ORDER BY window_end DESC LIMIT 1`,
    [pondId],
  );

  const standingKg = estimateStandingKg(telemetry, pond.areaM2);
  const harvested7d = harvests
    .filter((h) => Date.now() - h.harvested_at.getTime() < 7 * 86_400_000)
    .reduce((s, h) => s + Number(h.dry_mass_kg), 0);

  const ceilingCo2Kg: number = physics_ceiling_co2_kg(
    pond.latDeg, pond.areaM2, pond.depthM,
    Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000) - 7,
    7,
    meanTemp(telemetry) ?? 30,
  );

  return {
    pond,
    telemetry,
    observations: obs.map((o) => ({
      observedAt: o.observed_at.toISOString(),
      channel: o.channel,
      chlorophyllIndex: o.chlorophyll_index === null ? null : Number(o.chlorophyll_index),
      measuredDryMassKg:
        o.measured_dry_mass_kg === null ? null : Number(o.measured_dry_mass_kg),
      sourceRef: o.source_ref,
    })),
    harvests: harvests.map((h) => ({
      harvestedAt: h.harvested_at.toISOString(),
      dryMassKg: Number(h.dry_mass_kg),
      ref: h.weighbridge_ref,
    })),
    advisories: buildAdvisories({
      recent: telemetry.slice(-48),
      standingBiomassKg: standingKg,
      // 7-day physics forecast, converted back from CO2 to biomass.
      forecastYieldKg: ceilingCo2Kg / 1.83 / 3,
      actualYield7dKg: harvested7d,
      context: {
        depthM: pond.depthM,
        areaM2: pond.areaM2,
        // Ordered ascending, so the last row is the most recent cut.
        hoursSinceHarvest: harvests.length
          ? (Date.now() - harvests[harvests.length - 1]!.harvested_at.getTime()) / 3_600_000
          : 24 * 14,
      },
    }),
    latestCheck: checks[0]
      ? Object.fromEntries(
          Object.entries(checks[0]).map(([k, v]) => [
            k,
            v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : Number(v),
          ]),
        )
      : null,
    ceilingCo2Kg,
  };
}

async function recentTelemetry(pondId: string, limit: number): Promise<TelemetryPoint[]> {
  const { rows } = await pool.query(
    `SELECT id, pond_id, observed_at, source, co2_uptake_kg, ph,
            dissolved_oxygen_mgl, temperature_c, optical_density, energy_kwh
       FROM telemetry WHERE pond_id = $1
      ORDER BY observed_at DESC LIMIT $2`,
    [pondId, limit],
  );
  return rows
    .map((r) => ({
      id: r.id,
      pondId: r.pond_id,
      observedAt: r.observed_at.toISOString(),
      source: r.source,
      co2UptakeKg: r.co2_uptake_kg === null ? null : Number(r.co2_uptake_kg),
      ph: r.ph === null ? null : Number(r.ph),
      dissolvedOxygenMgL: r.dissolved_oxygen_mgl === null ? null : Number(r.dissolved_oxygen_mgl),
      temperatureC: r.temperature_c === null ? null : Number(r.temperature_c),
      opticalDensity: r.optical_density === null ? null : Number(r.optical_density),
      energyKwh: r.energy_kwh === null ? null : Number(r.energy_kwh),
    }))
    .reverse();
}

/** Standing biomass from optical density — crude, but it is what the operator sees. */
function estimateStandingKg(t: TelemetryPoint[], areaM2: number): number {
  const last = t[t.length - 1];
  if (!last?.opticalDensity) return 0;
  const gPerL = last.opticalDensity / 0.9;
  return (gPerL * areaM2 * 0.3 * 1000) / 1000;
}

function meanTemp(t: TelemetryPoint[]): number | null {
  const vals = t.map((x) => x.temperatureC).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
