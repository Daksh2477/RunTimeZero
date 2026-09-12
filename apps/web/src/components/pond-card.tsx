/** Large pond readings with alert status and a link to the source records. */

import Link from 'next/link';
import type { FleetPond } from '@/lib/api';
import { BigReading, type Band } from '@/components/big-reading';
import { mass, readingTime } from '@/lib/display';
import { Droplet, Sun, Thermometer, Waves } from '@/components/icons';
import { pondState } from '@/lib/pond-state';

const fmt = (v: number | null, dp: number) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(dp));

/* Cardinal temperatures for Chlorella-like strains: growth stops below ~20 °C
 * and the culture is damaged above ~38 °C. See packages/physics/src/growth.rs. */
function tempBand(t: number | null): Band {
  if (t == null || !Number.isFinite(t)) return 'unknown';
  if (t < 18 || t > 36) return 'critical';
  if (t < 22 || t > 33) return 'warning';
  return 'optimal';
}
function tempHint(t: number | null): string {
  if (t == null || !Number.isFinite(t)) return 'No reading';
  if (t > 36) return 'High temperature — review the pond';
  if (t > 33) return 'Rising — watch for heat stress';
  if (t < 18) return 'Low temperature — review the pond';
  if (t < 22) return 'Cool — growth is slower than it could be';
  return 'Comfortable for growth';
}

/* Photosynthesis drives pH up through the day; a falling pH is the classic
 * early sign of a culture in trouble. */
function phBand(v: number | null): Band {
  if (v == null || !Number.isFinite(v)) return 'unknown';
  if (v < 6.5 || v > 10.5) return 'critical';
  if (v < 7.2 || v > 9.8) return 'warning';
  return 'optimal';
}
function phHint(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'No reading';
  if (v < 6.5) return 'Low pH — review the pond';
  if (v < 7.2) return 'Drifting acidic — worth a look';
  if (v > 10.5) return 'High pH — review the pond';
  if (v > 9.8) return 'Above the indicative pH range';
  return 'Within the indicative pH range';
}

export function PondCard({ pond, siteName }: { pond: FleetPond; siteName: string }) {
  const s = pondState(pond);
  const atRisk = pond.claimedCo2Kg != null && pond.creditableCo2Kg != null
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
        /* Deliberately neutral, not amber: unconfirmed carbon is a paperwork
         * state, and colouring it like a warning made a healthy pond look
         * like it had two problems. */
        <p className="pond-note">
          {mass(atRisk)} of reported CO₂ is not supported by the latest check. Open the report to review the evidence.
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
              pond.latest.dissolvedOxygenMgL == null ? 'No reading'
                : pond.latest.dissolvedOxygenMgL < 2 ? 'Low — the pond may not be mixing'
                : 'Above the low-oxygen warning level'
            }
            band={
              pond.latest.dissolvedOxygenMgL == null ? 'unknown'
                : pond.latest.dissolvedOxygenMgL < 2 ? 'critical' : 'optimal'
            }
          />
          <BigReading
            label="Paddlewheel" icon={<Waves />}
            value={
              pond.latest.mixing == null ? 'No meter'
                : pond.latest.mixing ? 'Running' : 'Stopped'
            }
            hint={
              pond.latest.mixing == null
                ? 'No mixing status is available'
                : pond.latest.mixing
                  ? 'The latest record indicates mixing'
                  : 'Check the equipment and pond alerts'
            }
            band={
              pond.latest.mixing == null ? 'unknown'
                : pond.latest.mixing ? 'optimal' : 'critical'
            }
          />
        </div>
      )}

      <p className="helper">Reading bands are indicative. Use the pond alerts and your operating limits to decide on an action.</p>
      <footer>
        <Link className="button" href={`/console/pond/${pond.id}`}>
          {s.tone === 'ok' ? 'Look at this pond' : 'See what to do'}
        </Link>
        <span className="helper">Last reading: {readingTime(pond.lastReadingAt)}</span>
      </footer>
    </article>
  );
}
