/**
 * Turning verified windows into a batch.
 *
 * A `divergence_check` says "this pond, this fortnight, this much is
 * supportable". A batch says "this site, this period, this much may be sold,
 * and here is the document that proves how we got there".
 *
 * Three rules are enforced here rather than in the route, because they are
 * the product and a route is easy to bypass:
 *
 *   1. A check can only ever belong to ONE batch. Double-issuing the same
 *      tonne is the central fraud in this market.
 *   2. Only a durable disposition is creditable. Feed and fertiliser return
 *      the carbon to the atmosphere within a season; selling them as removal
 *      is the second fraud.
 *   3. The issued amount is the sum of per-check creditable figures. Never a
 *      recomputation from summed totals, which would let a pond that
 *      overstated hide behind one that understated.
 */

import { pool } from '../db/client.ts';
import { attestBatch } from './chain.ts';
import {
  buildReport, hashReport, isDurable,
  type CheckInput, type Disposition, type MrvReport,
} from './mrv.ts';

export interface CreateBatchArgs {
  pondId?: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  disposition: Disposition;
  dispositionEvidenceRef?: string | null;
  askingInrPerTonne?: number | null;
}

export interface BatchPreview {
  siteName: string;
  checkCount: number;
  report: MrvReport;
  reportHash: string;
  /** Reasons this cannot be issued. Empty means it can. */
  blockers: string[];
}

/**
 * What WOULD be minted, without minting it.
 *
 * Exists because the operator has to see the figure and its evidence before
 * committing. A mint flow whose first output is a transaction hash gives
 * nobody a chance to notice the number is wrong.
 */
export async function previewBatch(args: CreateBatchArgs): Promise<BatchPreview | null> {
  const { rows: siteRows } = await pool.query(
    'SELECT id, name FROM sites WHERE id = $1', [args.siteId],
  );
  const site = siteRows[0];
  if (!site) return null;

  // Checks in the period whose pond belongs to this site, and which no
  // existing batch has already consumed.
  const { rows } = await pool.query(
    `SELECT dc.id, dc.pond_id, p.label AS pond_label,
            dc.window_start, dc.window_end,
            dc.claimed_co2_kg, dc.independent_co2_kg, dc.independent_low_co2_kg,
            dc.ceiling_co2_kg, dc.creditable_co2_kg, dc.verdict
       FROM divergence_checks dc
       JOIN ponds p ON p.id = dc.pond_id
      WHERE p.site_id = $1
        AND ($4::uuid IS NULL OR p.id = $4)
        AND dc.window_start >= $2
        AND dc.window_end   <= $3
        AND NOT EXISTS (
          SELECT 1 FROM batches b WHERE dc.id = ANY(b.divergence_check_ids)
        )
      ORDER BY dc.window_start, p.label`,
    [args.siteId, args.periodStart, args.periodEnd, args.pondId ?? null],
  );

  const checks: CheckInput[] = rows.map((r) => ({
    id: r.id,
    pondId: r.pond_id,
    pondLabel: r.pond_label,
    windowStart: r.window_start.toISOString(),
    windowEnd: r.window_end.toISOString(),
    claimedCo2Kg: Number(r.claimed_co2_kg),
    independentCo2Kg: Number(r.independent_co2_kg),
    independentLowCo2Kg: Number(r.independent_low_co2_kg),
    ceilingCo2Kg: Number(r.ceiling_co2_kg),
    // A flagged window contributes nothing, and the engine already wrote 0.
    creditableCo2Kg: Number(r.creditable_co2_kg),
    verdict: r.verdict,
    evidenceRefs: [],
  }));

  const report = buildReport({
    siteId: args.siteId,
    siteName: site.name,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    disposition: args.disposition,
    dispositionEvidenceRef: args.dispositionEvidenceRef ?? null,
    checks,
  });

  const blockers: string[] = [];
  if (checks.length === 0) {
    blockers.push(
      'No unbatched verified windows in this period. Either the period is '
      + 'wrong, or these windows have already been issued.',
    );
  }
  if (!isDurable(args.disposition)) {
    blockers.push(
      `Disposition "${args.disposition}" is not a removal. Only buried, `
      + 'biochar and bioplastic keep the carbon out of the air; feed and '
      + 'fertiliser return it within a season.',
    );
  }
  if (isDurable(args.disposition) && !args.dispositionEvidenceRef) {
    blockers.push(
      'A durable disposition needs an evidence reference — the disposal '
      + 'record or offtake contract that shows where the biomass went.',
    );
  }
  if (report.totals.creditableCo2Kg <= 0) {
    blockers.push('Nothing is creditable in this period.');
  }

  return { siteName: site.name, checkCount: checks.length, report, reportHash: hashReport(report), blockers };
}

export interface CreatedBatch {
  id: string;
  reportHash: string;
  creditableCo2Kg: number;
  anchored: boolean;
  txHash: string | null;
  note: string;
}

/** Issue the batch. Refuses if `previewBatch` reported any blocker. */
export async function createBatch(args: CreateBatchArgs): Promise<CreatedBatch> {
  const preview = await previewBatch(args);
  if (!preview) throw Object.assign(new Error('No such site'), { status: 404 });
  if (preview.blockers.length) {
    throw Object.assign(new Error(preview.blockers.join(' ')), { status: 422 });
  }

  const { report, reportHash } = preview;
  const anchor = await attestBatch({
    siteId: args.siteId,
    reportHash,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    claimedCo2Kg: report.totals.claimedCo2Kg,
    independentCo2Kg: report.totals.independentCo2Kg,
    independentLowCo2Kg: report.totals.independentLowCo2Kg,
    ceilingCo2Kg: report.totals.ceilingCo2Kg,
    creditableCo2Kg: report.totals.creditableCo2Kg,
    divergenceBps: report.totals.divergenceBps,
    disposition: args.disposition,
    // Every check id, so an auditor can pull the same rows we used.
    evidenceRefs: report.checks.map((c) => c.id).join(','),
    dispositionEvidenceRef: args.dispositionEvidenceRef ?? '',
  });

  const { rows } = await pool.query(
    `INSERT INTO batches
       (site_id, period_start, period_end, claimed_co2_kg, independent_co2_kg,
        ceiling_co2_kg, creditable_co2_kg, disposition, disposition_evidence_ref,
        mrv_report_cid, evidence_token_id, minted_tonnes, tx_hash,
        divergence_check_ids, asking_inr_per_tonne)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      args.siteId, args.periodStart, args.periodEnd,
      report.totals.claimedCo2Kg, report.totals.independentCo2Kg,
      report.totals.ceilingCo2Kg, report.totals.creditableCo2Kg,
      args.disposition, args.dispositionEvidenceRef ?? null,
      // The hash stands in for the CID until a real IPFS pin exists. It is
      // the thing that actually proves the report, so it is not a placeholder.
      reportHash, anchor.tokenId,
      report.totals.creditableCo2Kg / 1000, anchor.txHash,
      report.checks.map((c) => c.id),
      args.askingInrPerTonne ?? null,
    ],
  );

  return {
    id: rows[0].id,
    reportHash,
    creditableCo2Kg: report.totals.creditableCo2Kg,
    anchored: anchor.anchored,
    txHash: anchor.txHash,
    note: anchor.note,
  };
}
