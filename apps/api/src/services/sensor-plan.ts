/**
 * What to install at a site, where to put it, and why.
 *
 * The costs mirror `apps/web/src/lib/planning.ts` — that file owns the console's
 * expansion planner and this one owns the answer the API gives, which is what
 * the firmware docs and the deck quote. If the two ever disagree the numbers on
 * screen stop matching the numbers in the PPT, so they are cross-referenced in
 * both directions rather than silently duplicated.
 *
 * The placement rules are the part that is actually load-bearing. A sonde in
 * the wrong place reads a pond that does not exist: fresh influent is thinner
 * and colder than the culture, the surface film superheats and supersaturates
 * with oxygen by mid-afternoon, and a dead corner out of the paddlewheel's flow
 * settles biomass out. Every rule below has the reason attached, because an
 * operator who knows why will not move the probe to somewhere convenient.
 */

import { pool } from '../db/client.ts';

/** Below this, instrumenting a pond costs more than the crop it protects. */
const MIN_INSTRUMENTED_AREA_M2 = 5_000;

/** Sentinel-2's red-edge band is 20 m; under two clean pixels is no pixel. */
const MIN_SATELLITE_WIDTH_M = 40;

/** Paddlewheel power, shared with the physics crate and the firmware. */
const PADDLEWHEEL_W_PER_M2 = 0.5;

const COSTS = {
  sonde: 26_000,
  node: 6_500,
  energyMeter: 4_500,
  flowMeter: 18_000,
  parSensor: 15_000,
  loraGateway: 11_000,
};

export interface PlanItem {
  name: string;
  qty: number;
  unitInr: number;
  totalInr: number;
  because: string;
}

export interface PondPlacement {
  pondId: string;
  label: string;
  areaM2: number;
  depthM: number;
  widthM: number;
  instrument: boolean;
  /** Where the sonde goes, in terms an operator can act on. */
  placement: string;
  depthOfProbeM: number | null;
  evidenceChannel: 'satellite' | 'drone_or_weighbridge';
  because: string;
}

export interface SensorPlan {
  site: { id: string; name: string; tier: string };
  ponds: PondPlacement[];
  items: PlanItem[];
  totals: {
    nodes: number;
    capexInr: number;
    instrumentedAreaM2: number;
    capexPerHectareInr: number | null;
    capexPerAcreInr: number | null;
    annualPaddlewheelKwh: number;
  };
  cadence: {
    publishSeconds: number;
    because: string;
  };
  notes: string[];
}

/**
 * Where the probe goes in a raceway, and how deep.
 *
 * A paddlewheel raceway is a loop, so one well-sited point represents the whole
 * pond — which is the only reason one sonde per pond is defensible.
 */
function placementFor(areaM2: number, depthM: number): { text: string; probeDepthM: number } {
  // Mid-column: deep enough to miss the superheated surface film, high enough
  // to miss settled biomass on the floor.
  const probeDepthM = Math.max(0.08, Math.round(depthM * 0.5 * 100) / 100);
  return {
    text:
      'Downstream of the paddlewheel, in the far straight from the inlet, at least '
      + `1 m off the wall, ${probeDepthM.toFixed(2)} m below the surface. `
      + 'The optical-density channel needs a fixed-path flow cell fed by a small '
      + 'pump at the bank — read through open water it tracks the sun, not the culture.',
    probeDepthM,
  };
}

