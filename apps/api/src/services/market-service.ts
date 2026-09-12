/**
 * The buyer side: what is available, and retiring it.
 *
 * WHAT A BUYER ACTUALLY NEEDS TO SEE
 *
 * Most carbon marketplaces show a price and a project name. That is how
 * worthless credits get sold — the buyer has no way to tell a well-evidenced
 * tonne from a claimed one. So every listing here carries its evidence
 * quality in the same breath as its quantity: how far the operator's claim
 * diverged from the independent estimate, how it was verified, and whether
 * the report is anchored on chain.
 *
 * Retirement is one-way. Once retired, a tonne is claimed against somebody's
 * emissions and can never be sold again — which is the only thing that stops
 * the same tonne being sold repeatedly down a chain of brokers.
 */

import { pool } from '../db/client.ts';
import { retireCredits } from './chain.ts';

/** Default ask when a seller has not set one. Matches the simulator's rate. */
export const DEFAULT_CREDIT_INR_PER_TONNE = 1500;

export interface Listing {
  batchId: string;
  siteId: string;
  siteName: string;
  tier: string;
  hostIndustry: string;
  periodStart: string;
  periodEnd: string;
  disposition: string;
  dispositionEvidenceRef: string | null;
  issuedKg: number;
  retiredKg: number;
  availableKg: number;
  /** Basis points the claim exceeded what we could support. 0 is ideal. */
  divergenceBps: number;
  reportHash: string | null;
  anchored: boolean;
  txHash: string | null;
  listed: boolean;
  askingInrPerTonne: number;
}

const LISTING_SQL = `SELECT b.id, b.site_id, s.name AS site_name, s.tier, s.host_industry,
            b.period_start, b.period_end, b.disposition,
            b.disposition_evidence_ref, b.creditable_co2_kg, b.claimed_co2_kg,
            b.mrv_report_cid, b.tx_hash, b.listed, b.asking_inr_per_tonne,
            COALESCE((SELECT SUM(r.kg) FROM retirements r
                       WHERE r.batch_id = b.id), 0) AS retired_kg
       FROM batches b
       JOIN sites s ON s.id = b.site_id`;

export function toListing(r: any): Listing {
  const issued = Number(r.creditable_co2_kg);
  const retired = Number(r.retired_kg);
  const claimed = Number(r.claimed_co2_kg);
  return {
    batchId: r.id,
    siteId: r.site_id,
    siteName: r.site_name,
    tier: r.tier,
    hostIndustry: r.host_industry,
    periodStart: r.period_start.toISOString(),
    periodEnd: r.period_end.toISOString(),
    disposition: r.disposition,
    dispositionEvidenceRef: r.disposition_evidence_ref,
    issuedKg: issued,
    retiredKg: retired,
    availableKg: Math.max(0, issued - retired),
    divergenceBps: claimed > 0 ? Math.round(((claimed - issued) / claimed) * 10_000) : 0,
    reportHash: r.mrv_report_cid,
    anchored: r.tx_hash !== null,
    txHash: r.tx_hash,
    listed: r.listed,
    askingInrPerTonne: r.asking_inr_per_tonne === null
      ? DEFAULT_CREDIT_INR_PER_TONNE : Number(r.asking_inr_per_tonne),
  };
}

/** Listings a buyer can act on. Paused ones stay visible to their seller via /market/mine. */
export async function listMarket(): Promise<Listing[]> {
  const { rows } = await pool.query(`${LISTING_SQL} WHERE b.listed ORDER BY b.period_end DESC`);
  return rows.map(toListing);
}

export async function listingsForSite(siteId: string): Promise<Listing[]> {
  const { rows } = await pool.query(
    `${LISTING_SQL} WHERE b.site_id = $1 ORDER BY b.period_end DESC`, [siteId],
  );
  return rows.map(toListing);
}

/** Pause or resume a listing. Only the site's own operator, or an admin. */
export async function setListed(
  batchId: string, listed: boolean, account: { sub: string; role: string },
  askingInrPerTonne: number | null = null,
): Promise<{ batchId: string; listed: boolean; note: string }> {
  const { rows } = await pool.query<{ site_id: string }>(
    'SELECT site_id FROM batches WHERE id = $1', [batchId],
  );
  if (!rows[0]) throw Object.assign(new Error('No such batch'), { status: 404 });
  if (account.role !== 'admin') {
    const { rows: acc } = await pool.query<{ site_id: string | null }>(
      'SELECT site_id FROM accounts WHERE id = $1', [account.sub],
    );
    if (acc[0]?.site_id !== rows[0].site_id) {
      throw Object.assign(new Error('Only this site\'s operator can change its listing'), { status: 403 });
    }
  }
  await pool.query(
    `UPDATE batches SET listed = $2, asking_inr_per_tonne = COALESCE($3, asking_inr_per_tonne)
      WHERE id = $1`,
    [batchId, listed, askingInrPerTonne],
  );
  return {
    batchId,
    listed,
    note: listed
      ? 'Listed. Buyers can retire from it again.'
      : 'Paused. Issued credit is untouched; nobody can retire from it until relisted.',
  };
}

