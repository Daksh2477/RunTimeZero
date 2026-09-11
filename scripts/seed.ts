/**
 * Seed the database with sites, ponds and independent observations.
 *
 * Creates four sites deliberately spanning all four verification tiers, so the
 * console shows the tier system doing real work rather than as a table in a
 * document. Each site is a plausible Indian effluent host.
 *
 *   npm run db:seed
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/algacarbon',
});

interface SeedSite {
  name: string;
  lat: number;
  lon: number;
  tier: 'smallholder' | 'small' | 'mid' | 'facility';
  hostIndustry: string;
  ponds: { label: string; areaM2: number; depthM: number; lengthM: number; widthM: number }[];
}

const SITES: SeedSite[] = [
  {
    // Big enough that Sentinel-2 resolves individual ponds — several clean
    // pixels across, which is the whole reason the facility tier exists.
    name: 'Naroda CETP — Ahmedabad',
    lat: 23.07,
    lon: 72.66,
    tier: 'facility',
    hostIndustry: 'cetp',
    ponds: [
      { label: 'RW-01', areaM2: 12000, depthM: 0.30, lengthM: 300, widthM: 40 },
      { label: 'RW-02', areaM2: 12000, depthM: 0.30, lengthM: 300, widthM: 40 },
      { label: 'RW-03', areaM2: 9000, depthM: 0.28, lengthM: 225, widthM: 40 },
    ],
  },
  {
    name: 'Surat Textile Effluent Works',
    lat: 21.17,
    lon: 72.83,
    tier: 'mid',
    hostIndustry: 'textile_dyeing',
    ponds: [
      { label: 'TX-A', areaM2: 4000, depthM: 0.30, lengthM: 100, widthM: 40 },
      { label: 'TX-B', areaM2: 4000, depthM: 0.30, lengthM: 100, widthM: 40 },
    ],
  },
  {
    // Under 40 m wide — satellite cannot resolve this, so it falls back to
    // drone imagery. This site exists to prove the fallback works.
    name: 'Anand Dairy Co-op',
    lat: 22.56,
    lon: 72.95,
    tier: 'small',
    hostIndustry: 'dairy_food',
    ponds: [{ label: 'DP-1', areaM2: 1200, depthM: 0.25, lengthM: 60, widthM: 20 }],
  },
  {
    // No instruments at all. Verified purely on weighbridge tickets, and still
    // earns credits — just at a wider band. See docs/DECISIONS.md #3.
    name: 'Bhavnagar Smallholder Plot',
    lat: 21.76,
    lon: 72.15,
    tier: 'smallholder',
    hostIndustry: 'none',
    ponds: [{ label: 'SH-1', areaM2: 400, depthM: 0.22, lengthM: 40, widthM: 10 }],
  },
];

async function seed() {
  console.log('seeding…');

  // Idempotent: wipe and rebuild. Safe because this only ever runs locally
  // against a dev database.
  await pool.query('TRUNCATE sites CASCADE');

  let pondCount = 0;

  for (const site of SITES) {
    const totalArea = site.ponds.reduce((s, p) => s + p.areaM2, 0);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO sites (name, lat, lon, timezone, tier, host_industry, total_area_m2)
       VALUES ($1, $2, $3, 'Asia/Kolkata', $4, $5, $6)
       RETURNING id`,
      [site.name, site.lat, site.lon, site.tier, site.hostIndustry, totalArea],
    );
    const siteId = rows[0]!.id;

    for (const p of site.ponds) {
      const { rows: pr } = await pool.query<{ id: string }>(
        `INSERT INTO ponds (site_id, label, area_m2, depth_m, length_m, width_m, strain, active)
         VALUES ($1, $2, $3, $4, $5, $6, 'spirulina', true)
         RETURNING id`,
        [siteId, p.label, p.areaM2, p.depthM, p.lengthM, p.widthM],
      );
      const pondId = pr[0]!.id;
      pondCount += 1;
      await seedObservations(pondId, site.tier, p.areaM2, p.depthM);
    }

    console.log(`  ${site.name} — ${site.ponds.length} pond(s), tier ${site.tier}`);
  }

  console.log(`done: ${SITES.length} sites, ${pondCount} ponds`);
  await pool.end();
}

/**
 * Independent observations for the last 14 days.
 *
 * Channel follows the tier — that mapping is the product, so the seed data has
 * to respect it rather than giving everyone satellite coverage.
 */
async function seedObservations(
  pondId: string,
  tier: string,
  areaM2: number,
  depthM: number,
) {
  const now = Date.now();
  const day = 86_400_000;

  if (tier === 'smallholder') {
    // Two weighbridge tickets — cruder in frequency, far stronger in kind.
    for (const daysAgo of [10, 3]) {
      const dryMass = (areaM2 * depthM * 1000 * 0.35) / 1000;
      await pool.query(
        `INSERT INTO imagery_observations
           (pond_id, observed_at, channel, chlorophyll_index,
            measured_dry_mass_kg, source_ref, cloud_fraction)
         VALUES ($1, $2, 'weighbridge', NULL, $3, $4, NULL)`,
        [
          pondId,
          new Date(now - daysAgo * day).toISOString(),
          dryMass.toFixed(1),
          `WB-${Math.floor(Math.random() * 9000 + 1000)}`,
        ],
      );
    }
    return;
  }

  const channel = tier === 'small' ? 'drone' : 'sentinel2';
  // Sentinel-2 revisits every ~5 days; a drone flies whenever you send it up.
  const intervalDays = channel === 'sentinel2' ? 5 : 7;

  for (let daysAgo = 14; daysAgo >= 0; daysAgo -= intervalDays) {
    // Rising chlorophyll across the window — a pond that is growing.
    const progress = (14 - daysAgo) / 14;
    const ndci = 0.08 + progress * 0.24;
    const cloud = channel === 'sentinel2' ? Math.random() * 0.25 : 0;

    await pool.query(
      `INSERT INTO imagery_observations
         (pond_id, observed_at, channel, chlorophyll_index,
          measured_dry_mass_kg, source_ref, cloud_fraction)
       VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
      [
        pondId,
        new Date(now - daysAgo * day).toISOString(),
        channel,
        ndci.toFixed(4),
        channel === 'sentinel2'
          ? `S2A_MSIL2A_${new Date(now - daysAgo * day).toISOString().slice(0, 10)}`
          : `DRONE_${new Date(now - daysAgo * day).toISOString().slice(0, 10)}`,
        cloud.toFixed(3),
      ],
    );
  }
}

seed().catch((err) => {
  console.error('seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
