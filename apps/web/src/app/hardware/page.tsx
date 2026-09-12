/**
 * The sensor node, on the website.
 *
 * Public on purpose: a buyer deciding whether to trust a credit wants to know
 * what measured it, and an operator deciding whether to buy wants the price
 * and the placement. The numbers come from `GET /land/site/:siteId/sensor-plan`
 * rather than being typed in here, so the figure on this page, the figure in
 * the console and the figure in the deck are the same figure.
 */

import Link from 'next/link';

/**
 * Read straight from the API rather than through the session helper.
 *
 * This page is public — nothing here is scoped to an account — and depending on
 * the authenticated helper would have made a deployed build fail on a file that
 * is still uncommitted in the other agent's working tree.
 */
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiGet(path: string): Promise<Response> {
  return fetch(`${API}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
}

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'The sensor node — AlgaCarbon',
  description:
    'One multiparameter sonde per pond, an ESP32 at the bank, and every reading '
    + 'checked against what photosynthesis allows.',
};

interface PlanPond {
  pondId: string; label: string; areaM2: number; depthM: number; widthM: number;
  instrument: boolean; placement: string; depthOfProbeM: number | null;
  evidenceChannel: 'satellite' | 'drone_or_weighbridge'; because: string;
}
interface PlanItem { name: string; qty: number; unitInr: number; totalInr: number; because: string }
interface Plan {
  site: { id: string; name: string; tier: string };
  ponds: PlanPond[];
  items: PlanItem[];
  totals: {
    nodes: number; capexInr: number; instrumentedAreaM2: number;
    capexPerHectareInr: number | null; capexPerAcreInr: number | null;
    annualPaddlewheelKwh: number;
  };
  cadence: { publishSeconds: number; because: string };
  notes: string[];
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The channels one sonde carries, and why each one is worth its cable. */
const CHANNELS = [
  {
    name: 'pH',
    what: 'Photosynthesis drives pH up through the day. A pond that stops '
      + 'climbing has stopped fixing carbon.',
  },
  {
    name: 'Dissolved oxygen',
    what: 'The leading indicator. A sunlit pond supersaturates by afternoon and '
      + 'is stripped by dawn; when that daily swing flattens, the culture is in '
      + 'trouble hours before the density visibly falls.',
  },
  {
    name: 'Temperature',
    what: 'Growth stops below 15 °C and above 42 °C, and the optimum is 35 °C. '
      + 'Hours outside that band explain most bad weeks.',
  },
  {
    name: 'Optical density',
    what: 'How much light the culture blocks — the harvest signal, and the '
      + 'number a satellite is checked against. Needs a fixed-path flow cell.',
  },
  {
    name: 'Paddlewheel state',
    what: 'A dry contact off the motor contactor. Zero on a meter is '
      + 'unambiguous; "oxygen is low" has half a dozen explanations.',
  },
];

const PINS = [
  ['pH', 'GPIO 34', 'ADC1, input-only', 'Two-point calibrated against pH 4 and pH 10 buffers'],
  ['Dissolved oxygen', 'GPIO 35', 'ADC1, input-only', 'Zero solution and air-saturated water'],
  ['Optical density', 'GPIO 32', 'ADC1', '680 nm through a fixed-path flow cell'],
  ['Water temperature', 'GPIO 4', 'OneWire', 'DS18B20, waterproof probe'],
  ['Paddlewheel running', 'GPIO 27', 'Digital, pulldown', 'Dry contact from the contactor'],
  ['Transmit LED', 'GPIO 13', 'Digital out', 'Blinks on publish — the field diagnostic'],
  ['Local readout', 'GPIO 21/22', 'I²C', 'SSD1306, so a farmer can read the pond without a phone'],
];

export default async function HardwarePage() {
  // One real site, so the costs on this page are a live answer rather than an
  // illustration. Falls back to prose if the API is unreachable.
  let plan: Plan | null = null;
  try {
    const fleet = await apiGet('/fleet');
    const sites = fleet.ok ? ((await fleet.json()) as { siteId?: string; id?: string }[]) : [];
    const siteId = sites[0]?.siteId ?? sites[0]?.id;
    if (siteId) {
      const res = await apiGet(`/land/site/${siteId}/sensor-plan`);
      if (res.ok) plan = (await res.json()) as Plan;
    }
  } catch {
    plan = null;
  }

  return (
    <main className="wrap hardware">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE SENSOR NODE</p>
          <h1>One instrument per pond, and nothing it says is taken on trust</h1>
          <p>
            A multiparameter sonde in the water, an ESP32 in a weatherproof box at
            the bank, and a public broker in between. Every reading is a claim —
            and a claim above what the sunlight allows is not doubtful, it is
            impossible.
          </p>
        </div>
      </div>

      <section className="hw-block">
        <h2>What one sonde measures</h2>
        <p className="hw-lede">
          Five channels on one body, one cable and one calibration visit. Listing
          them as separate instruments roughly doubles the quoted cost and is not
          how anybody actually buys them.
        </p>
        <div className="hw-channels">
          {CHANNELS.map((c) => (
            <article key={c.name}>
              <h3>{c.name}</h3>
              <p>{c.what}</p>
            </article>
          ))}
        </div>
        <p className="helper">
          Published every {plan?.cadence.publishSeconds ?? 30} seconds.{' '}
          {plan?.cadence.because
            ?? 'Anything slower than hourly loses the day-night swing the models read.'}
        </p>
      </section>

      <section className="hw-block">
        <h2>How it is wired</h2>
        <div className="hw-table-scroll">
          <table className="hw-table">
            <thead>
              <tr><th>Signal</th><th>Pin</th><th>Type</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {PINS.map(([signal, pin, type, note]) => (
                <tr key={signal}>
                  <td>{signal}</td><td><code>{pin}</code></td><td>{type}</td><td>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="helper">
          GPIO 34 and 35 are input-only and on ADC1, which keeps working while
          Wi-Fi is active. ADC2 pins do not, and that is the most common way an
          ESP32 sensor node fails silently. The board in{' '}
          <code>apps/firmware</code> is a real sketch — the three potentiometers
          stand in for the analog probes, and turning one moves a number on this
          dashboard through the same broker and the same validation as hardware
          would.
        </p>
      </section>

      <section className="hw-block">
        <h2>Where the probe goes, and how many</h2>
        <p className="hw-lede">
          A paddlewheel raceway is a mixed loop, which is the only reason one
          sonde per pond is defensible — and it only holds if the probe is sited
          properly. One node per pond, not per hectare; because one paddlewheel
          cannot mix past about 12,000 m², a bigger farm is more ponds and
          therefore more nodes.
        </p>
        <div className="hw-rules">
          {[
            ['Downstream of the paddlewheel, far straight from the inlet',
              'Fresh influent is thinner, colder and differently buffered than the culture. A probe by the inlet reads the effluent, not the pond.'],
            ['Half the water depth',
              'The surface film superheats and supersaturates with oxygen by mid-afternoon; the floor collects settled biomass. Neither is the pond.'],
            ['At least a metre off the wall',
              'Wall boundary layers are slow water, and slow water is not the loop.'],
            ['Never in a dead corner',
              'Out of the flow, biomass settles out and the pond reads like a crashing culture.'],
          ].map(([rule, why]) => (
            <article key={rule}><h3>{rule}</h3><p>{why}</p></article>
          ))}
        </div>
      </section>

      {plan && (
        <section className="hw-block">
          <h2>What {plan.site.name} needs</h2>
          <p className="hw-lede">
            Live from the API, not an illustration — this is the same endpoint the
            console reads.
          </p>
          <dl className="hw-figures">
            <div><dt>Nodes</dt><dd>{plan.totals.nodes}</dd></div>
            <div><dt>Kit cost</dt><dd>{inr(plan.totals.capexInr)}</dd></div>
            <div>
              <dt>Per acre</dt>
              <dd>{plan.totals.capexPerAcreInr ? inr(plan.totals.capexPerAcreInr) : '—'}</dd>
            </div>
            <div>
              <dt>Per hectare</dt>
              <dd>{plan.totals.capexPerHectareInr ? inr(plan.totals.capexPerHectareInr) : '—'}</dd>
            </div>
          </dl>

          <div className="hw-table-scroll">
            <table className="hw-table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Each</th><th>Total</th><th>Why</th></tr>
              </thead>
              <tbody>
                {plan.items.map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td>{i.qty}</td>
                    <td>{inr(i.unitInr)}</td>
                    <td>{inr(i.totalInr)}</td>
                    <td className="hw-why">{i.because}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="hw-subhead">Pond by pond</h3>
          <div className="hw-ponds">
            {plan.ponds.map((p) => (
              <article key={p.pondId} className={p.instrument ? '' : 'is-off'}>
                <header>
                  <strong>{p.label}</strong>
                  <span>{Math.round(p.areaM2).toLocaleString('en-IN')} m²</span>
                </header>
                <p>{p.instrument
                  ? `Sonde ${p.depthOfProbeM?.toFixed(2)} m down. ${p.placement}`
                  : p.because}</p>
                <span className="hw-channel-tag">
                  {p.evidenceChannel === 'satellite'
                    ? 'Satellite can resolve this pond'
                    : 'Verified by drone or weighed harvest'}
                </span>
              </article>
            ))}
          </div>

          <ul className="hw-notes">
            {plan.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}

      {!plan && (
        <section className="hw-block">
          <p className="inline-notice">
            The live costing needs the API, which is not reachable right now. The
            wiring and placement above do not depend on it.
          </p>
        </section>
      )}

      <section className="hw-block">
        <h2>What each failure looks like</h2>
        <div className="hw-table-scroll">
          <table className="hw-table">
            <thead><tr><th>In the field</th><th>On the dashboard</th></tr></thead>
            <tbody>
              {[
                ['Paddlewheel stops', 'The energy meter reads zero — unambiguous. Oxygen collapses overnight and crash risk climbs.'],
                ['Culture crashing', 'Density falls while pH drifts. The daily oxygen swing flattens first.'],
                ['Probe drifts out of calibration', 'Readings stay smooth but leave the physical envelope, and the ingest drops anything impossible.'],
                ['Node loses Wi-Fi', 'Last-reading age climbs. Nothing is invented to fill the gap.'],
                ['Someone publishes a fake reading', 'Accepted as a claim, then refused by the ceiling. Past about eight photons per molecule of CO₂ a claim is not doubtful, it is impossible.'],
              ].map(([field, dash]) => (
                <tr key={field}><td>{field}</td><td>{dash}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="helper">
        The full wiring, calibration maths and power budget are in{' '}
        <code>docs/HARDWARE.md</code>. Want to see the physics instead?{' '}
        <Link href="/sim">Run a pond</Link>.
      </p>
    </main>
  );
}
