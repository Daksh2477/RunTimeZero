/**
 * Selling pond data to researchers.
 *
 * THE ETHICAL SHAPE OF THIS, WHICH DRIVES THE DESIGN
 *
 * The data describes real farms. A bad season is commercially sensitive, and
 * a dataset naming a site that crashed three times is a liability for that
 * operator. So three rules are structural rather than policy:
 *
 *   1. Nothing is licensed without a `data_consent` row. Opt in, not out.
 *   2. Identity is separate from consent. A site can share its numbers while
 *      staying "a 4 ha CETP site in Gujarat", and most will want to.
 *   3. The farm takes a revenue share, because the farm generated the data.
 *
 * Buyers get a scoped, expiring API key rather than a file. A CSV cannot be
 * withdrawn once downloaded; a key can, which is what makes rule 1 mean
 * something after the sale rather than only at it.
 */

import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/client.ts';

export interface Dataset {
  id: string;
  name: string;
  description: string;
  /** What a buyer is actually getting, in plain terms. */
  contents: string[];
  rows: number;
  sites: number;
  priceInr: number;
  /** Why this is worth money — the honest version. */
  caveat: string;
}

const PRICE_PER_1K_ROWS_INR = 400;

/**
 * The catalogue, with real counts.
 *
 * Counts are queried rather than stated, because a catalogue that advertises
 * "19 months of data" while holding three weeks is the same overstatement
 * problem as an inflated carbon claim.
 */
export async function catalogue(): Promise<Dataset[]> {
  const { rows: consented } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM data_consent WHERE withdrawn_at IS NULL`,
  );
  const siteCount = consented[0]?.n ?? 0;

  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM telemetry t
          JOIN ponds p ON p.id = t.pond_id
          JOIN data_consent dc ON dc.site_id = p.site_id AND dc.withdrawn_at IS NULL
       ) AS telemetry_rows,
       (SELECT COUNT(*)::int FROM divergence_checks d
          JOIN ponds p ON p.id = d.pond_id
          JOIN data_consent dc ON dc.site_id = p.site_id AND dc.withdrawn_at IS NULL
       ) AS check_rows,
       (SELECT COUNT(*)::int FROM harvest_records h
          JOIN ponds p ON p.id = h.pond_id
          JOIN data_consent dc ON dc.site_id = p.site_id AND dc.withdrawn_at IS NULL
       ) AS harvest_rows`,
  );
  const c = counts.rows[0];
  const price = (rows: number) =>
    Math.round((rows / 1000) * PRICE_PER_1K_ROWS_INR);

  return [
    {
      id: 'telemetry',
      name: 'Pond telemetry',
      description:
        'Hourly pH, dissolved oxygen, temperature and optical density from '
        + 'working ponds, with the energy meter where one is fitted.',
      contents: ['pH', 'dissolved oxygen', 'temperature', 'optical density', 'energy'],
      rows: c.telemetry_rows,
      sites: siteCount,
      priceInr: price(c.telemetry_rows),
      caveat:
        'Readings are from production ponds, so they include sensor dropouts '
        + 'and fouling. We do not clean them — the gaps are part of the record.',
    },
    {
      id: 'reconciliation',
      name: 'Claim versus evidence',
      description:
        'Every verification window: what the operator claimed, what the '
        + 'independent channel showed, the physics ceiling, and what we credited.',
      contents: ['claimed CO₂', 'independent estimate', 'ceiling', 'credited', 'verdict'],
      rows: c.check_rows,
      sites: siteCount,
      priceInr: price(c.check_rows) * 3,
      caveat:
        'This is the only dataset here that is genuinely rare. Most MRV '
        + 'providers never publish the gap between claim and evidence.',
    },
    {
      id: 'harvests',
      name: 'Weighed harvests',
      description: 'Weighbridge records with dry mass and disposition.',
      contents: ['dry mass', 'disposition', 'weighbridge reference'],
      rows: c.harvest_rows,
      sites: siteCount,
      priceInr: price(c.harvest_rows) * 2,
      caveat:
        'Ground truth for biomass, which is what makes the telemetry set '
        + 'trainable. Small — weighbridge events are rare compared to readings.',
    },
  ];
}

export interface LicenceArgs {
  buyerName: string;
  buyerEmail: string;
  institution?: string | null;
  purpose: string;
  dataset: string;
  months: number;
}

export interface IssuedLicence {
  id: string;
  dataset: string;
  priceInr: number;
  expiresAt: string;
  /** Shown once. Only its hash is stored. */
  apiKey: string;
}

export async function issueLicence(args: LicenceArgs): Promise<IssuedLicence> {
  const sets = await catalogue();
  const set = sets.find((s) => s.id === args.dataset);
  if (!set) throw Object.assign(new Error('No such dataset'), { status: 404 });
  if (set.rows === 0) {
    throw Object.assign(
      new Error(
        'No site has consented to share this dataset yet, so there is '
        + 'nothing to license. This is not an error — it is the consent '
        + 'model working.',
      ),
      { status: 409 },
    );
  }

  const apiKey = `rtz_${randomBytes(24).toString('hex')}`;
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const expires = new Date(Date.now() + args.months * 30 * 86_400_000);

  const { rows } = await pool.query(
    `INSERT INTO data_licences
       (buyer_name, buyer_email, institution, purpose, dataset, price_inr,
        api_key_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      args.buyerName.trim(), args.buyerEmail.trim(), args.institution ?? null,
      args.purpose.trim(), args.dataset, set.priceInr * args.months, hash, expires,
    ],
  );

  return {
    id: rows[0].id,
    dataset: set.name,
    priceInr: set.priceInr * args.months,
    expiresAt: expires.toISOString(),
    apiKey,
  };
}

/** Resolve a bearer key to a live licence, or null. */
export async function licenceFor(apiKey: string): Promise<{ dataset: string } | null> {
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const { rows } = await pool.query(
    `SELECT dataset FROM data_licences
      WHERE api_key_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hash],
  );
  return rows[0] ? { dataset: rows[0].dataset } : null;
}
