/**
 * Sentinel-2 ingestion via the Copernicus Statistical API.
 *
 * WHY THE STATISTICAL API AND NOT IMAGE DOWNLOADS
 *
 * We need one number per pond per pass — mean chlorophyll index over the pond
 * polygon. Downloading GeoTIFFs to compute that ourselves would mean raster
 * tooling, a Python service, and gigabytes of scenes we throw away. The
 * Statistical API runs the evalscript server-side and returns JSON.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not certify anything. NDCI carries a mean absolute error factor near
 * 2.4 and cannot resolve a pond narrower than ~40 m. This is a divergence
 * detector with error bounds, and `estimate.ts` treats it as exactly that.
 * See docs/DECISIONS.md #3.
 */

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

/** Below this width, Sentinel-2's 20 m bands cannot give clean pixels. */
export const MIN_RESOLVABLE_WIDTH_M = 40;

/** Above this cloud fraction a scene tells you about the cloud, not the pond. */
const MAX_CLOUD_FRACTION = 0.3;

/**
 * NDCI evalscript.
 *
 * B05 (705 nm, red edge) and B04 (665 nm, red) — the pair the index is defined
 * on. B05 is a 20 m band, which is the physical reason small ponds are out of
 * reach. dataMask is returned so we can tell "no valid pixels" apart from
 * "index happened to be zero", which are very different answers.
 */
