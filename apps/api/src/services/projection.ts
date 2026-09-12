/**
 * "What happens to *my* pond next week", as opposed to the anonymous
 * simulator's "what happens to a pond this shape".
 *
 * Three things make this different from `POST /simulate`:
 *
 *   1. Geometry and latitude come from the pond's own row, not a form.
 *   2. Air temperature and its daily swing come from the site's real forecast,
 *      so a cloudy week projects like a cloudy week.
 *   3. The twin is warm-started to match the pond's latest measured density
 *      before the projection begins, because a fresh inoculum and a pond three
 *      weeks into a cycle behave nothing alike.
 *
 * The twin has no setter for biomass — deliberately, its state is private — so
 * (3) is done by stepping a fresh pond forward until its density reaches the
 * last reading and treating that point as hour zero. The response says how
 * many hours that took and what density it matched, because a projection whose
 * starting point you cannot see is a guess with a chart.
 */

import { WasmPond, physics_ceiling_co2_kg } from '../../../../packages/physics/pkg/rtz_physics.js';
import { pool } from '../db/client.ts';
import { getForecast, type Forecast } from './weather.ts';

/** Spirulina's growth band, from packages/physics/src/growth.rs. */
const TEMP_STALL_LOW_C = 15;
const TEMP_OPT_C = 35;
const TEMP_STALL_HIGH_C = 42;

/** Twin default influent nitrogen, mg/L. Overridable per request. */
const DEFAULT_NITROGEN_MG_L = 40;

/** Longest warm-up we will run looking for the pond's current density. */
const MAX_WARMUP_DAYS = 60;

export type Limiter = 'heat' | 'cold' | 'light' | 'density' | 'none';

export interface ProjectedHour {
  hour: number;
  day: number;
  co2Kg: number;
  opticalDensity: number;
  temperatureC: number;
  ph: number;
  dissolvedOxygenMgL: number;
  parUmol: number;
  solarElevationDeg: number;
}

export interface ProjectedDay {
  day: number;
  date: string;
  co2Kg: number;
  harvestedKg: number;
  opticalDensityEnd: number;
  waterTempMinC: number;
  waterTempMaxC: number;
  lightMolPerM2: number;
  hoursAboveOptimum: number;
  hoursStalled: number;
  limiter: Limiter;
  /** Why this day produced what it did, in one sentence. */
  cause: string;
  weather: { tempMaxC: number; cloudPct: number; rainMm: number; note: string } | null;
}

export interface ProjectionOptions {
  days?: number;
  harvestEveryDays?: number;
  /** Skip the forecast and use seasonal defaults — for reproducible runs. */
  useWeather?: boolean;
  meanTempC?: number;
  diurnalSwingC?: number;
  influentNitrogenMgL?: number;
  seed?: number;
}

interface PondRowForProjection {
  id: string;
  site_id: string;
  label: string;
  area_m2: string | number;
  depth_m: string | number;
  strain: string;
  active: boolean;
  lat: string | number;
  lon: string | number;
  site_name: string;
}

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

function round(n: number, places: number): number {
  return Number(n.toFixed(places));
}

/**
 * Which observable was holding this day back.
 *
 * Everything here is measured off the twin's own readings — temperature hours
 * outside the growth band, light delivered, and carbon fixed per unit of light
 * against the best day in the same run. No growth curve is re-implemented on
 * this side; `docs/DECISIONS.md` #6 keeps the physics in one place.
 */
function limiterFor(
  day: { hoursStalledHot: number; hoursStalledCold: number; hoursAboveOptimum: number;
         lightMolPerM2: number; co2Kg: number },
  best: { lightMolPerM2: number; co2PerLight: number },
): Limiter {
  if (day.hoursStalledHot > 0) return 'heat';
  if (day.hoursStalledCold > 0) return 'cold';
  if (day.hoursAboveOptimum >= 5) return 'heat';
  if (best.lightMolPerM2 > 0 && day.lightMolPerM2 < best.lightMolPerM2 * 0.65) return 'light';
  const perLight = day.lightMolPerM2 > 0 ? day.co2Kg / day.lightMolPerM2 : 0;
  if (best.co2PerLight > 0 && perLight < best.co2PerLight * 0.7) return 'density';
  return 'none';
}

