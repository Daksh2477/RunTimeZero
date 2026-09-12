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
import { BigReading, type Band } from '@/components/big-reading';
import { Droplet, Sun, Thermometer, Waves } from '@/components/icons';

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

const fmt = (v: number | null, dp: number) => (v === null ? '—' : v.toFixed(dp));

/* Cardinal temperatures for Chlorella-like strains: growth stops below ~20 °C
 * and the culture is damaged above ~38 °C. See packages/physics/src/growth.rs. */
function tempBand(t: number | null): Band {
  if (t === null) return 'warning';
  if (t < 18 || t > 36) return 'critical';
  if (t < 22 || t > 33) return 'warning';
  return 'optimal';
}
function tempHint(t: number | null): string {
  if (t === null) return 'No reading';
  if (t > 36) return 'Too hot — the culture is being damaged';
  if (t > 33) return 'Rising — watch for heat stress';
  if (t < 18) return 'Too cold — growth has essentially stopped';
  if (t < 22) return 'Cool — growth is slower than it could be';
  return 'Comfortable for growth';
}

/* Photosynthesis drives pH up through the day; a falling pH is the classic
 * early sign of a culture in trouble. */
function phBand(v: number | null): Band {
  if (v === null) return 'warning';
  if (v < 6.5 || v > 10.5) return 'critical';
  if (v < 7.2 || v > 9.8) return 'warning';
  return 'optimal';
}
function phHint(v: number | null): string {
  if (v === null) return 'No reading';
  if (v < 6.5) return 'Far too acidic — check for a crash';
  if (v < 7.2) return 'Drifting acidic — worth a look';
  if (v > 10.5) return 'Very alkaline — growth will suffer';
  return 'Normal for a working pond';
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

      {pond.latest && (
        /*
         * Four readings as big cards, the pattern from Chetan's branch. Each
         * hint says what the number MEANS rather than restating it — a farmer
         * needs "comfortable for growth", not "24 to 31 degrees".
         */
        <div className="reading-grid">
          <BigReading
            label="Water temp" icon={<Thermometer />}
            value={fmt(pond.latest.temperatureC, 1)} unit="°C"
            hint={tempHint(pond.latest.temperatureC)}
            band={tempBand(pond.latest.temperatureC)}
          />
          <BigReading
            label="Acidity" icon={<Droplet />}
            value={fmt(pond.latest.ph, 1)} unit="pH"
            hint={phHint(pond.latest.ph)}
            band={phBand(pond.latest.ph)}
          />
          <BigReading
            label="Oxygen" icon={<Sun />}
            value={fmt(pond.latest.dissolvedOxygenMgL, 1)} unit="mg/L"
            hint={
              pond.latest.dissolvedOxygenMgL === null ? 'No reading'
                : pond.latest.dissolvedOxygenMgL < 2 ? 'Low — the pond may not be mixing'
                : 'Healthy for the culture'
            }
            band={
              pond.latest.dissolvedOxygenMgL === null ? 'warning'
                : pond.latest.dissolvedOxygenMgL < 2 ? 'critical' : 'optimal'
            }
          />
          <BigReading
            label="Paddlewheel" icon={<Waves />}
            value={
              pond.latest.mixing === null ? 'No meter'
                : pond.latest.mixing ? 'Running' : 'Stopped'
            }
            hint={
              pond.latest.mixing === null
                ? 'This pond has no energy meter fitted'
                : pond.latest.mixing
                  ? 'Water is circulating as it should'
                  : 'Start it — the pond will stratify within hours'
            }
            band={
              pond.latest.mixing === null ? 'unknown'
                : pond.latest.mixing ? 'optimal' : 'critical'
            }
          />
        </div>
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
