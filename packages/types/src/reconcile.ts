/**
 * The reconciliation result — the output the whole system exists to produce.
 *
 * CRITICAL INVARIANT: nothing in this module, and nothing that builds a
 * DivergenceCheck, may read the simulator's ground truth. The engine sees only
 * the claim, the independent estimate, and the physics ceiling. If ground truth
 * ever leaks in, detection becomes circular and the demo proves nothing.
 * See docs/DECISIONS.md, decision 6.
 */

import type { Disposition } from './site.ts';

export type Verdict =
  /** Claim and independent estimate agree within the band. Mint at the claim. */
  | 'ok'
  /** Outside the band but below the ceiling. Mint at the lower figure, flag it. */
  | 'watch'
  /** Persistent one-directional divergence, or above the ceiling. Refuse to mint. */
  | 'flagged'
  /** Not enough independent evidence in the window to judge either way. */
  | 'insufficient_evidence';

/**
 * One reconciliation over one pond-window.
 *
 * `creditableCo2Kg` is the number that reaches the chain, and it is always
 * min(claimed, independent lower bound) — never an average, never the claim
 * alone. Crediting the lower bound is what makes overstatement pointless rather
 * than merely detectable.
 */
export interface DivergenceCheck {
  id: string;
  pondId: string;
  windowStart: string;
  windowEnd: string;

  /** What the operator asserted, in kg CO₂. */
  claimedCo2Kg: number;
  /** What the independent channel implies, with its band. */
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  independentHighCo2Kg: number;
  /** What physics permits at most. A claim above this is impossible, not doubtful. */
  ceilingCo2Kg: number;

  /**
   * Signed relative gap: (claimed − independent) / independent.
   * Positive means the operator claimed more than the evidence supports.
   */
  divergence: number;
  /** How many consecutive prior windows also diverged in the same direction. */
  consecutiveSameDirection: number;

  verdict: Verdict;
  /** The figure that may be minted. Zero when flagged. */
  creditableCo2Kg: number;
  reason: string;
  computedAt: string;
}

/**
 * Decide how much may be credited.
 *
 * Deliberately pure and deliberately boring: this is the function a judge will
 * ask us to explain, so it must be readable in one pass with no hidden state.
 */
export function creditableAmount(input: {
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  ceilingCo2Kg: number;
  verdict: Verdict;
}): number {
  if (input.verdict === 'flagged' || input.verdict === 'insufficient_evidence') {
    return 0;
  }

  // Which independent figure we cap against depends on whether the claim and
  // the evidence agree.
  //
  // An earlier version always used the band FLOOR. That punished honest
  // operators severely: with satellite's ±2.4x band, a perfectly accurate claim
  // was credited at 42% of its true value, and nobody would have adopted the
  // platform. Being conservative about fraud is not a reason to be wrong about
  // honesty.
  //
  // So: a claim that agrees with the evidence is capped at the central
  // estimate. A claim that does not agree is pushed down to the floor. The
  // penalty lands on disagreement, which is exactly where we want it — and
  // overstating still cannot pay, because the cap only ever moves downward.
  const cap =
    input.verdict === 'ok' ? input.independentCo2Kg : input.independentLowCo2Kg;

  return Math.max(0, Math.min(input.claimedCo2Kg, cap, input.ceilingCo2Kg));
}

/** A verified production batch — the unit that becomes a token. */
export interface Batch {
  id: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;

  claimedCo2Kg: number;
  independentCo2Kg: number;
  ceilingCo2Kg: number;
  /** Sum of creditableCo2Kg across the windows in this period. */
  creditableCo2Kg: number;

  disposition: Disposition;
  dispositionEvidenceRef: string | null;

  /** IPFS CID of the full MRV report. Null until the report is pinned. */
  mrvReportCid: string | null;
  /** On-chain ERC-721 token id of the BatchEvidence NFT. Null until minted. */
  evidenceTokenId: string | null;
  /** Tonnes actually minted as ERC-1155. Null until minted. */
  mintedTonnes: number | null;
  txHash: string | null;

  divergenceCheckIds: string[];
  createdAt: string;
}

/** The auditable record a verification body would actually act on. */
export interface MrvReport {
  batchId: string;
  generatedAt: string;
  method: {
    /** Version of the physics crate that produced the ceiling. */
    physicsVersion: string;
    co2PerKgBiomass: number;
    channel: string;
  };
  /** Every input echoed back, so a third party can recompute our figure. */
  inputs: Record<string, unknown>;
  checks: DivergenceCheck[];
  conclusion: {
    creditableCo2Kg: number;
    verdict: Verdict;
    notes: string;
  };
}