function causeFor(limiter: Limiter, d: ProjectedDay): string {
  switch (limiter) {
    case 'heat':
      return d.hoursStalled > 0
        ? `${d.hoursStalled} h past ${TEMP_STALL_HIGH_C}°C, where growth stops outright — `
          + `the pond peaked at ${round(d.waterTempMaxC, 1)}°C.`
        : `${d.hoursAboveOptimum} h above the ${TEMP_OPT_C}°C optimum (peak `
          + `${round(d.waterTempMaxC, 1)}°C), so the afternoon contributed little.`;
    case 'cold':
      return `${d.hoursStalled} h below ${TEMP_STALL_LOW_C}°C (low `
        + `${round(d.waterTempMinC, 1)}°C), where growth stops.`;
    case 'light':
      return `Only ${round(d.lightMolPerM2, 1)} mol/m² of light reached the water — `
        + 'this day is light-limited, not a fault in the pond.';
    case 'density':
      return 'Each unit of light fixed less carbon than on the best day — the culture is '
        + 'dense enough to shade itself and has drawn its nitrogen down. From outside '
        + 'the physics crate those two cannot be told apart; either way it is the '
        + 'harvest signal.';
    default:
      return `Nothing in the way: ${round(d.lightMolPerM2, 1)} mol/m² of light and water `
        + `between ${round(d.waterTempMinC, 1)} and ${round(d.waterTempMaxC, 1)}°C.`;
  }
}

