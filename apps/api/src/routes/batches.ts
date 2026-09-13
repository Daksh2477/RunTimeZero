/**
 * Batches — turning verified windows into issued credits.
 *
 * `POST /batches/preview` exists separately from `POST /batches` on purpose.
 * An operator must be able to see the figure, the evidence behind it and any
 * blocker BEFORE committing. A mint flow whose first output is a transaction
 * hash gives nobody a chance to notice the number is wrong.
 */

import { Router, type Response } from 'express';
import { pool } from '../db/client.ts';
import { createBatch, previewBatch, type CreateBatchArgs } from '../services/batch-service.ts';
import { DURABLE_DISPOSITIONS, type Disposition } from '../services/mrv.ts';

export const batchesRouter = Router();

const DISPOSITIONS = [
  ...DURABLE_DISPOSITIONS,
  'sold_as_feed', 'sold_as_fertiliser', 'undisclosed',
];

/** Reject bad input here so the service can assume it is well-formed. */
function parseArgs(body: unknown): CreateBatchArgs {
  const b = (body ?? {}) as Record<string, unknown>;
  const fail = (msg: string) => {
    throw Object.assign(new Error(msg), { status: 400 });
  };

  const siteId = typeof b.siteId === 'string' ? b.siteId : fail('siteId is required');
  const periodStart = typeof b.periodStart === 'string' ? b.periodStart : fail('periodStart is required');
  const periodEnd = typeof b.periodEnd === 'string' ? b.periodEnd : fail('periodEnd is required');
  const disposition = typeof b.disposition === 'string' ? b.disposition : 'undisclosed';

  if (!DISPOSITIONS.includes(disposition)) {
    fail(`disposition must be one of: ${DISPOSITIONS.join(', ')}`);
  }
  if (Number.isNaN(Date.parse(periodStart as string))
      || Number.isNaN(Date.parse(periodEnd as string))) {
    fail('periodStart and periodEnd must be ISO timestamps');
  }
  if (Date.parse(periodEnd as string) <= Date.parse(periodStart as string)) {
    fail('periodEnd must be after periodStart');
  }
  const asking = b.askingInrPerTonne == null ? null : Number(b.askingInrPerTonne);
  if (asking !== null && !(Number.isFinite(asking) && asking > 0)) {
    fail('askingInrPerTonne must be a positive number');
  }

  return {
    siteId: siteId as string,
    periodStart: periodStart as string,
    periodEnd: periodEnd as string,
    disposition: disposition as Disposition,
    dispositionEvidenceRef:
      typeof b.dispositionEvidenceRef === 'string' ? b.dispositionEvidenceRef : null,
    askingInrPerTonne: asking,
  };
}

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (status === 500) console.error('[batches]', err);
  res.status(status).json({ error: message });
}

/** What would be issued, and what is stopping it. Writes nothing. */
batchesRouter.post('/preview', async (req, res) => {
  try {
    const preview = await previewBatch(parseArgs(req.body));
    if (!preview) return res.status(404).json({ error: 'No such site' });
    res.json(preview);
  } catch (err) {
    send(res, err);
  }
});

/** Issue. Refuses whenever preview reported a blocker. */
batchesRouter.post('/', async (req, res) => {
  try {
    res.status(201).json(await createBatch(parseArgs(req.body)));
  } catch (err) {
    send(res, err);
  }
});

/** Batches for a site, newest first. */
batchesRouter.get('/site/:siteId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.period_start, b.period_end, b.creditable_co2_kg,
              b.claimed_co2_kg, b.disposition, b.mrv_report_cid, b.tx_hash,
              array_length(b.divergence_check_ids, 1) AS check_count,
              COALESCE((SELECT SUM(r.kg) FROM retirements r
                         WHERE r.batch_id = b.id), 0) AS retired_kg
         FROM batches b
        WHERE b.site_id = $1
        ORDER BY b.period_end DESC`,
      [req.params.siteId],
    );
    res.json(rows.map((r) => ({
      id: r.id,
      periodStart: r.period_start.toISOString(),
      periodEnd: r.period_end.toISOString(),
      claimedCo2Kg: Number(r.claimed_co2_kg),
      creditableCo2Kg: Number(r.creditable_co2_kg),
      retiredKg: Number(r.retired_kg),
      disposition: r.disposition,
      reportHash: r.mrv_report_cid,
      anchored: r.tx_hash !== null,
      txHash: r.tx_hash,
      checkCount: r.check_count ?? 0,
    })));
  } catch (err) {
    send(res, err);
  }
});
