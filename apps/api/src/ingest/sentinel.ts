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

/** A square bounding box around a point, sized to the pond. */
export function boundingBox(lat: number, lon: number, sideM: number): number[] {
  // ~111.32 km per degree of latitude; longitude shrinks with cos(lat).
  const halfLat = sideM / 2 / 111_320;
  const halfLon = sideM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
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
  const side = Math.max(opts.widthM, opts.lengthM);

  const body = {
    input: {
      bounds: {
        bbox: boundingBox(opts.lat, opts.lon, side),
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
      timeRange: {
        from: opts.from.toISOString(),
        to: opts.to.toISOString(),
      },
      // One aggregate per day; Sentinel-2 revisits every ~5 days, so most days
      // return nothing and are filtered out below.
      aggregationInterval: { of: 'P1D' },
      evalscript: NDCI_EVALSCRIPT,
      resx: 10,
      resy: 10,
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
