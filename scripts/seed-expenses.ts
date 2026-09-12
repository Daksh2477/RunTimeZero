/**
 * Generate the operating expense ledger from what each site actually did.
 *
 * Costs are DERIVED, not invented. Paddlewheel electricity comes from pond area
 * and the published 0.22–0.73 W/m² range; harvesting and drying come from the
 * mass actually recorded in `harvest_records`. That matters because the expense
 * panel exists to answer "where is my money going", and a number pulled from
 * nowhere answers nothing.
 *
 * The one finding this makes visible: growing algae is cheap, and getting it
 * out of the water is not. Mixing is roughly 69% of a raceway's utilities, but
 * harvesting an open-pond broth can reach 4.5 kWh per kg and thermal drying can
 * be ~30% of total production cost. The method chosen swings the total by an
 * order of magnitude — which is exactly the decision an operator should be
 * making with eyes open, before the concrete is poured.
 *
 *   npm run db:expenses
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql:///algacarbon?host=/var/run/postgresql',
});

/** Industrial tariff, INR per kWh. Gujarat HT industrial is around this. */
const TARIFF_INR_PER_KWH = 8;

/** Paddlewheel demand, W/m². Mid-range of the published 0.22–0.73. */
const PADDLEWHEEL_W_PER_M2 = 0.5;

/**
 * Harvesting energy, kWh per kg dry.
 *
 * Flocculation plus gravity settling sits near the bottom of this range and
 * centrifugation near the top. Sites are assigned by tier because a smallholder
 * is not buying a centrifuge.
 */
const HARVEST_KWH_PER_KG = { low: 0.35, high: 2.2 };

/** Solar drying is near free but weather-bound; thermal is not. */
const DRYING_KWH_PER_KG = { solar: 0.05, thermal: 1.1 };

const DAYS = 14;

interface SiteRow {
  id: string;
  name: string;
  tier: string;
  total_area_m2: string;
}

async function main() {
  const { rows: sites } = await pool.query<SiteRow>(
    `SELECT id, name, tier, total_area_m2 FROM sites ORDER BY total_area_m2 DESC`,
  );
  if (sites.length === 0) {
    console.error('no sites — run `npm run db:seed` first');
    process.exit(1);
  }

  await pool.query('DELETE FROM expenses');

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - DAYS * 86_400_000);

  for (const site of sites) {
    const areaM2 = Number(site.total_area_m2);

    const { rows: h } = await pool.query<{ dry: string | null }>(
      `SELECT COALESCE(SUM(hr.dry_mass_kg), 0) AS dry
         FROM harvest_records hr
         JOIN ponds p ON p.id = hr.pond_id
        WHERE p.site_id = $1 AND hr.harvested_at >= $2`,
      [site.id, periodStart.toISOString()],
    );
    const harvestedKg = Number(h[0]?.dry ?? 0);

    // A facility can justify a centrifuge; a smallholder settles and sun-dries.
    const mechanised = site.tier === 'facility' || site.tier === 'mid';
    const harvestKwhPerKg = mechanised ? HARVEST_KWH_PER_KG.high : HARVEST_KWH_PER_KG.low;
    const dryKwhPerKg = mechanised ? DRYING_KWH_PER_KG.thermal : DRYING_KWH_PER_KG.solar;

    const paddlewheelKwh = (PADDLEWHEEL_W_PER_M2 * areaM2 * 24 * DAYS) / 1000;
    // Influent and recirculation, roughly a fifth of mixing load.
    const pumpingKwh = paddlewheelKwh * 0.2;
    const harvestKwh = harvestedKg * harvestKwhPerKg;
    const dryingKwh = harvestedKg * dryKwhPerKg;

    // Labour scales sublinearly — one team covers a facility, and the whole
    // point of the fleet view is that it covers several ponds at once.
    const labourInr = 400 * DAYS * Math.max(1, Math.sqrt(areaM2 / 10_000));

    const lines: [string, number, number | null, string][] = [
      ['paddlewheel', paddlewheelKwh * TARIFF_INR_PER_KWH, paddlewheelKwh,
        `${PADDLEWHEEL_W_PER_M2} W/m² over ${areaM2.toLocaleString()} m², ${DAYS} days`],
      ['pumping', pumpingKwh * TARIFF_INR_PER_KWH, pumpingKwh,
        'influent, effluent and recirculation'],
      ['harvesting', harvestKwh * TARIFF_INR_PER_KWH, harvestKwh,
        `${harvestKwhPerKg} kWh/kg — ${mechanised ? 'centrifuge' : 'flocculation and settling'}`],
      ['drying', dryingKwh * TARIFF_INR_PER_KWH, dryingKwh,
        mechanised ? 'thermal drying' : 'solar drying, weather permitting'],
      // Zero, and that is the entire economic argument for wastewater siting.
      ['nutrients', 0, null, 'supplied free by the effluent'],
      ['co2', 0, null, 'atmospheric and effluent-borne; none purchased'],
      ['make_up_water', areaM2 * 0.4, null, 'evaporation replacement only'],
      ['labour', labourInr, null, `part-time, shared across ${site.tier} site`],
      ['maintenance', areaM2 * 0.9, null, 'bearings, liner repair, flocculant'],
      ['platform', DAYS * 45, null, 'AlgaCarbon monitoring'],
    ];

    for (const [category, amountInr, energyKwh, note] of lines) {
      await pool.query(
        `INSERT INTO expenses
           (site_id, period_start, period_end, category, amount_inr, energy_kwh, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          site.id,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          category,
          Math.round(amountInr),
          energyKwh === null ? null : Math.round(energyKwh),
          note,
        ],
      );
    }

    const total = lines.reduce((s, l) => s + l[1], 0);
    const separation = harvestKwh * TARIFF_INR_PER_KWH + dryingKwh * TARIFF_INR_PER_KWH;
    console.log(
      `  ${site.name.slice(0, 30).padEnd(32)} ₹${Math.round(total).toLocaleString('en-IN').padStart(9)}` +
        `   separation ${((separation / total) * 100).toFixed(0)}% of it`,
    );
  }

  console.log(`\nexpenses written for ${sites.length} sites over ${DAYS} days`);
  await pool.end();
}

main().catch((err) => {
  console.error('seed-expenses failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
