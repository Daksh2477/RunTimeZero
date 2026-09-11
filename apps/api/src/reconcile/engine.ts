/**
 * The reconciliation engine.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE MUST NEVER IMPORT FROM THE SIMULATOR.                      │
 * │                                                                      │
 * │ If you see `ground_truth_co2_kg_offline_scoring_only` anywhere below,│
 * │ or any import from packages/physics/src/sim, stop and read           │
 * │ docs/DECISIONS.md #6. Detection that can see the answer isn't        │
 * │ detection — it's the simulator reporting a number it already knew,   │
 * │ and the demo proves nothing.                                         │
 * │                                                                      │
 * │ The only physics import allowed is `physics_ceiling_co2_kg`, which   │
 * │ takes pond geometry and a date and returns arithmetic.               │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { creditableAmount, type Verdict } from '@rtz/types';
import type { ObservationRow, PondRow } from '../db/client.ts';
import { estimateFromObservations } from './estimate.ts';

/*
 * There is deliberately NO fixed divergence threshold here.
 *
 * An earlier version flagged any claim more than 15% from the central estimate.
 * That was incoherent: with a satellite band of +/-2.4x we are admitting we
 * cannot measure better than about +/-140%, so objecting at 15% asserts a
 * precision we do not have. It produced false positives on honest ponds, which
 * is the one failure mode that would stop operators adopting the platform.
 *
 * The rule now is simply: do we have evidence that CONTRADICTS the claim?
 * A claim inside the band is not contradicted, so it stands — and it is still
 * capped at the central estimate, so overstating inside the band gains nothing.
 * Better instrumentation narrows the band, which is exactly the incentive the
 * tier system is built on.
 */

/** Same-direction runs at or above this length are systematic, not noise. */
const SYSTEMATIC_RUN_LENGTH = 4;

export interface ReconcileInput {
  pond: PondRow;
  windowStart: Date;
  windowEnd: Date;
  /** What the operator's telemetry asserts, kg CO₂. */
  claimedCo2Kg: number;
  /** Independent evidence for this window. */
  observations: ObservationRow[];
  /** Mean water temperature, °C. Null when telemetry gave us none. */
  meanTempC: number | null;
  /** Prior consecutive windows diverging the same way. */
  priorRun: number;
  /** Physics bound, kg CO₂. Computed by the caller from the WASM module. */
  ceilingCo2Kg: number;
  /** Dry mass harvested during the window, kg. Part of production, not a loss. */
  harvestedDryKg: number;
}

export interface ReconcileResult {
  verdict: Verdict;
  creditableCo2Kg: number;
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  independentHighCo2Kg: number;
  ceilingCo2Kg: number;
  divergence: number;
  consecutiveSameDirection: number;
  reason: string;
}