const NDCI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B05", "SCL", "dataMask"] }],
    output: [
      { id: "ndci", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(s) {
  // Scene classification: drop cloud (8,9,10), shadow (3) and saturated (1).
  var bad = s.SCL === 1 || s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10;
  var denom = s.B05 + s.B04;
  var ndci = denom === 0 ? 0 : (s.B05 - s.B04) / denom;
  return {
    ndci: [ndci],
    dataMask: [bad ? 0 : s.dataMask]
  };
}`;

interface TokenCache {
  token: string;
  expiresAt: number;
}
let cached: TokenCache | null = null;

/**
 * Fetch and cache an access token.
 *
 * Copernicus rate-limits token requests and returns 429 if you ask per call, so
 * the token is reused until shortly before it expires.
 */
/** Whether this deployment can talk to Copernicus at all. */
export function hasCredentials(): boolean {
  return Boolean(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET);
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const id = process.env.COPERNICUS_CLIENT_ID;
  const secret = process.env.COPERNICUS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      'COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET are not set. ' +
        'Register a free OAuth client at dataspace.copernicus.eu, or run with ' +
        'synthetic observations from `npm run replay`.',
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Copernicus auth failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cached.token;
}

/**
 * Degrees per metre at a latitude, for east-west and north-south.
 *
 * Needed because the bounding boxes below are in EPSG:4326 and Sentinel Hub
 * reads `resx`/`resy` in the units of the bbox CRS. Asking for `resx: 10`
 * against a degree bbox asks for one pixel ten degrees wide, which silently
 * collapses a pond to a single sample — see `pixelResolution()`.
 */
function degreesPerMetre(lat: number): { lat: number; lon: number } {
  return {
    lat: 1 / 111_320,
    lon: 1 / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}

/**
 * `resx`/`resy` for a target ground resolution, in the degrees the bbox uses.
 *
 * This was `resx: 10, resy: 10` — read as ten degrees, so every request came
 * back with `sampleCount: 1`: the pond averaged into one pixel, with
 * `noDataCount` either 0 or 1 and therefore a cloud fraction that was always
 * exactly 0.0 or exactly 1.0. Partial cloud was invisible and the mean mixed
 * the pond with everything around it.
 */
function pixelResolution(lat: number, metres: number): { resx: number; resy: number } {
  const d = degreesPerMetre(lat);
  return { resx: metres * d.lon, resy: metres * d.lat };
}

/**
 * A box over the pond's actual footprint.
 *
 * Not a square of the long side: RW-01 is 40 m × 300 m, and a 300 m square puts
 * six times more land than water in the frame. The index is supposed to measure
 * the pond.
 */
export function pondBoundingBox(
  lat: number, lon: number, widthM: number, lengthM: number,
): number[] {
  const d = degreesPerMetre(lat);
  const halfLat = (widthM / 2) * d.lat;
  const halfLon = (lengthM / 2) * d.lon;
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
}

/** A square bounding box around a point — used for thumbnails, which want context. */
export function boundingBox(lat: number, lon: number, sideM: number): number[] {
  // ~111.32 km per degree of latitude; longitude shrinks with cos(lat).
  const halfLat = sideM / 2 / 111_320;
  const halfLon = sideM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
}

/** Midnight UTC on this date, as an ISO string. */
function startOfUtcDay(d: Date): string {
  return `${d.toISOString().slice(0, 10)}T00:00:00Z`;
}

export interface SentinelObservation {
  observedAt: string;
  ndci: number;
  cloudFraction: number;
  sourceRef: string;
  /** Fraction of the box with valid pixels. Low values mean an unusable pass. */
  validFraction: number;
}

/**
 * Mean NDCI per Sentinel-2 pass over a pond, for a date range.
 *
 * Returns one entry per usable pass. Passes with too few valid pixels are
 * dropped rather than returned with a low confidence flag: a number nobody
 * should use is better absent than present.
 */
export async function fetchNdciSeries(opts: {
  lat: number;
  lon: number;
  widthM: number;
  lengthM: number;
  from: Date;
  to: Date;
}): Promise<SentinelObservation[]> {
  if (opts.widthM < MIN_RESOLVABLE_WIDTH_M) {
    throw new Error(
      `Pond is ${opts.widthM} m wide; Sentinel-2 band B05 is 20 m, so this pond ` +
        `is under two clean pixels across. Use drone or weighbridge evidence instead.`,
    );
  }

  const token = await getAccessToken();

  const body = {
    input: {
      bounds: {
        bbox: pondBoundingBox(opts.lat, opts.lon, opts.widthM, opts.lengthM),
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: { mosaickingOrder: 'leastCC' },
        },
      ],
    },
    aggregation: {
      // Midnight-aligned, and that matters more than it looks.
      //
      // P1D intervals run from `from`, so a range starting at 13:22 puts each
      // morning overpass in the interval that *began the previous afternoon* —
      // and `interval.from` is what we store as the observation date. Every
      // pass was landing in the database a day early, which is invisible in a
      // chart and fatal to anything that asks for that date's scene by date.
      timeRange: {
        from: startOfUtcDay(opts.from),
        to: startOfUtcDay(new Date(opts.to.getTime() + 86_400_000)),
      },
      // One aggregate per day; Sentinel-2 revisits every ~5 days, so most days
      // return nothing and are filtered out below.
      aggregationInterval: { of: 'P1D' },
      evalscript: NDCI_EVALSCRIPT,
      // 10 m pixels, expressed in degrees because the bbox is EPSG:4326.
      ...pixelResolution(opts.lat, 10),
    },
  };

  const res = await fetch(STATS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Copernicus statistics failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    data?: {
      interval: { from: string; to: string };
      outputs?: {
        ndci?: { bands?: { B0?: { stats?: { mean?: number; sampleCount?: number; noDataCount?: number } } } };
      };
    }[];
  };

  const out: SentinelObservation[] = [];
  for (const entry of json.data ?? []) {
    const stats = entry.outputs?.ndci?.bands?.B0?.stats;
    if (!stats || typeof stats.mean !== 'number') continue;

    const total = (stats.sampleCount ?? 0) || 1;
    const noData = stats.noDataCount ?? 0;
    const validFraction = Math.max(0, (total - noData) / total);
    const cloudFraction = 1 - validFraction;

    // Too little of the pond visible to say anything. Dropping it is honest;
    // returning it with a caveat invites someone downstream to use it anyway.
    if (validFraction < 1 - MAX_CLOUD_FRACTION) continue;

    out.push({
      observedAt: entry.interval.from,
      ndci: stats.mean,
      cloudFraction: Number(cloudFraction.toFixed(3)),
      validFraction: Number(validFraction.toFixed(3)),
      sourceRef: `S2_L2A_${entry.interval.from.slice(0, 10)}`,
    });
  }

  return out;
}

/**
 * True-colour PNG of a pond for one Sentinel-2 pass.
 *
 * The NDCI series above is the evidence; this is the picture a human wants next
 * to it. They come from the same scene on the same date, which is the point —
 * an operator who can see cloud over their pond understands why that day was
 * dropped, and a judge who can see the pond understands what is being measured.
 *
 * Deliberately NOT stored in the database. It is a rendering of a public scene,
 * reproducible from (pond, date) by anyone with their own free credentials, so
 * caching bytes in Postgres would add a migration and a stale-image problem to
 * buy nothing.
 */
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

/** Standard L2A true-colour stretch. Reflectance is dim without it. */
const TRUE_COLOUR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }],
    output: { bands: 4 }
  };
}

function evaluatePixel(s) {
  // Cloud, shadow and saturated pixels go transparent rather than white. A
  // blown-out white square looks like a broken image; a hole in the frame
  // looks like what it is, and makes a cloudy pass self-evident.
  var bad = s.SCL === 1 || s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10;
  var alpha = bad ? 0 : s.dataMask;
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, alpha];
}`;

export interface ThumbnailRequest {
  lat: number;
  lon: number;
  /** Pond side in metres; the frame is this padded out for context. */
  sideM: number;
  /** Scene date, YYYY-MM-DD. The whole UTC day is requested. */
  date: string;
  /** How many pond-widths across the frame should be. */
  pad?: number;
  /** Output edge in pixels, 64–1024. */
  size?: number;
}

/**
 * A few recent renders, keyed by request. Copernicus bills processing units on
 * the free tier, and a gallery that re-renders on every scroll would burn them
 * for no reason.
 */
const THUMBNAIL_CACHE_MAX = 64;
const thumbnails = new Map<string, Uint8Array>();

export async function fetchTrueColourPng(req: ThumbnailRequest): Promise<Uint8Array> {
  const pad = Math.max(1, Math.min(10, req.pad ?? 3));
  const size = Math.max(64, Math.min(1024, Math.round(req.size ?? 512)));
  const key = `${req.lat.toFixed(4)}:${req.lon.toFixed(4)}:${req.sideM}:${req.date}:${pad}:${size}`;

  const cached = thumbnails.get(key);
  if (cached) return cached;

  const token = await getAccessToken();
  const body = {
    input: {
      bounds: {
        bbox: boundingBox(req.lat, req.lon, req.sideM * pad),
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${req.date}T00:00:00Z`, to: `${req.date}T23:59:59Z` },
            mosaickingOrder: 'leastCC',
          },
        },
      ],
    },
    output: {
      width: size,
      height: size,
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    },
    evalscript: TRUE_COLOUR_EVALSCRIPT,
  };

  const res = await fetch(PROCESS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw Object.assign(
      new Error(`Copernicus render failed: ${res.status} ${(await res.text()).slice(0, 200)}`),
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  const png = new Uint8Array(await res.arrayBuffer());
  /*
   * A featureless render means the scene exists but nothing of the pond was
   * visible — cloud masked to transparent, or the pass clipped the tile edge.
   *
   * Detected by compressed size, which is crude but needs no PNG decoder: a
   * uniform 512² frame deflates to about 1 KB, while any real ground detail
   * runs tens of KB. The threshold is generous on purpose — a false "no usable
   * pixels" is recoverable, a blank tile presented as evidence is not.
   */
  if (png.byteLength < 8192) {
    throw Object.assign(
      new Error(`No usable pixels over this pond on ${req.date} — cloud, most likely.`),
      { status: 404 },
    );
  }

  if (thumbnails.size >= THUMBNAIL_CACHE_MAX) {
    thumbnails.delete(thumbnails.keys().next().value as string);
  }
  thumbnails.set(key, png);
  return png;
}