export async function buildSensorPlan(siteId: string): Promise<SensorPlan | null> {
  const { rows: siteRows } = await pool.query(
    'SELECT id, name, tier FROM sites WHERE id = $1', [siteId],
  );
  const site = siteRows[0];
  if (!site) return null;

  const { rows: pondRows } = await pool.query(
    `SELECT id, label, area_m2, depth_m, width_m
       FROM ponds
      WHERE site_id = $1 AND active
      ORDER BY label`,
    [siteId],
  );

  const ponds: PondPlacement[] = pondRows.map((r) => {
    const areaM2 = Number(r.area_m2);
    const depthM = Number(r.depth_m);
    const widthM = Number(r.width_m);
    const instrument = areaM2 >= MIN_INSTRUMENTED_AREA_M2;
    const { text, probeDepthM } = placementFor(areaM2, depthM);
    return {
      pondId: r.id,
      label: r.label,
      areaM2,
      depthM,
      widthM,
      instrument,
      placement: instrument ? text : 'No probe. Weigh the harvest instead.',
      depthOfProbeM: instrument ? probeDepthM : null,
      evidenceChannel: widthM >= MIN_SATELLITE_WIDTH_M ? 'satellite' : 'drone_or_weighbridge',
      because: instrument
        ? 'Large enough that a lost crop costs more than the instrument.'
        : `At ${Math.round(areaM2).toLocaleString('en-IN')} m² the sonde costs more than `
          + 'the crop it would protect. A weighed harvest is cruder and harder to dispute.',
    };
  });

  const instrumented = ponds.filter((p) => p.instrument);
  const instrumentedAreaM2 = instrumented.reduce((s, p) => s + p.areaM2, 0);
  const totalAreaM2 = ponds.reduce((s, p) => s + p.areaM2, 0);
  const tier = String(site.tier);

  const items: PlanItem[] = [];
  const push = (name: string, qty: number, unitInr: number, because: string) => {
    if (qty > 0) items.push({ name, qty, unitInr, totalInr: qty * unitInr, because });
  };

  push(
    'Multiparameter sonde (pH, dissolved oxygen, temperature, density)',
    instrumented.length, COSTS.sonde,
    'One instrument per pond covers every reading the models need — one cable, '
    + 'one calibration, one thing to service.',
  );
  push(
    'Sensor node, enclosure and solar panel', instrumented.length, COSTS.node,
    'The ESP32 that reads the sonde and publishes it. See apps/firmware and '
    + 'docs/HARDWARE.md for the wiring.',
  );
  push(
    'Energy meter (one per site)', instrumented.length > 0 ? 1 : 0, COSTS.energyMeter,
    'A stopped paddlewheel reads zero on a meter, which is unambiguous. Dissolved '
    + 'oxygen falling has half a dozen explanations.',
  );

  if (tier === 'mid' || tier === 'facility') {
    push('Influent flow meter', 1, COSTS.flowMeter,
      'At this size nutrient supply is the thing most likely to stall growth without warning.');
    push('Sunlight (PAR) sensor', 1, COSTS.parSensor,
      'One per site, not per pond — irradiance does not vary across a few hectares. '
      + 'It separates a bad week of weather from a real fault.');
  }
  if (instrumented.length > 2) {
    push('LoRa gateway', 1, COSTS.loraGateway,
      'Past a couple of ponds, running cable back to one shed stops being practical.');
  }

  const capexInr = items.reduce((s, i) => s + i.totalInr, 0);
  const hectares = instrumentedAreaM2 / 10_000;
  const acres = instrumentedAreaM2 / 4_046.86;

  const notes: string[] = [
    'One node per pond, not per hectare: a paddlewheel raceway is a mixed loop, so '
    + 'one well-sited probe represents all of it. The ceiling is the pond itself — '
    + 'past about 12,000 m² one paddlewheel cannot mix evenly, so a bigger farm is '
    + 'more ponds and therefore more nodes.',
    'Costs are working estimates for Indian supply, not quotes.',
  ];
  if (ponds.length > instrumented.length) {
    notes.push(
      `${ponds.length - instrumented.length} pond(s) here are below `
      + `${MIN_INSTRUMENTED_AREA_M2.toLocaleString('en-IN')} m² and are deliberately `
      + 'left uninstrumented.',
    );
  }
  if (instrumented.some((p) => p.evidenceChannel === 'drone_or_weighbridge')) {
    notes.push(
      'Some ponds are narrower than 40 m, so Sentinel-2 cannot resolve them and their '
      + 'independent evidence is a weighed harvest or a drone pass.',
    );
  }

  return {
    site: { id: site.id, name: site.name, tier },
    ponds,
    items,
    totals: {
      nodes: instrumented.length,
      capexInr,
      instrumentedAreaM2,
      capexPerHectareInr: hectares > 0 ? Math.round(capexInr / hectares) : null,
      capexPerAcreInr: acres > 0 ? Math.round(capexInr / acres) : null,
      annualPaddlewheelKwh: Math.round((PADDLEWHEEL_W_PER_M2 * totalAreaM2 * 24 * 365) / 1000),
    },
    cadence: {
      publishSeconds: 30,
      because:
        'Every 30 s. The models read the day-night swing in dissolved oxygen — a pond '
        + 'that stops swinging has stopped photosynthesising, hours before density '
        + 'visibly falls — and anything slower than hourly loses that signal entirely.',
    },
    notes,
  };
}