/** CO₂ actually reported by this pond's probes over the trailing window. */
async function observedCo2Kg(pondId: string, days: number): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(co2_uptake_kg), 0) AS kg, COUNT(co2_uptake_kg) AS n
       FROM telemetry
      WHERE pond_id = $1 AND observed_at > now() - ($2 || ' days')::interval`,
    [pondId, String(days)],
  );
  const n = Number(rows[0]?.n ?? 0);
  return n > 0 ? Number(rows[0].kg) : null;
}

/** Latest density reading, which is what the warm-up matches. */
async function latestDensity(pondId: string): Promise<{ od: number; at: string } | null> {
  const { rows } = await pool.query(
    `SELECT optical_density, observed_at
       FROM telemetry
      WHERE pond_id = $1 AND optical_density IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1`,
    [pondId],
  );
  const r = rows[0];
  if (!r) return null;
  return { od: Number(r.optical_density), at: r.observed_at.toISOString() };
}

export async function projectPond(pondId: string, opts: ProjectionOptions = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.site_id, p.label, p.area_m2, p.depth_m, p.strain, p.active,
            s.lat, s.lon, s.name AS site_name
       FROM ponds p JOIN sites s ON s.id = p.site_id
      WHERE p.id = $1`,
    [pondId],
  );
  const r = rows[0] as PondRowForProjection | undefined;
  if (!r) return null;

  const areaM2 = Number(r.area_m2);
  const depthM = Number(r.depth_m);
  const latDeg = Number(r.lat);
  const lonDeg = Number(r.lon);
  const days = Math.max(1, Math.min(16, Math.round(opts.days ?? 7)));
  const harvestEvery = Math.max(2, Math.min(30, Math.round(opts.harvestEveryDays ?? 7)));
  const nitrogen = Number.isFinite(opts.influentNitrogenMgL)
    ? Number(opts.influentNitrogenMgL) : DEFAULT_NITROGEN_MG_L;
  const seed = BigInt(Math.round(opts.seed ?? 42));

  // Weather is an input, not decoration: if it cannot be fetched we say which
  // numbers the run used instead rather than pretending it was forecast-driven.
  let forecast: Forecast | null = null;
  let weatherError: string | null = null;
  if (opts.useWeather !== false) {
    try {
      forecast = await getForecast(latDeg, lonDeg, days);
    } catch (err) {
      weatherError = err instanceof Error ? err.message : 'Weather unavailable';
    }
  }

  const meanTempC = Number.isFinite(opts.meanTempC) ? Number(opts.meanTempC)
    : forecast?.meanTempC ?? 30;
  const swingC = Number.isFinite(opts.diurnalSwingC) ? Number(opts.diurnalSwingC)
    : forecast?.meanSwingC ?? 8;

  const startDay = dayOfYear(new Date());
  // `with_conditions` is the plain constructor with the site's weather spelled
  // out; the plain one hardcodes Gujarat annual means.
  const conditioned = WasmPond.with_conditions(
    latDeg, areaM2, depthM, seed, startDay, meanTempC, swingC, nitrogen,
  );

  // Warm-up: advance until the twin's density matches the pond's last reading.
  const measured = await latestDensity(pondId);
  let warmupHours = 0;
  let warmupReached: number | null = null;
  if (measured && measured.od > 0) {
    for (let h = 0; h < MAX_WARMUP_DAYS * 24; h += 1) {
      const reading = conditioned.step();
      warmupHours += 1;
      if (reading.optical_density >= measured.od) {
        warmupReached = reading.optical_density;
        break;
      }
    }
    // Growing the twin up to the measured density also drew its nitrogen down,
    // which is an artefact of how we got here rather than a fact about the real
    // pond: these are effluent-fed sites with influent arriving continuously.
    // `harvest(0)` removes no biomass and resets nitrogen to influent strength,
    // which is the closest the twin's public surface comes to "it is being fed".
    // Said out loud in `assumptions` because it materially changes the answer.
    conditioned.harvest(0);
  }

  const hourly: ProjectedHour[] = [];
  const daily: ProjectedDay[] = [];
  let totalCo2 = 0;
  let totalHarvestKg = 0;
  const rawDays: {
    hoursStalledHot: number; hoursStalledCold: number; hoursAboveOptimum: number;
    lightMolPerM2: number; co2Kg: number;
  }[] = [];

  for (let d = 0; d < days; d += 1) {
    let co2Kg = 0;
    let hoursStalledHot = 0;
    let hoursStalledCold = 0;
    let hoursAboveOptimum = 0;
    let parSum = 0;
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let odEnd = 0;

    for (let h = 0; h < 24; h += 1) {
      const reading = conditioned.step();
      co2Kg += reading.reported_co2_kg;
      parSum += reading.par_umol;
      const t = reading.temperature_c;
      if (t >= TEMP_STALL_HIGH_C) hoursStalledHot += 1;
      else if (t <= TEMP_STALL_LOW_C) hoursStalledCold += 1;
      else if (t > TEMP_OPT_C) hoursAboveOptimum += 1;
      tempMin = Math.min(tempMin, t);
      tempMax = Math.max(tempMax, t);
      odEnd = reading.optical_density;

      hourly.push({
        hour: d * 24 + h,
        day: d + 1,
        co2Kg: round(reading.reported_co2_kg, 4),
        opticalDensity: round(reading.optical_density, 3),
        temperatureC: round(t, 1),
        ph: round(reading.ph, 2),
        dissolvedOxygenMgL: round(reading.dissolved_oxygen_mg_l, 1),
        parUmol: Math.round(reading.par_umol),
        solarElevationDeg: round(reading.solar_elevation_deg, 1),
      });
    }

    let harvestedKg = 0;
    if ((d + 1) % harvestEvery === 0) harvestedKg = conditioned.harvest(0.45);
    totalCo2 += co2Kg;
    totalHarvestKg += harvestedKg;

    // µmol/m²/s summed hourly → mol/m²/day.
    const lightMolPerM2 = (parSum * 3600) / 1_000_000;
    rawDays.push({ hoursStalledHot, hoursStalledCold, hoursAboveOptimum, lightMolPerM2, co2Kg });

    const date = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const w = forecast?.days.find((x) => x.date === date) ?? null;
    daily.push({
      day: d + 1,
      date,
      co2Kg: round(co2Kg, 2),
      harvestedKg: round(harvestedKg, 1),
      opticalDensityEnd: round(odEnd, 3),
      waterTempMinC: round(tempMin, 1),
      waterTempMaxC: round(tempMax, 1),
      lightMolPerM2: round(lightMolPerM2, 1),
      hoursAboveOptimum,
      hoursStalled: hoursStalledHot + hoursStalledCold,
      limiter: 'none',
      cause: '',
      weather: w
        ? { tempMaxC: w.tempMaxC, cloudPct: w.cloudPct, rainMm: w.rainMm, note: w.note }
        : null,
    });
  }

  const best = {
    lightMolPerM2: Math.max(...rawDays.map((x) => x.lightMolPerM2), 0),
    co2PerLight: Math.max(
      ...rawDays.map((x) => (x.lightMolPerM2 > 0 ? x.co2Kg / x.lightMolPerM2 : 0)), 0,
    ),
  };
  daily.forEach((day, i) => {
    day.limiter = limiterFor(rawDays[i]!, best);
    day.cause = causeFor(day.limiter, day);
  });
  conditioned.free();

  const ceilingCo2Kg: number = physics_ceiling_co2_kg(
    latDeg, areaM2, depthM, startDay, days, meanTempC,
  );
  const observed = await observedCo2Kg(pondId, days);
  const worst = daily.filter((d) => d.limiter !== 'none');

  return {
    pond: {
      id: r.id,
      siteId: r.site_id,
      label: r.label,
      siteName: r.site_name,
      areaM2,
      depthM,
      strain: r.strain,
      active: r.active,
      latDeg,
      lonDeg,
    },
    startedFrom: measured
      ? {
        measuredOpticalDensity: round(measured.od, 3),
        measuredAt: measured.at,
        matchedOpticalDensity: warmupReached === null ? null : round(warmupReached, 3),
        warmupHours,
        note: warmupReached === null
          ? `The twin never reached the measured density of ${round(measured.od, 3)} in `
            + `${MAX_WARMUP_DAYS} simulated days, so this projection starts from a pond `
            + 'that is thinner than yours and will read low.'
          : `Advanced ${warmupHours} h to match the density last measured on this pond `
            + `(${round(measured.od, 3)}), then projected forward from there.`,
      }
      : {
        measuredOpticalDensity: null,
        measuredAt: null,
        matchedOpticalDensity: null,
        warmupHours: 0,
        note: 'No density reading for this pond, so the projection starts from a fresh '
          + 'inoculum. Expect it to read low for the first week.',
      },
    assumptions: {
      days,
      harvestEveryDays: harvestEvery,
      meanAirTempC: round(meanTempC, 1),
      diurnalSwingC: round(swingC, 1),
      influentNitrogenMgL: nitrogen,
      nutrientsAtInfluentStrengthAtStart: measured !== null && measured.od > 0,
      weatherDriven: forecast !== null,
      seed: Number(seed),
      note: (forecast
        ? `Air temperature and swing are the ${days}-day forecast for this site.`
        : 'No forecast was used — these are seasonal defaults for Gujarat'
          + (weatherError ? ` (${weatherError})` : '') + '.')
        + ' The twin replenishes nutrients only when biomass is harvested, so a long'
        + ' run with a distant harvest tapers off by design — that is its batch'
        + ' assumption showing, not a prediction of starvation.',
    },
    weather: forecast
      ? { headline: forecast.headline, timezone: forecast.timezone, days: forecast.days }
      : null,
    weatherError,
    hourly,
    daily,
    totals: {
      co2Kg: round(totalCo2, 1),
      harvestedDryKg: round(totalHarvestKg, 1),
      ceilingCo2Kg: round(ceilingCo2Kg, 1),
      ceilingUtilisation: ceilingCo2Kg > 0 ? round(totalCo2 / ceilingCo2Kg, 3) : null,
      observedCo2KgSameWindowLength: observed === null ? null : round(observed, 1),
      changeVsObserved: observed && observed > 0
        ? round((totalCo2 - observed) / observed, 3) : null,
    },
    outlook: {
      limitedDays: worst.length,
      headline: worst.length === 0
        ? `Nothing limits this pond over the next ${days} days: `
          + `${round(totalCo2, 0)} kg CO₂ and ${round(totalHarvestKg, 0)} kg of dry biomass.`
        : `${worst.length} of ${days} days are held back — `
          + `${[...new Set(worst.map((d) => d.limiter))].join(', ')}. `
          + `Projected ${round(totalCo2, 0)} kg CO₂ and ${round(totalHarvestKg, 0)} kg dry biomass.`,
      method:
        'Each day is labelled by the observable that held it back: hours outside the '
        + '15–42°C growth band first, then light delivered against the best day in this '
        + 'run, then carbon fixed per unit of light — which falls when the culture is '
        + 'thick enough to shade itself. Measured off the twin\'s own readings; no '
        + 'growth curve is re-implemented outside the physics crate.',
    },
  };
}
