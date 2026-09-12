/**
 * Live control for the simulator rig.
 *
 * The demo is two machines: this process runs on a laptop and publishes to the
 * public broker, and production picks the telemetry up and reacts. To make that
 * worth watching, somebody has to be able to break a pond ON STAGE and have the
 * dashboard notice — which the old `--fraud 1.3 --speed 200` flags could not do,
 * because they were read once at startup.
 *
 * So: a tiny HTTP surface, `node:http` and nothing else. curl works from the
 * podium, and a console panel can drive the same endpoints later.
 *
 * It binds LOCALHOST ONLY and it is unauthenticated, deliberately. It can stop
 * a simulation and lie to a broker; it cannot touch the database, the API or
 * anybody's credits. Exposing it to a network would be a bad idea, so it does
 * not listen on one.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type FaultKind = 'mixer' | 'crash' | 'overstate';

export interface ActiveFault {
  kind: FaultKind;
  /** Severity for a crash, factor for an overstatement, unused for the mixer. */
  magnitude: number;
  startedAtSimHour: number;
  durationHours: number;
}

/** One pond the rig is driving. */
export interface RigPond {
  id: string;
  label: string;
  hoursLived: number;
  faults: ActiveFault[];
  latest: {
    ph: number; dissolvedOxygenMgL: number; opticalDensity: number;
    temperatureC: number; co2UptakeKg: number;
  } | null;
  /** Apply a fault from the pond's current hour. Implemented by the driver. */
  inject: (kind: FaultKind, magnitude: number, durationHours: number) => void;
  harvest: () => number;
}

export interface Rig {
  speed: number;
  paused: boolean;
  simHour: number;
  brokerUrl: string;
  ponds: RigPond[];
}

const PORT = Number(process.env.SIM_CONTROL_PORT ?? 4400);

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    // The control panel will be served from a different port.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Find a pond by label (case-insensitive) or by id. */
function findPond(rig: Rig, key: unknown): RigPond | null {
  if (typeof key !== 'string' || !key) return null;
  const needle = key.trim().toLowerCase();
  return rig.ponds.find(
    (p) => p.label.toLowerCase() === needle || p.id === key.trim(),
  ) ?? null;
}

function stateOf(rig: Rig) {
  return {
    speed: rig.speed,
    paused: rig.paused,
    simHour: rig.simHour,
    simDay: Math.floor(rig.simHour / 24),
    broker: rig.brokerUrl,
    ponds: rig.ponds.map((p) => ({
      id: p.id,
      label: p.label,
      hoursLived: p.hoursLived,
      latest: p.latest,
      faults: p.faults.map((f) => ({
        kind: f.kind,
        magnitude: f.magnitude,
        startedAtSimHour: f.startedAtSimHour,
        durationHours: f.durationHours,
        endsAtSimHour: f.startedAtSimHour + f.durationHours,
        active: p.hoursLived < f.startedAtSimHour + f.durationHours,
      })),
    })),
  };
}

const HELP = {
  'GET /state': 'speed, paused, simulated hour, and every pond with its latest reading and faults',
  'POST /speed': '{ "x": 1..2000 } simulated hours per real second',
  'POST /pause': 'freeze the rig — telemetry stops arriving, which is itself worth demonstrating',
  'POST /resume': 'unfreeze',
  'POST /fault': '{ "pond": "RW-02", "kind": "mixer" | "crash" | "overstate", '
    + '"magnitude": number, "hours": number }',
  'POST /harvest': '{ "pond": "RW-02" } — cut 45% of standing biomass now',
  faults: {
    mixer: 'paddlewheel stops. Dissolved oxygen collapses overnight and the energy '
      + 'meter reads zero, which is the one unambiguous signal we have.',
    crash: 'culture collapse. magnitude 0..1 severity. This is real biology, so the '
      + 'advisory engine should catch it.',
    overstate: 'the pond reports magnitude× what it actually fixed. The biology is '
      + 'untouched — this exercises the verifier, not the advisor.',
  },
};

export function startControlServer(rig: Rig): void {
  if (process.env.SIM_CONTROL_PORT === 'off') return;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && (path === '/' || path === '/help')) return json(res, 200, HELP);
    if (req.method === 'GET' && path === '/state') return json(res, 200, stateOf(rig));

    if (req.method !== 'POST') return json(res, 404, { error: `no ${req.method} ${path}` });
    const body = await readBody(req);

    if (path === '/pause' || path === '/resume') {
      rig.paused = path === '/pause';
      console.log(`[sim] ${rig.paused ? 'paused' : 'resumed'}`);
      return json(res, 200, { paused: rig.paused });
    }

    if (path === '/speed') {
      const x = Number(body.x);
      if (!Number.isFinite(x) || x < 1 || x > 2000) {
        return json(res, 400, { error: 'x must be between 1 and 2000' });
      }
      rig.speed = Math.round(x);
      console.log(`[sim] speed ${rig.speed}x`);
      return json(res, 200, { speed: rig.speed });
    }

    if (path === '/harvest') {
      const pond = findPond(rig, body.pond);
      if (!pond) return json(res, 404, { error: 'no such pond — use a label like RW-02' });
      const kg = pond.harvest();
      console.log(`[sim] ${pond.label} harvested ${kg.toFixed(1)} kg`);
      return json(res, 200, { pond: pond.label, harvestedDryKg: Number(kg.toFixed(1)) });
    }

    if (path === '/fault') {
      const pond = findPond(rig, body.pond);
      if (!pond) return json(res, 404, { error: 'no such pond — use a label like RW-02' });

      const kind = String(body.kind) as FaultKind;
      if (!['mixer', 'crash', 'overstate'].includes(kind)) {
        return json(res, 400, { error: 'kind must be mixer, crash or overstate' });
      }

      const hours = Number.isFinite(Number(body.hours)) ? Math.round(Number(body.hours)) : 48;
      if (hours < 1 || hours > 24 * 30) {
        return json(res, 400, { error: 'hours must be between 1 and 720' });
      }

      // Defaults chosen to be visible on a dashboard within a minute of stage
      // time: a 90% crash, a 30% overstatement. A subtle fault is a fault
      // nobody in the audience can see.
      const fallback = kind === 'crash' ? 0.9 : kind === 'overstate' ? 1.3 : 1;
      const magnitude = Number.isFinite(Number(body.magnitude))
        ? Number(body.magnitude) : fallback;
      if (kind === 'crash' && (magnitude <= 0 || magnitude > 1)) {
        return json(res, 400, { error: 'crash magnitude is a severity between 0 and 1' });
      }
      if (kind === 'overstate' && magnitude <= 1) {
        return json(res, 400, {
          error: 'overstate magnitude must be above 1 — 1.3 reports 30% more than was fixed',
        });
      }

      pond.inject(kind, magnitude, hours);
      console.log(`[sim] ${pond.label} ${kind} ×${magnitude} for ${hours} h`);
      return json(res, 200, { pond: pond.label, kind, magnitude, hours });
    }

    return json(res, 404, { error: `no POST ${path}`, help: 'GET / for the surface' });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[sim] control on http://127.0.0.1:${PORT} — GET / for what it takes`);
  });
}