/**
 * Decide how much of a claim is supported by evidence.
 *
 * Deliberately boring and deliberately pure: this is the function a judge will
 * ask us to walk through, so it has to be readable in one pass with no hidden
 * state and no I/O.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const estimate = estimateFromObservations(
    input.observations,
    input.pond,
    input.harvestedDryKg,
  );

  const base = {
    claimedCo2Kg: input.claimedCo2Kg,
    ceilingCo2Kg: input.ceilingCo2Kg,
    independentCo2Kg: estimate?.co2Kg ?? 0,
    independentLowCo2Kg: estimate?.co2LowKg ?? 0,
    independentHighCo2Kg: estimate?.co2HighKg ?? 0,
  };

  // 1. No independent evidence — we cannot judge, so we credit nothing.
  //    Refusing to mint is the safe failure here. Crediting an unchecked claim
  //    would make the whole system decorative.
  if (!estimate) {
    return {
      ...base,
      verdict: 'insufficient_evidence',
      creditableCo2Kg: 0,
      divergence: 0,
      consecutiveSameDirection: input.priorRun,
      reason:
        'No independent observation in this window. Nothing to check the claim against.',
    };
  }

  // 2. Above the physics ceiling. Not suspicious — impossible. This needs no
  //    model to be trusted, only pond area, latitude and the date.
  if (input.claimedCo2Kg > input.ceilingCo2Kg) {
    return {
      ...base,
      verdict: 'flagged',
      creditableCo2Kg: 0,
      divergence: relativeDivergence(input.claimedCo2Kg, estimate.co2Kg),
      consecutiveSameDirection: input.priorRun + 1,
      reason:
        `Claim of ${fmt(input.claimedCo2Kg)} kg exceeds the physical maximum of ` +
        `${fmt(input.ceilingCo2Kg)} kg for this pond, area and period. ` +
        `No cultivation system can exceed this bound.`,
    };
  }

  const divergence = relativeDivergence(input.claimedCo2Kg, estimate.co2Kg);
  const overstating = divergence > 0;
  const run = overstating ? input.priorRun + 1 : 0;

  // 3. A sustained one-directional overstatement.
  //
  //    This is checked BEFORE the agreement test, and the order matters. A
  //    satellite band is wide enough to swallow a persistent 8% overstatement,
  //    so if we tested agreement first this branch would be unreachable — and
  //    it covers exactly the fraud the physics ceiling cannot catch, because a
  //    careful operator never goes near the ceiling. See DECISIONS.md #9.
  if (overstating && run >= SYSTEMATIC_RUN_LENGTH) {
    return {
      ...base,
      verdict: 'flagged',
      creditableCo2Kg: 0,
      divergence,
      consecutiveSameDirection: run,
      reason:
        `Claim has exceeded independent evidence for ${run} consecutive windows ` +
        `(currently +${pct(divergence)}). A one-directional run of this length is ` +
        `not measurement noise.`,
    };
  }

  // 4. Claim sits inside the independent band — agreement.
  const insideBand =
    input.claimedCo2Kg >= estimate.co2LowKg &&
    input.claimedCo2Kg <= estimate.co2HighKg;

  if (insideBand) {
    return {
      ...base,
      verdict: 'ok',
      creditableCo2Kg: creditableAmount({
        claimedCo2Kg: input.claimedCo2Kg,
        independentCo2Kg: estimate.co2Kg,
        independentLowCo2Kg: estimate.co2LowKg,
        ceilingCo2Kg: input.ceilingCo2Kg,
        verdict: 'ok',
      }),
      divergence,
      consecutiveSameDirection: run,
      reason:
        `Claim of ${fmt(input.claimedCo2Kg)} kg is not contradicted by independent ` +
        `evidence (${fmt(estimate.co2LowKg)}–${fmt(estimate.co2HighKg)} kg, ` +
        `${estimate.channel}). Credited at the lower of claim and central estimate.`,
    };
  }

  // 5. Outside the band but below the ceiling: credit the evidence floor and
  //    flag it for review. The operator loses nothing they could prove.
  const creditable = creditableAmount({
    claimedCo2Kg: input.claimedCo2Kg,
    independentCo2Kg: estimate.co2Kg,
    independentLowCo2Kg: estimate.co2LowKg,
    ceilingCo2Kg: input.ceilingCo2Kg,
    verdict: 'watch',
  });

  return {
    ...base,
    verdict: 'watch',
    creditableCo2Kg: creditable,
    divergence,
    consecutiveSameDirection: run,
    reason:
      `Claim of ${fmt(input.claimedCo2Kg)} kg is ${pct(divergence)} ` +
      `${overstating ? 'above' : 'below'} independent evidence ` +
      `(${fmt(estimate.co2LowKg)}–${fmt(estimate.co2HighKg)} kg). ` +
      `Credited at the evidence floor: ${fmt(creditable)} kg.`,
  };
}

/**
 * Signed relative gap. Positive means the operator claimed more than the
 * evidence supports.
 */
function relativeDivergence(claimed: number, independent: number): number {
  if (independent <= 0) return claimed > 0 ? 1 : 0;
  return (claimed - independent) / independent;
}

function fmt(kg: number): string {
  return kg.toFixed(1);
}

function pct(fraction: number): string {
  return `${(Math.abs(fraction) * 100).toFixed(1)}%`;
}