export interface RetireArgs {
  batchId: string;
  kg: number;
  beneficiary: string;
  accountId?: string | null;
}

export interface Certificate {
  id: string;
  batchId: string;
  siteName: string;
  kg: number;
  beneficiary: string;
  retiredAt: string;
  reportHash: string | null;
  anchored: boolean;
  txHash: string | null;
  inrPerTonne: number | null;
  note: string;
}

/**
 * Retire part of a batch.
 *
 * The availability check and the insert run in one transaction with the row
 * locked. Without that, two buyers retiring the last 40 kg at the same moment
 * both read "40 available" and both succeed — and the ledger now claims more
 * carbon was removed than ever existed.
 */
export async function retire(args: RetireArgs): Promise<Certificate> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: batchRows } = await client.query(
      `SELECT b.id, b.creditable_co2_kg, b.mrv_report_cid, b.evidence_token_id,
              b.listed, b.asking_inr_per_tonne, s.name AS site_name
         FROM batches b JOIN sites s ON s.id = b.site_id
        WHERE b.id = $1 FOR UPDATE OF b`,
      [args.batchId],
    );
    const batch = batchRows[0];
    if (!batch) throw Object.assign(new Error('No such batch'), { status: 404 });
    if (!batch.listed) {
      throw Object.assign(new Error('The seller has paused this listing'), { status: 409 });
    }
    const inrPerTonne = batch.asking_inr_per_tonne === null
      ? DEFAULT_CREDIT_INR_PER_TONNE : Number(batch.asking_inr_per_tonne);

    const { rows: sumRows } = await client.query(
      'SELECT COALESCE(SUM(kg), 0) AS retired FROM retirements WHERE batch_id = $1',
      [args.batchId],
    );
    const available = Number(batch.creditable_co2_kg) - Number(sumRows[0].retired);

    if (args.kg > available) {
      throw Object.assign(
        new Error(
          `Only ${available.toFixed(1)} kg remains in this batch; `
          + `${args.kg.toFixed(1)} kg was requested.`,
        ),
        { status: 409 },
      );
    }

    // The contract knows the evidence token id, not our UUID. A batch that
    // was never anchored retires locally, which is correct: this ledger is
    // authoritative either way.
    const anchor = await retireCredits({
      onChainBatchId: batch.evidence_token_id ?? null,
      kg: args.kg,
      beneficiary: args.beneficiary,
    });

    const { rows } = await client.query(
      `INSERT INTO retirements
         (batch_id, kg, beneficiary, certificate_id, tx_hash, inr_per_tonne, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, retired_at`,
      [args.batchId, args.kg, args.beneficiary.trim(), anchor.tokenId, anchor.txHash,
        inrPerTonne, args.accountId ?? null],
    );

    await client.query('COMMIT');

    return {
      id: rows[0].id,
      batchId: args.batchId,
      siteName: batch.site_name,
      kg: args.kg,
      beneficiary: args.beneficiary.trim(),
      retiredAt: rows[0].retired_at.toISOString(),
      reportHash: batch.mrv_report_cid,
      anchored: anchor.anchored,
      txHash: anchor.txHash,
      inrPerTonne,
      note: anchor.note,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCertificate(id: string): Promise<Certificate | null> {
  const { rows } = await pool.query(
    `SELECT r.id, r.batch_id, r.kg, r.beneficiary, r.retired_at, r.tx_hash,
            r.inr_per_tonne, b.mrv_report_cid, s.name AS site_name
       FROM retirements r
       JOIN batches b ON b.id = r.batch_id
       JOIN sites s ON s.id = b.site_id
      WHERE r.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    batchId: r.batch_id,
    siteName: r.site_name,
    kg: Number(r.kg),
    beneficiary: r.beneficiary,
    retiredAt: r.retired_at.toISOString(),
    reportHash: r.mrv_report_cid,
    anchored: r.tx_hash !== null,
    txHash: r.tx_hash,
    inrPerTonne: r.inr_per_tonne === null ? null : Number(r.inr_per_tonne),
    note: '',
  };
}
