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

export interface Listing {
  batchId: string;
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
}

export async function listMarket(): Promise<Listing[]> {
  const { rows } = await pool.query(
    `SELECT b.id, s.name AS site_name, s.tier, s.host_industry,
            b.period_start, b.period_end, b.disposition,
            b.disposition_evidence_ref, b.creditable_co2_kg, b.claimed_co2_kg,
            b.mrv_report_cid, b.tx_hash,
            COALESCE((SELECT SUM(r.kg) FROM retirements r
                       WHERE r.batch_id = b.id), 0) AS retired_kg
       FROM batches b
       JOIN sites s ON s.id = b.site_id
      ORDER BY b.period_end DESC`,
  );

  return rows.map((r) => {
    const issued = Number(r.creditable_co2_kg);
    const retired = Number(r.retired_kg);
    const claimed = Number(r.claimed_co2_kg);
    return {
      batchId: r.id,
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
    };
  });
}

export interface RetireArgs {
  batchId: string;
  kg: number;
  beneficiary: string;
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
              s.name AS site_name
         FROM batches b JOIN sites s ON s.id = b.site_id
        WHERE b.id = $1 FOR UPDATE OF b`,
      [args.batchId],
    );
    const batch = batchRows[0];
    if (!batch) throw Object.assign(new Error('No such batch'), { status: 404 });

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
      `INSERT INTO retirements (batch_id, kg, beneficiary, certificate_id, tx_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, retired_at`,
      [args.batchId, args.kg, args.beneficiary.trim(), anchor.tokenId, anchor.txHash],
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
            b.mrv_report_cid, s.name AS site_name
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
    note: '',
  };
}
