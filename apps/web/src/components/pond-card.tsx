/**
 * One pond, card-sized.
 *
 * It used to be a full-width panel: four big readings each with a sentence of
 * explanation, a paragraph about unconfirmed carbon, and a disclaimer. Seven
 * ponds came to about four screens of scrolling on a laptop, and the farmer's
 * actual question — "is anything wrong right now" — needed the whole page.
 *
 * So: roughly credit-card proportions, three or four to a row, and everything
 * that was a sentence is now a number with its explanation on hover and in the
 * `title` (which is also what a screen reader reads out). Nothing was deleted;
 * the detail moved to `/console/pond/[id]`, one click away, where there is room
 * for it.
 */

import Link from 'next/link';
import type { FleetPond } from '@/lib/api';
import { mass, readingTime } from '@/lib/display';
import { Droplet, Sun, Thermometer, Waves } from '@/components/icons';
import { pondState } from '@/lib/pond-state';

type Band = 'optimal' | 'warning' | 'critical' | 'unknown';

const fmt = (v: number | null, dp: number) =>
  (v == null || !Number.isFinite(v) ? '—' : v.toFixed(dp));

/* Cardinal temperatures for Chlorella-like strains: growth stops below ~20 °C
 * and the culture is damaged above ~38 °C. See packages/physics/src/growth.rs. */
function temperature(t: number | null): { band: Band; hint: string } {
  if (t == null || !Number.isFinite(t)) return { band: 'unknown', hint: 'No reading' };
  if (t > 36) return { band: 'critical', hint: 'High temperature — review the pond' };
  if (t > 33) return { band: 'warning', hint: 'Rising — watch for heat stress' };
  if (t < 18) return { band: 'critical', hint: 'Low temperature — review the pond' };
  if (t < 22) return { band: 'warning', hint: 'Cool — growth is slower than it could be' };
  return { band: 'optimal', hint: 'Comfortable for growth' };
}

/* Photosynthesis drives pH up through the day; a falling pH is the classic
 * early sign of a culture in trouble. */
function acidity(v: number | null): { band: Band; hint: string } {
  if (v == null || !Number.isFinite(v)) return { band: 'unknown', hint: 'No reading' };
  if (v < 6.5) return { band: 'critical', hint: 'Low pH — review the pond' };
  if (v < 7.2) return { band: 'warning', hint: 'Drifting acidic — worth a look' };
  if (v > 10.5) return { band: 'critical', hint: 'High pH — review the pond' };
  if (v > 9.8) return { band: 'warning', hint: 'Above the indicative pH range' };
  return { band: 'optimal', hint: 'Within the indicative pH range' };
}

function oxygen(v: number | null): { band: Band; hint: string } {
  if (v == null || !Number.isFinite(v)) return { band: 'unknown', hint: 'No reading' };
  if (v < 2) return { band: 'critical', hint: 'Low — the pond may not be mixing' };
  return { band: 'optimal', hint: 'Above the low-oxygen warning level' };
}

function mixing(v: boolean | null): { band: Band; hint: string; text: string } {
  if (v == null) {
    // No meter is NOT the same as a stopped paddlewheel, and colouring the two
    // alike put a red alarm on every site that never bought the meter.
    return { band: 'unknown', hint: 'No mixing status is available', text: 'No meter' };
  }
  return v
    ? { band: 'optimal', hint: 'The latest record indicates mixing', text: 'Running' }
    : { band: 'critical', hint: 'Check the equipment and pond alerts', text: 'Stopped' };
}

function Cell(
  { label, icon, value, unit, band, hint }: {
    label: string; icon: React.ReactNode; value: string; unit?: string;
    band: Band; hint: string;
  },
) {
  return (
    <div className={`mini-reading band-${band}`} title={`${label}: ${hint}`}>
      <span className="mini-reading-label">{icon}{label}</span>
      <span className="mini-reading-value">
        {value}{unit && <span className="mini-reading-unit">{unit}</span>}
      </span>
    </div>
  );
}

export function PondCard({ pond, siteName }: { pond: FleetPond; siteName: string }) {
  const s = pondState(pond);
  const latest = pond.latest;
  const atRisk = pond.claimedCo2Kg != null && pond.creditableCo2Kg != null
    ? Math.max(0, pond.claimedCo2Kg - pond.creditableCo2Kg)
    : 0;

  const temp = temperature(latest?.temperatureC ?? null);
  const ph = acidity(latest?.ph ?? null);
  const o2 = oxygen(latest?.dissolvedOxygenMgL ?? null);
  const mix = mixing(latest?.mixing ?? null);

  return (
    <article className={`pond-card tone-${s.tone}`}>
      <header>
        <div className="pond-card-id">
          <h2>{pond.label}</h2>
          <p className="pond-where">{siteName}</p>
        </div>
        <span className={`state-pill tone-${s.tone}`}>{s.word}</span>
      </header>

      <p className="pond-line">{s.line}</p>

      {latest && (
        <div className="mini-reading-grid">
          <Cell
            label="Temp" icon={<Thermometer />} unit="°C"
            value={fmt(latest.temperatureC, 1)} band={temp.band} hint={temp.hint}
          />
          <Cell
            label="pH" icon={<Droplet />}
            value={fmt(latest.ph, 1)} band={ph.band} hint={ph.hint}
          />
          <Cell
            label="Oxygen" icon={<Sun />} unit="mg/L"
            value={fmt(latest.dissolvedOxygenMgL, 1)} band={o2.band} hint={o2.hint}
          />
          <Cell
            label="Mixing" icon={<Waves />}
            value={mix.text} band={mix.band} hint={mix.hint}
          />
        </div>
      )}

      <footer>
        <Link className="button small" href={`/console/pond/${pond.id}`}>
          {s.tone === 'ok' ? 'Open' : 'What to do'}
        </Link>
        <span className="pond-meta">
          {pond.advisoryCount > 0 && (
            <span className="pond-flag">
              {pond.advisoryCount} to look at
            </span>
          )}
          {atRisk > 0 && (
            /* Neutral, not amber: unconfirmed carbon is a paperwork state, and
             * colouring it as a warning made a healthy pond look like it had
             * two problems. */
            <span
              className="pond-flag is-quiet"
              title={`${mass(atRisk)} of reported CO₂ is not supported by the latest check. Open the report to review the evidence.`}
            >
              {mass(atRisk)} unconfirmed
            </span>
          )}
          <span className="pond-age">{readingTime(pond.lastReadingAt)}</span>
        </span>
      </footer>
    </article>
  );
}
