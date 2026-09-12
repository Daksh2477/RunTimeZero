'use client';

/**
 * Sun, moon and conditions above the pond.
 *
 * Not decoration. The pond's behaviour is driven by day length and light
 * dose, and both change with latitude and season — at 23°N the sun is up
 * about ten hours in December and thirteen and a half in June. Showing a
 * fixed cartoon sun would hide the single biggest reason a pond yields less
 * in winter, which is the thing an operator most needs to understand before
 * blaming their culture.
 *
 * Everything here comes from the same solar model the physics uses, so the
 * sky and the numbers can never disagree.
 */

import type { DayPoint } from '@/lib/twin';

function describe(par: number): { label: string; note: string } {
  if (par < 150) return { label: 'Overcast', note: 'Too dim to build much' };
  if (par < 700) return { label: 'Hazy', note: 'Growth slowed by light' };
  if (par < 1400) return { label: 'Bright', note: 'Good light for algae' };
  return { label: 'Harsh sun', note: 'Bright enough to inhibit growth' };
}

export function SkyStrip({ point, airTempC }: { point: DayPoint | undefined; airTempC: number }) {
  if (!point) return null;

  const sun = point.solarElevationDeg;
  const par = point.parUmol;
  // From the physics engine's sunrise equation. An earlier approximation
  // from the noon sun angle reported 17.6 h for Gujarat in September, about
  // four hours too many.
  const hours = point.daylightHours;
  const weather = describe(par);
  const night = sun <= 0;

  // Sun tracks left-to-right across its arc; the moon takes its place after
  // dark so the strip never reads as "nothing is happening".
  const arc = Math.max(0, Math.min(1, (sun + 10) / 80));

  return (
    <div className={`sky-strip${night ? ' is-night' : ''}`}>
      <div className="sky-arc" aria-hidden="true">
        <span
          className={`sky-body ${night ? 'is-moon' : 'is-sun'}`}
          style={{ left: `${8 + arc * 84}%`, bottom: `${10 + Math.sin(arc * Math.PI) * 58}%` }}
        />
      </div>

      <dl className="sky-facts">
        <div>
          <dt>Sun</dt>
          <dd>{night ? 'Below horizon' : `${Math.round(sun)}° up`}</dd>
        </div>
        <div>
          <dt>Daylight</dt>
          <dd>{hours.toFixed(1)} h</dd>
        </div>
        <div>
          <dt>Light</dt>
          <dd title={`${Math.round(par)} µmol/m²/s PAR`}>{weather.label}</dd>
        </div>
        <div>
          <dt>Air</dt>
          <dd>{Math.round(airTempC)} °C</dd>
        </div>
        <div>
          <dt>Water</dt>
          <dd>{point.temperatureC.toFixed(1)} °C</dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>{(point.proteinFrac * 100).toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Lipid</dt>
          <dd>{(point.lipidFrac * 100).toFixed(0)}%</dd>
        </div>
      </dl>

      <p className="sky-note">{weather.note}</p>
    </div>
  );
}
