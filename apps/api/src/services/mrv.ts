/**
 * The MRV report and its hash.
 *
 * WHAT MAKES THIS THE INTEGRITY LAYER
 *
 * A carbon credit is only as good as the ability to re-derive it. This module
 * turns a set of divergence checks into one canonical JSON document and a
 * hash of it, such that anybody holding the database can recompute the hash
 * and see whether the published figure still matches the evidence.
 *
 * The hash is over CANONICAL JSON — keys sorted, numbers at fixed precision,
 * no whitespace. Without that, two servers serialising the same facts produce
 * different hashes and the whole exercise is theatre.
 *
 * The chain is deliberately NOT required for this to mean something. Putting
 * the hash on Polygon makes it publicly timestamped and tamper-evident, which
 * is worth having; but a report that only verifies when a chain is reachable
 * would be a weaker claim, not a stronger one. See docs/DECISIONS.md #5.
 */

import { createHash } from 'node:crypto';

/** Only these three put carbon somewhere it stays. The rest are utilisation. */
export const DURABLE_DISPOSITIONS = ['buried', 'biochar', 'bioplastic'] as const;
export type Disposition =
  | (typeof DURABLE_DISPOSITIONS)[number]
  | 'sold_as_feed'
  | 'sold_as_fertiliser'
  | 'undisclosed';

export function isDurable(d: string): boolean {
  return (DURABLE_DISPOSITIONS as readonly string[]).includes(d);
}

export interface CheckInput {
  id: string;
  pondId: string;
  pondLabel: string;
  windowStart: string;
  windowEnd: string;
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  ceilingCo2Kg: number;
  creditableCo2Kg: number;
  verdict: string;
  evidenceRefs: string[];
}

export interface MrvReport {
  schema: 'algacarbon.mrv/1';
  siteId: string;
  siteName: string;
  periodStart: string;
  periodEnd: string;
  disposition: Disposition;
  dispositionEvidenceRef: string | null;
  method: {
    rule: string;
    ceilingBasis: string;
    physicsVersion: string;
  };
  totals: {
    claimedCo2Kg: number;
    independentCo2Kg: number;
    independentLowCo2Kg: number;
    ceilingCo2Kg: number;
    creditableCo2Kg: number;
    divergenceBps: number;
  };
  checks: CheckInput[];
}

/** Fixed precision everywhere, so serialisation never changes the hash. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Deterministic JSON: object keys sorted at every depth, arrays left in
 * their given order because their order is meaningful.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' ? JSON.stringify(round(value)) : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
}

export function hashReport(report: MrvReport): string {
  return `0x${createHash('sha256').update(canonicalise(report), 'utf8').digest('hex')}`;
}

export interface BuildArgs {
  siteId: string;
  siteName: string;
  periodStart: string;
  periodEnd: string;
  disposition: Disposition;
  dispositionEvidenceRef: string | null;
  checks: CheckInput[];
}

/**
 * Roll a period's checks into one report.
 *
 * The creditable total is the SUM OF PER-CHECK CREDITABLE FIGURES, not a
 * recomputation from the summed totals. Those differ, and the per-check sum
 * is the smaller and correct one: a pond that overstated in week one cannot
 * have that cancelled by a pond that understated in week two. Netting across
 * ponds would let a bad pond hide behind a good one.
 */
export function buildReport(args: BuildArgs): MrvReport {
  const sum = (f: (c: CheckInput) => number) =>
    round(args.checks.reduce((acc, c) => acc + f(c), 0));

  const claimed = sum((c) => c.claimedCo2Kg);
  const creditable = sum((c) => c.creditableCo2Kg);

  // Positive means the operator claimed more than we could support.
  const divergenceBps =
    claimed > 0 ? Math.round(((claimed - creditable) / claimed) * 10_000) : 0;

  return {
    schema: 'algacarbon.mrv/1',
    siteId: args.siteId,
    siteName: args.siteName,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    disposition: args.disposition,
    dispositionEvidenceRef: args.dispositionEvidenceRef,
    method: {
      rule: 'creditable = min(claimed, independentLow, ceiling), summed per check',
      ceilingBasis:
        'Quantum-yield limit: 8 photons per CO2, 217 kJ/mol PAR, 477 kJ/mol biomass → 27.5% of PAR',
      physicsVersion: 'rtz-physics/0.1',
    },
    totals: {
      claimedCo2Kg: claimed,
      independentCo2Kg: sum((c) => c.independentCo2Kg),
      independentLowCo2Kg: sum((c) => c.independentLowCo2Kg),
      ceilingCo2Kg: sum((c) => c.ceilingCo2Kg),
      creditableCo2Kg: creditable,
      divergenceBps,
    },
    checks: args.checks,
  };
}

/**
 * Re-derive a report's hash and compare. This is the function an auditor
 * runs — and the one the verify page uses to say "still matches evidence".
 */
export function verifyReport(report: MrvReport, expectedHash: string): boolean {
  return hashReport(report) === expectedHash;
}
