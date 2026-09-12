/**
 * Landing page, and the index for everything in the project.
 *
 * Three different people arrive here — a farmer, someone checking a credit
 * they were sold, and someone deciding whether any of this is real — and each
 * needs a different door. The argument comes first because it is short and it
 * is the whole product: a claim nobody can check is worth nothing.
 *
 * The map at the bottom lists what is built AND what is not. A hackathon
 * index that quietly omits the unfinished half is the same dishonesty this
 * project exists to argue against, so unbuilt parts are listed and marked.
 */

import Link from 'next/link';
import { REPO_URL } from '@/lib/site';

export const metadata = {
  title: 'AlgaCarbon — carbon you can check',
  description:
    'Algae ponds absorb CO₂. We check the claim against evidence the farm does not control, and credit the lower of the two.',
};

/*
 * Doors by audience, not by task. Chetan's frontend branch had this right:
 * a farmer, a researcher and an investor want genuinely different screens,
 * and the difference is not cosmetic — the farmer's view has no charts on it
 * at all, because nobody standing at a pond bank reads a time series.
 */
const DOORS = [
  {
    href: '/farm',
    who: 'I run ponds',
    what: 'What needs doing today, in plain words. No graphs — just the pond, the problem and the fix.',
    cta: 'Open my ponds',
  },
  {
    href: '/verify',
    who: 'I was given a carbon credit',
    what: 'Check what it is based on. Every report shows its evidence and what we could not confirm.',
    cta: 'Check a report',
  },
  {
    href: '/sim',
    who: 'I study or fund this',
    what: 'Run the physics yourself. Change the pond, stop the paddlewheel, and see every number move with the model.',
    cta: 'Open the simulator',
  },
];

/** Everything in the project, built or not. `todo` renders greyed and unlinked. */
const MAP: { group: string; items: { name: string; href?: string; note: string; todo?: boolean }[] }[] = [
  {
    group: 'For the farm',
    items: [
      { name: 'Today’s jobs', href: '/farm', note: 'The farmer’s view. One verdict per pond, the action, and what ignoring it costs. No charts' },
      { name: 'Full console', href: '/console', note: 'Readings, trends and divergence figures — for researchers and investors' },
      { name: 'Live simulator', href: '/sim', note: 'The same physics engine, running in your browser' },
      { name: 'Expansion planner', href: '/sim', note: 'What more land costs in sensors, power and payback' },
    ],
  },
  {
    group: 'For the buyer',
    items: [
      { name: 'Verification reports', href: '/verify', note: 'What was claimed, what the evidence showed, what we credited' },
      { name: 'Marketplace', note: 'Buy and retire credits', todo: true },
      { name: 'Credit inventory', note: 'What you hold and what you have retired', todo: true },
    ],
  },
  {
    group: 'Underneath',
    items: [
      { name: 'Physics engine', href: `${REPO_URL}/tree/main/packages/physics`, note: 'Rust, compiled to 34 KB of WebAssembly. Same binary in the browser and on the server' },
      { name: 'Sensor firmware', href: `${REPO_URL}/tree/main/apps/firmware`, note: 'Real ESP32 code on a simulated board, publishing over MQTT' },
      { name: 'Models', href: `${REPO_URL}/tree/main/packages/models`, note: 'Crash risk, divergence and biomass. Trained in Python, shipped as readable JSON weights' },
      { name: 'Contracts', href: `${REPO_URL}/tree/main/apps/contracts`, note: 'Evidence, credits and retirement on-chain. Written and tested, not yet wired to the app', todo: true },
    ],
  },
];

export default function Landing() {
  return (
    <main className="wrap landing">
      <section className="hero">
        <p className="eyebrow">ALGAE PONDS · CARBON · EVIDENCE</p>
        <h1>A carbon claim is only worth what you can check.</h1>
        <p className="hero-lede">
          Algae ponds pull CO₂ out of the air while they clean wastewater. Today
          the farm reports its own number and nobody can verify it — so we
          compare that number against evidence the farm does not control, and
          count only the lower of the two.
        </p>

        <div className="rule-card">
          <p className="rule-line">
            <span>what the farm claims</span>
            <em>vs</em>
            <span>what the evidence shows</span>
          </p>
          <p className="rule-out">We count the smaller one.</p>
          <p className="helper">
            So overstating earns nothing. There is no number a farm can write
            down that beats the evidence.
          </p>
        </div>
      </section>

      <section className="doors">
        <h2 className="doors-title">Where would you like to start?</h2>
        {DOORS.map((d) => (
          <Link className="door" key={d.href + d.who} href={d.href}>
            <strong>{d.who}</strong>
            <span>{d.what}</span>
            <em>{d.cta} →</em>
          </Link>
        ))}
      </section>

      <section className="how">
        <h2>How the checking works</h2>
        <ol className="how-list">
          <li>
            <strong>The pond reports what it captured.</strong> Sensors in the
            water, or a note from the farmer. Either way it is a claim, not yet
            a fact.
          </li>
          <li>
            <strong>We look from outside.</strong> Satellite images of the pond,
            weighed harvests at the bridge, and the sunlight that actually fell
            on that patch of ground.
          </li>
          <li>
            <strong>Sunlight sets a hard ceiling.</strong> Photosynthesis needs
            about eight particles of light per molecule of CO₂. Past that limit
            a claim is not doubtful, it is impossible.
          </li>
          <li>
            <strong>We count the lower figure</strong> and show our working, so
            anyone can disagree with the evidence rather than with us.
          </li>
        </ol>
      </section>

      <section className="site-map">
        <h2>Everything in the project</h2>
        <p className="sub">
          Including the parts that are not finished. Those are marked.
        </p>
        {MAP.map((g) => (
          <div className="map-group" key={g.group}>
            <h3>{g.group}</h3>
            <ul>
              {g.items.map((i) => (
                <li key={i.name} className={i.todo ? 'is-todo' : undefined}>
                  {i.href ? (
                    <Link href={i.href}>{i.name}</Link>
                  ) : (
                    <span className="map-name">{i.name}</span>
                  )}
                  {i.todo && <span className="tag">not built yet</span>}
                  <p className="helper">{i.note}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
