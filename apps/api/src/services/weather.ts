/**
 * Weather forecast for a site, and what it means for a pond.
 *
 * Open-Meteo, because it needs no API key and no account — one less credential
 * between a farmer and a working screen. The forecast is not decoration: it
 * feeds `mean_air_temp_c` and `diurnal_swing_c` into the twin, so "what will
 * next week look like" is answered with next week's actual weather rather than
 * the Gujarat annual means the twin falls back to.
 *
 * Nothing here invents a number. If Open-Meteo cannot be reached the caller is
 * told so and the projection says it ran on seasonal defaults instead.
 */

const BASE_URL = process.env.WEATHER_BASE_URL ?? 'https://api.open-meteo.com/v1';

/**
 * Spirulina stops growing outside these, from `StrainParams` in
 * packages/physics/src/growth.rs. Repeated here only to phrase the warnings —
 * the physics itself is never re-implemented on this side.
 */
const TEMP_MIN_C = 15;
const TEMP_OPT_C = 35;
const TEMP_MAX_C = 42;

/** Clear September sky at 23°N. Anything well under this is a cloudy day. */
const CLEAR_SKY_MJ_M2 = 22;

export interface DailyWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  meanTempC: number;
  swingC: number;
  cloudPct: number;
  radiationMjM2: number;
  rainMm: number;
  windKph: number;
  /** What this day does to the culture, in the operator's terms. */
  effect: 'good' | 'slower' | 'stressful';
  note: string;
}

export interface Forecast {
  latDeg: number;
  lonDeg: number;
  timezone: string;
  fetchedAt: string;
  source: string;
  days: DailyWeather[];
  /** Averages over the horizon, which is what the twin actually consumes. */
  meanTempC: number;
  meanSwingC: number;
  headline: string;
}

interface CacheEntry {
  at: number;
  forecast: Forecast;
}

/**
 * Open-Meteo refreshes hourly and a site does not move, so a short in-process
 * cache keeps a screen that polls every few seconds from hammering a free API.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number, days: number): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${days}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Float noise in a forecast reads as false precision, so trim it once here. */
function round1(n: number): number {
  return Number(n.toFixed(1));
}

/** Plain-language reading of one day, worst problem first. */
function describe(day: Omit<DailyWeather, 'effect' | 'note'>): Pick<DailyWeather, 'effect' | 'note'> {
  if (day.tempMaxC >= TEMP_MAX_C) {
    return {
      effect: 'stressful',
      note: `${day.tempMaxC.toFixed(0)}°C peak is at or past the ${TEMP_MAX_C}°C where `
        + 'growth stops. Run the paddlewheel through the afternoon and harvest early '
        + 'if the culture is already dense.',
    };
  }
  if (day.tempMaxC >= TEMP_OPT_C + 3) {
    return {
      effect: 'stressful',
      note: `${day.tempMaxC.toFixed(0)}°C peak is above the ${TEMP_OPT_C}°C optimum — `
        + 'expect the afternoon hours to contribute little.',
    };
  }
  if (day.tempMinC <= TEMP_MIN_C) {
    return {
      effect: 'stressful',
      note: `${day.tempMinC.toFixed(0)}°C overnight is at the ${TEMP_MIN_C}°C floor where `
        + 'growth stops. The night is a write-off; the day still counts.',
    };
  }
  if (day.rainMm >= 25) {
    return {
      effect: 'stressful',
      note: `${day.rainMm.toFixed(0)} mm of rain will dilute the pond and can overtop it. `
        + 'Check freeboard and the overflow before it arrives.',
    };
  }
  if (day.radiationMjM2 < CLEAR_SKY_MJ_M2 * 0.55 || day.cloudPct >= 80) {
    return {
      effect: 'slower',
      note: `${day.cloudPct.toFixed(0)}% cloud and ${day.radiationMjM2.toFixed(1)} MJ/m² of `
        + `light against about ${CLEAR_SKY_MJ_M2} on a clear day — growth will be `
        + 'light-limited, not a fault.',
    };
  }
  if (day.rainMm >= 5) {
    return {
      effect: 'slower',
      note: `${day.rainMm.toFixed(0)} mm of rain. Some dilution, nothing structural.`,
    };
  }
  return {
    effect: 'good',
    note: `${day.tempMaxC.toFixed(0)}°C peak and ${day.radiationMjM2.toFixed(1)} MJ/m² of `
      + 'light. Nothing in the way.',
  };
}

