/**
 * One pond, as a farmer needs it.
 *
 * The ordering is the whole design: state, then what to do, then what it costs
 * to do nothing. No sparkline, no readings, no divergence figure — those are
 * true and useful and they belong on /console, where the audience reads them.
 *
 * Colour is load-bearing here and is never the only signal: every state also
 * carries a word, because a green dot means nothing to someone seeing this
 * screen for the first time, and about one man in twelve cannot tell it from
 * the red one.
 */

import Link from 'next/link';
import type { FleetPond } from '@/lib/api';

const inr = (v: number) =>
  v >= 100_000 ? `₹${(v / 100_000).toFixed(1)} lakh` : `₹${Math.round(v).toLocaleString('en-IN')}`;

/** Plain-language state, in the farmer's terms rather than the system's. */
function state(pond: FleetPond): { tone: 'bad' | 'watch' | 'ok'; word: string; line: string } {
  if (pond.worstSeverity === 'critical') {
    return {
      tone: 'bad',
      word: 'Needs you now',
      line: 'Something is going wrong in this pond today.',
    };
  }
  if (pond.worstSeverity === 'warning') {
    return {
      tone: 'watch',
      word: 'Keep an eye on it',
      line: 'Not urgent, but worth checking before the week is out.',
    };
  }
  if (!pond.lastReadingAt) {
    return {
      tone: 'watch',
      word: 'Not reporting',
      line: 'No readings have come in. The sensor or its power may be off.',
    };
  }
  return { tone: 'ok', word: 'Growing well', line: 'Nothing needs doing here today.' };
}

/** "3 hours ago" reads faster than a timestamp when you are standing outside. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function PondCard({ pond, siteName }: { pond: FleetPond; siteName: string }) {
  const s = state(pond);
  const atRisk = pond.claimedCo2Kg && pond.creditableCo2Kg !== null
    ? Math.max(0, pond.claimedCo2Kg - pond.creditableCo2Kg)
    : 0;

  return (
    <article className={`pond-card tone-${s.tone}`}>
      <header>
        <div>
          <h2>{pond.label}</h2>
          <p className="pond-where">{siteName}</p>
        </div>
        <span className={`state-pill tone-${s.tone}`}>{s.word}</span>
      </header>

      <p className="pond-line">{s.line}</p>

      {pond.advisoryCount > 0 && (
        <p className="pond-count">
          {pond.advisoryCount === 1
            ? '1 thing to look at'
            : `${pond.advisoryCount} things to look at`}
        </p>
      )}

      {atRisk > 0 && (
        <p className="pond-risk">
          {inr(atRisk * 1.83 * 12)} of this pond&rsquo;s carbon could not be
          confirmed yet.
        </p>
      )}

      <footer>
        <Link className="button" href={`/console/pond/${pond.id}`}>
          {s.tone === 'ok' ? 'Look at this pond' : 'See what to do'}
        </Link>
        <span className="helper">Last reading {ago(pond.lastReadingAt)}</span>
      </footer>
    </article>
  );
}
