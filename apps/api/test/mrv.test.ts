/**
 * The MRV hash is the integrity claim, so it gets tested like one.
 *
 * If key order, float formatting or field insertion can change the hash
 * without the facts changing, then "recompute and compare" proves nothing
 * and the whole verification story collapses.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, canonicalise, hashReport, isDurable, verifyReport } from '../src/services/mrv.ts';

const check = {
  id: 'c1', pondId: 'p1', pondLabel: 'RW-01',
  windowStart: '2026-08-01T00:00:00.000Z', windowEnd: '2026-08-15T00:00:00.000Z',
  claimedCo2Kg: 1000, independentCo2Kg: 900, independentLowCo2Kg: 800,
  ceilingCo2Kg: 1200, creditableCo2Kg: 800, verdict: 'consistent',
  evidenceRefs: ['S2A_20260804'],
};

const args = {
  siteId: 's1', siteName: 'Naroda CETP', periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z', disposition: 'biochar' as const,
  dispositionEvidenceRef: 'PYRO-1', checks: [check],
};

test('the same facts always hash the same', () => {
  assert.equal(hashReport(buildReport(args)), hashReport(buildReport(args)));
});

test('key order does not change the hash', () => {
  const a = canonicalise({ b: 1, a: 2, c: { z: 1, y: 2 } });
  const b = canonicalise({ c: { y: 2, z: 1 }, a: 2, b: 1 });
  assert.equal(a, b);
});

test('changing any fact changes the hash', () => {
  const base = hashReport(buildReport(args));
  const tampered = hashReport(buildReport({
    ...args,
    checks: [{ ...check, creditableCo2Kg: 900 }],
  }));
  assert.notEqual(base, tampered, 'inflating the creditable figure must break the hash');
});

test('verifyReport catches a tampered report', () => {
  const report = buildReport(args);
  const hash = hashReport(report);
  assert.equal(verifyReport(report, hash), true);

  report.totals.creditableCo2Kg = 999_999;
  assert.equal(verifyReport(report, hash), false);
});

test('creditable is the sum of per-check figures, not netted', () => {
  // One pond overstated, one understated. Netting would let the good pond
  // cancel the bad one; summing per check must not.
  const over = { ...check, id: 'c2', claimedCo2Kg: 2000, creditableCo2Kg: 500 };
  const report = buildReport({ ...args, checks: [check, over] });
  assert.equal(report.totals.creditableCo2Kg, 1300);
  assert.equal(report.totals.claimedCo2Kg, 3000);
});

test('only buried, biochar and bioplastic are durable', () => {
  assert.equal(isDurable('biochar'), true);
  assert.equal(isDurable('buried'), true);
  assert.equal(isDurable('bioplastic'), true);
  assert.equal(isDurable('sold_as_feed'), false);
  assert.equal(isDurable('sold_as_fertiliser'), false);
  assert.equal(isDurable('undisclosed'), false);
});
