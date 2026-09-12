/**
 * Demo market: several accounts trading what the sites actually produced.
 *
 * Quantities come from the database, never from here — a buyer can only
 * retire credit a batch really issued and only order a harvest that was really
 * weighed. What this script invents is the trading itself: who bought, when,
 * and at what price. Those rows are marked (demo account ids, `@demo.local`
 * emails) and the script deletes its own previous run before writing, so it is
 * safe to re-run.
 *
 * Credit prices walk inside ₹850–2,500 / tCO2, roughly the $10–30 band that
 * durable nature-based removals traded at in voluntary markets. India's CCTS
 * has no traded price yet, so there is no domestic series to replay.
 * Produce prices start from each grade's farm-gate band in produce-service.ts.
 *
 *   npm run db:market
 */

import { pool } from '../apps/api/src/db/client.ts';
import { hashPassword } from '../apps/api/src/services/auth.ts';

const PASSWORD = 'demo1234';
const DAY = 86_400_000;

// Deterministic, so two runs tell the same story.
let seed = 20260913;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const OPERATORS: Record<string, string> = {
  'naroda-ops': 'Naroda CETP — Ahmedabad',
  'surat-ops': 'Surat Textile Effluent Works',
  'bhavnagar-farmer': 'Bhavnagar Smallholder Plot',
  'anand-coop': 'Anand Dairy Co-op',
};
const BUYERS = ['mill-esg-desk', 'feed-mill-buyer'];
const INVESTORS = ['green-fund', 'angel-investor'];

async function account(username: string, role: string, siteId: string | null): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO accounts (username, password_hash, role, site_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, site_id = EXCLUDED.site_id
     RETURNING id`,
    [username, await hashPassword(PASSWORD), role, siteId],
  );
  return rows[0].id;
}

async function main(): Promise<void> {
  const { rows: sites } = await pool.query<{ id: string; name: string }>('SELECT id, name FROM sites');
  const siteByName = new Map(sites.map((s) => [s.name, s.id]));

  for (const [user, siteName] of Object.entries(OPERATORS)) {
    await account(user, 'operator', siteByName.get(siteName) ?? null);
  }
  const buyerIds = await Promise.all(BUYERS.map((u) => account(u, 'buyer', null)));
  const investorIds = await Promise.all(INVESTORS.map((u) => account(u, 'buyer', null)));
  const demoIds = [...buyerIds, ...investorIds];

  // Undo the previous run.
  await pool.query('DELETE FROM retirements WHERE account_id = ANY($1)', [demoIds]);
  const { rows: touched } = await pool.query(
    'DELETE FROM produce_orders WHERE account_id = ANY($1) RETURNING harvest_id', [demoIds],
  );
  await pool.query(
    `UPDATE harvest_records h SET sold_kg = COALESCE(
       (SELECT SUM(o.kg) FROM produce_orders o WHERE o.harvest_id = h.id), 0)
      WHERE h.id = ANY($1)`,
    [touched.map((t) => t.harvest_id)],
  );
  await pool.query(`DELETE FROM investment_listings WHERE contact_email LIKE '%@demo.local'`);
  await pool.query(`DELETE FROM investor_enquiries WHERE investor_email LIKE '%@demo.local'`);

  // --- credits: retire up to ~60% of each batch, spread from issue to today.
  const { rows: batches } = await pool.query(
    `SELECT b.id, b.period_end, b.creditable_co2_kg,
            COALESCE((SELECT SUM(kg) FROM retirements r WHERE r.batch_id = b.id), 0) AS retired
       FROM batches b WHERE b.listed`,
  );
  let credits = 0;
  let price = 1300;
  for (const b of batches) {
    let left = (Number(b.creditable_co2_kg) - Number(b.retired)) * 0.6;
    // Nobody can retire credit before the period that produced it has closed.
    const start = Math.min(b.period_end.getTime(), Date.now() - DAY);
    for (let i = 0; i < 12 && left > 1; i++) {
      price = Math.min(2500, Math.max(850, price * (1 + (rand() - 0.45) * 0.08)));
      const kg = Math.min(left, left * (0.1 + rand() * 0.25));
      left -= kg;
      const at = new Date(start + ((Date.now() - start) * (i + rand())) / 12);
      await pool.query(
        `INSERT INTO retirements (batch_id, kg, beneficiary, inr_per_tonne, account_id, retired_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [b.id, kg, i % 2 ? 'Vapi Dyeing Mill (scope 1)' : 'Kheda Paper Mill (scope 1)',
          Math.round(price), buyerIds[0], at],
      );
      credits++;
    }
  }

  // --- produce: list what is unlisted, then fill part of it.
  await pool.query(
    `UPDATE harvest_records SET listed_kg = ROUND((dry_mass_kg * 0.7)::numeric, 1)
      WHERE listed_kg IS NULL AND dry_mass_kg > 0`,
  );
  const { rows: harvests } = await pool.query(
    `SELECT id, harvested_at, listed_kg, sold_kg, asking_inr_per_kg FROM harvest_records
      WHERE listed_kg > sold_kg`,
  );
  let orders = 0;
  for (const h of harvests) {
    const base = h.asking_inr_per_kg === null ? 240 : Number(h.asking_inr_per_kg);
    let left = (Number(h.listed_kg) - Number(h.sold_kg)) * (0.3 + rand() * 0.5);
    const start = h.harvested_at.getTime();
    for (let i = 0; i < 3 && left > 1; i++) {
      const kg = Math.round(left * (0.3 + rand() * 0.4));
      if (kg < 1) break;
      left -= kg;
      await pool.query(
        `INSERT INTO produce_orders (harvest_id, buyer_name, buyer_email, kg, inr_per_kg, account_id, placed_at)
         VALUES ($1, 'Feed mill buyer', 'feed@demo.local', $2, $3, $4, $5)`,
        [h.id, kg, Math.round(base * (0.9 + rand() * 0.2)), buyerIds[1],
          new Date(start + (Date.now() - start) * rand())],
      );
      await pool.query('UPDATE harvest_records SET sold_kg = sold_kg + $2 WHERE id = $1', [h.id, kg]);
      orders++;
    }
  }

  // --- investment: every site pitches, both investors ask about the best two.
  for (const s of sites) {
    const { rows } = await pool.query(
      `INSERT INTO investment_listings
         (site_id, headline, pitch, seeking_inr, use_of_funds, contact_name, contact_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [s.id, `Expand ${s.name}`, 'Verified history on AlgaCarbon; figures on the listing come from checks, not from us.',
        Math.round((5 + rand() * 40)) * 100_000, 'More raceway area, a harvest screen and a solar dryer.',
        'Site operator', `ops.${s.id.slice(0, 6)}@demo.local`],
    );
    if (rand() > 0.4) {
      await pool.query(
        `INSERT INTO investor_enquiries (listing_id, investor_name, investor_email, organisation, message)
         VALUES ($1, 'Green Fund analyst', 'fund@demo.local', 'Green Fund (demo)', 'Can we see 12 months of checks?')`,
        [rows[0].id],
      );
    }
  }

  console.log(`accounts: ${Object.keys(OPERATORS).join(', ')}, ${[...BUYERS, ...INVESTORS].join(', ')} / ${PASSWORD}`);
  console.log(`retirements ${credits}, produce orders ${orders}, investment listings ${sites.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