function headlineFor(days: DailyWeather[]): string {
  const stressful = days.filter((d) => d.effect === 'stressful');
  const slower = days.filter((d) => d.effect === 'slower');
  if (stressful.length === 0 && slower.length === 0) {
    return `${days.length} clear days ahead. Good growing weather throughout.`;
  }
  const parts: string[] = [];
  if (stressful.length > 0) {
    parts.push(`${stressful.length} of ${days.length} days are hard on the culture `
      + `(first: ${stressful[0]!.date})`);
  }
  if (slower.length > 0) {
    parts.push(`${slower.length} will be light-limited`);
  }
  return `${parts.join(', ')}.`;
}

interface OpenMeteoDaily {
  time?: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  cloud_cover_mean?: number[];
  shortwave_radiation_sum?: number[];
  precipitation_sum?: number[];
  wind_speed_10m_max?: number[];
}

/**
 * Daily forecast for one point. Throws if the upstream is unreachable — the
 * caller decides whether that is fatal or just means "no weather panel today".
 */
export async function getForecast(
  latDeg: number,
  lonDeg: number,
  days = 7,
): Promise<Forecast> {
  const horizon = Math.max(1, Math.min(16, Math.round(days)));
  const key = cacheKey(latDeg, lonDeg, horizon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.forecast;

  const url = new URL(`${BASE_URL}/forecast`);
  url.searchParams.set('latitude', latDeg.toFixed(4));
  url.searchParams.set('longitude', lonDeg.toFixed(4));
  url.searchParams.set('daily', [
    'temperature_2m_max', 'temperature_2m_min', 'cloud_cover_mean',
    'shortwave_radiation_sum', 'precipitation_sum', 'wind_speed_10m_max',
  ].join(','));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', String(horizon));

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw Object.assign(
      new Error(`Weather service returned ${response.status}`),
      { status: 502 },
    );
  }
  const body = await response.json() as { timezone?: string; daily?: OpenMeteoDaily };
  const d = body.daily ?? {};
  const dates = d.time ?? [];
  if (dates.length === 0) {
    throw Object.assign(new Error('Weather service returned no days'), { status: 502 });
  }

  const daysOut: DailyWeather[] = dates.map((date, i) => {
    const tempMaxC = d.temperature_2m_max?.[i] ?? 0;
    const tempMinC = d.temperature_2m_min?.[i] ?? 0;
    const core = {
      date,
      tempMaxC,
      tempMinC,
      meanTempC: round1((tempMaxC + tempMinC) / 2),
      swingC: round1(Math.max(0, tempMaxC - tempMinC)),
      cloudPct: d.cloud_cover_mean?.[i] ?? 0,
      radiationMjM2: d.shortwave_radiation_sum?.[i] ?? 0,
      rainMm: d.precipitation_sum?.[i] ?? 0,
      windKph: d.wind_speed_10m_max?.[i] ?? 0,
    };
    return { ...core, ...describe(core) };
  });

  const forecast: Forecast = {
    latDeg,
    lonDeg,
    timezone: body.timezone ?? 'UTC',
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo forecast API',
    days: daysOut,
    meanTempC: round1(mean(daysOut.map((x) => x.meanTempC))),
    meanSwingC: round1(mean(daysOut.map((x) => x.swingC))),
    headline: headlineFor(daysOut),
  };

  cache.set(key, { at: Date.now(), forecast });
  return forecast;
}
