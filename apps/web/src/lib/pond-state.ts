/**
 * One pond's state, in a farmer's terms.
 *
 * THIS EXISTS BECAUSE THE HEADLINE AND THE CARDS DISAGREED.
 *
 * The summary at the top of /farm counted only `worstSeverity`, while each
 * card also considered how stale its last reading was. The result was a page
 * that said "Everything looks fine. All 7 ponds are growing normally" above
 * seven cards each marked "Out of date". Two readers of the same data must
 * not reach different conclusions, so there is now exactly one function.
 */

import type { FleetPond } from './api';

export type Tone = 'bad' | 'watch' | 'ok';

export interface PondState {
  tone: Tone;
  word: string;
  line: string;
}

/** Past this, a reading describes the past rather than the present. */
const STALE_HOURS = 6;

export function hoursSince(iso: string | null): number | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

export function pondState(pond: FleetPond): PondState {
  if (pond.worstSeverity === 'critical') {
    return {
      tone: 'bad',
      word: 'Needs you now',
      line: 'Review the urgent alert and check the pond’s current conditions.',
    };
  }
  if (pond.worstSeverity === 'warning') {
    return {
      tone: 'watch',
      word: 'Keep an eye on it',
      line: 'Review the warning and its suggested action time.',
    };
  }
  if (hoursSince(pond.lastReadingAt) === null) {
    return {
      tone: 'watch',
      word: 'Not reporting',
      line: 'No valid reading time is available. Check the sensor connection.',
    };
  }

  /*
   * A pond that stopped reporting hours ago is not a healthy pond — it is a
   * pond we cannot see. Saying "Growing well" over a stale reading is the
   * worst thing this screen could do, because the numbers beside it look
   * perfectly fine while being hours out of date.
   */
  const age = hoursSince(pond.lastReadingAt)!;
  if (age < -0.0833) return { tone: 'watch', word: 'Check reading time', line: 'The latest reading is dated in the future. Check the sensor clock.' };
  if (age > STALE_HOURS) {
    return {
      tone: 'watch',
      word: 'Out of date',
      line:
        `The last reading is ${Math.round(age)} hours old. What you see ` +
        'below was true then, not now.',
    };
  }

  return { tone: 'ok', word: 'No urgent alerts', line: 'No urgent alerts in the available records. Continue your usual pond checks.' };
}

/** Worst first: a farmer opening this should meet the problem, not scroll to it. */
export const TONE_RANK: Record<Tone, number> = { bad: 0, watch: 1, ok: 2 };
